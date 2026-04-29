import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Volume2, VolumeX, Headphones, StopCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useNarration } from '@/hooks/useNarration';

const FRAMING_HINT_MS = 15000;
const SLOW_VIDEO_MS = 8000;

export default function MindARScene({
  figId,
  figureName,
  videoUrl,
  targetUrl,
  voiceText = '',
  lang = 'mn',
  storyChapter,
  onError,
}) {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useLang();
  const narration = useNarration({ text: voiceText, lang, useSpeak: true });
  const [muted, setMuted] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSlow, setShowSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let scene = null;
    let stopCameraTracks = () => {};
    let hintTimer, slowTimer;

    Promise.all([
      import('aframe'),
      import('mind-ar/dist/mindar-image-aframe.prod.js'),
    ]).then(() => {
      if (cancelled || !containerRef.current) return;
      scene = buildScene(targetUrl, videoUrl);
      containerRef.current.appendChild(scene);

      const video = scene.querySelector('#figVideo');
      const onTargetFound = () => {
        setTracking(true);
        setShowHint(false);
        clearTimeout(hintTimer);
        video?.play().catch(() => {});
      };
      const onTargetLost = () => {
        setTracking(false);
        video?.pause();
      };
      const onArError = (event) => {
        onError?.(event?.detail || event);
      };

      scene.addEventListener('targetFound', onTargetFound);
      scene.addEventListener('targetLost', onTargetLost);
      scene.addEventListener('arError', onArError);

      hintTimer = setTimeout(() => setShowHint(true), FRAMING_HINT_MS);
      slowTimer = setTimeout(() => {
        if (video?.readyState < 2) setShowSlow(true);
      }, SLOW_VIDEO_MS);

      stopCameraTracks = () => {
        const allVideos = scene.querySelectorAll('video');
        allVideos.forEach((v) => {
          const ms = v.srcObject;
          if (ms && typeof ms.getTracks === 'function') {
            ms.getTracks().forEach((trk) => trk.stop());
          }
        });
      };
    }).catch((err) => {
      if (!cancelled) onError?.(err);
    });

    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      clearTimeout(slowTimer);
      try { stopCameraTracks(); } catch { /* best-effort */ }
      if (scene && scene.parentNode) scene.parentNode.removeChild(scene);
    };
  }, [targetUrl, videoUrl, onError]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      const v = containerRef.current?.querySelector('#figVideo');
      if (v) v.muted = next;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black z-[300]">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-ivory flex items-center gap-1.5 text-sm font-meta tracking-[0.22em] uppercase"
          aria-label={t('ar.back')}
        >
          <ArrowLeft className="w-4 h-4" /> {t('ar.back')}
        </button>
        <div className="text-ivory font-cinzel text-sm truncate px-3">{figureName}</div>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t('ar.unmute') : t('ar.mute')}
          className="text-ivory"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {showHint && !tracking && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-ink/85 border border-gold/50 rounded text-xs text-gold font-body z-10 max-w-[88vw] text-center">
          {t('ar.hint.framing')}
        </div>
      )}
      {showSlow && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 px-4 py-2 bg-ink/85 border border-bronze/50 rounded text-xs text-bronze font-body z-10">
          {t('ar.error.slowConn')}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-around px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
        {storyChapter && (
          <button
            type="button"
            onClick={() => navigate(`/story/${storyChapter}`)}
            className="px-4 py-2 border border-brass/60 text-ivory text-xs font-meta tracking-[0.24em] uppercase"
          >
            {t('ar.action.story')}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/figure/${figId}#quiz`)}
          className="px-4 py-2 border border-brass/60 text-ivory text-xs font-meta tracking-[0.24em] uppercase"
        >
          {t('ar.action.quiz')}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/c/${figId}`)}
          className="px-4 py-2 border border-brass/60 text-ivory text-xs font-meta tracking-[0.24em] uppercase"
        >
          {t('ar.action.askAi')}
        </button>
        {voiceText && (
          <button
            type="button"
            data-testid="ar-voice-button"
            onClick={() => (narration.status === 'playing' ? narration.stop() : narration.play())}
            aria-label={narration.status === 'playing' ? t('ar.action.voiceStop') : t('ar.action.voice')}
            className="px-4 py-2 border border-brass/60 text-ivory text-xs font-meta tracking-[0.24em] uppercase inline-flex items-center gap-2"
          >
            {narration.status === 'playing' ? (
              <StopCircle className="w-4 h-4" />
            ) : (
              <Headphones className="w-4 h-4" />
            )}
            {narration.status === 'playing' ? t('ar.action.voiceStop') : t('ar.action.voice')}
          </button>
        )}
      </div>
      <audio {...narration.audioProps} />
    </div>
  );
}

function buildScene(targetUrl, videoUrl) {
  const scene = document.createElement('a-scene');
  const safeTarget = encodeURI(targetUrl);
  scene.setAttribute('mindar-image', `imageTargetSrc: ${safeTarget}; autoStart: true; uiLoading: no; uiError: no; uiScanning: no;`);
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
  scene.style.position = 'absolute';
  scene.style.inset = '0';

  const assets = document.createElement('a-assets');
  const video = document.createElement('video');
  video.id = 'figVideo';
  video.src = videoUrl;
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.crossOrigin = 'anonymous';
  video.setAttribute('webkit-playsinline', '');
  assets.appendChild(video);
  scene.appendChild(assets);

  const camera = document.createElement('a-camera');
  camera.setAttribute('position', '0 0 0');
  camera.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(camera);

  const target = document.createElement('a-entity');
  target.setAttribute('mindar-image-target', 'targetIndex: 0');
  const plane = document.createElement('a-video');
  plane.setAttribute('src', '#figVideo');
  plane.setAttribute('position', '0 0 0');
  plane.setAttribute('width', '1');
  plane.setAttribute('height', '0.552');
  plane.setAttribute('rotation', '0 0 0');
  target.appendChild(plane);
  scene.appendChild(target);

  return scene;
}
