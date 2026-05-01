import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { buildRoundFromSeed } from '../_shared/seededRound.ts';
import { figurePoolFor } from '../_shared/rosterGate.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

interface IncomingAnswer {
  idx: number;
  pickedFigId: number | null;
  ms: number;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { session_id?: string; answers?: IncomingAnswer[] };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  if (!body.session_id || !Array.isArray(body.answers)) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const admin = createClient(url, service);

  const sessionIdHeader = req.headers.get('x-session-id');
  try {
    await assertActiveSession(admin, userId, sessionIdHeader);
  } catch (e) {
    if (e instanceof SessionRevokedError) {
      return json({ ok: false, reason: 'session_revoked' }, 401);
    }
    throw e;
  }

  const { data: session, error: sErr } = await admin
    .from('game_sessions')
    .select('id, seed, lang, round_size, status, mode, tournament_id, eligible_fig_ids')
    .eq('id', body.session_id)
    .maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  if (session.status === 'abandoned') return json({ ok: false, reason: 'abandoned' }, 410);
  if (session.status === 'complete' && session.mode === 'solo') {
    return json({ ok: false, reason: 'already_submitted' }, 409);
  }

  // Participant check. For async_duel we auto-enrol the opener (player B).
  const { data: part } = await admin
    .from('game_participants')
    .select('user_id')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part) {
    if (session.mode === 'async_duel') {
      const { error: pInsErr } = await admin
        .from('game_participants')
        .insert({ session_id: session.id, user_id: userId });
      if (pInsErr) return json({ ok: false, reason: 'server' }, 500);
    } else {
      return json({ ok: false, reason: 'not_participant' }, 403);
    }
  }

  // One submission per (session, user).
  const { data: existing } = await admin
    .from('game_results')
    .select('user_id')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return json({ ok: false, reason: 'already_submitted' }, 409);

  // Rebuild the authoritative round from the stored seed.
  const round = buildRoundFromSeed(figurePoolFor(session.eligible_fig_ids), session.round_size, session.seed);

  // Re-score. Client sends pickedFigId; server verifies against the seeded
  // round and ignores any client-sent correctness flag. An answer is correct
  // only when pickedFigId matches q.figId AND is one of the options the
  // client was given (prevents picking any figId as a shortcut).
  let score = 0;
  const verifiedAnswers: Array<{
    idx: number;
    pickedFigId: number | null;
    correct: boolean;
    ms: number;
  }> = [];
  for (const a of body.answers) {
    const q = round[a.idx];
    if (!q) continue;
    const isValidPick = a.pickedFigId != null && q.optionFigIds.includes(a.pickedFigId);
    const correct = isValidPick && a.pickedFigId === q.figId;
    if (correct) score++;
    verifiedAnswers.push({
      idx: a.idx,
      pickedFigId: a.pickedFigId,
      correct,
      ms: Math.max(0, Math.min(120000, a.ms | 0)),
    });
  }

  const total = round.length;

  const { error: insErr } = await admin.from('game_results').insert({
    session_id: session.id,
    user_id: userId,
    tournament_id: session.tournament_id,
    score,
    total,
    answers: verifiedAnswers,
  });
  if (insErr) return json({ ok: false, reason: 'server' }, 500);

  // --- Status transition ---
  if (session.mode === 'solo') {
    await admin.from('game_sessions').update({ status: 'complete' }).eq('id', session.id);
  } else if (session.mode === 'async_duel') {
    const { count } = await admin
      .from('game_results')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id);
    if ((count ?? 0) >= 2) {
      await admin.from('game_sessions').update({ status: 'complete' }).eq('id', session.id);
    }
  }

  return json({
    ok: true,
    score,
    total,
    correct_fig_ids: round.map((q) => q.figId),
  });
});
