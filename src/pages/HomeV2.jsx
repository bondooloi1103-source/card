import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  QrCode,
  Sparkles,
  Users,
  Trophy,
  Volume2,
  Quote as QuoteIcon,
  ScanLine,
  Map as MapIcon,
  Plus,
} from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { FIGURES } from '@/lib/figuresData';
import { useMyTeam } from '@/hooks/useMyTeam';
import { base44 } from '@/api/base44Client';
import ChatFAB from '@/components/ChatFAB';
import Card3D from '@/components/Card3D';
import FigureTileV2 from '@/components/FigureTileV2';

const FONT_SANS =
  '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const tokens = {
  bg: '#0a0c14',
  surface: '#11141F',
  surfaceMuted: '#1A1F2E',
  surfaceHigh: '#252B3D',
  ink: '#EDE8D5',
  inkSoft: '#C9C0A8',
  body: '#A89F8A',
  hint: '#6B6557',
  border: 'rgba(212,168,67,0.18)',
  borderStrong: 'rgba(212,168,67,0.42)',
  brand: '#D4A843',
  brandStrong: '#E6BC52',
  brandSoft: 'rgba(212,168,67,0.12)',
  brandOnSoft: '#F2D88A',
  bronze: '#CD7F32',
  bronzeSoft: 'rgba(205,127,50,0.14)',
};

const SECTION_PADY = 64;

