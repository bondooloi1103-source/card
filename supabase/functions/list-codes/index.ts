import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user?.app_metadata?.is_admin) return json({ ok: false, reason: 'forbidden' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin
    .from('access_codes')
    .select('code, grants_admin, created_at, redeemed_by, redeemed_at')
    .order('created_at', { ascending: false });
  if (error) return json({ ok: false, reason: error.message }, 500);

  return json({
    ok: true,
    codes: data.map((r: Record<string, unknown>) => ({
      id: r.code,
      code: r.code,
      grants_admin: r.grants_admin,
      created_at: r.created_at,
      used_by: r.redeemed_by,
      used_at: r.redeemed_at,
    })),
  });
});
