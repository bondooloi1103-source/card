import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: { slot_idx?: number };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  if (!Number.isInteger(body.slot_idx) || body.slot_idx! < 1 || body.slot_idx! > 5) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const auth = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!auth) return json({ ok: false, reason: 'unauthorized' }, 401);
  const { data: u } = await admin.auth.getUser(auth);
  if (!u?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = u.user.id;

  const { data: profile } = await admin.from('profiles')
    .select('parent_user_id').eq('id', userId).maybeSingle();
  if (profile?.parent_user_id) return json({ ok: false, reason: 'guests_cannot_manage' }, 403);

  try {
    await assertActiveSession(admin, userId, req.headers.get('x-session-id'));
  } catch (e) {
    if (e instanceof SessionRevokedError) return json({ ok: false, reason: 'session_revoked' }, 401);
    throw e;
  }

  const { data: slot } = await admin.from('guest_slots')
    .select('id, auth_user_id')
    .eq('parent_user_id', userId).eq('slot_idx', body.slot_idx!).maybeSingle();
  if (!slot) return json({ ok: false, reason: 'slot_not_found' }, 404);
  if (!slot.auth_user_id) return json({ ok: true });

  // Kill heartbeat, rotate password, revoke refresh tokens, drop pending invites.
  await admin.from('active_sessions').delete().eq('user_id', slot.auth_user_id);
  await admin.auth.admin.updateUserById(slot.auth_user_id, { password: crypto.randomUUID() });
  await admin.rpc('revoke_auth_sessions', { p_user_id: slot.auth_user_id });
  await admin.from('guest_tokens').delete().eq('slot_id', slot.id);
  await admin.from('guest_slots').update({ claimed_at: null }).eq('id', slot.id);

  return json({ ok: true });
});