const COPY = {
  mn: {
    nav: { figures: 'Дүрүүд', team: 'Миний баг', engagements: 'Тоглоом', chapters: 'Бүлгүүд', classic: 'Хуучин', scan: 'QR уншуулах' },
    hero: {
      kicker: 'Кодекс I',
      title1: 'Алтан Домогийн',
      title2: 'нүүр',
      lede: '52 түүхэн дүрийн намтар, эш үг, дуу хоолой — нэг код. Хөзрөө уншуулж эхэл, эсвэл доорх кодексийг сэрүүн.',
      cta: 'Хөзөр уншуулах',
      ctaAlt: 'Бүх 52 дүр',
    },
    team: {
      chip: 'Миний баг',
      empty: 'Чи багаа шилэн ав. Дүрүүдийн дотроос дуртайгаа сонгоод энд цуглуулна.',
      build: 'Баг бүрдүүлэх',
      addMore: 'Нэмэх',
    },
    explore: {
      chip: 'Кодекс',
      title: 'Өнөөдөр хэнтэй уулзах вэ?',
      lede: 'Хаад, хатад, жанжид, зөвлөх, соёлын зүтгэлтэн — эхлэхдээ тохирох хэдийг сонгож үзээрэй.',
      all: 'Бүх 52',
      view2D: '🃏 2D',
      view3D: '🎴 3D',
      viewLabel: 'Үзэх горим',
    },
    engagements: {
      chip: 'Оролц',
      title: 'Кодекстэй наадах',
      cards: [
        { kicker: 'Ганц', title: 'Хэний үг вэ?', sub: 'Ишлэлийг уншиж, хэн хэлснийг сонго. Тэргүүлэгчдийн жагсаалтад нэрээ үлдээ.' },
        { kicker: 'Багаараа', title: 'Живэ өрөө', sub: '2–8 тоглогч, нийтлэг хугацаа, нэг ишлэл. Код оруулан нэгд эсвэл өрөө үүсгэ.' },
        { kicker: 'Байр', title: 'Тэргүүлэгчид', sub: '7 хоногийн болон бүх цагийн жагсаалт.' },
        { kicker: 'Сонсох', title: 'Түүхэн аялал', sub: 'Кодексийн эхнээс сүүл хүртэл дуу автоматаар тоглоно.' },
      ],
    },
    chapters: {
      chip: 'Түүхэн бүлгүүд',
      title: 'Кодексийн бүтэц',
      lede: 'Зургаан бүлэгт хуваагдсан түүхэн дүрүүд — домогт өвгөдөөс орчин цагийн баатрууд хүртэл.',
      list: [
        { num: 'I', title: 'Хаад', count: '13 дүр', desc: 'Чингисээс Богд хүртэл — Их Монголын ширээний өв.' },
        { num: 'II', title: 'Хатад', count: '10 дүр', desc: 'Бөртэгээс Мандухай хүртэл — ширээний цаадахь хүчирхэг хатад.' },
        { num: 'III', title: 'Жанжид', count: '12 дүр', desc: 'Сүбээдэйгээс Сүхбаатар хүртэл — байлдан дагуулагчид.' },
        { num: 'IV', title: 'Зөвлөхүүд', count: '9 дүр', desc: 'Елүй Чуцайгаас Цэдэнбал хүртэл — улсыг бичиж босгогчид.' },
        { num: 'V', title: 'Соёл', count: '5 дүр', desc: 'Бичээч, уран барималч, лама — Монголын оюун санааг тээгчид.' },
        { num: 'VI', title: 'Орчин үе', count: '3 дүр', desc: 'XX зууны баатрууд — тусгаар тогтнолын тэмцэл.' },
      ],
      open: 'Бүлэг нээх',
    },
    map: {
      chip: 'Газар нутаг',
      title: 'Эзэнт гүрэн зурагтаа',
      desc: 'Хархорумаас Багдад, Будапештээс Дайду хүртэл — байлдааны замнал, ноёрхлын хил.',
      cta: 'Зураг үзэх',
    },
    foot: { rights: 'Алтан Домог · Codex I · Ulaanbaatar' },
  },
  en: {
    nav: { figures: 'Figures', team: 'My team', engagements: 'Play', chapters: 'Chapters', classic: 'Classic', scan: 'Scan a card' },
    hero: {
      kicker: 'Codex I',
      title1: 'The face of',
      title2: 'Altan Domog',
      lede: '52 lives, 52 voices — one code. Scan a card and meet a figure, or wake the codex below.',
      cta: 'Scan a card',
      ctaAlt: 'All 52 figures',
    },
    team: {
      chip: 'My team',
      empty: 'Build your team. Pick the figures you want to keep close — they’ll live here.',
      build: 'Build a team',
      addMore: 'Add more',
    },
    explore: {
      chip: 'The codex',
      title: 'Who are you meeting today?',
      lede: 'Khans, queens, generals, advisors, cultural figures — pick a few to start with.',
      all: 'See all 52',
      view2D: '🃏 2D',
      view3D: '🎴 3D',
      viewLabel: 'View mode',
    },
    engagements: {
      chip: 'Play',
      title: 'Engage with the codex',
      cards: [
        { kicker: 'Solo', title: 'Whose words?', sub: 'Read the quote, pick the figure. Your score lands on the leaderboard.' },
        { kicker: 'Party', title: 'Live rooms', sub: '2–8 players, shared timer, one quote at a time. Host or join with a code.' },
        { kicker: 'Rankings', title: 'Leaderboard', sub: 'Weekly and all-time scores across every quote round and duel.' },
        { kicker: 'Listen', title: 'Story Tour', sub: 'Walk the codex end to end with narration playing automatically.' },
      ],
    },
    chapters: {
      chip: 'Chapters',
      title: 'How the codex is laid out',
      lede: 'Six chapters of figures — from mythic ancestors to the heroes of the modern republic.',
      list: [
        { num: 'I', title: 'Khans', count: '13 figures', desc: 'From Genghis to the last Bogd — the throne of the Great Mongol state.' },
        { num: 'II', title: 'Queens', count: '10 figures', desc: 'From Borte to Mandukhai — the power behind and on the throne.' },
        { num: 'III', title: 'Warriors', count: '12 figures', desc: 'From Subedei to Sukhbaatar — the conquerors and defenders.' },
        { num: 'IV', title: 'Advisors', count: '9 figures', desc: 'From Yelü Chucai to Tsedenbal — the writers of the state.' },
        { num: 'V', title: 'Culture', count: '5 figures', desc: 'Scribes, sculptors, lamas — the carriers of the Mongol mind.' },
        { num: 'VI', title: 'Modern', count: '3 figures', desc: 'Twentieth-century heroes of the independence struggle.' },
      ],
      open: 'Open chapter',
    },
    map: {
      chip: 'Geography',
      title: 'The empire on a map',
      desc: 'From Karakorum to Baghdad, Budapest to Dadu — the campaigns and the borders of dominion.',
      cta: 'Open the map',
    },
    foot: { rights: 'Altan Domog · Codex I · Ulaanbaatar' },
  },
};

