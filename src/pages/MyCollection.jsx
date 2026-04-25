import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, BookOpen } from 'lucide-react';
import { FIGURES, CATEGORIES } from '@/lib/figuresData';
import { useCollection } from '@/hooks/useCollection';
import { useLang, figureName } from '@/lib/i18n';
import { motion } from 'framer-motion';
import SealMark from '@/components/ornaments/SealMark';
import CornerTicks from '@/components/ornaments/CornerTicks';
import CategoryGlyph from '@/components/ornaments/CategoryGlyph';
import { AsyncStatus, Skeleton, EmptyState } from '@/lib/feedback';

function CollectedCard({ figure, earnedAt }) {
  const navigate = useNavigate();
  const cat = CATEGORIES[figure.cat];
  const pad = String(figure.fig_id).padStart(2, '0');
  const { lang } = useLang();
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -3 }}
      onClick={() => navigate(`/figure/${figure.fig_id}`)}
      className="relative flex flex-col overflow-hidden border border-brass/40 hover:border-brass bg-card text-left"
      style={{ aspectRatio: '3 / 4.4' }}
    >
      <CornerTicks size={8} inset={4} thickness={1} opacity={0.85} />

      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, ${cat?.color}aa, #0e0b07 95%)` }}
      />
      {figure.front_img && (
        <>
          <img
            src={figure.front_img}
            alt={figure.name}
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-90"
          />
          <span
            aria-hidden
            className="absolute inset-0 mix-blend-multiply opacity-70"
            style={{ background: `linear-gradient(160deg, ${cat?.color}cc, #0e0b07 92%)` }}
          />
        </>
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-ink/20" />

      <div className="relative z-10 h-full flex flex-col p-2.5 justify-between">
        <div className="flex items-start justify-between">
          <span className="font-meta text-[8px] tracking-[0.22em] text-ivory/85 bg-ink/55 border border-brass/40 px-1 py-0.5">
            N° {pad}
          </span>
          <SealMark size={18} variant="filled" />
        </div>
        <div>
          <p
            className="font-display text-[12px] leading-[1.05] text-ivory"
            style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}
          >
            {figureName(figure, lang)}
          </p>
          <p className="font-meta text-[8px] tracking-[0.16em] text-brass/85 mt-0.5">{figure.yrs}</p>
          {earnedAt && (
            <p className="font-meta text-[7.5px] tracking-[0.2em] text-ivory/40 mt-1">
              {new Date(earnedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'mn-MN')}
            </p>
          )}
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${cat?.color}, transparent 70%)` }}
      />
    </motion.button>
  );
}

function LockedCard({ index }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center border border-brass/20 bg-ink/50"
      style={{ aspectRatio: '3 / 4.4' }}
    >
      <CornerTicks size={6} inset={3} thickness={1} opacity={0.35} />
      <Lock className="w-4 h-4 text-brass/30" />
      <p className="font-meta text-[9px] tracking-[0.22em] text-brass/30 mt-1.5">
        N° {String(index).padStart(2, '0')}
      </p>
    </div>
  );
}

export default function MyCollection() {
  const navigate = useNavigate();
  const { collection, hasCard, total, loading } = useCollection();
  const [filter, setFilter] = useState('all');
  const { t, lang } = useLang();
  const activePillRef = useRef(null);

  useEffect(() => {
    activePillRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [filter]);

  const filterOptions = [
    { key: 'all',       label: 'Бүгд',    label_en: 'All',       roman: '∑' },
    { key: 'khans',     label: 'Хаад',    label_en: 'Khans',     roman: 'I' },
    { key: 'queens',    label: 'Хатад',   label_en: 'Khatuns',   roman: 'II' },
    { key: 'warriors',  label: 'Дайчид',  label_en: 'Warriors',  roman: 'III' },
    { key: 'political', label: 'Төрийн',  label_en: 'Ministers', roman: 'IV' },
    { key: 'cultural',  label: 'Соёлын',  label_en: 'Sages',     roman: 'V' },
  ];

  const filteredFigures = FIGURES.filter(f => filter === 'all' || f.cat === filter);
  const collectedInFilter = filteredFigures.filter(f => hasCard(f.fig_id)).length;
  const earnedAt = collection?.earned_at || {};
  const percent = Math.round((total / FIGURES.length) * 100);

  return (
    <div className="min-h-screen bg-ink font-prose">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-ink/92 backdrop-blur-md border-b border-brass/30">
        <div className="max-w-[82rem] mx-auto px-5 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('fd.back')}
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-meta text-[9px] tracking-[0.3em] uppercase text-brass/70">{t('col.label')}</div>
            <h1
              className="font-display text-xl md:text-2xl text-ivory leading-none"
              style={{ fontVariationSettings: '"opsz" 48, "SOFT" 60' }}
            >
              {t('col.title')}
            </h1>
          </div>
          <div className="relative flex items-center gap-2 px-3 py-2 border border-brass/45">
            <CornerTicks size={6} inset={2} thickness={1} opacity={0.8} />
            <SealMark size={16} variant={total > 0 ? 'filled' : 'outline'} pulse={total > 0} />
            <span
              className="font-display text-[13px] text-ivory relative z-10"
              style={{ fontVariationSettings: '"opsz" 24, "SOFT" 50' }}
            >
              {String(total).padStart(2, '0')} / {FIGURES.length}
            </span>
          </div>
        </div>

        {/* Progress bar — hairline */}
        <div className="max-w-[82rem] mx-auto px-5 pb-3">
          <div className="flex items-center justify-between text-[10px] font-meta tracking-[0.24em] uppercase text-brass/70 mb-1.5">
            <span>{t('col.progress')}</span>
            <span className="text-ivory">{percent}%</span>
          </div>
          <div className="h-1 bg-muted/60 overflow-hidden">
            <motion.div
              className="h-full"
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ background: 'linear-gradient(90deg, hsl(var(--seal)), hsl(var(--brass)))' }}
            />
          </div>
        </div>
      </div>

      {/* Category filter — catalog style */}
      <div className="max-w-[82rem] mx-auto px-5 pt-8 pb-5">
        <div className="border-y border-brass/30 py-3 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-x-6 gap-y-2 min-w-max">
            {filterOptions.map((c, i) => {
              const active = filter === c.key;
              const scopeFigures = c.key === 'all' ? FIGURES : FIGURES.filter(f => f.cat === c.key);
              const scopeEarned = scopeFigures.filter(f => hasCard(f.fig_id)).length;
              return (
                <button
                  key={c.key}
                  ref={active ? activePillRef : null}
                  onClick={() => setFilter(c.key)}
                  className="group flex items-baseline gap-2 py-1 relative"
                >
                  <span className={`font-meta text-[9px] tracking-[0.3em] ${active ? 'text-seal' : 'text-brass/55'}`}>
                    {c.roman}.
                  </span>
                  <span
                    className={`font-display text-sm transition-colors ${
                      active ? 'text-ivory' : 'text-ivory/60 group-hover:text-ivory'
                    }`}
                    style={{ fontVariationSettings: '"opsz" 30, "SOFT" 50' }}
                  >
                    {lang === 'en' ? (c.label_en || c.label) : c.label}
                  </span>
                  <span className="font-meta text-[9px] tracking-[0.22em] text-brass/55">
                    {String(scopeEarned).padStart(2, '0')}/{String(scopeFigures.length).padStart(2, '0')}
                  </span>
                  {active && <span className="absolute -bottom-1 left-0 right-0 h-px bg-seal" />}
                  {i < filterOptions.length - 1 && (
                    <span className="hidden sm:inline-block ml-4 text-brass/30">·</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-3 font-meta text-[10px] tracking-[0.22em] uppercase text-brass/65">
          {t('col.filter')}: <span className="text-ivory">{String(collectedInFilter).padStart(2, '0')}</span> / {filteredFigures.length}
        </p>
      </div>

      {/* Cards grid */}
      <div className="max-w-[82rem] mx-auto px-5 pb-20">
        <AsyncStatus
          loading={loading}
          empty={!loading && total === 0}
          loadingFallback={<Skeleton.Grid count={24} variant="card" />}
          emptyFallback={
            <EmptyState
              icon={<BookOpen className="w-12 h-12 text-amber-400/60" />}
              title="empty.collection.title"
              description="empty.collection.description"
              action={
                <button
                  onClick={() => navigate('/app')}
                  className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass hover:text-ivory"
                >
                  {t('empty.collection.action')}
                </button>
              }
            />
          }
        >
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredFigures.map((fig) =>
              hasCard(fig.fig_id) ? (
                <CollectedCard key={fig.fig_id} figure={fig} earnedAt={earnedAt[fig.fig_id]} />
              ) : (
                <LockedCard key={fig.fig_id} index={fig.fig_id} />
              )
            )}
          </div>
        </AsyncStatus>
      </div>
    </div>
  );
}
