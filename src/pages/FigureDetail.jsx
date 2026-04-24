import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, BookOpen, Clock, Users, Quote, Map, HelpCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CATEGORIES, FIGURES } from '@/lib/figuresData';
import { motion } from 'framer-motion';
import FigureTimeline from '@/components/FigureTimeline';
import HistoricalMap from '@/components/HistoricalMap';
import { HISTORICAL_LOCATIONS } from '@/lib/mapData';
import FigureQuiz from '@/components/FigureQuiz';
import { useMyTeam } from '@/hooks/useMyTeam';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import SealMark from '@/components/ornaments/SealMark';
import CornerTicks from '@/components/ornaments/CornerTicks';
import CategoryGlyph from '@/components/ornaments/CategoryGlyph';
import Fleuron from '@/components/ornaments/Fleuron';
import ContourBackground from '@/components/ornaments/ContourBackground';
import BrassButton from '@/components/ornaments/BrassButton';
import StoryPlayer from '@/components/StoryPlayer';
import { useAuthoredContent } from '@/hooks/useAuthoredContent';
import ShareCard from '@/components/ShareCard';
import { relType, REL_TYPE_META } from '@/lib/relationships';
import { useLang, figureName, figureRole, figureBio, figureAchievements, figureFact, figureQuote } from '@/lib/i18n';

const TABS = [
  { key: 'bio',      roman: 'I',   labelKey: 'fd.tab.bio',      icon: BookOpen },
  { key: 'timeline', roman: 'II',  labelKey: 'fd.tab.timeline', icon: Clock },
  { key: 'map',      roman: 'III', labelKey: 'fd.tab.map',      icon: Map },
  { key: 'quiz',     roman: 'IV',  labelKey: 'fd.tab.quiz',     icon: HelpCircle },
  { key: 'related',  roman: 'V',   labelKey: 'fd.tab.related',  icon: Users },
  { key: 'links',    roman: 'VI',  labelKey: 'fd.tab.links',    icon: ExternalLink },
];