function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, delay = 0, className = '' }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 700ms ease ${delay}ms, transform 700ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, tone = 'neutral' }) {
  const palettes = {
    neutral: { bg: tokens.surfaceMuted, fg: tokens.inkSoft, bd: tokens.border },
    brand: { bg: tokens.brandSoft, fg: tokens.brandOnSoft, bd: tokens.borderStrong },
    dark: { bg: 'rgba(212,168,67,0.06)', fg: tokens.ink, bd: tokens.border },
  };
  const p = palettes[tone] || palettes.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 9999,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.bd}`,
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ to, href, onClick, children, ...rest }) {
  const Tag = to ? Link : 'a';
  const linkProps = to ? { to } : { href: href || '#' };
  return (
    <Tag
      {...linkProps}
      onClick={onClick}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 22px',
        borderRadius: 14,
        background: tokens.brand,
        color: tokens.bg,
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: 0.1,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'transform 180ms ease, box-shadow 180ms ease, background 180ms ease',
        boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 8px 24px rgba(212,168,67,0.32)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tokens.brandStrong;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = tokens.brand;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {children}
    </Tag>
  );
}

function GhostButton({ to, href, onClick, children, ...rest }) {
  const Tag = to ? Link : 'a';
  const linkProps = to ? { to } : { href: href || '#' };
  return (
    <Tag
      {...linkProps}
      onClick={onClick}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '11px 20px',
        borderRadius: 14,
        background: 'transparent',
        color: tokens.ink,
        fontWeight: 600,
        fontSize: 14.5,
        letterSpacing: 0.1,
        textDecoration: 'none',
        cursor: 'pointer',
        border: `1px solid ${tokens.borderStrong}`,
        transition: 'background 180ms ease, transform 180ms ease, border-color 180ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tokens.brandSoft;
        e.currentTarget.style.borderColor = tokens.brand;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = tokens.borderStrong;
      }}
    >
      {children}
    </Tag>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  const opt = (code, label) => {
    const active = lang === code;
    return (
      <button
        key={code}
        onClick={() => setLang(code)}
        style={{
          padding: '6px 12px',
          borderRadius: 9999,
          background: active ? tokens.brand : 'transparent',
          color: active ? tokens.bg : tokens.body,
          border: 'none',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          cursor: 'pointer',
          transition: 'all 160ms ease',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 3,
        borderRadius: 9999,
        background: tokens.surfaceMuted,
        border: `1px solid ${tokens.border}`,
      }}
    >
      {opt('mn', 'MN')}
      {opt('en', 'EN')}
    </div>
  );
}

function NavBar({ c }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: c.nav.figures, href: '#explore' },
    { label: c.nav.team, href: '#team' },
    { label: c.nav.engagements, href: '#engagements' },
    { label: c.nav.chapters, href: '#chapters' },
  ];

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: scrolled ? 'rgba(10,12,20,0.85)' : 'rgba(10,12,20,0.0)',
        backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none',
        borderBottom: scrolled ? `1px solid ${tokens.border}` : '1px solid transparent',
        transition: 'all 200ms ease',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Link to="/v2/app" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: tokens.brand,
              color: tokens.bg,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: 0.5,
            }}
          >
            АД
          </span>
          <span style={{ color: tokens.ink, fontWeight: 700, fontSize: 17, letterSpacing: 0.2 }}>
            Altan Domog
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="hidden-on-mobile">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                color: tokens.body,
                fontSize: 14.5,
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'color 160ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = tokens.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = tokens.body)}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LangToggle />
          <GhostButton to="/v1/app" className="hidden-on-mobile">
            <span style={{ fontSize: 13.5 }}>{c.nav.classic}</span>
          </GhostButton>
          <PrimaryButton to="/ar">
            <ScanLine size={16} /> {c.nav.scan}
          </PrimaryButton>
        </div>
      </div>
    </header>
  );
}

function Hero({ c, figureCount }) {
  return (
    <section
      style={{
        position: 'relative',
        padding: `${SECTION_PADY + 16}px 24px ${SECTION_PADY}px`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: 1280,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <Reveal>
          <Chip tone="brand">
            <Sparkles size={14} /> {c.hero.kicker} · {figureCount} figures
          </Chip>
          <h1
            style={{
              marginTop: 18,
              color: tokens.ink,
              fontWeight: 600,
              letterSpacing: -0.8,
              lineHeight: 1.05,
              fontSize: 'clamp(2.6rem, 6vw, 4.6rem)',
            }}
          >
            {c.hero.title1}{' '}
            <span
              style={{
                color: tokens.brand,
                fontWeight: 600,
              }}
            >
              {c.hero.title2}
            </span>
          </h1>
          <p
            style={{
              marginTop: 18,
              maxWidth: 620,
              margin: '18px auto 0',
              fontSize: 18,
              lineHeight: 1.6,
              color: tokens.body,
            }}
          >
            {c.hero.lede}
          </p>
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <PrimaryButton to="/ar">
              <ScanLine size={16} /> {c.hero.cta}
            </PrimaryButton>
            <GhostButton to="/figures">{c.hero.ctaAlt}</GhostButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// FigureTile, PORTRAIT_FALLBACKS, and CategoryIcon now live in @/components/FigureTileV2
// (re-exported for shared use across Figures and Collection pages).

function MyTeamStrip({ c, figures }) {
  const { team, removeFromTeam } = useMyTeam();
  const navigate = useNavigate();
  const teamFigures = useMemo(
    () => team.map((id) => figures.find((f) => f.fig_id === id)).filter(Boolean),
    [team, figures]
  );

  return (
    <section
      id="team"
      style={{ padding: `${SECTION_PADY}px 24px`, background: tokens.surface, borderTop: `1px solid ${tokens.border}` }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 28,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Chip>
                <Users size={14} /> {c.team.chip}
              </Chip>
              <h2
                style={{
                  marginTop: 14,
                  fontSize: 'clamp(1.6rem, 3.2vw, 2.2rem)',
                  fontWeight: 800,
                  letterSpacing: -0.4,
                  color: tokens.ink,
                }}
              >
                {team.length} / 5
              </h2>
            </div>
            <GhostButton to="/figures">
              {team.length === 0 ? c.team.build : c.team.addMore}
              <Plus size={16} />
            </GhostButton>
          </div>
        </Reveal>

        {team.length === 0 ? (
          <Reveal delay={60}>
            <div
              style={{
                background: tokens.bg,
                border: `1px dashed ${tokens.borderStrong}`,
                borderRadius: 22,
                padding: 32,
                textAlign: 'center',
                color: tokens.body,
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              {c.team.empty}
            </div>
          </Reveal>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 16,
              overflowX: 'auto',
              paddingBottom: 8,
              scrollSnapType: 'x mandatory',
            }}
          >
            {teamFigures.map((figure, i) => (
              <Reveal key={figure.fig_id} delay={i * 60}>
                <div style={{ width: 260, flexShrink: 0, scrollSnapAlign: 'start' }}>
                  <FigureTileV2 figure={figure} onClick={() => navigate(`/figure/${figure.fig_id}`)} />
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ExploreFigures({ c, figures }) {
  const navigate = useNavigate();
  const [view3D, setView3D] = useState(false);
  const featured = useMemo(() => {
    const order = ['khans', 'queens', 'warriors', 'political', 'cultural', 'modern'];
    const seen = new Set();
    const picks = [];
    order.forEach((cat) => {
      figures
        .filter((f) => f.cat === cat)
        .slice(0, 2)
        .forEach((f) => {
          if (!seen.has(f.fig_id)) {
            seen.add(f.fig_id);
            picks.push(f);
          }
        });
    });
    return picks.slice(0, 8);
  }, [figures]);

  const toggleOpt = (mode, label) => {
    const active = (mode === '3d') === view3D;
    return (
      <button
        key={mode}
        onClick={() => setView3D(mode === '3d')}
        style={{
          padding: '6px 14px',
          borderRadius: 9999,
          background: active ? tokens.brand : 'transparent',
          color: active ? tokens.bg : tokens.body,
          border: 'none',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          cursor: 'pointer',
          transition: 'all 160ms ease',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <section id="explore" style={{ padding: `${SECTION_PADY}px 24px`, background: tokens.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              marginBottom: 32,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Chip>{c.explore.chip}</Chip>
              <h2
                style={{
                  marginTop: 14,
                  fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                  color: tokens.ink,
                  fontWeight: 800,
                  letterSpacing: -0.4,
                }}
              >
                {c.explore.title}
              </h2>
              <p
                style={{
                  marginTop: 10,
                  maxWidth: 540,
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: tokens.body,
                }}
              >
                {c.explore.lede}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: 3,
                  borderRadius: 9999,
                  background: tokens.surfaceMuted,
                  border: `1px solid ${tokens.border}`,
                }}
                aria-label={c.explore.viewLabel}
              >
                {toggleOpt('2d', c.explore.view2D)}
                {toggleOpt('3d', c.explore.view3D)}
              </div>
              <Link
                to="/figures"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: tokens.ink,
                  fontWeight: 600,
                  fontSize: 14.5,
                  textDecoration: 'none',
                  borderBottom: `1px solid ${tokens.borderStrong}`,
                  paddingBottom: 4,
                }}
              >
                {c.explore.all} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Reveal>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: view3D
              ? 'repeat(auto-fill, minmax(280px, 1fr))'
              : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 22,
          }}
        >
          {featured.map((f, i) => (
            <Reveal key={f.fig_id} delay={i * 50}>
              {view3D ? (
                <Card3D figure={f} onClick={() => navigate(`/figure/${f.fig_id}`)} index={i} />
              ) : (
                <FigureTileV2 figure={f} onClick={() => navigate(`/figure/${f.fig_id}`)} />
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const ENGAGEMENT_ICONS = [QuoteIcon, Users, Trophy, Volume2];
const ENGAGEMENT_ROUTES = ['/games/quotes', '/games/quotes/live', '/leaderboard', '/tour'];

function Engagements({ c }) {
  return (
    <section
      id="engagements"
      style={{ padding: `${SECTION_PADY}px 24px`, background: tokens.surface, borderTop: `1px solid ${tokens.border}` }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal>
          <div style={{ marginBottom: 32 }}>
            <Chip>{c.engagements.chip}</Chip>
            <h2
              style={{
                marginTop: 14,
                fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                color: tokens.ink,
                fontWeight: 800,
                letterSpacing: -0.4,
              }}
            >
              {c.engagements.title}
            </h2>
          </div>
        </Reveal>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}
        >
          {c.engagements.cards.map((card, i) => {
            const Icon = ENGAGEMENT_ICONS[i] || QuoteIcon;
            const to = ENGAGEMENT_ROUTES[i] || '/';
            return (
              <Reveal key={card.title} delay={i * 60}>
                <Link
                  to={to}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    background: tokens.bg,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 22,
                    padding: 24,
                    transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 18px 40px -22px rgba(15,23,42,0.18)';
                    e.currentTarget.style.borderColor = tokens.borderStrong;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = tokens.border;
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: tokens.brandSoft,
                      color: tokens.brand,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.4,
                      color: tokens.hint,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {card.kicker}
                  </div>
                  <h3
                    style={{
                      marginTop: 6,
                      fontSize: 19,
                      fontWeight: 700,
                      color: tokens.ink,
                    }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      color: tokens.body,
                    }}
                  >
                    {card.sub}
                  </p>
                  <div
                    style={{
                      marginTop: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: tokens.ink,
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    <ArrowRight size={14} />
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Chapters({ c }) {
  return (
    <section id="chapters" style={{ padding: `${SECTION_PADY}px 24px`, background: tokens.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Chip>{c.chapters.chip}</Chip>
            <h2
              style={{
                marginTop: 14,
                fontSize: 'clamp(2rem, 4vw, 2.75rem)',
                color: tokens.ink,
                fontWeight: 800,
                letterSpacing: -0.4,
                lineHeight: 1.1,
              }}
            >
              {c.chapters.title}
            </h2>
            <p
              style={{
                marginTop: 14,
                maxWidth: 600,
                margin: '14px auto 0',
                color: tokens.body,
                fontSize: 17,
                lineHeight: 1.6,
              }}
            >
              {c.chapters.lede}
            </p>
          </div>
        </Reveal>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}
        >
          {c.chapters.list.map((ch, i) => (
            <Reveal key={ch.num} delay={i * 50}>
              <Link
                to={`/story/${i + 1}`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  background: tokens.surface,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 22,
                  padding: 24,
                  height: '100%',
                  transition: 'transform 200ms ease, box-shadow 200ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 18px 40px -22px rgba(15,23,42,0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                            fontSize: 36,
                      fontWeight: 600,
                      letterSpacing: -1,
                      color: tokens.brand,
                      lineHeight: 1,
                    }}
                  >
                    {ch.num}
                  </span>
                  <span style={{ color: tokens.hint, fontSize: 12, fontWeight: 600, letterSpacing: 0.6 }}>
                    {ch.count}
                  </span>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: tokens.ink, letterSpacing: -0.2 }}>
                  {ch.title}
                </h3>
                <p style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.55, color: tokens.body }}>
                  {ch.desc}
                </p>
                <div
                  style={{
                    marginTop: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: tokens.ink,
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  {c.chapters.open} <ArrowRight size={14} />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapBand({ c }) {
  return (
    <section style={{ padding: `${SECTION_PADY}px 24px`, background: tokens.surface, borderTop: `1px solid ${tokens.border}` }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          background: tokens.surfaceMuted,
          color: tokens.ink,
          borderRadius: 28,
          padding: 'clamp(28px, 5vw, 48px)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'center',
        }}
        className="map-band"
      >
        <div>
          <Chip tone="brand">
            <MapIcon size={14} /> {c.map.chip}
          </Chip>
          <h3
            style={{
              marginTop: 14,
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              fontWeight: 600,
              letterSpacing: -0.4,
              lineHeight: 1.15,
              color: tokens.ink,
            }}
          >
            {c.map.title}
          </h3>
          <p style={{ marginTop: 12, color: tokens.body, fontSize: 16, lineHeight: 1.55 }}>
            {c.map.desc}
          </p>
          <div style={{ marginTop: 22 }}>
            <Link
              to="/app#map"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 16,
                background: tokens.brand,
                color: tokens.bg,
                fontWeight: 700,
                fontSize: 14.5,
                textDecoration: 'none',
              }}
            >
              {c.map.cta} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div
          aria-hidden
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderRadius: 16,
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                `linear-gradient(to right, ${tokens.border} 1px, transparent 1px), linear-gradient(to bottom, ${tokens.border} 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
              opacity: 0.6,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '38%',
              left: '36%',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: tokens.brand,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '54%',
              left: '60%',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: tokens.brandStrong,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function Foot({ c }) {
  return (
    <footer style={{ padding: '36px 24px 48px', background: tokens.bg, borderTop: `1px solid ${tokens.border}` }}>
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: tokens.brand,
              color: tokens.bg,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 0.4,
            }}
          >
            АД
          </span>
          <span style={{ color: tokens.ink, fontWeight: 600, fontSize: 14.5 }}>{c.foot.rights}</span>
        </div>
        <div style={{ color: tokens.hint, fontSize: 13, letterSpacing: 0.4 }}>© MMXXVI</div>
      </div>
    </footer>
  );
}

