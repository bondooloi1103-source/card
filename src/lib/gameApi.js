import { supabase } from '@/lib/supabase';

export async function fetchTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, lang, round_size, starts_at, ends_at, published')
    .order('starts_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTournamentParticipantCounts(tournamentIds) {
  if (!tournamentIds.length) return {};
  const { data, error } = await supabase
    .from('game_results')
    .select('tournament_id, user_id')
    .in('tournament_id', tournamentIds);
  if (error) throw new Error(error.message);
  const counts = {};
  for (const row of data ?? []) {
    counts[row.tournament_id] = (counts[row.tournament_id] ?? 0) + 1;
  }
  return counts;
}

export async function fetchMyTournamentEntries(userId) {
  const { data, error } = await supabase
    .from('game_results')
    .select('tournament_id')
    .eq('user_id', userId)
    .not('tournament_id', 'is', null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.tournament_id));
}

export async function fetchTournamentLeaderboard(tournamentId) {
  const { data, error } = await supabase
    .from('v_tournament_leaderboard')
    .select('tournament_id, user_id, username, score, total, completed_at, rank')
    .eq('tournament_id', tournamentId)
    .order('rank', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTournament(id) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, lang, round_size, starts_at, ends_at, published')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message ?? 'function_error');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

/**
 * @param {{
 *   mode: string,
 *   lang: string,
 *   round_size: number,
 *   tournament_id?: string,
 *   timer_s?: number,
 *   player_cap?: number,
 *   from_session_id?: string,
 * }} opts
 */
export async function createSession(opts) {
  const { mode, lang, round_size, tournament_id, timer_s, player_cap, from_session_id } = opts;
  const body = { mode, lang, round_size };
  if (tournament_id) body.tournament_id = tournament_id;
  if (timer_s) body.timer_s = timer_s;
  if (player_cap) body.player_cap = player_cap;
  if (from_session_id) body.from_session_id = from_session_id;
  const { id, seed, join_code, share_path } = await invoke('game-create-session', body);
  return { id, seed, join_code, share_path };
}

export async function submitResult({ session_id, answers }) {
  const { score, total, correct_fig_ids } = await invoke('game-submit-result', {
    session_id,
    answers,
  });
  return { score, total, correct_fig_ids };
}

export async function fetchSession(id) {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(
      'id, seed, mode, lang, round_size, host_user_id, status, expires_at, created_at',
    )
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchSessionResults(sessionId) {
  const { data, error } = await supabase
    .from('game_results')
    .select('session_id, user_id, score, total, answers, completed_at')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchLeaderboard(kind, limit = 20) {
  const view = kind === 'all_time' ? 'game_leaderboard_all_time' : 'game_leaderboard_weekly';
  const { data, error } = await supabase
    .from(view)
    .select('user_id, username, total_points, games_played, accuracy_pct')
    .order('total_points', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
