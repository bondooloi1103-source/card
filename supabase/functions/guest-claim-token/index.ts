import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

function toByteaHex(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  if (!body.token) return json({ ok: false, reason: 'bad_request' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  let raw: Uint8Array;
  try { raw = b64urlDecode(body.token); }
  catch { return json({ ok: false, reason: 'expired_or_invalid' }, 410); }
  const hash = await sha256(raw);

  // Atomic single-use claim.
  const { data, error } = await admin.rpc('claim_guest_token_atomic', { p_token_hash: toByteaHex(hash) });
  if (error) return json({ ok: false, reason: 'server' }, 500);
  const row = (data as Array<any> | null)?.[0];
  if (!row?.found) return json({ ok: false, reason: 'expired_or_invalid' }, 410);

  const { slot_id, auth_user_id } = row;

  // Rotate password.
  const newPw = crypto.randomUUID();
  const { error: updErr } = await admin.auth.admin.updateUserById(auth_user_id, { password: newPw });
  if (updErr) return json({ ok: false, reason: 'rotate_failed' }, 502);

  // Canonical email — username is mutable.
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(auth_user_id);
  if (authErr || !authUser?.user?.email) return json({ ok: false, reason: 'lookup_failed' }, 502);
  const guestEmail = authUser.user.email;

  // Issue a fresh session via generateLink + verifyOtp.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: guestEmail,
  });
  if (linkErr || !link?.properties?.hashed_token) return json({ ok: false, reason: 'link_failed' }, 502);

  const { data: verify, error: verifyErr } = await admin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verify?.session) return json({ ok: false, reason: 'verify_failed' }, 502);
  const { access_token, refresh_token } = verify.session;

  // Now that we have the new JWT, revoke prior sessions for this user.
  await admin.auth.admin.signOut(access_token, 'others');

  // Mark slot claimed.
  await admin.from('guest_slots').update({ claimed_at: new Date().toISOString() }).eq('id', slot_id);

  // Single-device claim — evict any prior friend on this slot.
  const sessionId = crypto.randomUUID();
  await admin.rpc('claim_session_atomic', {
    p_user_id: auth_user_id,
    p_session_id: sessionId,
    p_device_label: 'guest',
    p_force: true,
    p_stale_seconds: 120,
  });

  return json({
    ok: true,
    access_token,
    refresh_token,
    session_id: sessionId,
    parent_username: row.parent_username,
    guest_username: row.guest_username,
  });
});