export default function HomeV2() {
  const { lang } = useLang();
  const c = COPY[lang] || COPY.mn;
  const [figures, setFigures] = useState(FIGURES);

  const { data: dbFigures } = useQuery({
    queryKey: ['figures'],
    queryFn: () => base44.entities.Figure.list('-fig_id', 100),
    initialData: [],
  });

  useEffect(() => {
    if (dbFigures && dbFigures.length > 0) {
      const merged = FIGURES.map((defaultFig) => {
        const dbFig = dbFigures.find((d) => d.fig_id === defaultFig.fig_id);
        return dbFig ? { ...defaultFig, ...dbFig } : defaultFig;
      });
      dbFigures.forEach((dbFig) => {
        if (!merged.find((m) => m.fig_id === dbFig.fig_id)) merged.push(dbFig);
      });
      merged.sort((a, b) => a.fig_id - b.fig_id);
      setFigures(merged);
    }
  }, [dbFigures]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: tokens.bg,
        color: tokens.ink,
        fontFamily: FONT_SANS,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <NavBar c={c} />
      <Hero c={c} figureCount={figures.length} />
      <MyTeamStrip c={c} figures={figures} />
      <ExploreFigures c={c} figures={figures} />
      <Engagements c={c} />
      <Chapters c={c} />
      <MapBand c={c} />
      <Foot c={c} />
      <ChatFAB />
      <style>{`
        @media (max-width: 880px) {
          .hidden-on-mobile { display: none !important; }
          .map-band { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
