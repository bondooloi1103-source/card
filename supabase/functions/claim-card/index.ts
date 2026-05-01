import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { FIGURES } from '../_shared/figures.ts';
import { currentHourBucket } from '../_shared/ip.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

const HOURLY_LIMIT = 30;
const VALID_FIG_IDS = new Set(FIGURES.map((f) => f.fig_id));

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthenticated' }, 401);
  }

  let body: { fig_id?: number };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const figId = Number(body.fig_id);
  if (!Number.isInteger(figId) || !VALID_FIG_IDS.has(figId)) {
    return json({ ok: false, reason: 'invalid_fig_id' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Resolve the user from their JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, reason: 'unauthenticated' }, 401);
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);

  // Guests do not own cards and cannot claim. They get cards transitively
  // through the parent's collection. Caught by Codex review 2026-05-01.
  const { data: profGuard } = await admin.from('profiles')
    .select('parent_user_id').eq('id', userId).maybeSingle();
  if (profGuard?.parent_user_id) return json({ ok: false, reason: 'guests_cannot_claim' }, 403);

  try {
    await assertActiveSession(admin, userId, req.headers.get('x-session-id'));
  } catch (e) {
    if (e instanceof SessionRevokedError) return json({ ok: false, reason: 'session_revoked' }, 401);
    throw e;
  }

  // Rate limit keyed on user_id (reusing the rate_limits table; ip_hash column carries user id here).
  const limit = await checkAndIncrement(admin, userId, currentHourBucket(), 'claim-card', HOURLY_LIMIT);
  if (!limit.allowed) {
    return json({ ok: false, reason: 'rate_limited' }, 429);
  }

  const { data: existing, error: selErr } = await admin
    .from('card_ownership')
    .select('scanned_at')
    .eq('user_id', userId)
    .eq('fig_id', figId)
    .maybeSingle();
  if (selErr) return json({ ok: false, reason: 'db_error' }, 500);

  if (existing) {
    return json({ ok: true, owned: true, newly_claimed: false, scanned_at: existing.scanned_at });
  }

  const { data: inserted, error: insErr } = await admin
    .from('card_ownership')
    .insert({ user_id: userId, fig_id: figId })
    .select('scanned_at')
    .single();
  if (insErr) return json({ ok: false, reason: 'db_error' }, 500);

  return json({ ok: true, owned: true, newly_claimed: true, scanned_at: inserted.scanned_at });
});
