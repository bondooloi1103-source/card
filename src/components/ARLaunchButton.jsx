import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import { useFigureARPack } from '@/hooks/useFigureARPack';
import BrassButton from '@/components/ornaments/BrassButton';
import CornerTicks from '@/components/ornaments/CornerTicks';

function ARGlyph({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M3 7v-3h3M21 7v-3h-3M3 17v3h3M21 17v3h-3" />
      <path d="M12 6 4 10l8 4 8-4-8-4z" />
      <path d="M4 10v6l8 4M20 10v6l-8 4M12 14v6" />
    </svg>
  );
}

export default function ARLaunchButton({ figId: _figId, variant = 'full' }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const { ready, loading } = useFigureARPack();

  if (loading) {
    return (
      <span
        data-testid="ar-launch-loading"
        className={
          variant === 'compact'
            ? 'relative inline-block w-9 h-9 border border-brass/40 animate-pulse'
            : 'inline-flex items-center gap-2 px-6 py-3 border border-brass/40 animate-pulse text-brass/60 text-[11px] font-meta tracking-[0.28em] uppercase'
        }
      >
        {variant === 'compact' ? '' : t('ar.loading')}
      </span>
    );
  }

  const onClick = () => {
    if (!ready) return;
    navigate('/ar');
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!ready}
        data-variant="compact"
        aria-label={t('ar.button.full')}
        title={ready ? t('ar.button.full') : t('ar.button.tooltipDisabled')}
        className={`relative w-9 h-9 inline-flex items-center justify-center transition-colors
          ${ready
            ? 'bg-ink/70 text-seal hover:text-ivory'
            : 'bg-ink/40 text-bronze/50 cursor-not-allowed'}`}
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <span
          aria-hidden
          className={`absolute inset-0 border ${ready ? 'border-brass/70' : 'border-bronze/30'}`}
        />
        <CornerTicks size={5} inset={1} thickness={1} opacity={ready ? 0.95 : 0.5} />
        {ready && (
          <motion.span
            aria-hidden
            className="absolute inset-0 border border-seal/60 motion-safe:animate-[arPulse_2.4s_ease-out_infinite]"
          />
        )}
        <span className="relative z-10 inline-flex">
          <ARGlyph size={14} />
        </span>
      </button>
    );
  }

  return (
    <span className="relative inline-flex" data-variant="full">
      <BrassButton
        type="button"
        onClick={onClick}
        disabled={!ready}
        variant={ready ? 'primary' : 'ghost'}
        size="sm"
        icon={<ARGlyph size={14} />}
      >
        {ready ? t('ar.button.full') : t('ar.button.comingSoon')}
      </BrassButton>
      {ready && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 border border-brass/50 motion-safe:animate-[arPulse_2.4s_ease-out_infinite]"
        />
      )}
    </span>
  );
}
