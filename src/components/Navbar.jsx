import { useState, useEffect } from 'react';
import { Menu, X, BookMarked, LogOut, Trophy, Medal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCollection } from '@/hooks/useCollection';
import { clearOtpVerification } from '@/components/OtpGate';
import { currentSession } from '@/lib/authStore';
import { useLang } from '@/lib/i18n';
import CornerTicks from '@/components/ornaments/CornerTicks';

const NAV_ITEMS = [
  { roman: 'I',    key: 'nav.home',        target: 'hero' },
  { roman: 'II',   key: 'nav.codex',       target: 'gallery' },
  { roman: 'III',  key: 'nav.chapters',    target: 'chapters' },
  { roman: 'IV',   key: 'nav.myteam',      target: 'myteam' },
  { roman: 'V',    key: 'nav.engagements', target: 'engagements' },
  { roman: 'VI',   key: 'nav.map',         target: 'map' },
  { roman: 'VII',  key: 'nav.timeline',    target: 'timeline' },
];

export default function Navbar({ onScrollTo }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const { total } = useCollection();
  const session = currentSession();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = (target) => {
    onScrollTo(target);
    setMobileOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-30 transition-colors duration-500 ${
        scrolled ? 'bg-ink/92 backdrop-blur-md' : 'bg-ink/40 backdrop-blur-sm'
      }`}
    >
      {/* top hairline */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-brass/50 to-transparent" />

      <div className="max-w-[92rem] mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-4">

        {/* Imprint — circular Altan Domog emblem (wordmark is in the logo itself) */}
        <button
          onClick={() => handleClick('hero')}
          className="flex items-center gap-2 group shrink-0"
          aria-label="Нүүр"
        >
          <img
            src="/logo.png"
            alt="Altan Domog"
            className="h-10 md:h-12 w-auto group-hover:scale-105 transition-transform"
          />
          <span className="hidden md:inline font-meta text-[8px] tracking-[0.3em] text-brass/70 self-end pb-2">
            CODEX · MMXXVI
          </span>
        </button>

        {/* Desktop nav — roman-numeral index (tightened gap + smaller text) */}
        <div className="hidden lg:flex items-center gap-5 flex-1 justify-center">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.target}
              onClick={() => handleClick(item.target)}
              className="group flex items-baseline gap-1.5 py-2"
            >
              <span className="font-meta text-[9px] tracking-[0.28em] text-brass/70 group-hover:text-brass transition-colors">
                {item.roman}.
              </span>
              <span className="font-display text-[13px] text-ivory/75 group-hover:text-ivory transition-colors tracking-wide"
                    style={{ fontVariationSettings: '"opsz" 30, "wght" 450, "SOFT" 40' }}>
                {t(item.key)}
              </span>
              <span className="h-px w-0 group-hover:w-full bg-brass/70 transition-[width] duration-300 self-end mb-1" />
            </button>
          ))}
        </div>

        {/* Right-side controls — icon-only below xl, tighter gaps */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Language toggle */}
          <div className="relative flex items-center gap-0 border border-brass/40 overflow-hidden">
            <CornerTicks size={5} inset={1} thickness={1} opacity={0.7} />
            {['mn', 'en'].map((code) => {
              const active = lang === code;
              return (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`relative z-10 px-1.5 py-1 font-meta text-[9.5px] tracking-[0.2em] uppercase transition-colors ${
                    active ? 'bg-brass/15 text-ivory' : 'text-brass/70 hover:text-ivory'
                  }`}
                  aria-pressed={active}
                >
                  {code === 'mn' ? 'МН' : 'EN'}
                </button>
              );
            })}
          </div>

          {/* Collection — icon-only with badge (label shown xl+) */}
          <button
            onClick={() => navigate('/collection')}
            title={t('nav.collection')}
            className="relative group flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-meta tracking-[0.2em] uppercase text-brass hover:text-ivory transition-colors"
          >
            <span className="absolute inset-0 border border-brass/40 group-hover:border-brass/90 transition-colors" />
            <BookMarked className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden xl:inline relative z-10">{t('nav.collection')}</span>
            {total > 0 && (
              <span className="relative z-10 ml-0.5 font-display text-[10px] leading-none text-ivory px-1 py-0.5 bg-seal/85"
                    style={{ fontVariationSettings: '"opsz" 24, "wght" 600' }}>
                {total}
              </span>
            )}
          </button>

          {/* Leaderboard — icon-only */}
          {session && (
            <button
              onClick={() => navigate('/leaderboard')}
              title={t('nav.leaderboard')}
              className="relative group hidden sm:flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-meta tracking-[0.2em] uppercase text-brass hover:text-ivory transition-colors"
            >
              <span className="absolute inset-0 border border-brass/40 group-hover:border-brass/90 transition-colors" />
              <Trophy className="w-3.5 h-3.5 relative z-10" />
              <span className="hidden xl:inline relative z-10">{t('nav.leaderboard')}</span>
            </button>
          )}

          {/* Tournaments — icon-only */}
          {session && (
            <button
              onClick={() => navigate('/app/tournaments')}
              title={t('nav.tournaments')}
              className="relative group hidden sm:flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-meta tracking-[0.2em] uppercase text-brass hover:text-ivory transition-colors"
            >
              <span className="absolute inset-0 border border-brass/40 group-hover:border-brass/90 transition-colors" />
              <Medal className="w-3.5 h-3.5 relative z-10" />
              <span className="hidden xl:inline relative z-10">{t('nav.tournaments')}</span>
            </button>
          )}

          {/* Logout — icon-only */}
          <button
            onClick={() => { clearOtpVerification(); navigate('/'); }}
            title={t('nav.logout')}
            className="relative group flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-meta tracking-[0.2em] uppercase text-ivory/60 hover:text-ivory transition-colors"
          >
            <span className="absolute inset-0 border border-border group-hover:border-seal/60 transition-colors" />
            <LogOut className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden xl:inline relative z-10">{t('nav.logout')}</span>
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden relative p-1.5 text-ivory hover:text-brass transition-colors"
            aria-label="Цэс"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* bottom hairline */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-brass/30 to-transparent" />

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden bg-ink/96 backdrop-blur-xl border-b border-brass/30 overflow-hidden"
          >
            <div className="px-6 py-6 space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.target}
                  onClick={() => handleClick(item.target)}
                  className="group flex items-baseline gap-3 w-full text-left py-3 border-b border-border/60 last:border-b-0"
                >
                  <span className="font-meta text-[11px] tracking-[0.3em] text-brass/80 w-8">
                    {item.roman}.
                  </span>
                  <span className="font-display text-base text-ivory/85 group-hover:text-ivory">
                    {t(item.key)}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
