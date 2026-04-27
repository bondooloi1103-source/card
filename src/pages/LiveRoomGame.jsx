import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang, translateReason } from '@/lib/i18n';
import { FIGURES } from '@/lib/figuresData';
import { buildRoundFromSeed } from '@/lib/seededRound';
import { submitAnswer, requestRematch, requestNext, requestReveal } from '@/lib/liveRoomApi';
import { pickMvp } from '@/lib/liveScoring';
import RoundPlayer from '@/components/game/RoundPlayer';
import Timer from '@/components/game/Timer';
import Standings from '@/components/game/Standings';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomGame({ room, sessionId, currentUserId, showResults }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [picked, setPicked] = useState(null);

  const isHost = room.session?.host_user_id === currentUserId;

  const figurePool = useMemo(() => {
    const ids = room.session?.eligible_fig_ids;
    if (!ids || ids.length === 0) return FIGURES;
    const idSet = new Set(ids);
    return FIGURES.filter((f) => idSet.has(f.fig_id));
  }, [room.session?.eligible_fig_ids]);

  const round = useMemo(() => {
    if (!room.session?.seed || !room.session?.round_size) return [];
    return buildRoundFromSeed(figurePool, room.session.round_size, room.session.seed);
  }, [room.session?.seed, room.session?.round_size, figurePool]);

  const currentIdx = room.session?.current_round_idx ?? 0;
  const q = round[currentIdx];

  useEffect(() => { setPicked(null); }, [currentIdx]);

  const revealed = Boolean(room.lastReveal && room.lastReveal.round_idx === currentIdx);

  // Host-only: after reveal, pause ~4s so players see the answer, then advance.
  // Other clients just wait for the 'question' broadcast. Only the host calls
  // next_question to avoid parallel calls racing on the server.
  useEffect(() => {
    if (!revealed || !isHost || !sessionId) return;
    const id = setTimeout(() => {
      requestNext(sessionId).catch(() => { /* swallow — another client already advanced */ });
    }, 4000);
    return () => clearTimeout(id);
  }, [revealed, isHost, sessionId]);

  async function onPick(figId) {
    if (picked !== null) return;
    setPicked(figId);
    try { await submitAnswer({ session_id: sessionId, pickedFigId: figId }); }
    catch { /* local UI already updated */ }
  }

  async function onTimerExpire() {
    if (picked !== null) return;
    setPicked(-1);
    try { await submitAnswer({ session_id: sessionId, pickedFigId: null }); }
    catch { /* swallow */ }
  }

  async function onHostReveal() {
    try { await requestReveal(sessionId); }
    catch (err) { alert(translateReason(t, err.message)); }
  }

  async function onHostNext() {
    try { await requestNext(sessionId); }
    catch (err) { alert(translateReason(t, err.message)); }
  }

  const standings = useMemo(() => {
    return (room.participants ?? [])
      .map((p) => ({
        user_id: p.user_id,
        username: p.username ?? p.user_id.slice(0, 6),
        correct: p.current_score ?? 0,
      }))
      .sort((a, b) => b.correct - a.correct);
  }, [room.participants]);

  if (showResults || room.session?.status === 'complete') {
    return <ResultsView room={room} standings={standings} sessionId={sessionId} navigate={navigate} t={t} lang={lang} />;
  }

  if (!q) {
    return <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-5 md:px-8 py-10">
      <div className="max-w-[56rem] mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
            {String(currentIdx + 1).padStart(2, '0')} / {String(round.length).padStart(2, '0')}
          </span>
          <Timer sentAt={room.session.current_sent_at} timerS={room.session.timer_s} onExpire={onTimerExpire} />
        </div>

        <RoundPlayer
          question={q}
          figures={FIGURES}
          picked={picked === -1 ? null : picked}
          onPick={onPick}
          revealed={revealed}
          correctFigId={revealed ? room.lastReveal.correct_fig_id : null}
          lang={lang}
        />

        <Standings standings={standings} mode={revealed ? 'reveal' : 'in_round'} currentUserId={currentUserId} />

        {isHost && (
          <div className="flex items-center justify-center gap-3">
            {!revealed && (
              <button
                onClick={onHostReveal}
                className="px-4 py-2 text-xs font-meta tracking-[0.25em] uppercase text-brass border border-brass/40 hover:text-ivory hover:border-brass transition-colors"
              >
                {lang === 'en' ? 'Reveal' : 'Нээх'}
              </button>
            )}
            {revealed && (
              <button
                onClick={onHostNext}
                className="px-4 py-2 text-xs font-meta tracking-[0.25em] uppercase text-ivory bg-seal/80 border border-seal hover:bg-seal transition-colors"
              >
                {lang === 'en' ? 'Next →' : 'Дараагийн →'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsView({ room, standings, sessionId, navigate, t, lang }) {
  const [rematching, setRematching] = useState(false);
  const mvp = pickMvp(standings);

  async function onRematch() {
    setRematching(true);
    try {
      const { new_join_code } = await requestRematch(sessionId);
      if (new_join_code) navigate(`/games/quotes/live/${new_join_code}`);
    } catch (err) {
      alert(translateReason(t, err.message));
    } finally {
      setRematching(false);
    }
  }

  if (room.session?.rematch_join_code) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-ivory">{t('live.results.joinRematch')}</h1>
        <BrassButton variant="primary" size="md" onClick={() => navigate(`/games/quotes/live/${room.session.rematch_join_code}`)}>
          {room.session.rematch_join_code}
        </BrassButton>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-3xl text-ivory">
        {lang === 'en' ? 'Final standings' : 'Эцсийн дүн'}
      </h1>
      <Standings standings={standings} mode="final" currentUserId={null} />
      {mvp && standings[0] && (
        <p className="font-meta text-[10px] uppercase tracking-[0.3em] text-brass mt-4">
          ★ MVP: {standings[0].username}
        </p>
      )}
      <BrassButton variant="primary" size="md" onClick={onRematch} disabled={rematching}>
        {t('live.results.rematch')}
      </BrassButton>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl w-full space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
