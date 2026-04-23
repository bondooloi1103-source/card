import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { snapshot } from '@/lib/liveRoomApi';

/**
 * Subscribes to a live-room Realtime channel and reconciles with snapshot
 * on mount. Accepts either a session_id string or `{ sessionId?, joinCode? }`.
 */
export function useLiveRoom(sessionIdOrKeys) {
  const [state, setState] = useState({
    loading: true,
    session: null,
    participants: [],
    lastReveal: null,
    error: null,
    presence: {},
  });
  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const snap = await snapshot(sessionIdOrKeys);
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          session: snap.session,
          participants: snap.participants ?? [],
          error: null,
        }));

        const sid = snap.session.id;
        await supabase.realtime.setAuth();
        if (cancelled) return;
        const channel = supabase.channel(`game:session:${sid}`, {
          config: { private: true },
        });
        channelRef.current = channel;

        channel.on('broadcast', { event: '*' }, (msg) => {
          if (cancelled) return;
          applyEvent(setState, msg);
        });
        channel.on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const presenceState = channel.presenceState();
          const presence = {};
          for (const key of Object.keys(presenceState)) {
            for (const e of presenceState[key]) presence[e.user_id ?? key] = true;
          }
          setState((s) => ({ ...s, presence }));
        });

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') channel.track({ user_id: 'self' });
        });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
    }

    init();
    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof sessionIdOrKeys === 'string' ? sessionIdOrKeys : (sessionIdOrKeys?.sessionId ?? sessionIdOrKeys?.joinCode)]);

  return state;
}

function applyEvent(setState, msg) {
  const event = msg.event;
  const p = msg.payload;
  setState((s) => {
    switch (event) {
      case 'lobby_update':
        return {
          ...s,
          participants: p.players ?? s.participants,
          session: s.session ? { ...s.session, ...p.settings } : s.session,
        };
      case 'start':
        return {
          ...s,
          session: s.session ? {
            ...s.session,
            status: 'in_progress',
            current_round_idx: p.round_idx,
            current_sent_at: p.sent_at,
            timer_s: p.timer_s,
          } : s.session,
        };
      case 'question':
        return {
          ...s,
          session: s.session ? {
            ...s.session,
            current_round_idx: p.round_idx,
            current_sent_at: p.sent_at,
          } : s.session,
          participants: s.participants.map((pp) => ({ ...pp, current_round_answer: null })),
        };
      case 'answer_submitted':
        return {
          ...s,
          participants: s.participants.map((pp) =>
            pp.user_id === p.user_id
              ? { ...pp, current_round_answer: pp.current_round_answer ?? { correct: p.correct, ms: p.ms, pickedFigId: null } }
              : pp,
          ),
        };
      case 'reveal':
        return { ...s, lastReveal: p };
      case 'end':
        return {
          ...s,
          session: s.session ? { ...s.session, status: 'complete' } : s.session,
          lastReveal: { ...p, final: true },
        };
      case 'host_changed':
        return { ...s, session: s.session ? { ...s.session, host_user_id: p.new_host_user_id } : s.session };
      case 'rematch_ready':
        return {
          ...s,
          session: s.session
            ? { ...s.session, rematch_session_id: p.new_session_id, rematch_join_code: p.new_join_code }
            : s.session,
        };
      default:
        return s;
    }
  });
}
