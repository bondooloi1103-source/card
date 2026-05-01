import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

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
  if (profile?.parent_user_id) return json({ ok: false, reason: 'guests_cannot_init' }, 403);

  try {
    await assertActiveSession(admin, userId, req.headers.get('x-session-id'));
  } catch (e) {
    if (e instanceof SessionRevokedError) return json({ ok: false, reason: 'session_revoked' }, 401);
    throw e;
  }

  const rows = [1, 2, 3, 4, 5].map((slot_idx) => ({ parent_user_id: userId, slot_idx }));
  const { error } = await admin.from('guest_slots').upsert(rows, {
    onConflict: 'parent_user_id,slot_idx',
    ignoreDuplicates: true,
  });
  if (error) return json({ ok: false, reason: 'server' }, 500);

  return json({ ok: true });
});
