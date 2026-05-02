import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ScanLine, Sparkles } from 'lucide-react';
import { FIGURES } from '@/lib/figuresData';
import { useOwnedFigures } from '@/hooks/useOwnedFigures';
import { currentSession } from '@/lib/authStore';
import { useLang } from '@/lib/i18n';
import FigureTileV2, { FIGURE_TILE_TOKENS as t } from '@/components/FigureTileV2';

const FONT_SANS =
  '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const COPY = {
  mn: {
    back: 'Буцах',
    chip: 'Цуглуулга',
    title: 'Миний цуглуулга',
    subtitle: 'Карт уншуулсан түүхэн зүтгэлтнүүдийн жагсаалт.',
    statSuffix: 'дүр',
    loading: 'Уншиж байна…',
    emptyTitle: 'Цуглуулгаа эхлүүл',
    emptyLede: 'Хөзрөө утсаараа уншуулмагц энд тэмдэглэгдэх болно.',
    emptyScan: 'Карт уншуулах',
    emptyAll: 'Бүх дүрсийг үзэх',
    seeAll: 'Бүх дүрсүүд',
  },
  en: {
    back: 'Back',
    chip: 'Collection',
    title: 'My collection',
    subtitle: 'The historical figures whose cards you have scanned.',
    statSuffix: 'figures',
    loading: 'Loading…',
    emptyTitle: 'Start your collection',
    emptyLede: 'Scan a card with your phone and it will appear here.',
    emptyScan: 'Scan a card',
    emptyAll: 'See all figures',
    seeAll: 'All figures',
  },
};

function PageShell({ children }) {
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
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 56px' }}>{children}</div>
    </div>
  );
}

export default function Collection() {
  const { lang } = useLang();
  const c = COPY[lang] || COPY.mn;
  const navigate = useNavigate();
  const session = currentSession();
  const userId = session?.account_id ?? null;
  const { figIds, loading } = useOwnedFigures(userId);

  if (loading) {
    return (
      <PageShell>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.brand, fontSize: 15 }}>
          {c.loading}
        </div>
      </PageShell>
    );
  }

  const owned = figIds
    .map((id) => FIGURES.find((f) => f.fig_id === id))
    .filter(Boolean);

  return (
    <PageShell>
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
          to="/figures"
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
          {c.seeAll} <ArrowRight size={14} />
        </Link>
      </div>

      <header style={{ marginBottom: owned.length === 0 ? 0 : 32 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 9999,
            background: t.brandSoft,
            color: t.brandOnSoft,
            border: `1px solid ${t.borderStrong}`,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: 0.4,
          }}
        >
          <Sparkles size={14} /> {c.chip}
        </span>
        <h1
          style={{
            marginTop: 14,
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            color: t.ink,
            fontWeight: 800,
            letterSpacing: -0.5,
            lineHeight: 1.05,
          }}
        >
          {c.title}
        </h1>
        <p
          style={{
            marginTop: 12,
            maxWidth: 540,
            color: t.body,
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          {c.subtitle}
        </p>
        {owned.length > 0 && (
          <div
            style={{
              marginTop: 22,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '14px 22px',
              borderRadius: 18,
              background: t.surface,
              border: `1px solid ${t.borderStrong}`,
            }}
          >
            <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: -0.6, color: t.brand, lineHeight: 1 }}>
              {owned.length}
            </span>
            <span style={{ fontSize: 14, color: t.body, letterSpacing: 0.4 }}>
              / {FIGURES.length} {c.statSuffix}
            </span>
          </div>
        )}
      </header>

      {owned.length === 0 ? (
        <div
          style={{
            marginTop: 40,
            padding: 'clamp(32px, 5vw, 56px)',
            background: t.surface,
            border: `1px dashed ${t.borderStrong}`,
            borderRadius: 24,
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: t.ink,
              letterSpacing: -0.2,
              margin: 0,
            }}
          >
            {c.emptyTitle}
          </h2>
          <p
            style={{
              marginTop: 12,
              maxWidth: 460,
              margin: '12px auto 0',
              color: t.body,
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            {c.emptyLede}
          </p>
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link
              to="/ar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 22px',
                borderRadius: 14,
                background: t.brand,
                color: t.bg,
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
                boxShadow: '0 8px 24px rgba(212,168,67,0.32)',
              }}
            >
              <ScanLine size={16} /> {c.emptyScan}
            </Link>
            <Link
              to="/figures"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 20px',
                borderRadius: 14,
                background: 'transparent',
                color: t.ink,
                fontWeight: 600,
                fontSize: 14.5,
                textDecoration: 'none',
                border: `1px solid ${t.borderStrong}`,
              }}
            >
              {c.emptyAll}
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 22,
          }}
        >
          {owned.map((f) => (
            <FigureTileV2
              key={f.fig_id}
              figure={f}
              owned
              onClick={() => navigate(`/c/${f.fig_id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
