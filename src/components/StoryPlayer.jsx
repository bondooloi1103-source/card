import { useMemo } from 'react';
import { Play, Pause, Square, Volume2 } from 'lucide-react';
import { useLang, storyText } from '@/lib/i18n';
import { useNarration } from '@/hooks/useNarration';
import CornerTicks from '@/components/ornaments/CornerTicks';

/**
 * StoryPlayer — narrate a figure's story. Two variants:
 *   variant='block'   — full editorial plate (used on FigureDetail)
 *   variant='button'  — compact pill (used inside Card3D)
 * Narration delegated to useNarration so the same engine powers StoryChapter.
 */
export default function StoryPlayer({ figure, variant = 'block', autoPlay = false, onDone }) {
  const { lang } = useLang();
  const audioUrl = lang === 'en' ? figure?.story_audio_en : figure?.story_audio;
  const text = useMemo(() => storyText(figure, lang), [figure, lang]);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const canPlay = Boolean(audioUrl) || (ttsSupported && text);

  const { status, progress, play, pause, stop, audioProps, mode } = useNarration({
    text, audioUrl, lang, autoPlay, onDone,
  });

  if (!canPlay) return null;
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const pct = Math.round(progress * 100);

  if (variant === 'button') {
    return (
      <>
        {mode === 'audio' && <audio {...audioProps} />}
        <button
          onClick={() => (isPlaying ? pause() : play())}
          title={mode === 'audio'
            ? (lang === 'en' ? 'Listen to recording' : 'Бичлэг сонсох')
            : (lang === 'en' ? 'Listen to the story' : 'Түүхийг сонсох')}
          className="px-3 py-1.5 bg-gold/90 hover:bg-gold text-background rounded-full text-xs font-body inline-flex items-center gap-1.5 transition-all"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {isPlaying
            ? (lang === 'en' ? 'Pause' : 'Зогсоох')
            : mode === 'audio'
              ? (lang === 'en' ? 'Listen' : 'Сонсох')
              : (lang === 'en' ? 'Story' : 'Түүх')}
        </button>
      </>
    );
  }

  return (
    <section className="relative bg-ink/50 border border-brass/35 overflow-hidden">
      <CornerTicks size={12} inset={6} thickness={1} opacity={0.9} />
      {mode === 'audio' && <audio {...audioProps} />}
      <div className="flex items-center gap-5 px-5 py-4 md:px-6 md:py-5">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="relative flex-shrink-0 w-14 h-14 rounded-full border-2 border-brass hover:border-ivory text-brass hover:text-ivory flex items-center justify-center transition-colors"
          style={{ background: 'radial-gradient(circle, hsl(var(--seal)/0.3) 0%, transparent 70%)' }}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-[1px]" />}
          {isPlaying && (
            <span className="absolute inset-0 rounded-full border-2 border-brass/40 animate-ping pointer-events-none" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-meta text-[9px] tracking-[0.32em] uppercase text-brass/80">
              {lang === 'en' ? 'Narration' : 'Түүхэн Яриа'}
            </span>
            {status !== 'idle' && (
              <span className="font-meta text-[9px] tracking-[0.22em] text-ivory/60">
                {isPaused ? (lang === 'en' ? 'PAUSED' : 'ТҮР ЗОГССОН') : `${pct}%`}
              </span>
            )}
          </div>
          <div className="font-display text-[17px] md:text-[19px] text-ivory/90 mt-1 line-clamp-2">
            {text}
          </div>
          <div className="mt-3 h-[2px] bg-brass/15 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-seal to-brass transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {status !== 'idle' && (
          <button
            onClick={stop}
            aria-label="Stop"
            className="hidden sm:inline-flex flex-shrink-0 w-10 h-10 items-center justify-center border border-brass/40 hover:border-brass text-brass/80 hover:text-ivory transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}
