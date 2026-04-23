import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  // Accept session_id (UUID) or join_code (6-char). Plan routes use the code;
  // internal calls use the id. Try id first; fall back to code.
  let sessionId: string | null = null;
  let joinCode: string | null = null;
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    sessionId = params.get('session_id');
    joinCode = params.get('join_code');
  } else {
    try {
      const body = await req.json();
      sessionId = body?.session_id ?? null;
      joinCode = body?.join_code ?? null;
    } catch {
      return json({ ok: false, reason: 'bad_request' }, 400);
    }
  }
  if (!sessionId && !joinCode) return json({ ok: false, reason: 'bad_request' }, 400);

  const admin = createClient(url, service);

  const query = admin
    .from('game_sessions')
    .select('id, status, mode, lang, round_size, timer_s, host_user_id, current_round_idx, current_sent_at, current_deadline, rematch_session_id, seed, join_code');
  const { data: session, error: sErr } = await (
    sessionId ? query.eq('id', sessionId) : query.eq('join_code', joinCode)
  ).maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  sessionId = session.id;

  const { data: part } = await admin
    .from('game_participants')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part && session.host_user_id !== userId) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }

  const { data: participants } = await admin
    .from('game_participants')
    .select('user_id, joined_at, current_score, current_round_answer')
    .eq('session_id', sessionId);

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (participants ?? []).map((p) => p.user_id));

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const scrubbed = (participants ?? []).map((p) => ({
    user_id: p.user_id,
    username: usernameById.get(p.user_id) ?? null,
    joined_at: p.joined_at,
    current_score: p.current_score,
    current_round_answer:
      p.user_id === userId || session.host_user_id === userId ? p.current_round_answer : null,
  }));

  return json({ ok: true, session, participants: scrubbed });
});
