import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

const TOKEN_BYTES = 32;
const TTL_MIN = 15;
const RATE_LIMIT = 10;

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

// bytea over PostgREST: send as `\x<hex>` literal.
function toByteaHex(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: { slot_idx?: number };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const slotIdx = body.slot_idx;
  if (!Number.isInteger(slotIdx) || slotIdx! < 1 || slotIdx! > 5) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const publicHost = Deno.env.get('PUBLIC_HOST') ?? req.headers.get('origin');
  if (!publicHost) return json({ ok: false, reason: 'server_misconfiguration' }, 500);
  const admin = createClient(url, serviceKey);

  const auth = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!auth) return json({ ok: false, reason: 'unauthorized' }, 401);
  const { data: u } = await admin.auth.getUser(auth);
  if (!u?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = u.user.id;

  const { data: profile } = await admin.from('profiles')
    .select('parent_user_id, username').eq('id', userId).maybeSingle();
  if (!profile) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (profile.parent_user_id) return json({ ok: false, reason: 'guests_cannot_manage' }, 403);

  try {
    await assertActiveSession(admin, userId, req.headers.get('x-session-id'));
  } catch (e) {
    if (e instanceof SessionRevokedError) return json({ ok: false, reason: 'session_revoked' }, 401);
    throw e;
  }

  // Find slot.
  const { data: slot } = await admin.from('guest_slots')
    .select('id, auth_user_id')
    .eq('parent_user_id', userId).eq('slot_idx', slotIdx).maybeSingle();
  if (!slot) return json({ ok: false, reason: 'slot_not_found' }, 404);

  // Activate slot if first time.
  let authUserId: string | null = slot.auth_user_id;
  if (!authUserId) {
    const parentPrefix = userId.replace(/-/g, '').slice(0, 12);
    const guestUsername = `guest_${parentPrefix}_${slotIdx}`;
    const guestEmail = `${guestUsername}@guests.local`;
    const tempPw = crypto.randomUUID();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: guestEmail,
      password: tempPw,
      email_confirm: true,
      user_metadata: { username: guestUsername },
      app_metadata: { parent_user_id: userId },
    });
    if (cErr || !created.user) return json({ ok: false, reason: 'create_failed' }, 500);
    authUserId = created.user.id;
    await admin.from('guest_slots').update({ auth_user_id: authUserId }).eq('id', slot.id);
  }

  // Per-parent atomic rate limit.
  const { data: rateOk, error: rateErr } = await admin.rpc('guest_record_token_generation', {
    p_parent_user_id: userId,
    p_slot_id: slot.id,
    p_limit_per_hour: RATE_LIMIT,
  });
  if (rateErr) return json({ ok: false, reason: 'server' }, 500);
  if (!rateOk) return json({ ok: false, reason: 'rate_limited' }, 429);

  // Generate fresh token; replace any pending invite for this slot.
  const raw = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(raw);
  const hash = await sha256(raw);
  const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString();

  await admin.from('guest_tokens').delete().eq('slot_id', slot.id);
  const { error: insErr } = await admin.from('guest_tokens').insert({
    slot_id: slot.id,
    token_hash: toByteaHex(hash),
    expires_at: expiresAt,
  });
  if (insErr) return json({ ok: false, reason: 'server' }, 500);

  const fullUrl = `${publicHost}/guest/join?token=${b64url(raw)}`;
  return json({ ok: true, url: fullUrl, expires_at: expiresAt });
});