// External reading links per figure (curated). Figures not listed still get a Wikipedia-MN
// search suggestion in the UI below.
const EXTERNAL_LINKS = {
  1:  [
    { label: 'Wikipedia: Genghis Khan', url: 'https://en.wikipedia.org/wiki/Genghis_Khan' },
    { label: 'Britannica: Genghis Khan', url: 'https://www.britannica.com/biography/Genghis-Khan' },
    { label: 'National Geographic', url: 'https://www.nationalgeographic.com/history/article/genghis-khan' },
  ],
  2:  [{ label: 'Wikipedia: Ögedei Khan', url: 'https://en.wikipedia.org/wiki/%C3%96gedei_Khan' }],
  3:  [
    { label: 'Wikipedia: Kublai Khan', url: 'https://en.wikipedia.org/wiki/Kublai_Khan' },
    { label: 'Britannica: Kublai Khan', url: 'https://www.britannica.com/biography/Kublai-Khan' },
  ],
  4:  [{ label: 'Wikipedia: Möngke Khan', url: 'https://en.wikipedia.org/wiki/M%C3%B6ngke_Khan' }],
  5:  [{ label: 'Wikipedia: Tolui', url: 'https://en.wikipedia.org/wiki/Tolui' }],
  6:  [{ label: 'Wikipedia: Güyük Khan', url: 'https://en.wikipedia.org/wiki/G%C3%BCy%C3%BCk_Khan' }],
  7:  [{ label: 'Wikipedia: Hulagu Khan', url: 'https://en.wikipedia.org/wiki/Hulagu_Khan' }],
  8:  [{ label: 'Wikipedia: Batu Khan', url: 'https://en.wikipedia.org/wiki/Batu_Khan' }],
  9:  [{ label: 'Wikipedia: Chagatai Khan', url: 'https://en.wikipedia.org/wiki/Chagatai_Khan' }],
  10: [{ label: 'Wikipedia: Jochi', url: 'https://en.wikipedia.org/wiki/Jochi' }],
  11: [{ label: 'Wikipedia: Kaidu', url: 'https://en.wikipedia.org/wiki/Kaidu' }],
  12: [{ label: 'Wikipedia: Dayan Khan', url: 'https://en.wikipedia.org/wiki/Dayan_Khan' }],
  13: [{ label: 'Wikipedia: Bogd Khan', url: 'https://en.wikipedia.org/wiki/Bogd_Khan' }],
  14: [{ label: 'Wikipedia: Börte', url: 'https://en.wikipedia.org/wiki/B%C3%B6rte' }],
  15: [{ label: 'Wikipedia: Sorghaghtani Beki', url: 'https://en.wikipedia.org/wiki/Sorghaghtani_Beki' }],
  16: [{ label: 'Wikipedia: Mandukhai Khatun', url: 'https://en.wikipedia.org/wiki/Mandukhai_Khatun' }],
  18: [{ label: 'Wikipedia: Khutulun', url: 'https://en.wikipedia.org/wiki/Khutulun' }],
  19: [{ label: 'Wikipedia: Töregene Khatun', url: 'https://en.wikipedia.org/wiki/T%C3%B6regene_Khatun' }],
  20: [{ label: 'Wikipedia: Chabi', url: 'https://en.wikipedia.org/wiki/Chabi' }],
  21: [{ label: 'Wikipedia: Hoelun', url: 'https://en.wikipedia.org/wiki/Hoelun' }],
  24: [{ label: 'Wikipedia: Subutai', url: 'https://en.wikipedia.org/wiki/Subutai' }],
  25: [{ label: 'Wikipedia: Jebe', url: 'https://en.wikipedia.org/wiki/Jebe' }],
  26: [{ label: 'Wikipedia: Muqali', url: 'https://en.wikipedia.org/wiki/Muqali' }],
  30: [{ label: 'Wikipedia: Qasar', url: 'https://en.wikipedia.org/wiki/Qasar' }],
  32: [{ label: 'Wikipedia: Bayan of the Baarin', url: 'https://en.wikipedia.org/wiki/Bayan_of_the_Baarin' }],
  34: [{ label: 'Wikipedia: Damdin Sükhbaatar', url: 'https://en.wikipedia.org/wiki/Damdin_S%C3%BCkhbaatar' }],
  36: [{ label: 'Wikipedia: Yelü Chucai', url: 'https://en.wikipedia.org/wiki/Yel%C3%BC_Chucai' }],
  40: [{ label: 'Wikipedia: Khorloogiin Choibalsan', url: 'https://en.wikipedia.org/wiki/Khorloogiin_Choibalsan' }],
  41: [{ label: 'Wikipedia: Yumjaagiin Tsedenbal', url: 'https://en.wikipedia.org/wiki/Yumjaagiin_Tsedenbal' }],
  44: [{ label: 'Wikipedia: Galdan Boshugtu Khan', url: 'https://en.wikipedia.org/wiki/Galdan_Boshugtu_Khan' }],
  45: [{ label: 'Wikipedia: Rashid al-Din Hamadani', url: 'https://en.wikipedia.org/wiki/Rashid-al-Din_Hamadani' }],
  46: [
    { label: 'Wikipedia: Marco Polo', url: 'https://en.wikipedia.org/wiki/Marco_Polo' },
    { label: 'Britannica: Marco Polo', url: 'https://www.britannica.com/biography/Marco-Polo' },
  ],
  47: [{ label: 'Wikipedia: Zanabazar', url: 'https://en.wikipedia.org/wiki/Zanabazar' }],
  49: [{ label: 'Wikipedia: Dashdorjiin Natsagdorj', url: 'https://en.wikipedia.org/wiki/Dashdorjiin_Natsagdorj' }],
  50: [{ label: 'Wikipedia: Jugderdemidiin Gürragchaa', url: 'https://en.wikipedia.org/wiki/Jugderdemidiin_G%C3%BCrragchaa' }],
};

