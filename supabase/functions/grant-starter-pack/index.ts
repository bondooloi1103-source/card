import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

const STARTER_FIG_IDS = [1, 3, 14] as const;

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthenticated' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, reason: 'unauthenticated' }, 401);
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('starter_granted_at, parent_user_id')
    .eq('id', userId)
    .maybeSingle();
  if (profErr) return json({ ok: false, reason: 'db_error' }, 500);

  // Guests don't own cards; never grant a starter pack. Caught by Codex
  // review 2026-05-01.
  if (profile?.parent_user_id) return json({ ok: false, reason: 'guests_cannot_receive' }, 403);

  try {
    await assertActiveSession(admin, userId, req.headers.get('x-session-id'));
  } catch (e) {
    if (e instanceof SessionRevokedError) return json({ ok: false, reason: 'session_revoked' }, 401);
    throw e;
  }

  if (profile?.starter_granted_at) {
    return json({ ok: true, granted: false, reason: 'already_granted' });
  }

  const rows = STARTER_FIG_IDS.map((fig_id) => ({ user_id: userId, fig_id }));
  const { error: insErr } = await admin
    .from('card_ownership')
    .upsert(rows, { onConflict: 'user_id,fig_id', ignoreDuplicates: true });
  if (insErr) return json({ ok: false, reason: 'db_error' }, 500);

  const { error: updErr } = await admin
    .from('profiles')
    .update({ starter_granted_at: new Date().toISOString() })
    .eq('id', userId);
  if (updErr) return json({ ok: false, reason: 'db_error' }, 500);

  return json({ ok: true, granted: true, fig_ids: STARTER_FIG_IDS });
});
