import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Trophy, Share2 } from 'lucide-react';
import { FIGURES } from '@/lib/figuresData';
import { useLang, figureName } from '@/lib/i18n';
import { buildRoundFromSeed } from '@/lib/seededRound';
import { createSession, submitResult, fetchSession } from '@/lib/gameApi';
import CornerTicks from '@/components/ornaments/CornerTicks';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';
import BrassButton from '@/components/ornaments/BrassButton';

const ROUND_SIZE = 10;

export default function GameQuoteGuess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, lang: activeLang } = useLang();
  const sessionIdFromUrl = params.get('session');

  const [sessionState, setSessionState] = useState(null);
  const [loadError, setLoadError] = useState(null);

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

  const round = useMemo(() => {
    if (!sessionState) return [];
    return buildRoundFromSeed(FIGURES, sessionState.lang, sessionState.round_size, sessionState.seed);
  }, [sessionState]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]);
  const questionStartRef = useRef(Date.now());

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [idx]);

  const choose = useCallback(
    (opt) => {
      if (picked !== null) return;
      setPicked(opt);
      const q = round[idx];
      const ms = Date.now() - questionStartRef.current;
      const match = FIGURES.find((f) => figureName(f, sessionState.lang) === opt);
      const pickedFigId = match?.fig_id ?? null;
      const isCorrect = opt === q.correct;
      if (isCorrect) setScore((s) => s + 1);
      setAnswers((prev) => [...prev, { idx, pickedFigId, ms }]);
    },
    [picked, round, idx, sessionState],
  );

  const next = useCallback(async () => {
    if (idx + 1 >= round.length) {
      setDone(true);
      if (!submitted && sessionState) {
        setSubmitted(true);
        try {
          await submitResult({ session_id: sessionState.id, answers });
        } catch (err) {
          console.error('submit failed:', err);
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
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
      </div>
    );
  }

  const q = round[idx];
  const pickedRight = picked === q?.correct;
  const pct = Math.round(((idx + (picked ? 1 : 0)) / round.length) * 100);

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
            <section className="relative bg-ink/60 border border-brass/35 px-6 md:px-12 py-10">
              <CornerTicks size={14} inset={8} thickness={1} opacity={0.95} />
              <span className="font-meta text-[9.5px] tracking-[0.32em] uppercase text-brass/70 block text-center mb-5">
                {activeLang === 'en' ? 'Quotation' : 'Ишлэл'}
              </span>
              <p
                className="font-display italic text-[clamp(1.2rem,3.2vw,2.1rem)] leading-snug text-ivory text-center"
                style={{ fontVariationSettings: '"opsz" 72, "SOFT" 80, "WONK" 1' }}
              >
                &laquo; {q.quote} &raquo;
              </p>
            </section>

            <div className="grid sm:grid-cols-2 gap-3">
              {q.options.map((opt, i) => {
                const isCorrect = opt === q.correct;
                const isPicked = picked === opt;
                const showResult = picked !== null;
                let style = 'border-brass/40 hover:border-brass text-ivory bg-ink/40';
                if (showResult) {
                  if (isCorrect) style = 'border-green-500/70 text-green-400 bg-green-500/10';
                  else if (isPicked) style = 'border-seal/70 text-seal bg-seal/10';
                  else style = 'border-border text-ivory/55 bg-ink/30 opacity-60';
                }
                return (
                  <button
                    key={i}
                    onClick={() => choose(opt)}
                    disabled={picked !== null}
                    className={`group relative flex items-center gap-4 px-5 py-4 border ${style} text-left transition-colors`}
                  >
                    <span className="font-meta text-[9px] tracking-[0.3em] text-brass/70">
                      {['I', 'II', 'III', 'IV'][i]}.
                    </span>
                    <span
                      className="font-display text-[15px] leading-tight flex-1"
                      style={{ fontVariationSettings: '"opsz" 30, "SOFT" 50' }}
                    >
                      {opt}
                    </span>
                    {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {showResult && isPicked && !isCorrect && <XCircle className="w-4 h-4 text-seal" />}
                  </button>
                );
              })}
            </div>

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
                      ? `✗ It was: ${q.correct}`
                      : `✗ Зөв хариулт: ${q.correct}`}
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
        alert(t('game.copiedLink'));
      }
    } catch (err) {
      alert((lang === 'en' ? 'Failed: ' : 'Алдаа: ') + (err.message ?? 'unknown'));
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
