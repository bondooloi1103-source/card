import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FIGURES } from '@/lib/figuresData';
import { useOwnedFigures } from '@/hooks/useOwnedFigures';
import { currentSession } from '@/lib/authStore';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/i18n';
import FigureTileV2, { FIGURE_TILE_TOKENS as t } from '@/components/FigureTileV2';

const FONT_SANS =
  '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const COPY = {
  mn: {
    back: 'Буцах',
    title: 'Бүх дүрсүүд',
    mine: 'Миний цуглуулга',
    cats: {
      all: 'Бүгд',
      khans: 'Хаад',
      queens: 'Хатад',
      warriors: 'Жанжид',
      political: 'Зөвлөх',
      cultural: 'Соёл',
      modern: 'Орчин үе',
    },
    claiming: 'Цуглуулж байна…',
  },
  en: {
    back: 'Back',
    title: 'All figures',
    mine: 'My collection',
    cats: {
      all: 'All',
      khans: 'Khans',
      queens: 'Queens',
      warriors: 'Warriors',
      political: 'Advisors',
      cultural: 'Culture',
      modern: 'Modern',
    },
    claiming: 'Claiming…',
  },
};

const CAT_ORDER = ['all', 'khans', 'queens', 'warriors', 'political', 'cultural', 'modern'];

export default function Figures() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const c = COPY[lang] || COPY.mn;
  const session = currentSession();
  const userId = session?.account_id ?? null;
  const { figIds } = useOwnedFigures(userId);
  const ownedSet = new Set(figIds);

  const [activeCat, setActiveCat] = useState('all');
  const [claimingId, setClaimingId] = useState(null);

  const visible = FIGURES.filter((f) => activeCat === 'all' || f.cat === activeCat);

  const handleClaim = async (fig) => {
    if (ownedSet.has(fig.fig_id)) {
      navigate(`/c/${fig.fig_id}`);
      return;
    }
    setClaimingId(fig.fig_id);
    try {
      const { data, error } = await supabase.functions.invoke('claim-card', {
        body: { fig_id: fig.fig_id },
      });
      if (!error && data?.ok && data.owned) {
        navigate(`/c/${fig.fig_id}`);
      } else {
        console.warn('claim-card failed', error || data);
      }
    } catch (err) {
      console.error('claim-card invoke failed', err);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: t.bg,
        color: t.ink,
        fontFamily: FONT_SANS,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 56px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/app"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: t.body,
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 9999,
              border: `1px solid ${t.border}`,
              transition: 'color 160ms ease, border-color 160ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = t.brand;
              e.currentTarget.style.borderColor = t.borderStrong;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = t.body;
              e.currentTarget.style.borderColor = t.border;
            }}
          >
            <ArrowLeft size={14} /> {c.back}
          </Link>
          <Link
            to="/collection"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: t.brand,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              borderBottom: `1px solid ${t.borderStrong}`,
              paddingBottom: 4,
            }}
          >
            {c.mine} <ArrowRight size={14} />
          </Link>
        </div>

        <header style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: t.brand,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            Codex · {visible.length} / {FIGURES.length}
          </div>
          <h1
            style={{
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              color: t.ink,
              fontWeight: 800,
              letterSpacing: -0.5,
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {c.title}
          </h1>
        </header>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 32,
          }}
        >
          {CAT_ORDER.map((catId) => {
            const active = activeCat === catId;
            return (
              <button
                key={catId}
                onClick={() => setActiveCat(catId)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 9999,
                  background: active ? t.brand : 'transparent',
                  color: active ? t.bg : t.body,
                  border: `1px solid ${active ? t.brand : t.border}`,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: 0.2,
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                }}
              >
                {c.cats[catId]}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 22,
          }}
        >
          {visible.map((f) => {
            const claiming = claimingId === f.fig_id;
            return (
              <div key={f.fig_id} style={{ position: 'relative', opacity: claiming ? 0.55 : 1, transition: 'opacity 200ms' }}>
                <FigureTileV2
                  figure={f}
                  owned={ownedSet.has(f.fig_id)}
                  onClick={() => handleClaim(f)}
                />
                {claiming && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      color: t.brand,
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      background: 'rgba(10,12,20,0.55)',
                      borderRadius: 22,
                    }}
                  >
                    {c.claiming}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
