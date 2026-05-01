import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  let body: { code?: string; username?: string; password?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const code = body.code?.trim().toUpperCase();
  const username = body.username?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  if (!code) return json({ ok: false, reason: 'bad_request' }, 400);
  if (!USERNAME_RE.test(username)) return json({ ok: false, reason: 'invalid_username' }, 200);
  if (password.length < 4) return json({ ok: false, reason: 'weak_password' }, 200);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // Block guest accounts from redeeming new codes.
  // Note: unauthenticated callers (anon key) bypass the check — getUser returns
  // no user. Only an actual signed-in guest hits the 403.
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (authHeader) {
    const { data: u } = await admin.auth.getUser(authHeader);
    if (u?.user) {
      const { data: prof } = await admin.from('profiles')
        .select('parent_user_id').eq('id', u.user.id).maybeSingle();
      if (prof?.parent_user_id) {
        return json({ ok: false, reason: 'guests_cannot_redeem' }, 403);
      }
    }
  }

  // 1. Validate code
  const { data: codeRow, error: codeErr } = await admin
    .from('access_codes')
    .select('code, grants_admin, redeemed_by')
    .eq('code', code)
    .maybeSingle();

  if (codeErr) return json({ ok: false, reason: 'server' }, 500);
  if (!codeRow) return json({ ok: false, reason: 'not_found' }, 200);
  if (codeRow.redeemed_by) return json({ ok: false, reason: 'already_used' }, 200);

  // 2. Reject if username is taken
  const email = `${username}@users.local`;
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existingProfile) return json({ ok: false, reason: 'username_taken' }, 200);

  // 3. Create auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
    app_metadata: { is_admin: !!codeRow.grants_admin },
  });
  if (createErr || !created.user) {
    return json({ ok: false, reason: createErr?.message ?? 'create_failed' }, 500);
  }

  // 4. Mark code redeemed (atomic via conditional update to prevent race)
  const { error: markErr, data: marked } = await admin
    .from('access_codes')
    .update({ redeemed_by: created.user.id, redeemed_at: new Date().toISOString() })
    .eq('code', code)
    .is('redeemed_by', null)
    .select()
    .maybeSingle();

  if (markErr || !marked) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ ok: false, reason: 'already_used' }, 200);
  }

  // 5. Sign the new user in to return a session
  const anonClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) {
    return json({ ok: false, reason: 'signin_failed' }, 500);
  }

  return json({ ok: true, session: signIn.session });
});
