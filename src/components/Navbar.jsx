import { useState, useEffect } from 'react';
import { Menu, X, BookMarked, LogOut, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCollection } from '@/hooks/useCollection';
import { clearOtpVerification } from '@/components/OtpGate';
import { currentSession } from '@/lib/authStore';
import { useLang } from '@/lib/i18n';
import Fleuron from '@/components/ornaments/Fleuron';
import CornerTicks from '@/components/ornaments/CornerTicks';

const NAV_ITEMS = [
  { roman: 'I',   key: 'nav.home',     target: 'hero' },
  { roman: 'II',  key: 'nav.codex',    target: 'gallery' },
  { roman: 'III', key: 'nav.chapters', target: 'chapters' },
  { roman: 'IV',  key: 'nav.myteam',   target: 'myteam' },
  { roman: 'V',   key: 'nav.map',      target: 'map' },
  { roman: 'VI',  key: 'nav.timeline', target: 'timeline' },
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

      <div className="max-w-[92rem] mx-auto px-6 md:px-10 h-16 md:h-[4.5rem] flex items-center justify-between">

        {/* Imprint — monogram + wordmark */}
        <button
          onClick={() => handleClick('hero')}
          className="flex items-center gap-3 group"
          aria-label="Нүүр"
        >
          <div className="relative w-10 h-10 flex items-center justify-center">
            <CornerTicks size={8} inset={0} thickness={1} opacity={0.7} />
            <Fleuron size={22} className="group-hover:scale-105 transition-transform" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-[11px] tracking-[0.44em] text-ivory/90" style={{ fontVariationSettings: '"opsz" 24, "wght" 500' }}>
              ALTAN DOMOG
            </span>
            <span className="font-meta text-[8.5px] tracking-[0.34em] text-brass/80 mt-1">
              CODEX · MMXXVI
            </span>
          </div>
        </button>

        {/* Desktop nav — roman-numeral index */}
        <div className="hidden lg:flex items-center gap-7">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.target}
              onClick={() => handleClick(item.target)}
              className="group flex items-baseline gap-2 py-2"
            >
              <span className="font-meta text-[9.5px] tracking-[0.3em] text-brass/70 group-hover:text-brass transition-colors">
                {item.roman}.
              </span>
              <span className="font-display text-sm text-ivory/75 group-hover:text-ivory transition-colors tracking-wide"
                    style={{ fontVariationSettings: '"opsz" 30, "wght" 450, "SOFT" 40' }}>
                {t(item.key)}
              </span>
              <span className="h-px w-0 group-hover:w-full bg-brass/70 transition-[width] duration-300 self-end mb-1" />
            </button>
          ))}
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Language toggle */}
          <div className="relative flex items-center gap-0 border border-brass/40 overflow-hidden">
            <CornerTicks size={5} inset={1} thickness={1} opacity={0.7} />
            {['mn', 'en'].map((code) => {
              const active = lang === code;
              return (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`relative z-10 px-2 py-1.5 font-meta text-[10px] tracking-[0.24em] uppercase transition-colors ${
                    active ? 'bg-brass/15 text-ivory' : 'text-brass/70 hover:text-ivory'
                  }`}
                  aria-pressed={active}
                >
                  {code === 'mn' ? 'МН' : 'EN'}
                </button>
              );
            })}
          </div>

          {/* Collection button — catalog badge style */}
          <button
            onClick={() => navigate('/collection')}
            className="relative group flex items-center gap-2 px-3 py-2 text-[10px] font-meta tracking-[0.24em] uppercase text-brass hover:text-ivory transition-colors"
          >
            <span className="absolute inset-0 border border-brass/40 group-hover:border-brass/90 transition-colors" />
            <CornerTicks size={6} inset={2} thickness={1} opacity={0.8} />
            <BookMarked className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden sm:inline relative z-10">{t('nav.collection')}</span>
            {total > 0 && (
              <span className="relative z-10 ml-1 font-display text-[11px] leading-none text-ivory px-1.5 py-0.5 bg-seal/85"
                    style={{ fontVariationSettings: '"opsz" 24, "wght" 600' }}>
                {total}
              </span>
            )}
          </button>

          {/* Leaderboard button — authenticated only */}
          {session && (
            <button
              onClick={() => navigate('/leaderboard')}
              className="relative group hidden md:flex items-center gap-2 px-3 py-2 text-[10px] font-meta tracking-[0.24em] uppercase text-brass hover:text-ivory transition-colors"
            >
              <span className="absolute inset-0 border border-brass/40 group-hover:border-brass/90 transition-colors" />
              <CornerTicks size={6} inset={2} thickness={1} opacity={0.8} />
              <Trophy className="w-3.5 h-3.5 relative z-10" />
              <span className="hidden sm:inline relative z-10">{t('nav.leaderboard')}</span>
            </button>
          )}

          {/* Session badge */}
          {session && (
            <span className="hidden lg:inline-flex items-center gap-2 font-meta text-[10px] tracking-[0.22em] uppercase text-ivory/50">
              <span className="w-1 h-1 rounded-full bg-brass animate-pulse" />
              @{session.username}
            </span>
          )}

          {/* Logout */}
          <button
            onClick={() => { clearOtpVerification(); navigate('/'); }}
            title={t('nav.logout')}
            className="relative group flex items-center gap-2 px-3 py-2 text-[10px] font-meta tracking-[0.24em] uppercase text-ivory/60 hover:text-ivory transition-colors"
          >
            <span className="absolute inset-0 border border-border group-hover:border-seal/60 transition-colors" />
            <LogOut className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden sm:inline relative z-10">{t('nav.logout')}</span>
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden relative p-2 text-ivory hover:text-brass transition-colors"
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
