import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { buildRoundFromSeed } from '../_shared/seededRound.ts';
import { FIGURES } from '../_shared/figures.ts';

const PRESENCE_CHANNEL = (sid: string) => `game:session:${sid}`;

async function broadcast(admin: SupabaseClient, sessionId: string, event: string, payload: unknown) {
  const ch = admin.channel(PRESENCE_CHANNEL(sessionId));
  await ch.send({ type: 'broadcast', event, payload });
  await admin.removeChannel(ch);
}

async function loadLobby(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('id, host_user_id, lang, round_size, timer_s, player_cap, status')
    .eq('id', sessionId)
    .maybeSingle();
  const { data: participants } = await admin
    .from('game_participants')
    .select('user_id, joined_at')
    .eq('session_id', sessionId);
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (participants ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  return {
    settings: {
      lang: session?.lang,
      round_size: session?.round_size,
      timer_s: session?.timer_s,
      player_cap: session?.player_cap,
    },
    players: (participants ?? []).map((p) => ({
      user_id: p.user_id,
      username: usernameById.get(p.user_id) ?? null,
      is_host: p.user_id === session?.host_user_id,
    })),
  };
}

async function doReveal(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('current_round_idx, current_deadline, seed, round_size, timer_s, host_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return;

  const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);
  const q = round[session.current_round_idx];
  if (!q) return;

  const { data: parts } = await admin
    .from('game_participants')
    .select('user_id, current_score, current_round_answer')
    .eq('session_id', sessionId);

  for (const p of parts ?? []) {
    const a = p.current_round_answer as { correct?: boolean } | null;
    if (a?.correct) {
      await admin
        .from('game_participants')
        .update({ current_score: (p.current_score ?? 0) + 1 })
        .eq('session_id', sessionId)
        .eq('user_id', p.user_id);
    }
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (parts ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const standings = (parts ?? [])
    .map((p) => {
      const a = p.current_round_answer as { correct?: boolean; ms?: number } | null;
      return {
        user_id: p.user_id,
        username: usernameById.get(p.user_id) ?? null,
        score: (p.current_score ?? 0) + (a?.correct ? 1 : 0),
        last_correct: !!a?.correct,
        last_ms: a?.ms ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  const nextAt = new Date(Date.now() + 3000);
  await admin
    .from('game_sessions')
    .update({ current_deadline: nextAt.toISOString() })
    .eq('id', sessionId);

  await broadcast(admin, sessionId, 'reveal', {
    round_idx: session.current_round_idx,
    correct_fig_id: q.figId,
    standings,
    next_question_at: nextAt.toISOString(),
  });
}

async function doEnd(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('id, seed, round_size, tournament_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return;

  const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);

  const { data: parts } = await admin
    .from('game_participants')
    .select('user_id, current_score')
    .eq('session_id', sessionId);

  for (const p of parts ?? []) {
    await admin.from('game_results').insert({
      session_id: sessionId,
      user_id: p.user_id,
      tournament_id: session.tournament_id,
      score: p.current_score ?? 0,
      total: round.length,
      answers: [],
    });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (parts ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const finalStandings = (parts ?? [])
    .map((p) => ({
      user_id: p.user_id,
      username: usernameById.get(p.user_id) ?? null,
      score: p.current_score ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  await admin
    .from('game_sessions')
    .update({ status: 'complete', ends_at: new Date().toISOString() })
    .eq('id', sessionId);

  await broadcast(admin, sessionId, 'end', { final_standings: finalStandings });
}

function randSeed(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
function randJoinCode(): string {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, reason: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { session_id?: string; event?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const { session_id, event, payload } = body;
  if (!session_id || !event) return json({ ok: false, reason: 'bad_request' }, 400);

  const admin = createClient(url, service);

  const { data: session, error: sErr } = await admin
    .from('game_sessions')
    .select('id, mode, lang, round_size, timer_s, player_cap, host_user_id, status, seed, current_round_idx, current_sent_at, current_deadline, rematch_session_id, tournament_id')
    .eq('id', session_id)
    .maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  if (session.mode !== 'live_room') return json({ ok: false, reason: 'not_live_room' }, 400);

  switch (event) {
    case 'join': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      const { count } = await admin
        .from('game_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session_id);
      if ((count ?? 0) >= (session.player_cap ?? 8)) {
        return json({ ok: false, reason: 'room_full' }, 409);
      }
      await admin.from('game_participants').upsert(
        { session_id, user_id: userId },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true },
      );
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    case 'leave': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      await admin.from('game_participants').delete()
        .eq('session_id', session_id).eq('user_id', userId);
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    case 'update_settings': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      if (session.host_user_id !== userId) return json({ ok: false, reason: 'not_host' }, 403);
      const updates: Record<string, unknown> = {};
      if (payload?.lang && ['mn', 'en'].includes(payload.lang as string)) updates.lang = payload.lang;
      if (payload?.round_size && Number.isInteger(payload.round_size)
          && (payload.round_size as number) >= 5 && (payload.round_size as number) <= 20) {
        updates.round_size = payload.round_size;
      }
      if (payload?.timer_s && [10, 15, 20].includes(payload.timer_s as number)) updates.timer_s = payload.timer_s;
      if (Object.keys(updates).length === 0) return json({ ok: false, reason: 'bad_request' }, 400);
      await admin.from('game_sessions').update(updates).eq('id', session_id);
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    case 'start': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      if (session.host_user_id !== userId) return json({ ok: false, reason: 'not_host' }, 403);
      const { count } = await admin
        .from('game_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session_id);
      if ((count ?? 0) < 2) return json({ ok: false, reason: 'need_two_players' }, 409);

      const now = new Date();
      const deadline = new Date(now.getTime() + (session.timer_s ?? 15) * 1000 + 500);
      await admin.from('game_sessions').update({
        status: 'in_progress',
        current_round_idx: 0,
        current_sent_at: now.toISOString(),
        current_deadline: deadline.toISOString(),
        starts_at: now.toISOString(),
      }).eq('id', session_id);
      await admin.from('game_participants').update({
        current_round_answer: null, current_score: 0,
      }).eq('session_id', session_id);

      await broadcast(admin, session_id, 'start', {
        server_start_ts: now.toISOString(),
        round_idx: 0,
        timer_s: session.timer_s,
        sent_at: now.toISOString(),
      });
      return json({ ok: true });
    }

    case 'answer':
    case 'timeout_null': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);

      const { data: part } = await admin
        .from('game_participants')
        .select('user_id, current_round_answer')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!part) return json({ ok: false, reason: 'not_participant' }, 403);
      if (part.current_round_answer != null) {
        return json({ ok: false, reason: 'already_answered_this_round' }, 409);
      }

      const now = new Date();
      const deadline = new Date(session.current_deadline!);
      const isTimeout = event === 'timeout_null';
      if (!isTimeout && now.getTime() > deadline.getTime()) {
        return json({ ok: false, reason: 'too_late' }, 409);
      }

      const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);
      const q = round[session.current_round_idx!];
      if (!q) return json({ ok: false, reason: 'bad_state' }, 500);

      let pickedFigId: number | null = null;
      if (!isTimeout) {
        const pf = (payload?.pickedFigId ?? null) as number | null;
        if (pf != null && q.optionFigIds.includes(pf)) pickedFigId = pf;
      }
      const correct = pickedFigId != null && pickedFigId === q.figId;
      const ms = Math.max(
        0,
        Math.min(120000, now.getTime() - new Date(session.current_sent_at!).getTime()),
      );

      await admin.from('game_participants').update({
        current_round_answer: { pickedFigId, ms, correct },
      }).eq('session_id', session_id).eq('user_id', userId);

      await broadcast(admin, session_id, 'answer_submitted', {
        user_id: userId, correct, ms,
      });

      const { data: allParts } = await admin
        .from('game_participants')
        .select('current_round_answer')
        .eq('session_id', session_id);
      const allAnswered = (allParts ?? []).every((p) => p.current_round_answer != null);
      if (allAnswered) await doReveal(admin, session_id);

      return json({ ok: true, correct });
    }

    case 'reveal': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);
      const now = new Date();
      const deadline = new Date(session.current_deadline!);
      let permitted = session.host_user_id === userId || now.getTime() > deadline.getTime();
      if (!permitted) {
        const { data: allParts } = await admin
          .from('game_participants')
          .select('current_round_answer')
          .eq('session_id', session_id);
        permitted = (allParts ?? []).every((p) => p.current_round_answer != null);
      }
      if (!permitted) return json({ ok: false, reason: 'not_allowed' }, 403);
      await doReveal(admin, session_id);
      return json({ ok: true });
    }

    case 'next_question': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);
      const now = new Date();
      const deadlinePassed = session.current_deadline
        && now.getTime() >= new Date(session.current_deadline).getTime();
      if (session.host_user_id !== userId && !deadlinePassed) {
        return json({ ok: false, reason: 'too_early' }, 403);
      }
      const nextIdx = (session.current_round_idx ?? 0) + 1;
      if (nextIdx >= session.round_size) {
        await doEnd(admin, session_id);
        return json({ ok: true, ended: true });
      }
      const questionSentAt = new Date();
      const deadline = new Date(questionSentAt.getTime() + (session.timer_s ?? 15) * 1000 + 500);
      await admin.from('game_sessions').update({
        current_round_idx: nextIdx,
        current_sent_at: questionSentAt.toISOString(),
        current_deadline: deadline.toISOString(),
      }).eq('id', session_id);
      await admin.from('game_participants').update({ current_round_answer: null })
        .eq('session_id', session_id);
      await broadcast(admin, session_id, 'question', {
        round_idx: nextIdx,
        sent_at: questionSentAt.toISOString(),
        timer_s: session.timer_s,
      });
      return json({ ok: true });
    }

    case 'host_gone': {
      const { data: caller } = await admin
        .from('game_participants')
        .select('user_id')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!caller) return json({ ok: false, reason: 'not_participant' }, 403);

      const { data: parts } = await admin
        .from('game_participants')
        .select('user_id, joined_at')
        .eq('session_id', session_id)
        .order('joined_at', { ascending: true });
      const next = (parts ?? []).find((p) => p.user_id !== session.host_user_id);
      if (!next) return json({ ok: true, noop: true });
      if (session.host_user_id === next.user_id) return json({ ok: true, noop: true });

      await admin.from('game_sessions').update({ host_user_id: next.user_id }).eq('id', session_id);
      await broadcast(admin, session_id, 'host_changed', { new_host_user_id: next.user_id });
      return json({ ok: true, new_host_user_id: next.user_id });
    }

    case 'rematch': {
      if (session.status !== 'complete') return json({ ok: false, reason: 'bad_state' }, 409);

      const { data: caller } = await admin
        .from('game_participants')
        .select('user_id')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!caller) return json({ ok: false, reason: 'not_participant' }, 403);

      if (session.rematch_session_id) {
        const { data: existing } = await admin
          .from('game_sessions')
          .select('id, join_code')
          .eq('id', session.rematch_session_id)
          .maybeSingle();
        return json({
          ok: false,
          reason: 'duplicate_rematch',
          new_session_id: existing?.id ?? null,
          new_join_code: existing?.join_code ?? null,
        });
      }

      const { data: newSession, error: insErr } = await admin
        .from('game_sessions')
        .insert({
          seed: randSeed(),
          mode: 'live_room',
          lang: session.lang,
          round_size: session.round_size,
          timer_s: session.timer_s,
          player_cap: session.player_cap,
          host_user_id: userId,
          status: 'open',
          join_code: randJoinCode(),
        })
        .select('id, join_code')
        .single();
      if (insErr || !newSession) return json({ ok: false, reason: 'server' }, 500);

      const { error: casErr } = await admin
        .from('game_sessions')
        .update({ rematch_session_id: newSession.id })
        .eq('id', session_id)
        .is('rematch_session_id', null);
      if (casErr) {
        await admin.from('game_sessions').delete().eq('id', newSession.id);
        const { data: winner } = await admin
          .from('game_sessions')
          .select('rematch_session_id')
          .eq('id', session_id)
          .maybeSingle();
        const { data: winnerNew } = await admin
          .from('game_sessions')
          .select('id, join_code')
          .eq('id', winner?.rematch_session_id ?? '')
          .maybeSingle();
        return json({
          ok: false,
          reason: 'duplicate_rematch',
          new_session_id: winnerNew?.id ?? null,
          new_join_code: winnerNew?.join_code ?? null,
        });
      }

      await admin.from('game_participants').insert({
        session_id: newSession.id, user_id: userId,
      });

      await broadcast(admin, session_id, 'rematch_ready', {
        new_session_id: newSession.id,
        new_join_code: newSession.join_code,
      });
      return json({ ok: true, new_session_id: newSession.id, new_join_code: newSession.join_code });
    }

    default:
      return json({ ok: false, reason: 'unknown_event' }, 400);
  }
});
