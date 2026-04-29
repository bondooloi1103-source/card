import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';
import { useFigureARTarget } from '@/hooks/useFigureARTarget';

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

export default function ARLaunchButton({ figId, variant = 'full' }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const { ready, loading } = useFigureARTarget(figId);

  if (loading) {
    return (
      <span
        data-testid="ar-launch-loading"
        className={
          variant === 'compact'
            ? 'inline-block w-8 h-8 rounded-full border border-gold/40 animate-pulse'
            : 'inline-flex items-center gap-2 px-4 py-2 border border-gold/40 rounded animate-pulse text-gold/60 text-xs font-meta tracking-[0.2em] uppercase'
        }
      >
        {variant === 'compact' ? '' : t('ar.loading')}
      </span>
    );
  }

  const onClick = () => {
    if (!ready) return;
    navigate(`/ar/${figId}`);
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
        className={`relative w-8 h-8 rounded-full flex items-center justify-center
          ${ready
            ? 'bg-ink/70 text-gold border border-gold/70 hover:scale-110 transition-transform'
            : 'bg-ink/40 text-bronze/50 border border-bronze/30 cursor-not-allowed'}`}
        style={{ minWidth: 44, minHeight: 44, padding: 0 }}
      >
        {ready && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-gold/70 motion-safe:animate-[arPulse_2.4s_ease-out_infinite]"
          />
        )}
        <ARGlyph size={14} />
      </button>
    );
  }

  // full variant — distinct from crimson/brass action buttons
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      data-variant="full"
      className={`relative inline-flex items-center gap-2 px-4 py-2 font-meta text-[10px] tracking-[0.28em] uppercase
        ${ready
          ? 'text-gold hover:text-ivory transition-colors'
          : 'text-bronze/60 cursor-not-allowed'}`}
    >
      <span
        aria-hidden
        className={`absolute inset-0 border ${ready ? 'border-gold/70' : 'border-bronze/40'}`}
        style={{ background: ready
          ? 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(184,134,11,0.04))'
          : 'transparent' }}
      />
      {ready && (
        <motion.span
          aria-hidden
          className="absolute inset-0 border border-gold/40 motion-safe:animate-[arPulse_2.4s_ease-out_infinite]"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">
        <ARGlyph size={14} />
        {ready ? t('ar.button.full') : t('ar.button.comingSoon')}
      </span>
    </button>
  );
}
