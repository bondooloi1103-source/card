import { useState } from 'react';
import { Crown, Sparkles, Shield, BookOpen, Check } from 'lucide-react';

export const FIGURE_TILE_TOKENS = {
  bg: '#0a0c14',
  surface: '#11141F',
  surfaceMuted: '#1A1F2E',
  ink: '#EDE8D5',
  body: '#A89F8A',
  border: 'rgba(212,168,67,0.18)',
  borderStrong: 'rgba(212,168,67,0.42)',
  brand: '#D4A843',
  brandStrong: '#E6BC52',
  brandSoft: 'rgba(212,168,67,0.12)',
  brandOnSoft: '#F2D88A',
  bronze: '#CD7F32',
};

export const PORTRAIT_FALLBACKS = {
  khans: '#2A2218',
  queens: '#2A1C1C',
  warriors: '#2C2615',
  political: '#1F1B14',
  cultural: '#1A2024',
  modern: '#221A1A',
};

export function CategoryIcon({ cat, size = 14 }) {
  if (cat === 'khans') return <Crown size={size} />;
  if (cat === 'queens') return <Sparkles size={size} />;
  if (cat === 'warriors') return <Shield size={size} />;
  if (cat === 'political') return <BookOpen size={size} />;
  return <BookOpen size={size} />;
}

export default function FigureTileV2({ figure, onClick, owned = false }) {
  const [hover, setHover] = useState(false);
  const t = FIGURE_TILE_TOKENS;
  const fallback = PORTRAIT_FALLBACKS[figure.cat] || t.surfaceMuted;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: t.surface,
        border: `1px solid ${owned ? t.borderStrong : t.border}`,
        borderRadius: 22,
        overflow: 'hidden',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        width: '100%',
        transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hover ? '0 24px 48px -28px rgba(0,0,0,0.55)' : 'none',
      }}
    >
      <div
        style={{
          aspectRatio: '4/5',
          position: 'relative',
          overflow: 'hidden',
          background: fallback,
        }}
      >
        {figure.image_url ? (
          <img
            src={figure.image_url}
            alt={figure.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
              opacity: 0.55,
            }}
          >
            {figure.ico}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 9999,
            background: 'rgba(10,12,20,0.72)',
            color: t.brandOnSoft,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            backdropFilter: 'blur(6px)',
            border: `1px solid ${t.border}`,
          }}
        >
          <CategoryIcon cat={figure.cat} size={11} />
          {figure.cat}
        </div>

        {owned && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 9999,
              background: t.brand,
              color: t.bg,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              boxShadow: '0 4px 12px -4px rgba(212,168,67,0.5)',
            }}
            aria-label="owned"
          >
            <Check size={11} strokeWidth={3} />
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            bottom: 12,
            color: '#fff',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))',
            paddingTop: 36,
            paddingBottom: 4,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>
            {figure.name}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4 }}>
            {figure.yrs}
          </div>
        </div>
      </div>
    </button>
  );
}
