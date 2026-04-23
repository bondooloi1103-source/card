import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchSession, fetchSessionResults } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function DuelIntro() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;

  const [state, setState] = useState({
    loading: true,
    session: null,
    results: [],
    error: null,
  });

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

  useEffect(() => {
    if (state.loading || !state.session) return;
    if (state.session.status === 'complete' || state.results.some((r) => r.user_id === userId)) {
      navigate(`/duel/${id}/summary`, { replace: true });
    }
  }, [state, userId, navigate, id]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error || !state.session) {
    return (
      <IntroShell>
        <p className="font-prose italic text-ivory/70">{t('duel.notFound')}</p>
      </IntroShell>
    );
  }

  if (state.session.status === 'abandoned') {
    return (
      <IntroShell>
        <p className="font-prose italic text-ivory/70">{t('duel.expired')}</p>
      </IntroShell>
    );
  }

  const hostResult = state.results.find((r) => r.user_id === state.session.host_user_id);
  const rulesText = t('duel.intro.rules').replace('{n}', String(state.session.round_size));

  return (
    <IntroShell>
      <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">
        {t('duel.title')}
      </p>
      <h1 className="font-display text-[clamp(2rem,5vw,3rem)] text-ivory">
        {lang === 'en' ? 'Whose words?' : 'Хэний үг вэ?'}
      </h1>
      <p className="font-prose italic text-ivory/80">{rulesText}</p>
      {hostResult && (
        <p className="font-meta text-[11px] tracking-[0.25em] uppercase text-brass">
          {t('duel.intro.toBeat')} <span className="text-ivory">{hostResult.score}</span>
        </p>
      )}
      <BrassButton variant="primary" size="md" onClick={() => navigate(`/games/quotes?session=${id}`)}>
        {t('duel.intro.start')}
      </BrassButton>
    </IntroShell>
  );
}

function IntroShell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
