import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchSession, fetchSessionResults, createSession } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function DuelSummary() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [state, setState] = useState({
    loading: true,
    session: null,
    results: [],
    error: null,
  });
  const [rematching, setRematching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, r] = await Promise.all([fetchSession(id), fetchSessionResults(id)]);
        if (cancelled) return;
        setState({ loading: false, session: s, results: r, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, session: null, results: [], error: err.message ?? 'load_failed' });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function rematch() {
    if (!state.session) return;
    setRematching(true);
    try {
      const { id: newId } = await createSession({
        mode: 'async_duel',
        lang: state.session.lang,
        round_size: state.session.round_size,
      });
      navigate(`/games/quotes?session=${newId}`);
    } catch (err) {
      alert(err.message ?? 'Failed to rematch');
    } finally {
      setRematching(false);
    }
  }

  if (state.loading) {
    return (
      <Shell>
        <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin mx-auto" />
      </Shell>
    );
  }
  if (!state.session) {
    return (
      <Shell>
        <p className="font-prose italic text-ivory/70">{t('duel.notFound')}</p>
      </Shell>
    );
  }

  const hostRes = state.results.find((r) => r.user_id === state.session.host_user_id);
  const guestRes = state.results.find((r) => r.user_id !== state.session.host_user_id);
  const isHost = userId === state.session.host_user_id;
  const mine = isHost ? hostRes : guestRes;
  const theirs = isHost ? guestRes : hostRes;

  if (!theirs) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-ivory">{t('duel.summary.title')}</h1>
        <p className="font-prose italic text-ivory/70">{t('duel.waiting')}</p>
        {mine && (
          <p className="font-meta text-[11px] uppercase tracking-[0.3em] text-brass">
            {mine.score} / {mine.total}
          </p>
        )}
      </Shell>
    );
  }

  if (!mine) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-ivory">{t('duel.summary.title')}</h1>
        <p className="font-prose italic text-ivory/70">{t('duel.waiting')}</p>
      </Shell>
    );
  }

  let verdict;
  if (mine.score > theirs.score) verdict = t('duel.summary.youWon');
  else if (mine.score < theirs.score) verdict = t('duel.summary.theyWon');
  else verdict = t('duel.summary.tie');

  return (
    <Shell>
      <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">
        {t('duel.summary.title')}
      </p>
      <div className="flex items-center justify-center gap-10 pt-2">
        <div>
          <div className="font-display text-5xl text-ivory">{mine.score}</div>
          <div className="font-meta text-[10px] text-brass/60 uppercase tracking-[0.28em]">
            {lang === 'en' ? 'You' : 'Та'}
          </div>
        </div>
        <div className="font-display text-2xl text-brass/60">vs</div>
        <div>
          <div className="font-display text-5xl text-ivory">{theirs.score}</div>
          <div className="font-meta text-[10px] text-brass/60 uppercase tracking-[0.28em]">
            {lang === 'en' ? 'Them' : 'Тэд'}
          </div>
        </div>
      </div>
      <p className="font-prose italic text-ivory/80 text-lg">{verdict}</p>

      <PerQuestionGrid mine={mine} theirs={theirs} />

      <div className="flex items-center justify-center gap-3 pt-4">
        <BrassButton variant="ghost" size="sm" onClick={() => navigate('/app')}>
          {lang === 'en' ? 'Back' : 'Буцах'}
        </BrassButton>
        <BrassButton variant="primary" size="sm" onClick={rematch} disabled={rematching}>
          {t('duel.summary.rematch')}
        </BrassButton>
      </div>
    </Shell>
  );
}

function PerQuestionGrid({ mine, theirs }) {
  const total = mine.total;
  return (
    <div className="grid grid-cols-10 gap-1 max-w-md mx-auto pt-2">
      {Array.from({ length: total }).map((_, i) => {
        const myA = mine.answers?.find((a) => a.idx === i);
        const theirA = theirs.answers?.find((a) => a.idx === i);
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className={`w-3 h-3 rounded-sm ${myA?.correct ? 'bg-green-500/80' : 'bg-seal/80'}`} />
            <span className={`w-3 h-3 rounded-sm ${theirA?.correct ? 'bg-green-500/80' : 'bg-seal/80'}`} />
          </div>
        );
      })}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
