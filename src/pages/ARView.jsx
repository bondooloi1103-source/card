import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFigureARTarget } from '@/hooks/useFigureARTarget';
import { FIGURES } from '@/lib/figuresData';
import { figureBio } from '@/lib/i18n';
import MindARScene from '@/components/ar/MindARScene';
import DesktopFallback from '@/components/ar/DesktopFallback';
import BrandHeader from '@/components/ornaments/BrandHeader';

const FIGURE_TO_CHAPTER = {};

function ErrorPanel({ titleKey, bodyKey, onBack, onRetry, retryLabelKey }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 bg-ink z-[300] flex items-center justify-center px-6">
      <div className="absolute top-4 left-4 md:top-6 md:left-8">
        <BrandHeader />
      </div>
      <div className="max-w-sm w-full text-center space-y-5 border border-brass/40 p-6 rounded">
        <h2 className="font-cinzel text-lg text-ivory">{t(titleKey)}</h2>
        {bodyKey && <p className="text-sm text-ivory/75 font-body">{t(bodyKey)}</p>}
        <div className="flex justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 border border-gold/60 text-gold text-xs font-meta tracking-[0.22em] uppercase"
            >
              {t(retryLabelKey || 'ar.error.permission.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 border border-brass/60 text-ivory text-xs font-meta tracking-[0.22em] uppercase"
          >
            {t('ar.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ARView() {
  const { figId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const isMobile = useIsMobile();
  const { ready, loading, videoUrl, targetUrl } = useFigureARTarget(figId);
  const [arError, setArError] = useState(null);

  const id = Number(figId);
  const figure = FIGURES.find((f) => f.fig_id === id);
  const figureName = figure?.name ?? '';
  const voiceText = figure ? figureBio(figure, lang) : '';

  if (loading) {
    return (
      <div
        data-testid="ar-view-loading"
        className="fixed inset-0 bg-ink flex items-center justify-center"
      >
        <div className="absolute top-4 left-4 md:top-6 md:left-8">
          <BrandHeader />
        </div>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full border-2 border-gold/40 mx-auto" />
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin mx-auto" />
          <p className="text-sm text-ivory/70 font-body">{t('ar.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isMobile) {
    return <DesktopFallback figId={id} figureName={figureName} />;
  }

  if (!ready) {
    return (
      <ErrorPanel
        titleKey="ar.assetsMissing.title"
        bodyKey="ar.assetsMissing.body"
        onBack={() => navigate(-1)}
      />
    );
  }

  if (arError === 'permission') {
    return (
      <ErrorPanel
        titleKey="ar.error.permission"
        onBack={() => navigate(-1)}
        onRetry={() => setArError(null)}
        retryLabelKey="ar.error.permission.retry"
      />
    );
  }
  if (arError === 'no_camera') {
    return <ErrorPanel titleKey="ar.error.noCamera" onBack={() => navigate(-1)} />;
  }
  if (arError === 'in_app_browser') {
    return <ErrorPanel titleKey="ar.error.inAppBrowser" onBack={() => navigate(-1)} />;
  }

  const handleArError = (err) => {
    const msg = String(err?.message ?? err ?? '').toLowerCase();
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
      setArError('in_app_browser');
    } else if (msg.includes('notfound')) {
      setArError('no_camera');
    } else {
      setArError('permission');
    }
  };

  return (
    <MindARScene
      figId={id}
      figureName={figureName}
      videoUrl={videoUrl}
      targetUrl={targetUrl}
      voiceText={voiceText}
      lang={lang}
      storyChapter={FIGURE_TO_CHAPTER[id]}
      onError={handleArError}
    />
  );
}
