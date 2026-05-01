import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { QUOTE_FIG_IDS, MIN_FIGS_FOR_ROSTER } from '../_shared/rosterGate.ts';
import { assertActiveSession, SessionRevokedError } from '../_shared/assertActiveSession.ts';

const MODES = new Set(['solo', 'async_duel', 'live_room', 'tournament']);
const LANGS = new Set(['mn', 'en']);

function randSeed(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function randJoinCode(): string {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, no numbers, easy to type
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

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

  let body: {
    mode?: string;
    lang?: string;
    round_size?: number;
    tournament_id?: string;
    timer_s?: number;
    player_cap?: number;
    from_session_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const mode = body.mode ?? 'solo';
  const lang = body.lang ?? 'mn';
  const roundSize = body.round_size ?? 10;

  if (!MODES.has(mode)) return json({ ok: false, reason: 'bad_mode' }, 400);
  if (!LANGS.has(lang)) return json({ ok: false, reason: 'bad_lang' }, 400);
  if (!Number.isInteger(roundSize) || roundSize < 5 || roundSize > 20) {
    return json({ ok: false, reason: 'bad_round_size' }, 400);
  }

  const admin = createClient(url, service);

  const sessionId = req.headers.get('x-session-id');
  try {
    await assertActiveSession(admin, userId, sessionId);
  } catch (e) {
    if (e instanceof SessionRevokedError) {
      return json({ ok: false, reason: 'session_revoked' }, 401);
    }
    throw e;
  }

  // --- Seed resolution ---
  let seed = randSeed();
  let tournamentId: string | null = null;
  let resolvedLang = lang;
  let resolvedRoundSize = roundSize;

  if (mode === 'tournament') {
    if (!body.tournament_id) return json({ ok: false, reason: 'bad_request' }, 400);
    const { data: t, error: tErr } = await admin
      .from('tournaments')
      .select('id, seed, lang, round_size, starts_at, ends_at, published')
      .eq('id', body.tournament_id)
      .maybeSingle();
    if (tErr || !t) return json({ ok: false, reason: 'not_found' }, 404);
    const now = Date.now();
    if (new Date(t.starts_at).getTime() > now || new Date(t.ends_at).getTime() < now) {
      return json({ ok: false, reason: 'tournament_closed' }, 400);
    }
    seed = t.seed;
    tournamentId = t.id;
    resolvedLang = t.lang;
    resolvedRoundSize = t.round_size;
  }

  if (mode === 'async_duel' && body.from_session_id) {
    // Promote an existing solo session: reuse its seed, flip its mode.
    const { data: fromSession, error: fsErr } = await admin
      .from('game_sessions')
      .select('id, seed, host_user_id, mode, lang, round_size')
      .eq('id', body.from_session_id)
      .maybeSingle();
    if (fsErr || !fromSession) return json({ ok: false, reason: 'not_found' }, 404);
    if (fromSession.host_user_id !== userId) return json({ ok: false, reason: 'forbidden' }, 403);
    if (fromSession.mode !== 'solo') return json({ ok: false, reason: 'already_promoted' }, 409);

    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { error: upErr } = await admin
      .from('game_sessions')
      .update({ mode: 'async_duel', expires_at: expires })
      .eq('id', fromSession.id);
    if (upErr) return json({ ok: false, reason: 'server' }, 500);

    return json({
      ok: true,
      id: fromSession.id,
      seed: fromSession.seed,
      join_code: null,
      share_path: `/duel/${fromSession.id}`,
    });
  }

  // --- Build insert payload ---
  const insert: Record<string, unknown> = {
    seed,
    mode,
    lang: resolvedLang,
    round_size: resolvedRoundSize,
    host_user_id: userId,
    tournament_id: tournamentId,
    status: 'open',
  };

  if (mode === 'live_room') {
    const timer = body.timer_s ?? 15;
    const cap = body.player_cap ?? 8;
    if (![10, 15, 20].includes(timer)) return json({ ok: false, reason: 'bad_timer' }, 400);
    if (!Number.isInteger(cap) || cap < 2 || cap > 8) {
      return json({ ok: false, reason: 'bad_cap' }, 400);
    }
    insert.timer_s = timer;
    insert.player_cap = cap;
    insert.join_code = randJoinCode();
  }

  if (mode === 'async_duel') {
    insert.expires_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  }

  if (mode === 'live_room') {
    const { data: owned, error: ownedError } = await admin
      .from('card_ownership')
      .select('fig_id')
      .eq('user_id', userId);

    // Fail closed: do not silently fall back to full pool when the
    // trust-boundary roster lookup fails or returns a malformed result.
    // The client localizes `roster_lookup_failed` and surfaces a recoverable
    // create-room error.
    if (ownedError || owned == null) {
      return json({ ok: false, reason: 'roster_lookup_failed' }, 503);
    }

    const ownedSet = new Set(owned.map((r) => r.fig_id));
    const eligible = QUOTE_FIG_IDS.filter((id) => ownedSet.has(id));
    insert.eligible_fig_ids =
      eligible.length >= MIN_FIGS_FOR_ROSTER ? eligible : null;
  }

  const { data: session, error: insErr } = await admin
    .from('game_sessions')
    .insert(insert)
    .select('id, seed, join_code')
    .single();

  if (insErr || !session) return json({ ok: false, reason: 'server' }, 500);

  // Creator auto-joins as participant.
  await admin.from('game_participants').insert({ session_id: session.id, user_id: userId });

  const sharePath =
    mode === 'async_duel'
      ? `/duel/${session.id}`
      : mode === 'live_room'
        ? `/game/live/${session.join_code}`
        : null;

  return json({
    ok: true,
    id: session.id,
    seed: session.seed,
    join_code: session.join_code,
    share_path: sharePath,
  });
});
