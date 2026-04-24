import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { FIGURES, CATEGORIES, ERAS, ERA_KEYS, getEra } from '@/lib/figuresData';
import { useLang, figureName, figureRole, figureBio, storyText } from '@/lib/i18n';
import StoryPlayer from '@/components/StoryPlayer';
import { useAuthoredContent } from '@/hooks/useAuthoredContent';
import CornerTicks from '@/components/ornaments/CornerTicks';
import CodexRule from '@/components/ornaments/CodexRule';
import CategoryGlyph from '@/components/ornaments/CategoryGlyph';
import Fleuron from '@/components/ornaments/Fleuron';

/**
 * Story Tour — sequential reader/listener.
 *
 * Builds an ordered playlist of figures from the Codex (sorted by era then fig_id)
 * and walks through each one with the StoryPlayer + transcript visible.  Autoplay-next
 * carries the user through the whole journey.
 *
 * Query params:
 *   ?from=<fig_id>   — start at a specific figure
 *   ?era=<era_key>   — restrict the tour to one era
 */
export default function StoryTour() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, lang } = useLang();
  const { get: getAuthored } = useAuthoredContent(false);

  // Build the playlist (deterministic order by era → fig_id)
  const playlist = useMemo(() => {
    const eraFilter = params.get('era');
    const fromId = parseInt(params.get('from'));
    const filtered = eraFilter
      ? FIGURES.filter(f => getEra(f) === eraFilter)
      : FIGURES;
    const ordered = [...filtered].sort((a, b) => {
      const ea = ERA_KEYS.indexOf(getEra(a));
      const eb = ERA_KEYS.indexOf(getEra(b));
      if (ea !== eb) return ea - eb;
      return a.fig_id - b.fig_id;
    });
    if (fromId && !isNaN(fromId)) {
      const i = ordered.findIndex(f => f.fig_id === fromId);
      if (i >= 0) return [...ordered.slice(i), ...ordered.slice(0, i)];
    }
    return ordered;
  }, [params]);

  const [idx, setIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const figure = playlist[idx];

  useEffect(() => { window.scrollTo(0, 0); }, [idx]);

  const goNext = useCallback(() => {
    setIdx(i => Math.min(i + 1, playlist.length - 1));
  }, [playlist.length]);

  const goPrev = useCallback(() => {
    setIdx(i => Math.max(i - 1, 0));
  }, []);

  const handleStoryEnd = useCallback(() => {
    if (autoplay && idx < playlist.length - 1) {
      // Small pause before advancing for breathing room
      setTimeout(() => setIdx(i => i + 1), 1200);
    }
  }, [autoplay, idx, playlist.length]);

  if (!figure) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-prose italic text-ivory/70">
          {lang === 'en' ? 'Tour is empty.' : 'Аяллын жагсаалт хоосон байна.'}
        </p>
      </div>
    );
  }

  const cat = CATEGORIES[figure.cat];
  const era = ERAS[getEra(figure)];
  const pad = String(figure.fig_id).padStart(2, '0');
  const transcript = storyText(figure, lang, { get: getAuthored });

  return (
    <div className="min-h-screen bg-ink contour-bg">
      {/* Top bar */}
      <div className="relative z-20 max-w-[88rem] mx-auto px-5 md:px-10 pt-6 flex items-center justify-between gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('fd.back')}
        </button>

        <div className="flex items-center gap-4">
          <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
            {String(idx + 1).padStart(2, '0')} / {String(playlist.length).padStart(2, '0')}
          </span>

          <label className="flex items-center gap-2 font-meta text-[10px] tracking-[0.24em] uppercase text-brass/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
              className="appearance-none w-3 h-3 border border-brass/60 checked:bg-brass relative cursor-pointer"
            />
            {lang === 'en' ? 'Autoplay' : 'Авто'}
          </label>
        </div>
      </div>

      {/* Heading */}
      <div className="relative max-w-[64rem] mx-auto px-5 md:px-10 pt-6 pb-3 text-center space-y-3">
        <CodexRule caption={lang === 'en' ? 'CODEX · STORY TOUR' : 'КОДЕКС · ТҮҮХЭН АЯЛАЛ'} fleuronSize={18} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={figure.fig_id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-[80rem] mx-auto px-5 md:px-10 pb-16 grid lg:grid-cols-[0.45fr_0.55fr] gap-8 lg:gap-12 items-start"
        >
          {/* LEFT — portrait + title */}
          <div className="space-y-5">
            <div className="flex items-baseline gap-3">
              <span className="catalog-no">N° {pad}</span>
              <span className="h-px flex-1 bg-brass/30" />
              <span className="font-meta text-[9.5px] tracking-[0.28em] uppercase text-brass/70">
                {era?.roman} · {lang === 'en' ? (era?.label_en || era?.label) : era?.label}
              </span>
            </div>

            <h1
              className="display-title text-[clamp(2rem,5vw,3.5rem)] text-ivory leading-[0.95]"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 70, "WONK" 1, "wght" 520' }}
            >
              {figureName(figure, lang)}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-meta text-[10.5px] tracking-[0.28em] uppercase text-brass">{figure.yrs}</span>
              <span className="text-brass/40">·</span>
              <span className="font-prose italic text-[14px] text-ivory/80">{figureRole(figure, lang)}</span>
            </div>

            {/* Portrait */}
            <div
              className="relative aspect-[4/5] border border-brass/40 overflow-hidden"
              style={{ background: `linear-gradient(152deg, ${cat?.color}, #0e0b07)` }}
            >
              <CornerTicks size={14} inset={7} thickness={1} opacity={0.95} />
              {figure.front_img ? (
                <>
                  <img
                    src={figure.front_img}
                    alt={figureName(figure, lang)}
                    crossOrigin="anonymous"
                    className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-95"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 mix-blend-multiply opacity-70"
                    style={{ background: `linear-gradient(152deg, ${cat?.color}dd, #0e0b07 95%)` }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CategoryGlyph cat={figure.cat} size={120} className="text-ivory/30" />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — story player + transcript */}
          <div className="space-y-6">
            <StoryPlayer figure={figure} autoPlay={autoplay} onDone={handleStoryEnd} authored={{ get: getAuthored }} />

            {/* Transcript scrubber — full text, scrollable */}
            <section className="relative bg-ink/40 border border-brass/30">
              <CornerTicks size={10} inset={5} thickness={1} opacity={0.85} />
              <div className="px-5 py-4 border-b border-brass/20 flex items-center justify-between">
                <span className="font-meta text-[10px] tracking-[0.32em] uppercase text-brass/80">
                  {lang === 'en' ? 'Transcript' : 'Бичвэр'}
                </span>
                <span className="font-meta text-[9px] tracking-[0.22em] text-brass/55">
                  {transcript.length} {lang === 'en' ? 'chars' : 'тэмдэгт'}
                </span>
              </div>
              <div className="px-5 py-5 max-h-[420px] overflow-y-auto">
                <p className="prose-body italic text-[15px] leading-[1.75] text-ivory/85">
                  {transcript || figureBio(figure, lang)}
                </p>
              </div>
            </section>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Bottom navigation */}
      <div className="border-t border-brass/25 bg-ink/85 backdrop-blur-sm">
        <div className="max-w-[80rem] mx-auto px-5 md:px-10 py-5 flex items-center justify-between gap-4">
          <button
            onClick={goPrev}
            disabled={idx === 0}
            className="group flex items-center gap-3 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            {lang === 'en' ? 'Previous' : 'Өмнөх'}
          </button>

          {/* Brass progress hairline */}
          <div className="flex-1 h-[2px] bg-brass/15 mx-6 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-seal to-brass transition-[width] duration-500"
              style={{ width: `${((idx + 1) / playlist.length) * 100}%` }}
            />
          </div>

          <button
            onClick={goNext}
            disabled={idx === playlist.length - 1}
            className="group flex items-center gap-3 font-meta text-[10px] tracking-[0.3em] uppercase text-ivory hover:text-brass transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {lang === 'en' ? 'Next' : 'Дараах'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {idx === playlist.length - 1 && (
        <div className="text-center py-10">
          <Fleuron size={32} className="mx-auto opacity-60" />
          <p className="font-prose italic text-ivory/60 text-sm mt-3">
            {lang === 'en' ? 'You have reached the end of the tour.' : 'Аялал дууслаа.'}
          </p>
        </div>
      )}
    </div>
  );
}
