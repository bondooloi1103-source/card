import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const STALE_SECONDS = 120;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }
  const userJwt = authHeader.slice(7).trim();
  if (!userJwt) return json({ ok: false, reason: 'unauthorized' }, 401);

  let body: { device_label?: string; force?: boolean };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 1. Verify the JWT and extract the user.
  const { data: userResp, error: userErr } = await admin.auth.getUser(userJwt);
  if (userErr || !userResp.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userResp.user.id;

  // 2. Admin exemption.
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profErr) return json({ ok: false, reason: 'server' }, 500);
  if (profile?.is_admin) return json({ ok: true, exempt: true });

  // 3. Atomic claim.
  const newSessionId = crypto.randomUUID();
  const deviceLabel = (body.device_label ?? '').slice(0, 200);
  const force = !!body.force;

  const { data: rows, error: rpcErr } = await admin.rpc('claim_session_atomic', {
    p_user_id: userId,
    p_session_id: newSessionId,
    p_device_label: deviceLabel,
    p_force: force,
    p_stale_seconds: STALE_SECONDS,
  });
  if (rpcErr) return json({ ok: false, reason: 'server' }, 500);

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return json({ ok: false, reason: 'server' }, 500);

  if (!row.claimed) {
    return json({
      ok: false,
      blocked: true,
      device_label: row.device_label,
      last_seen: row.last_seen,
    });
  }

  // 4. Forced takeover of a *different* prior session → revoke other refresh tokens.
  if (row.previous_session_id) {
    try {
      // admin.signOut takes a JWT; passing the just-verified userJwt with scope
      // 'others' kills every other session for this user except the current one.
      await admin.auth.admin.signOut(userJwt, 'others');
    } catch (e) {
      console.warn('admin.signOut(others) failed:', e);
      // Non-fatal — heartbeat will still evict the old device.
    }
  }

  return json({ ok: true, exempt: false, session_id: newSessionId });
});
