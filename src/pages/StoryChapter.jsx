import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useLang, storyText } from '@/lib/i18n';
import { ERAS, ERA_KEYS } from '@/lib/figuresData';
import { buildChapterPlaylist } from '@/lib/storyPlaylist';
import { useNarration } from '@/hooks/useNarration';
import { useVoices } from '@/hooks/useVoices';
import { supabase } from '@/lib/supabase';
import StoryStage from '@/components/story/StoryStage';
import StoryControls from '@/components/story/StoryControls';
import StoryEnding from '@/components/story/StoryEnding';

const RESUME_KEY = 'story:resume';

export default function StoryChapter() {
  const { chapter } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();

  useEffect(() => {
    if (!ERA_KEYS.includes(chapter)) {
      toast.error(t('story.notFound'));
      navigate('/#chapters', { replace: true });
    }
  }, [chapter, navigate, t]);

  const playlist = useMemo(
    () => (ERA_KEYS.includes(chapter) ? buildChapterPlaylist(chapter) : []),
    [chapter],
  );
  const eraDef = ERAS[chapter] || {};
  const { voiceIdFor } = useVoices(lang);

  const initialIdx = useMemo(() => {
    const q = parseInt(params.get('s') ?? '', 10);
    if (!Number.isNaN(q) && q >= 0 && q < playlist.length) return q;
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.chapter === chapter && Number.isInteger(saved.slideIdx)) {
          return Math.min(Math.max(0, saved.slideIdx), playlist.length - 1);
        }
      }
    } catch { /* ignore */ }
    return 0;
  }, [chapter, params, playlist.length]);

  const [slideIdx, setSlideIdx] = useState(initialIdx);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ chapter, slideIdx })); } catch { /* ignore */ }
    const onBeforeUnload = () => {
      try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ chapter, slideIdx })); } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [chapter, slideIdx]);

  const slide = playlist[slideIdx];
  const isDone = slideIdx >= playlist.length;

  const narrationText = useMemo(() => {
    if (!slide) return '';
    if (slide.kind === 'figure') return storyText(slide.figure, lang);
    if (slide.kind === 'intro') {
      const years = lang === 'en' ? (eraDef.years_en || eraDef.years) : eraDef.years;
      const intro = lang === 'en' ? (eraDef.intro_en || eraDef.intro) : eraDef.intro;
      return `${eraDef.label}. ${years}. ${intro ?? ''}`;
    }
    return lang === 'en' ? `Chapter ${eraDef.roman} complete.` : `Бүлэг ${eraDef.roman} дуусав.`;
  }, [slide, lang, eraDef]);

  const advance = useCallback(() => setSlideIdx((i) => i + 1), []);

  const slideVoiceId = useMemo(() => {
    if (!slide || slide.kind !== 'figure') return null;
    return voiceIdFor(slide.figure.fig_id);
  }, [slide, voiceIdFor]);

  const { status, progress, charIndex, play, pause, stop } = useNarration({
    text: narrationText,
    lang,
    voiceId: slideVoiceId,
    useSpeak: true,
    autoPlay: true,
    onDone: advance,
  });

  // Background pre-fetch: warm the speak cache for upcoming slides.
  useEffect(() => {
    if (!playlist.length || slideIdx >= playlist.length - 1) return;
    if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return;
    const upcoming = playlist.slice(slideIdx + 1);
    const CONCURRENCY = 3;
    let cancelled = false;
    let cursor = 0;
    async function runOne() {
      while (!cancelled && cursor < upcoming.length) {
        const i = cursor++;
        const s = upcoming[i];
        const text = s.kind === 'figure'
          ? storyText(s.figure, lang)
          : s.kind === 'intro'
            ? `${eraDef.label}. ${lang === 'en' ? (eraDef.years_en || eraDef.years) : eraDef.years}. ${lang === 'en' ? (eraDef.intro_en || eraDef.intro) : eraDef.intro ?? ''}`
            : (lang === 'en' ? `Chapter ${eraDef.roman} complete.` : `Бүлэг ${eraDef.roman} дуусав.`);
        const vid = s.kind === 'figure' ? voiceIdFor(s.figure.fig_id) : null;
        const body = { text, lang };
        if (vid) body.voice_id = vid;
        try { await supabase.functions.invoke('speak', { body }); } catch { /* ignore */ }
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, () => runOne());
    Promise.allSettled(workers);
    return () => { cancelled = true; };
  }, [playlist, slideIdx, lang, voiceIdFor, eraDef]);

  const goPrev = useCallback(() => setSlideIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setSlideIdx((i) => i + 1), []);

  const toggleFullscreen = useCallback(() => {
    const el = document.getElementById('story-root');
    if (!document.fullscreenElement) {
      if (el?.requestFullscreen) {
        el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(true));
      } else {
        setIsFullscreen(true);
      }
    } else {
      document.exitFullscreen?.().finally(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); status === 'playing' ? pause() : play(); }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.code === 'KeyF')       { e.preventDefault(); toggleFullscreen(); }
      else if (e.code === 'Escape' && isFullscreen) {
        e.preventDefault();
        document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, play, pause, goPrev, goNext, toggleFullscreen, isFullscreen]);

  useEffect(() => () => stop(), [stop]);

  if (!ERA_KEYS.includes(chapter)) return null;
  if (playlist.length === 0) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-6 text-center">
        <p className="font-prose italic text-ivory/70">{t('story.empty')}</p>
      </div>
    );
  }

  if (isDone) {
    return (
      <div id="story-root" className={`bg-ink min-h-screen ${isFullscreen ? 'fixed inset-0 z-[999]' : ''}`}>
        <StoryEnding currentEra={chapter} />
      </div>
    );
  }

  const currentAct = slide?.kind === 'figure' ? slide.act : null;

  return (
    <div
      id="story-root"
      className={`bg-ink ${isFullscreen ? 'fixed inset-0 z-[999] overflow-auto' : 'min-h-screen'}`}
    >
      <div className={`${isFullscreen ? 'h-full flex flex-col' : ''}`}>
        <div className={`flex-1 ${isFullscreen ? 'overflow-auto' : ''} px-4 md:px-8 py-6`}>
          <StoryStage slide={slide} charIndex={charIndex} />
        </div>
        <StoryControls
          status={status}
          progress={progress}
          slideIdx={slideIdx}
          totalSlides={playlist.length}
          currentAct={currentAct}
          chapterRoman={eraDef.roman}
          chapterLabel={lang === 'en' ? (eraDef.label_en || eraDef.label) : eraDef.label}
          isFullscreen={isFullscreen}
          onPlay={play}
          onPause={pause}
          onPrev={goPrev}
          onNext={goNext}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  );
}
