import { supabase } from '@/lib/supabase';

async function callInvoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError wraps non-2xx responses with a generic message and
    // hides the body. Pull `reason` out of the real response so callers can
    // localize (need_two_players, room_full, already_entered, etc.).
    let reason = null;
    try {
      const parsed = await error.context?.json?.();
      reason = parsed?.reason ?? null;
    } catch { /* body wasn't JSON */ }
    throw new Error(reason || error.message || 'function_error');
  }
  return data;
}

/**
 * Fetch a live-room snapshot. Accepts either a session_id string or a keyed
 * arg `{ sessionId?, joinCode? }`.
 */
export async function snapshot(idOrKeys) {
  const body = typeof idOrKeys === 'string'
    ? { session_id: idOrKeys }
    : {
        session_id: idOrKeys?.sessionId ?? null,
        join_code: idOrKeys?.joinCode ?? null,
      };
  const data = await callInvoke('game-live-snapshot', body);
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

export async function sendEvent(sessionId, event, payload = {}) {
  const data = await callInvoke('game-live-event', { session_id: sessionId, event, payload });
  return data;
}

export async function joinRoom(sessionId) {
  const data = await sendEvent(sessionId, 'join');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

export async function leaveRoom(sessionId) {
  await sendEvent(sessionId, 'leave');
}

export async function updateSettings(sessionId, settings) {
  const data = await sendEvent(sessionId, 'update_settings', settings);
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
}

export async function startRoom(sessionId) {
  const data = await sendEvent(sessionId, 'start');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
}

export async function submitAnswer({ session_id, pickedFigId }) {
  if (pickedFigId == null) return sendEvent(session_id, 'timeout_null', {});
  return sendEvent(session_id, 'answer', { pickedFigId });
}

export async function requestReveal(sessionId) {
  return sendEvent(sessionId, 'reveal');
}

export async function requestNext(sessionId) {
  return sendEvent(sessionId, 'next_question');
}

export async function requestHostGone(sessionId) {
  return sendEvent(sessionId, 'host_gone');
}

export async function requestRematch(sessionId) {
  const data = await sendEvent(sessionId, 'rematch');
  if (data?.ok || data?.reason === 'duplicate_rematch') {
    return {
      new_session_id: data.new_session_id,
      new_join_code: data.new_join_code,
    };
  }
  throw new Error(data?.reason ?? 'unknown_error');
}
