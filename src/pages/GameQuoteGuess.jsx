import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RefreshCw, Trophy, Share2 } from 'lucide-react';
import { FIGURES } from '@/lib/figuresData';
import { useLang, figureName } from '@/lib/i18n';
import { buildRoundFromSeed } from '@/lib/seededRound';
import { createSession, submitResult, fetchSession } from '@/lib/gameApi';
import { useOwnedFigures } from '@/hooks/useOwnedFigures';
import { currentSession } from '@/lib/authStore';
import RoundPlayer from '@/components/game/RoundPlayer';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';
import BrassButton from '@/components/ornaments/BrassButton';
import { notify, Skeleton } from '@/lib/feedback';

const ROUND_SIZE = 10;
// Need at least 4 quote-bearing figures to build the multiple-choice round.
const MIN_FIGS_FOR_ROSTER = 4;

export default function GameQuoteGuess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, lang: activeLang } = useLang();
  const sessionIdFromUrl = params.get('session');
  const isDemo = params.get('demo') === '1';

  const session = currentSession();
  const userId = session?.account_id ?? null;
  const { figIds: ownedFigIds, loading: ownedLoading } = useOwnedFigures(userId);

  const [sessionState, setSessionState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [rosterFallback, setRosterFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (sessionIdFromUrl) {
          const s = await fetchSession(sessionIdFromUrl);
          if (cancelled) return;
          setSessionState(s);
        } else {
          const { id, seed } = await createSession({
            mode: 'solo',
            lang: activeLang,
            round_size: ROUND_SIZE,
          });
          if (cancelled) return;
          setSessionState({ id, seed, lang: activeLang, round_size: ROUND_SIZE, mode: 'solo' });
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message ?? 'load_failed');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [sessionIdFromUrl, activeLang]);

  const figurePool = useMemo(() => {
    if (isDemo || ownedLoading) return FIGURES;
    const owned = FIGURES.filter((f) => ownedFigIds.includes(f.fig_id));
    const ownedWithQuotes = owned.filter((f) => f.quote);
    if (ownedWithQuotes.length < MIN_FIGS_FOR_ROSTER) {
      if (!rosterFallback) setRosterFallback(true);
      return FIGURES;
    }
    if (rosterFallback) setRosterFallback(false);
    return owned;
  }, [isDemo, ownedLoading, ownedFigIds, rosterFallback]);

  const round = useMemo(() => {
    if (!sessionState || ownedLoading) return [];
    return buildRoundFromSeed(figurePool, sessionState.round_size, sessionState.seed);
  }, [sessionState, figurePool, ownedLoading]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null); // picked figId (number) or null
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]);
  const questionStartRef = useRef(Date.now());

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [idx]);

  const choose = useCallback(
    (pickedFigId) => {
      if (picked !== null) return;
      setPicked(pickedFigId);
      const q = round[idx];
      const ms = Date.now() - questionStartRef.current;
      if (pickedFigId === q.figId) setScore((s) => s + 1);
      setAnswers((prev) => [...prev, { idx, pickedFigId, ms }]);
    },
    [picked, round, idx],
  );

  const next = useCallback(async () => {
    if (idx + 1 >= round.length) {
      setDone(true);
      if (!submitted && sessionState && !isDemo) {
        setSubmitted(true);
        try {
          await submitResult({ session_id: sessionState.id, answers });
        } catch (err) {
          notify.error(err, { fallbackKey: 'toast.quote.submitFailed' });
        }
      }
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  }, [idx, round.length, submitted, sessionState, answers]);

  const restart = useCallback(async () => {
    setIdx(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setSubmitted(false);
    setAnswers([]);
    try {
      const { id, seed } = await createSession({
        mode: 'solo',
        lang: activeLang,
        round_size: ROUND_SIZE,
      });
      setSessionState({ id, seed, lang: activeLang, round_size: ROUND_SIZE, mode: 'solo' });
    } catch (err) {
      setLoadError(err.message ?? 'load_failed');
    }
  }, [activeLang]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-6 text-center">
        <div className="space-y-4 max-w-md">
          <Fleuron size={48} className="mx-auto opacity-60" />
          <p className="font-prose italic text-ivory/70">{t('game.loadFailed')}</p>
          <button
            onClick={() => navigate(-1)}
            className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass hover:text-ivory"
          >
            ← {t('fd.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!sessionState || round.length === 0) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-6">
        <Skeleton.Card className="max-w-sm w-full" />
      </div>
    );
  }

  const q = round[idx];
  const pickedRight = picked === q?.figId;
  const pct = Math.round(((idx + (picked !== null ? 1 : 0)) / round.length) * 100);
  const correctName = q ? figureName(FIGURES.find((f) => f.fig_id === q.figId), activeLang) : '';

  return (
    <div className="min-h-screen bg-ink contour-bg">
      <div className="relative z-20 max-w-[60rem] mx-auto px-5 md:px-8 pt-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {t('fd.back')}
        </button>
        <div className="flex items-center gap-3">
          {isDemo && (
            <span
              className="font-meta text-[10px] tracking-[0.28em] uppercase px-2 py-0.5 rounded"
              style={{ border: '1px solid rgba(201,168,76,0.5)', color: '#c9a84c' }}
              title={activeLang === 'en' ? 'Demo mode — XP not counted' : 'Demo горим — XP тоологдохгүй'}
            >
              Demo
            </span>
          )}
          {!isDemo && rosterFallback && (
            <span
              className="font-meta text-[10px] tracking-[0.28em] uppercase px-2 py-0.5 rounded opacity-80"
              style={{ border: '1px dashed rgba(201,168,76,0.5)', color: '#c9a84c' }}
              title={activeLang === 'en'
                ? 'You need 4+ owned figures with quotes to play with your roster.'
                : 'Цуглуулсан цөөн байна — бүх дүрсээр тоглож байна'}
            >
              {activeLang === 'en' ? 'All figures' : 'Бүгд'}
            </span>
          )}
          <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
            {String(idx + 1).padStart(2, '0')} / {String(round.length).padStart(2, '0')}
          </span>
          <span className="font-meta text-[10px] tracking-[0.22em] text-brass/60">·</span>
          <span className="font-meta text-[10px] tracking-[0.28em] text-ivory">
            {activeLang === 'en' ? 'Score' : 'Оноо'}: {score}
          </span>
        </div>
      </div>

      <div className="relative max-w-[60rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-4">
        <CodexRule caption={activeLang === 'en' ? 'CODEX · GAME' : 'КОДЕКС · ТОГЛООМ'} fleuronSize={20} />
        <h1
          className="display-title text-[clamp(2rem,5vw,3.5rem)] text-ivory"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70, "WONK" 1, "wght" 540' }}
        >
          {activeLang === 'en' ? 'Whose ' : 'Хэний '}
          <span className="text-seal">{activeLang === 'en' ? 'words?' : 'үг вэ?'}</span>
        </h1>
        <p className="prose-body italic text-ivory/70 max-w-lg mx-auto">
          {activeLang === 'en'
            ? 'Read the quotation below and pick the figure who said it.'
            : 'Доорх ишлэлийг уншиж, хэн хэлснийг сонгоорой.'}
        </p>
        <div className="max-w-md mx-auto h-[2px] bg-brass/20 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-seal to-brass transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35 }}
            className="relative max-w-[56rem] mx-auto px-5 md:px-8 pb-16 space-y-8"
          >
            <RoundPlayer
              question={q}
              figures={FIGURES}
              picked={picked}
              onPick={choose}
              revealed={picked !== null}
              correctFigId={q.figId}
              lang={activeLang}
            />

            {picked !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 flex-wrap"
              >
                <p className={`font-prose italic text-[15px] ${pickedRight ? 'text-green-400' : 'text-seal'}`}>
                  {pickedRight
                    ? activeLang === 'en'
                      ? '✓ Correct.'
                      : '✓ Зөв байна.'
                    : activeLang === 'en'
                      ? `✗ It was: ${correctName}`
                      : `✗ Зөв хариулт: ${correctName}`}
                  {q.qattr && (
                    <span className="ml-2 font-meta text-[10px] tracking-[0.22em] uppercase text-brass/60">
                      — {q.qattr}
                    </span>
                  )}
                </p>
                <BrassButton variant="primary" size="sm" onClick={next}>
                  {idx + 1 >= round.length
                    ? activeLang === 'en'
                      ? 'Finish'
                      : 'Дүгнэлт'
                    : activeLang === 'en'
                      ? 'Next →'
                      : 'Дараах →'}
                </BrassButton>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <ResultScreen
            score={score}
            total={round.length}
            lang={activeLang}
            sessionId={sessionState.id}
            mode={sessionState.mode}
            onReplay={restart}
            navigate={navigate}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultScreen({ score, total, lang, sessionId, mode, onReplay, navigate, t }) {
  const [challenging, setChallenging] = useState(false);

  async function challengeFriend() {
    setChallenging(true);
    try {
      const { share_path } = await createSession({
        mode: 'async_duel',
        lang,
        round_size: total,
        from_session_id: sessionId,
      });
      const url = `${window.location.origin}${share_path}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: lang === 'en' ? 'Whose words?' : 'Хэний үг вэ?',
            text:
              lang === 'en'
                ? `I scored ${score}/${total}. Beat me?`
                : `Би ${score}/${total} оноо авлаа. Намайг давж чадах уу?`,
            url,
          });
        } catch {
          /* user canceled */
        }
      } else {
        await navigator.clipboard.writeText(url);
        notify.success(t('game.copiedLink'));
      }
    } catch (err) {
      notify.error(err, { fallbackKey: 'toast.generic.unknownError' });
    } finally {
      setChallenging(false);
    }
  }

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="relative max-w-[44rem] mx-auto px-5 md:px-8 pb-20 text-center space-y-7"
    >
      <Fleuron size={44} className="mx-auto opacity-80" />
      <div>
        <div
          className="font-display text-[clamp(3rem,8vw,6rem)] leading-none text-ivory"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1, "wght" 560' }}
        >
          {score} <span className="text-brass/60">/ {total}</span>
        </div>
        <p className="font-meta text-[10px] tracking-[0.32em] uppercase text-brass/70 mt-2">
          {lang === 'en' ? 'Final score' : 'Эцсийн оноо'}
        </p>
      </div>

      <div className="relative bg-ink/60 border border-brass/30 p-6">
        <CornerTicks size={12} inset={6} thickness={1} opacity={0.85} />
        <Trophy className="w-5 h-5 text-brass mx-auto" />
        <p className="font-prose italic text-ivory/80 mt-3">{scoreVerdict(score, total, lang)}</p>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <BrassButton variant="ghost" size="sm" onClick={() => navigate('/app')}>
          {lang === 'en' ? 'Back to Codex' : 'Кодекс руу'}
        </BrassButton>
        <BrassButton
          variant="primary"
          size="sm"
          onClick={onReplay}
          icon={<RefreshCw className="w-3 h-3" />}
        >
          {lang === 'en' ? 'Play again' : 'Дахин тоглох'}
        </BrassButton>
        {mode === 'solo' && (
          <BrassButton
            variant="primary"
            size="sm"
            onClick={challengeFriend}
            icon={<Share2 className="w-3 h-3" />}
            disabled={challenging}
          >
            {t('game.challenge')}
          </BrassButton>
        )}
      </div>
    </motion.div>
  );
}

function scoreVerdict(score, total, lang) {
  const pct = score / total;
  if (lang === 'en') {
    if (pct >= 0.9) return 'A scholar of the steppe — exceptional.';
    if (pct >= 0.7) return 'Strong knowledge of the codex.';
    if (pct >= 0.5) return 'A respectable showing.';
    if (pct >= 0.3) return 'A start — read on, the chronicle awaits.';
    return 'The codex is patient. Try again.';
  }
  if (pct >= 0.9) return 'Тал нутгийн жинхэнэ судлаач — гайхалтай.';
  if (pct >= 0.7) return 'Кодекстээ тулгуурласан мэдлэг бий.';
  if (pct >= 0.5) return 'Дунд зэргийн амжилт.';
  if (pct >= 0.3) return 'Эхлэл сайхан — кодекс хүлээж байна.';
  return 'Кодекс тэвчээртэй. Дахин оролдоорой.';
}
