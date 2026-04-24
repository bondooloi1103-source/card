import { Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2 } from 'lucide-react';
import { useLang } from '@/lib/i18n';

export default function StoryControls({
  status, progress, slideIdx, totalSlides, currentAct,
  chapterRoman, chapterLabel, isFullscreen,
  onPlay, onPause, onPrev, onNext, onToggleFullscreen,
}) {
  const { t } = useLang();
  const isPlaying = status === 'playing';
  const pct = Math.round((progress ?? 0) * 100);

  return (
    <div className="border-t border-brass/25 bg-ink/95 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3">
      <div className="hidden md:flex flex-col leading-tight min-w-0 mr-2">
        <span className="font-meta text-[9px] tracking-[0.28em] uppercase text-brass/70">
          {t('story.chapter')} {chapterRoman} · {chapterLabel}
        </span>
        {currentAct && (
          <span className="font-display text-[11px] text-ivory/70 truncate mt-0.5">
            {currentAct}
          </span>
        )}
      </div>
      <button onClick={onPrev} aria-label={t('story.prev')}
              className="w-8 h-8 flex items-center justify-center text-brass/80 hover:text-ivory">
        <SkipBack className="w-4 h-4" />
      </button>
      <button
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? t('story.pause') : t('story.play')}
        className="w-10 h-10 rounded-full border-2 border-brass hover:border-ivory text-brass hover:text-ivory flex items-center justify-center"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
      </button>
      <button onClick={onNext} aria-label={t('story.next')}
              className="w-8 h-8 flex items-center justify-center text-brass/80 hover:text-ivory">
        <SkipForward className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0 mx-2">
        <div className="h-[2px] bg-brass/15 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-seal to-brass transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="font-meta text-[10px] tracking-[0.22em] text-ivory/60 tabular-nums">
        {String(slideIdx + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
      </span>
      <button
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? t('story.exitFullscreen') : t('story.fullscreen')}
        className="w-8 h-8 flex items-center justify-center text-brass/80 hover:text-ivory"
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