export default function FigureDetail() {
  const { figId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('bio');
  const [showShare, setShowShare] = useState(false);
  const { isInTeam, toggleTeam } = useMyTeam();
  const { t, lang } = useLang();
  const { get: getAuthored } = useAuthoredContent(false);

  const { data: dbFigures } = useQuery({
    queryKey: ['figures'],
    queryFn: () => base44.entities.Figure.list('-fig_id', 100),
    initialData: [],
  });

  const figure = (() => {
    const id = parseInt(figId);
    const staticFig = FIGURES.find(f => f.fig_id === id);
    if (!staticFig) return null;
    if (dbFigures?.length) {
      const dbFig = dbFigures.find(d => d.fig_id === id);
      return dbFig ? { ...staticFig, ...dbFig } : staticFig;
    }
    return staticFig;
  })();

  useEffect(() => { window.scrollTo(0, 0); }, [figId]);

  if (!figure) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-center space-y-4">
          <Fleuron size={48} className="mx-auto opacity-60" />
          <p className="font-prose italic text-ivory/70">Зүтгэлтэн олдсонгүй</p>
          <Button onClick={() => navigate('/app')} variant="outline">Кодекс руу буцах</Button>
        </div>
      </div>
    );
  }

  const cat = CATEGORIES[figure.cat];
  const relatedFigures = (figure.rel || [])
    .map(id => FIGURES.find(f => f.fig_id === id))
    .filter(Boolean);
  const sameCatFigures = FIGURES.filter(f => f.cat === figure.cat && f.fig_id !== figure.fig_id);
  const links = EXTERNAL_LINKS[figure.fig_id] || [];
  const inTeam = isInTeam(figure.fig_id);
  const pad = String(figure.fig_id).padStart(2, '0');

  return (
    <div className="min-h-screen bg-ink">
      {/* HERO — asymmetric manuscript spread */}
      <div className="relative contour-bg pb-10">
        <ContourBackground density="med" opacity={0.10} />

        {/* top bar with back + team toggle */}
        <div className="relative z-20 max-w-[92rem] mx-auto px-4 md:px-10 pt-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('fd.back')}
          </button>
          <div className="flex items-center gap-2">
            {/* Share */}
            <button
              onClick={() => setShowShare(true)}
              title={lang === 'en' ? 'Share' : 'Хуваалцах'}
              className="relative group flex items-center gap-2 px-3 py-2 font-meta text-[10px] tracking-[0.28em] uppercase text-ivory/85 hover:text-ivory transition-colors"
            >
              <span className="absolute inset-0 border border-brass/40 group-hover:border-brass transition-colors" />
              <CornerTicks size={6} inset={2} thickness={1} opacity={0.85} />
              <Share2 className="w-3.5 h-3.5 relative z-10" />
              <span className="hidden sm:inline relative z-10">
                {lang === 'en' ? 'Share' : 'Хуваалцах'}
              </span>
            </button>

            {/* Team toggle */}
            <button
              onClick={() => toggleTeam(figure.fig_id)}
              className="relative group flex items-center gap-2.5 px-4 py-2 font-meta text-[10px] tracking-[0.28em] uppercase text-ivory transition-colors"
            >
              <span
                className={`absolute inset-0 border transition-colors ${
                  inTeam ? 'border-seal bg-seal/15' : 'border-brass/40 group-hover:border-brass'
                }`}
              />
              <CornerTicks size={7} inset={3} thickness={1} opacity={0.9} />
              <SealMark size={15} variant={inTeam ? 'filled' : 'outline'} pulse={inTeam} />
              <span className="relative z-10">
                {inTeam ? t('fd.inTeam') : t('fd.addToTeam')}
              </span>
            </button>
          </div>
        </div>

        {/* main hero grid */}
        <div className="relative max-w-[92rem] mx-auto px-4 md:px-10 pt-8 md:pt-12 pb-8 grid lg:grid-cols-[0.55fr_0.45fr] gap-10 lg:gap-16 items-start">
          {/* LEFT — editorial headline block */}
          <div className="relative page-turn">
            <div className="flex items-baseline gap-4 mb-5">
              <span className="catalog-no">N° {pad}</span>
              <span className="h-px flex-1 bg-brass/30" />
              <span className="font-meta text-[10px] tracking-[0.22em] uppercase text-brass/75">{figure.card}</span>
            </div>

            {/* Name — oversized display */}
            <h1
              className="display-title text-[clamp(2.4rem,7vw,6.5rem)] text-ivory leading-[0.95]"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 70, "WONK" 1, "wght" 520' }}
            >
              {figureName(figure, lang)}
            </h1>

            {/* Subtitle row: years + role */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-meta text-[11px] tracking-[0.28em] uppercase text-brass">{figure.yrs}</span>
              <span className="text-brass/40">·</span>
              <span className="font-prose italic text-[15px] text-ivory/85">{figureRole(figure, lang)}</span>
            </div>

            {/* Genus badge */}
            <div className="mt-8 flex items-center gap-3">
              <span
                className="w-11 h-11 flex items-center justify-center border"
                style={{ borderColor: cat?.color, background: `${cat?.color}22` }}
              >
                <CategoryGlyph cat={figure.cat} size={24} className="text-brass" />
              </span>
              <div>
                <div className="font-meta text-[9px] tracking-[0.3em] uppercase text-brass/70">GENUS · {cat?.roman}</div>
                <div className="font-display text-sm text-ivory" style={{ fontVariationSettings: '"opsz" 30' }}>
                  {lang === 'en' ? (cat?.label_en || cat?.label) : cat?.label}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — portrait plate */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="relative aspect-[4/5] border border-brass/40 overflow-hidden"
              style={{ background: `linear-gradient(152deg, ${cat?.color}, #0e0b07)` }}
            >
              <CornerTicks size={16} inset={8} thickness={1} opacity={0.95} />
              {figure.front_img ? (
                <>
                  <img
                    src={figure.front_img}
                    alt={figure.name}
                    crossOrigin="anonymous"
                    className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-95"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 mix-blend-multiply opacity-75"
                    style={{ background: `linear-gradient(152deg, ${cat?.color}dd, #0e0b07 95%)` }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CategoryGlyph cat={figure.cat} size={110} className="text-ivory/30" />
                </div>
              )}
              {/* Catalog caption overlaid */}
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between z-10">
                <div>
                  <div className="font-meta text-[10px] tracking-[0.3em] uppercase text-ivory/80">Portrait · {figure.card}</div>
                  <div className="font-display text-xl text-ivory mt-1" style={{ fontVariationSettings: '"opsz" 36, "SOFT" 50' }}>
                    {figureName(figure, lang)}
                  </div>
                </div>
                <span className="font-meta text-[10px] tracking-[0.22em] text-brass bg-ink/60 px-1.5 py-0.5 border border-brass/50">
                  N° {pad}
                </span>
              </div>
            </motion.div>
            {/* Vertical bichig column to the right of the portrait */}
            <div className="hidden md:flex absolute -right-6 top-6 bottom-6 items-center">
              <span className="bichig text-lg text-brass/50">{figure.name.slice(0, 8)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — roman-numeral editorial nav */}
      <div className="sticky top-0 z-20 bg-ink/92 backdrop-blur-md border-y border-brass/30">
        <div className="max-w-[72rem] mx-auto px-2 sm:px-6 overflow-x-auto scrollbar-hide">
          <div className="flex min-w-max">
            {TABS.map((tab_) => {
              const Icon = tab_.icon;
              const active = tab === tab_.key;
              return (
                <button
                  key={tab_.key}
                  onClick={() => setTab(tab_.key)}
                  className={`group flex items-center gap-2 px-4 sm:px-6 py-4 transition-colors relative flex-1 ${
                    active ? 'text-ivory' : 'text-ivory/55 hover:text-ivory'
                  }`}
                >
                  <span className={`font-meta text-[9px] tracking-[0.3em] ${active ? 'text-seal' : 'text-brass/55'}`}>
                    {tab_.roman}.
                  </span>
                  <Icon className="w-3.5 h-3.5" />
                  <span
                    className="font-display text-[13px] hidden sm:inline"
                    style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}
                  >
                    {t(tab_.labelKey)}
                  </span>
                  {active && (
                    <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-seal" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content body */}
      <div className="max-w-[56rem] mx-auto px-5 sm:px-8 py-14 space-y-12">

        {/* BIO */}
        {tab === 'bio' && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-12"
          >
            {/* Story player — narrates the figure's story aloud */}
            <StoryPlayer figure={figure} authored={{ get: getAuthored }} />

            {/* Biography — drop-cap */}
            <section className="relative">
              <header className="flex items-baseline gap-3 mb-5">
                <span className="catalog-no text-brass">§ I</span>
                <h2 className="codex-caption text-brass">Намтар</h2>
                <span className="flex-1 h-px bg-brass/30" />
              </header>
              <p className="prose-body">
                {(() => {
                  const text = figureBio(figure, lang);
                  return (
                    <>
                      <span
                        className="float-left pr-3 pt-1 font-display text-[5rem] leading-[0.8] text-seal"
                        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
                      >
                        {text.charAt(0)}
                      </span>
                      {text.slice(1)}
                    </>
                  );
                })()}
              </p>
            </section>

            {/* Achievements — editorial listicle with roman numerals */}
            {(() => {
              const achs = figureAchievements(figure, lang);
              if (!achs?.length) return null;
              return (
                <section>
                  <header className="flex items-baseline gap-3 mb-5">
                    <span className="catalog-no text-brass">§ II</span>
                    <h2 className="codex-caption text-brass">{t('fd.section.achs')}</h2>
                    <span className="flex-1 h-px bg-brass/30" />
                  </header>
                  <ol className="grid sm:grid-cols-2 gap-0 border-t border-b border-brass/20">
                    {achs.map((a, i) => (
                      <li
                        key={i}
                        className={`relative flex items-baseline gap-4 px-5 py-5 ${
                          i < achs.length - 1 ? 'border-b border-brass/20' : ''
                        } ${i % 2 === 0 ? 'sm:border-r sm:border-brass/20' : ''}`}
                      >
                        <span
                          className="font-display text-3xl text-brass/80 leading-none w-10"
                          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60' }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="font-prose text-[15px] text-ivory/85 leading-relaxed flex-1">{a}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })()}

            {/* Quote — manuscript pull-quote */}
            {(() => {
              const { quote, qattr } = figureQuote(figure, lang);
              if (!quote) return null;
              return (
                <section className="relative py-10 px-8 md:px-14 border-l-2 border-seal">
                  <Quote className="absolute -left-3 top-6 w-5 h-5 text-seal bg-ink px-0.5" />
                  <p
                    className="font-display text-2xl md:text-3xl italic text-ivory/90 leading-snug"
                    style={{ fontVariationSettings: '"opsz" 72, "SOFT" 80, "WONK" 1' }}
                  >
                    &laquo; {quote} &raquo;
                  </p>
                  {qattr && (
                    <cite className="block mt-4 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 not-italic">
                      — {qattr}
                    </cite>
                  )}
                </section>
              );
            })()}

            {/* Interesting fact — sidenote */}
            {(() => {
              const fact = figureFact(figure, lang);
              if (!fact) return null;
              return (
                <section className="relative pl-10 border-l border-brass/50">
                  <header className="flex items-baseline gap-3 mb-3 -ml-10">
                    <span className="catalog-no text-brass">§ III</span>
                    <h2 className="codex-caption text-brass">{t('fd.section.fact')}</h2>
                  </header>
                  <p className="prose-body italic">{fact}</p>
                </section>
              );
            })()}
          </motion.div>
        )}

        {/* TIMELINE */}
        {tab === 'timeline' && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <header className="mb-6">
              <span className="codex-caption text-brass">Chronos · {figure.name}</span>
              <h2
                className="display-title text-3xl md:text-4xl text-ivory mt-1"
                style={{ fontVariationSettings: '"opsz" 72, "SOFT" 60' }}
              >
                Он дарааллын судар
              </h2>
            </header>
            <FigureTimeline figure={figure} />
          </motion.div>
        )}

        {/* MAP */}
        {tab === 'map' && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <header>
              <span className="codex-caption text-brass">Locus</span>
              <h2 className="display-title text-3xl md:text-4xl text-ivory mt-1" style={{ fontVariationSettings: '"opsz" 72, "SOFT" 60' }}>
                Газар нутгийн зураг
              </h2>
              <p className="font-prose italic text-ivory/65 mt-2 text-sm">
                {figure.name}-тай холбоотой газар нутгийг уран зурагт үзэв.
              </p>
            </header>
            {HISTORICAL_LOCATIONS.some(l => l.figIds?.includes(figure.fig_id)) ? (
              <div className="relative border border-brass/40">
                <CornerTicks size={10} inset={6} thickness={1} opacity={0.8} />
                <HistoricalMap highlightFigId={figure.fig_id} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 border border-brass/30">
                <Fleuron size={40} className="opacity-60" />
                <p className="font-prose italic text-ivory/60 text-sm">Газрын зургийн мэдээлэл нэмэгдэж байна</p>
              </div>
            )}
          </motion.div>
        )}

        {/* QUIZ */}
        {tab === 'quiz' && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <header className="mb-6">
              <span className="codex-caption text-brass">Probatio · Шалгалт</span>
              <h2 className="display-title text-3xl md:text-4xl text-ivory mt-1" style={{ fontVariationSettings: '"opsz" 72, "SOFT" 60' }}>
                Мэдлэг шалгах
              </h2>
            </header>
            <FigureQuiz figure={figure} />
          </motion.div>
        )}

        {/* RELATED */}
        {tab === 'related' && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            {relatedFigures.length > 0 && (
              <section>
                <header className="flex items-baseline gap-3 mb-5">
                  <span className="catalog-no text-brass">§ I</span>
                  <h2 className="codex-caption text-brass">Холбоотой хүмүүс</h2>
                  <span className="flex-1 h-px bg-brass/30" />
                </header>
                <div className="grid sm:grid-cols-2 gap-0 border-t border-brass/20">
                  {relatedFigures.map((rf, i) => {
                    const rfCat = CATEGORIES[rf.cat];
                    const rfPad = String(rf.fig_id).padStart(2, '0');
                    const rt = relType(figure.fig_id, rf.fig_id);
                    const rtMeta = rt ? REL_TYPE_META[rt] : null;
                    return (
                      <button
                        key={rf.fig_id}
                        onClick={() => navigate(`/figure/${rf.fig_id}`)}
                        className={`relative group flex items-center gap-4 p-5 border-b border-brass/20 hover:bg-brass/5 transition-colors text-left ${
                          i % 2 === 0 ? 'sm:border-r sm:border-brass/20' : ''
                        }`}
                      >
                        <div
                          className="w-14 h-16 flex-shrink-0 border border-brass/40 overflow-hidden"
                          style={{ background: `${rfCat?.color}33` }}
                        >
                          {rf.front_img
                            ? <img src={rf.front_img} alt={figureName(rf, lang)} crossOrigin="anonymous" className="w-full h-full object-cover mix-blend-luminosity" />
                            : <div className="w-full h-full flex items-center justify-center">
                                <CategoryGlyph cat={rf.cat} size={22} className="text-brass" />
                              </div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-meta text-[9px] tracking-[0.3em] text-brass/70">
                              N° {rfPad} · {rfCat?.roman}
                            </span>
                            {rtMeta && (
                              <span
                                className="font-meta text-[8.5px] tracking-[0.26em] uppercase px-1.5 py-0.5 border"
                                style={{ color: rtMeta.color, borderColor: rtMeta.color }}
                              >
                                {lang === 'en' ? rtMeta.label_en : rtMeta.label}
                              </span>
                            )}
                          </div>
                          <p
                            className="font-display text-base text-ivory group-hover:text-brass transition-colors leading-tight"
                            style={{ fontVariationSettings: '"opsz" 30, "SOFT" 50' }}
                          >
                            {figureName(rf, lang)}
                          </p>
                          <p className="font-prose italic text-[12px] text-ivory/55 truncate">{figureRole(rf, lang)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <header className="flex items-baseline gap-3 mb-5">
                <span className="catalog-no text-brass">§ II</span>
                <h2 className="codex-caption text-brass">Ижил ангилал</h2>
                <span className="flex-1 h-px bg-brass/30" />
              </header>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {sameCatFigures.map(f => (
                  <button
                    key={f.fig_id}
                    onClick={() => navigate(`/figure/${f.fig_id}`)}
                    className="group flex items-baseline gap-2 py-1 border-b border-transparent hover:border-brass/70 transition-colors"
                  >
                    <span className="font-meta text-[9px] tracking-[0.22em] text-brass/55">{String(f.fig_id).padStart(2, '0')}</span>
                    <span
                      className="font-display text-[15px] text-ivory/80 group-hover:text-ivory"
                      style={{ fontVariationSettings: '"opsz" 30, "SOFT" 40' }}
                    >
                      {figureName(f, lang)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {/* LINKS */}
        {tab === 'links' && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <section>
              <header className="flex items-baseline gap-3 mb-5">
                <span className="catalog-no text-brass">§ I</span>
                <h2 className="codex-caption text-brass">Эх сурвалж · дэлгэрэнгүй</h2>
                <span className="flex-1 h-px bg-brass/30" />
              </header>
              {links.length > 0 ? (
                <ul className="border-t border-brass/20">
                  {links.map((link, i) => (
                    <li key={i} className="border-b border-brass/20">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-5 px-5 py-4 hover:bg-brass/5 transition-colors"
                      >
                        <span className="font-meta text-[10px] tracking-[0.24em] text-brass/70 w-8">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-display text-[16px] text-ivory group-hover:text-brass transition-colors"
                            style={{ fontVariationSettings: '"opsz" 30, "SOFT" 40' }}
                          >
                            {link.label}
                          </p>
                          <p className="font-meta text-[10px] tracking-[0.14em] text-ivory/45 truncate mt-0.5">
                            {link.url}
                          </p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-brass/60 group-hover:text-brass transition-colors flex-shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-14 text-center space-y-4">
                  <Fleuron size={40} className="mx-auto opacity-50" />
                  <p className="font-prose italic text-ivory/55 text-sm">Эх сурвалж нэмэгдээгүй байна</p>
                </div>
              )}
            </section>

            <section className="border border-brass/30 p-6 relative">
              <CornerTicks size={10} inset={6} thickness={1} opacity={0.8} />
              <h3 className="codex-caption text-brass mb-2">Өөрөө хайх</h3>
              <p className="font-prose italic text-[14px] text-ivory/70 mb-5">
                {figure.name}-ын тухай Wikipedia дээр дэлгэрэнгүй уншина уу.
              </p>
              <a
                href={`https://mn.wikipedia.org/wiki/${encodeURIComponent(figure.name)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <BrassButton variant="ghost" size="sm" trailingIcon={<ExternalLink className="w-3 h-3" />}>
                  Wikipedia-д нээх
                </BrassButton>
              </a>
            </section>
          </motion.div>
        )}

        {/* Bottom navigation */}
        <div className="pt-8 border-t border-brass/25">
          <div className="flex items-center justify-between">
            {figure.fig_id > 1 ? (
              <button
                onClick={() => navigate(`/figure/${figure.fig_id - 1}`)}
                className="group flex items-baseline gap-3 text-left"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-brass/60 group-hover:text-brass transition-colors self-center" />
                <div>
                  <div className="font-meta text-[9px] tracking-[0.3em] uppercase text-brass/60">Prev · N° {String(figure.fig_id - 1).padStart(2, '0')}</div>
                  <div
                    className="font-display text-sm text-ivory/75 group-hover:text-ivory"
                    style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}
                  >
                    {figureName(FIGURES.find(f => f.fig_id === figure.fig_id - 1), lang)}
                  </div>
                </div>
              </button>
            ) : <div />}
            <button
              onClick={() => navigate('/app', { state: { scrollTo: 'gallery' } })}
              className="hidden sm:inline-block font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70 hover:text-ivory transition-colors"
            >
              ← Кодекс ↗
            </button>
            {figure.fig_id < 52 ? (
              <button
                onClick={() => navigate(`/figure/${figure.fig_id + 1}`)}
                className="group flex items-baseline gap-3 text-right"
              >
                <div>
                  <div className="font-meta text-[9px] tracking-[0.3em] uppercase text-brass/60">Next · N° {String(figure.fig_id + 1).padStart(2, '0')}</div>
                  <div
                    className="font-display text-sm text-ivory/75 group-hover:text-ivory"
                    style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}
                  >
                    {figureName(FIGURES.find(f => f.fig_id === figure.fig_id + 1), lang)}
                  </div>
                </div>
                <ArrowLeft className="w-3.5 h-3.5 rotate-180 text-brass/60 group-hover:text-brass transition-colors self-center" />
              </button>
            ) : <div />}
          </div>
        </div>
      </div>

      {showShare && (
        <ShareCard figure={figure} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
