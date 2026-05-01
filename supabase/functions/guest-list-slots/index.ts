import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

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

  const { data: slots } = await admin
    .from('guest_slots')
    .select('slot_idx, auth_user_id, claimed_at, profiles:auth_user_id ( username ), active_sessions:auth_user_id ( session_id, last_seen )')
    .eq('parent_user_id', userId)
    .order('slot_idx');

  const out = (slots ?? []).map((s: any) => {
    const lastSeen = s.active_sessions?.last_seen;
    const online = !!s.active_sessions?.session_id
      && lastSeen != null
      && (Date.now() - new Date(lastSeen).getTime() < 120_000);
    return {
      slot_idx: s.slot_idx,
      auth_user_id: s.auth_user_id,
      display_name: s.profiles?.username ?? null,
      claimed_at: s.claimed_at,
      online,
    };
  });

  return json({ ok: true, slots: out });
});
