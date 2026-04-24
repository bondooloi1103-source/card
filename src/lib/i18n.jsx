import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Lightweight i18n for the Codex.  Two locales: 'mn' (default) and 'en'.
 *
 *   const { t, lang, setLang } = useLang();
 *   t('nav.chapters')         → 'Бүлгүүд' or 'Chapters'
 *   t('codex.chapter', {n:2}) → 'КОДЕКС · ГЛАВА II' (same both locales)
 *
 * Persists choice in localStorage.
 */

const LANG_KEY = 'mthk_lang';

export const LOCALES = ['mn', 'en'];

export const STRINGS = {
  // Chapter rule captions
  'codex.chapter.II':  { mn: 'КОДЕКС · ГЛАВА II',  en: 'CODEX · CHAPTER II' },
  'codex.chapter.III': { mn: 'КОДЕКС · ГЛАВА III', en: 'CODEX · CHAPTER III' },
  'codex.chapter.IV':  { mn: 'КОДЕКС · ГЛАВА IV',  en: 'CODEX · CHAPTER IV' },
  'codex.chapter.V':   { mn: 'КОДЕКС · ГЛАВА V',   en: 'CODEX · CHAPTER V' },
  'codex.chapter.VI':  { mn: 'КОДЕКС · ГЛАВА VI',  en: 'CODEX · CHAPTER VI' },

  // Navbar
  'nav.home':      { mn: 'Нүүр',         en: 'Home' },
  'nav.codex':     { mn: 'Кодекс',       en: 'Codex' },
  'nav.chapters':    { mn: 'Бүлгүүд',        en: 'Chapters' },
  'nav.myteam':      { mn: 'Миний Баг',      en: 'My Team' },
  'nav.engagements': { mn: 'Тоглоом',        en: 'Games' },
  'nav.map':         { mn: 'Газар',          en: 'Map' },
  'nav.timeline':    { mn: 'Он Дараалал',    en: 'Timeline' },
  'nav.collection':{ mn: 'Цуглуулга',    en: 'Collection' },
  'nav.logout':    { mn: 'Гарах',        en: 'Logout' },

  // Gallery
  'gallery.title.prefix': { mn: 'Түүхэн',       en: 'Historical' },
  'gallery.title.suffix': { mn: 'Баатрууд',     en: 'Figures' },
  'gallery.subtitle':     { mn: 'Тавин хоёр зүтгэлтэн — таван ангилал. Хөзрөө эргүүлж, намтарт нь үзэгдэрхий.',
                            en: 'Fifty-two figures across five categories. Turn the cards, step into the stories.' },
  'gallery.all':          { mn: 'Бүгд',         en: 'All' },
  'gallery.search':       { mn: 'Нэр, үүрэг, намтраар хайх…', en: 'Search by name, role, or bio…' },
  'gallery.entries':      { mn: 'entries',      en: 'entries' },
  'gallery.resultFound':  { mn: 'зүтгэлтэн',    en: 'figures' },
  'gallery.noResults.t':  { mn: 'Үр дүн олдсонгүй',        en: 'No results' },
  'gallery.noResults.s':  { mn: 'Хайлтын үгээ дахин оролдоорой', en: 'Try another search term' },
  'gallery.filterBy.cat': { mn: 'ангилал',      en: 'category' },
  'gallery.filterBy.era': { mn: 'үе',           en: 'era' },
  'gallery.filterBy.q':   { mn: 'хайлт',        en: 'search' },

  // Chapters
  'chapters.title.prefix':{ mn: 'Түүхийн',      en: 'Historical' },
  'chapters.title.suffix':{ mn: 'Бүлгүүд',      en: 'Chapters' },
  'chapters.subtitle':    { mn: 'Зургаан бүлэгт зохион байгуулсан түүхэн зүтгэлтнүүд — домогт өвөгчдөөс орчин цагийн баатрууд хүртэл.',
                            en: 'Fifty-two figures across six historical eras — from mythic ancestors to modern heroes.' },
  'chapters.dramatis':    { mn: 'Dramatis Personæ',        en: 'Dramatis Personæ' },
  'chapters.count':       { mn: 'зүтгэлтэн',    en: 'figures' },

  // Map
  'map.title.prefix':     { mn: 'Газар зүйн',   en: 'Geographical' },
  'map.title.suffix':     { mn: 'Судар',        en: 'Atlas' },
  'map.subtitle':         { mn: 'Монгол эзэнт гүрний үйл явдлууд, тулалдаан, нийслэл хотуудыг газрын зураг дээр.',
                            en: 'Events, battles, and capital cities of the Mongol Empire plotted on the map.' },

  // Timeline
  'timeline.title.prefix':{ mn: 'Цаг',           en: 'Chronological' },
  'timeline.title.mid':   { mn: 'Хугацааны',     en: '' },
  'timeline.title.suffix':{ mn: 'Судар',         en: 'Record' },
  'timeline.subtitle':    { mn: 'Хүннүээс орчин цагийн Монгол Улс хүртэл — найман жилийн он дарааллын тэмдэглэл.',
                            en: 'From the Xiongnu empire to modern Mongolia — eight millennia of events in chronological order.' },

  // My Team
  'team.label':           { mn: 'Comitatus · Миний Баг', en: 'Comitatus · My Team' },
  'team.title.prefix':    { mn: 'Сонгогдсон',    en: 'Chosen' },
  'team.title.suffix':    { mn: 'зүтгэлтнүүд',   en: 'figures' },
  'team.clearConfirm':    { mn: 'Багийг цэвэрлэх үү?', en: 'Clear the team?' },

  // Hero section
  'hero.eyebrow':         { mn: 'Монголын Их Эзэнт Гүрний', en: 'Of the Great Mongol Empire' },
  'hero.title.top':       { mn: 'Хүмүүний',      en: 'The' },
  'hero.title.bottom':    { mn: 'Кодекс',        en: 'Codex' },
  'hero.pageLabel':       { mn: 'ТАВИН ХОЁР · FIFTY-TWO', en: 'ТАВИН ХОЁР · FIFTY-TWO' },
  'hero.lead':            { mn: 'Тавин хоёр зүтгэлтний намтар, гавьяа, домог — найман зуун жилийн түүхийг нэгэн хөзрийн баглаанд багтаасан зураглалт кодекс.',
                            en: 'Fifty-two figures — eight centuries of history bound into a single illustrated codex of playing cards.' },
  'hero.cta':             { mn: 'Кодексоо Нээх', en: 'Open the Codex' },
  'hero.or':              { mn: 'Эсхүл',         en: 'Or' },
  'hero.timelineLink':    { mn: 'Он дарааллаар үзэх', en: 'Browse by timeline' },
  'hero.scrollHint':      { mn: 'Хуудас эргүүлэх', en: 'Turn the page' },
  'hero.stat.figures':    { mn: 'ЗҮТГЭЛТЭН',     en: 'FIGURES' },
  'hero.stat.categories': { mn: 'АНГИЛАЛ',        en: 'CATEGORIES' },
  'hero.stat.centuries':  { mn: 'ЖИЛИЙН ТҮҮХ',   en: 'YEARS OF HISTORY' },
  'hero.stat.locations':  { mn: 'ГАЗРЫН ЦЭГ',    en: 'MAP MARKERS' },
  'hero.features.map':    { mn: 'Газар зүйн интерактив зураг', en: 'Interactive geographic atlas' },
  'hero.features.compare':{ mn: 'Зүтгэлтэн бүрийг харьцуулах', en: 'Compare figures side-by-side' },
  'hero.features.ai':     { mn: 'AI-тай яриа үүсгэх', en: 'Conversations with AI-powered figures' },
  'hero.features.quiz':   { mn: 'Мэдлэг шалгах асуумж', en: 'Knowledge-check quizzes' },

  // FigureDetail
  'fd.back':              { mn: 'Буцах',          en: 'Back' },
  'fd.addToTeam':         { mn: 'Багт нэмэх',     en: 'Add to team' },
  'fd.inTeam':            { mn: 'Багт байна',     en: 'In team' },
  'fd.tab.bio':           { mn: 'Намтар',         en: 'Biography' },
  'fd.tab.timeline':      { mn: 'Он дараалал',    en: 'Timeline' },
  'fd.tab.map':           { mn: 'Газрын Зураг',   en: 'Map' },
  'fd.tab.quiz':          { mn: 'Шалгалт',        en: 'Quiz' },
  'fd.tab.related':       { mn: 'Холбоо',         en: 'Related' },
  'fd.tab.links':         { mn: 'Эх сурвалж',     en: 'Sources' },
  'fd.section.bio':       { mn: 'Намтар',         en: 'Biography' },
  'fd.section.achs':      { mn: 'Гавьяа Зүт',     en: 'Achievements' },
  'fd.section.fact':      { mn: 'Тэмдэглэл',      en: 'Notable fact' },
  'fd.section.related':   { mn: 'Холбоотой хүмүүс', en: 'Connected figures' },
  'fd.section.sameCat':   { mn: 'Ижил ангилал',    en: 'Same category' },
  'fd.section.sources':   { mn: 'Эх сурвалж · дэлгэрэнгүй', en: 'Sources · further reading' },
  'fd.prev':              { mn: 'Prev · N°',      en: 'Prev · N°' },
  'fd.next':              { mn: 'Next · N°',      en: 'Next · N°' },
  'fd.ownSearch.t':       { mn: 'Өөрөө хайх',     en: 'Search elsewhere' },
  'fd.ownSearch.b':       { mn: '-ын тухай Wikipedia дээр дэлгэрэнгүй уншина уу.',
                            en: 'Read more on Wikipedia.' },
  'fd.ownSearch.cta':     { mn: 'Wikipedia-д нээх', en: 'Open in Wikipedia' },

  // Quiz strings (minimal — more lives in FigureQuiz itself)
  'quiz.title':           { mn: 'МЭДЛЭГ ШАЛГАХ',    en: 'KNOWLEDGE CHECK' },
  'quiz.subtitle':        { mn: '-ын тухай та хэр мэдэх вэ?', en: '— how well do you know them?' },

  // Collection
  'col.title':            { mn: 'Миний Цуглуулга', en: 'My Collection' },
  'col.label':            { mn: 'Catalogus · Мөн нь', en: 'Catalogus · Holdings' },
  'col.progress':         { mn: 'Нийт явц',          en: 'Total progress' },
  'col.howTo.h':          { mn: 'Инструкция — Цуглуулах аргачлал', en: 'How to collect' },
  'col.howTo.b':          { mn: 'Зүтгэлтний хуудас нэг бүрийн § IV · Шалгалт табыг ялагнаар даван гарч, тухайн зүтгэлтний хөзрийг кодекс цуглуулгадаа нэмнэ.',
                            en: 'Pass the § IV · Quiz on each figure’s page to add that figure’s card to your codex collection.' },
  'col.filter':           { mn: 'Шүүлтэнд',           en: 'In filter' },

  // Footer
  'footer.colophon':      { mn: 'Colophon',           en: 'Colophon' },
  'footer.body':          { mn: 'Тавин хоёр түүхэн зүтгэлтний намтар, гавьяа, домог — Монголын найман зуун жилийн түүхийг нэгэн хөзрийн баглаанд багтаасан зураглалт кодекс.',
                            en: 'A Codex of fifty-two figures — biography, deeds, and legend — binding eight centuries of Mongol history into a single illustrated deck.' },

  // Game
  'game.loadFailed':      { mn: 'Тоглоомыг ачаалахад алдаа гарлаа.',        en: 'Failed to load the game.' },

  // Duel
  'duel.title':           { mn: 'Сорилт',                                    en: 'Challenge' },
  'duel.intro.challenged':{ mn: 'чамайг сорьсон',                           en: 'challenged you' },
  'duel.intro.rules':     { mn: '{n} асуулт. Адилхан хоёулаа.',              en: '{n} questions. Same for both.' },
  'duel.intro.toBeat':    { mn: 'Давах оноо:',                               en: 'Score to beat:' },
  'duel.intro.start':     { mn: 'Эхлэх',                                      en: 'Play' },
  'duel.expired':         { mn: 'Энэ сорилт хугацаа нь дууссан байна.',     en: 'This challenge has expired.' },
  'duel.notFound':        { mn: 'Сорилт олдсонгүй.',                         en: 'Challenge not found.' },
  'duel.waiting':         { mn: 'Эсрэг талын тоглогч хүлээж байна…',        en: 'Waiting for your opponent…' },
  'duel.summary.title':   { mn: 'Сорилтын дүн',                              en: 'Duel summary' },
  'duel.summary.youWon':  { mn: 'Та ялсан!',                                 en: 'You won!' },
  'duel.summary.theyWon': { mn: 'Эсрэг талын тоглогч ялсан.',                en: 'Your opponent won.' },
  'duel.summary.tie':     { mn: 'Тэнцсэн үр дүн.',                           en: "It's a tie." },
  'duel.summary.rematch': { mn: 'Дахин сорилт',                              en: 'Rematch' },

  // Challenge CTA on game end
  'game.challenge':       { mn: 'Найздаа сорилт илгээх',                    en: 'Challenge a friend' },
  'game.copiedLink':      { mn: 'Холбоос хуулагдсан.',                       en: 'Link copied to clipboard.' },

  // Leaderboard
  'leaderboard.title':    { mn: 'Тэргүүлэгчид',                              en: 'Leaderboard' },
  'leaderboard.tab.weekly':{mn: 'Энэ 7 хоног',                               en: 'This week' },
  'leaderboard.tab.all':  { mn: 'Бүх цаг',                                   en: 'All time' },
  'leaderboard.col.rank': { mn: '#',                                          en: '#' },
  'leaderboard.col.user': { mn: 'Тоглогч',                                   en: 'Player' },
  'leaderboard.col.games':{ mn: 'Тоглоом',                                   en: 'Games' },
  'leaderboard.col.points':{mn: 'Оноо',                                       en: 'Points' },
  'leaderboard.col.acc':  { mn: 'Нарийвчлал',                                en: 'Accuracy' },
  'leaderboard.empty':    { mn: 'Одоогоор бичлэг алга.',                     en: 'No scores yet.' },
  'leaderboard.yourRank': { mn: 'Таны байр',                                 en: 'Your rank' },
  'nav.leaderboard':      { mn: 'Тэргүүлэгчид',                              en: 'Leaderboard' },

  // Live rooms (Phase 2)
  'live.new.title':         { mn: 'Шинэ өрөө',                     en: 'New live room' },
  'live.new.lang':          { mn: 'Хэл',                           en: 'Language' },
  'live.new.roundSize':     { mn: 'Асуултын тоо',                  en: 'Question count' },
  'live.new.timer':         { mn: 'Хугацаа',                       en: 'Timer' },
  'live.new.playerCap':     { mn: 'Хамгийн их тоглогч',            en: 'Max players' },
  'live.new.submit':        { mn: 'Өрөөг үүсгэх',                  en: 'Create room' },
  'live.lobby.joinCode':    { mn: 'Орох код',                      en: 'Join code' },
  'live.lobby.players':     { mn: 'Тоглогчид',                     en: 'Players' },
  'live.lobby.start':       { mn: 'Эхлэх',                         en: 'Start' },
  'live.lobby.waitingForHost': { mn: 'Хост эхлэхийг хүлээж байна…', en: 'Waiting for the host to start…' },
  'live.game.question':     { mn: 'Асуулт',                        en: 'Question' },
  'live.game.timer':        { mn: 'Хугацаа',                       en: 'Timer' },
  'live.game.standings':    { mn: 'Оноон байрлал',                 en: 'Standings' },
  'live.reveal.correct':    { mn: 'Зөв хариулт',                   en: 'Correct answer' },
  'live.reveal.nextIn':     { mn: 'Дараагийн асуулт…',             en: 'Next question in…' },
  'live.results.mvp':       { mn: 'MVP',                           en: 'MVP' },
  'live.results.rematch':   { mn: 'Дахин сорилт',                  en: 'Rematch' },
  'live.results.joinRematch': { mn: 'Шинэ өрөөнд нэгдэх',          en: 'Join new room' },
  'live.abandoned':         { mn: 'Энэ өрөө дууссан байна.',       en: 'This room has ended.' },

  // Edge-function error reasons — surfaced from `{ reason }` field.
  'error.need_two_players':   { mn: 'Эхлэхийн тулд хамгийн багадаа 2 тоглогч хэрэгтэй.', en: 'Need at least 2 players to start.' },
  'error.room_full':          { mn: 'Өрөө дүүрсэн байна.',            en: 'Room is full.' },
  'error.bad_state':          { mn: 'Одоогийн төлөв энэ үйлдэлд тохирохгүй.', en: "Can't do that right now." },
  'error.not_host':           { mn: 'Зөвхөн эзэн эхлүүлэх боломжтой.', en: 'Only the host can do that.' },
  'error.not_participant':    { mn: 'Та энэ өрөөний оролцогч биш.',    en: 'You are not a participant.' },
  'error.tournament_closed':  { mn: 'Тэмцээн идэвхтэй биш байна.',     en: 'Tournament is not active.' },
  'error.already_entered':    { mn: 'Та энэ тэмцээнд оролцсон байна.', en: 'You have already entered this tournament.' },
  'error.too_late':           { mn: 'Хариулах хугацаа хэтэрсэн.',      en: 'Time is up.' },
  'error.already_answered_this_round': { mn: 'Та энэ асуултад хариулсан байна.', en: 'You already answered this question.' },
  'error.forbidden':          { mn: 'Зөвшөөрөлгүй.',                   en: 'Forbidden.' },
  'error.unauthorized':       { mn: 'Нэвтрээгүй байна.',               en: 'Not signed in.' },
  'error.not_found':          { mn: 'Олдсонгүй.',                      en: 'Not found.' },
  'error.duplicate_rematch':  { mn: 'Дахин сорилт аль хэдийн үүсгэгдсэн.', en: 'Rematch already created.' },

  // Tournaments (Phase 3)
  'nav.tournaments':              { mn: 'Тэмцээн',                        en: 'Tournaments' },
  'tournament.title':             { mn: 'Тэмцээнүүд',                     en: 'Tournaments' },
  'tournament.upcoming':          { mn: 'Удахгүй',                        en: 'Upcoming' },
  'tournament.active':            { mn: 'Идэвхтэй',                       en: 'Active' },
  'tournament.past':              { mn: 'Өнгөрсөн',                       en: 'Past' },
  'tournament.play':              { mn: 'Тоглох',                         en: 'Play' },
  'tournament.viewLeaderboard':   { mn: 'Дэвжээ харах',                   en: 'View leaderboard' },
  'tournament.viewResult':        { mn: 'Үр дүнгээ харах',                en: 'View your result' },
  'tournament.alreadyEntered':    { mn: 'Та энэ тэмцээнд оролцсон байна.', en: 'You have already entered this tournament.' },
  'tournament.noResults':         { mn: 'Оролцогч алга',                  en: 'No entries yet' },
  'tournament.winners':           { mn: 'Ялагчид',                        en: 'Winners' },
  'tournament.starts':            { mn: 'Эхлэх:',                         en: 'Starts:' },
  'tournament.ends':              { mn: 'Дуусах:',                        en: 'Ends:' },
  'tournament.participants':      { mn: 'оролцогч',                       en: 'participants' },
  'tournament.empty':             { mn: 'Одоогоор тэмцээн байхгүй байна.', en: 'No tournaments yet.' },
  'tournament.rank':              { mn: '#',                               en: '#' },
  'tournament.score':             { mn: 'Оноо',                           en: 'Score' },
  'tournament.player':            { mn: 'Тоглогч',                        en: 'Player' },
  'tournament.starts_in':         { mn: 'Эхлэх:',                         en: 'Starts' },
  'tournament.unpublished':       { mn: 'Нийтлэгдэж байна…',              en: 'Results pending…' },

  // Medals (Phase 3)
  'medal.gold':                   { mn: 'Алт',                            en: 'Gold' },
  'medal.silver':                 { mn: 'Мөнгө',                          en: 'Silver' },
  'medal.bronze':                 { mn: 'Хүрэл',                          en: 'Bronze' },
  'medal.awardedIn':              { mn: 'тэмцээнд хүртсэн',               en: 'awarded in' },

  // Admin — tournaments
  'admin.t.title':                { mn: 'Тэмцээнүүд',                     en: 'Tournaments' },
  'admin.t.new':                  { mn: 'Шинэ тэмцээн',                   en: 'New tournament' },
  'admin.t.name':                 { mn: 'Нэр',                            en: 'Name' },
  'admin.t.lang':                 { mn: 'Хэл',                            en: 'Language' },
  'admin.t.roundSize':            { mn: 'Асуултын тоо',                   en: 'Round size' },
  'admin.t.startsAt':             { mn: 'Эхлэх цаг',                      en: 'Starts at' },
  'admin.t.endsAt':               { mn: 'Дуусах цаг',                     en: 'Ends at' },
  'admin.t.publishNow':           { mn: 'Одоо нийтлэх',                   en: 'Publish now' },
  'admin.t.published':            { mn: 'Нийтлэгдсэн',                    en: 'Published' },
  'admin.t.create':               { mn: 'Үүсгэх',                         en: 'Create' },
};

const LangContext = createContext({ lang: 'mn', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === 'undefined') return 'mn';
    const saved = localStorage.getItem(LANG_KEY);
    return LOCALES.includes(saved) ? saved : 'mn';
  });

  const setLang = useCallback((next) => {
    if (!LOCALES.includes(next)) return;
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'mn');
    }
  }, [lang]);

  const t = useCallback((key) => {
    const entry = STRINGS[key];
    if (!entry) return key;
    return entry[lang] ?? entry.mn ?? key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

// Convenience helpers for figure fields — English name maps live here so
// components don't all import the same big map.
import {
  FIGURE_NAMES_EN, FIGURE_ROLES_EN, FIGURE_BIOS_EN,
  FIGURE_ACHIEVEMENTS_EN, FIGURE_FACT_EN, FIGURE_QUOTE_EN,
} from './figuresI18n';
export { figureAchievements, figureFact, figureQuote, storyText } from './figuresI18n';

export function figureName(figure, lang) {
  if (!figure) return '';
  if (lang === 'en') return FIGURE_NAMES_EN[figure.fig_id] || figure.name;
  return figure.name;
}

export function figureRole(figure, lang) {
  if (!figure) return '';
  if (lang === 'en') return FIGURE_ROLES_EN[figure.fig_id] || figure.role;
  return figure.role;
}

export function figureBio(figure, lang) {
  if (!figure) return '';
  if (lang === 'en' && FIGURE_BIOS_EN[figure.fig_id]) return FIGURE_BIOS_EN[figure.fig_id];
  return figure.bio;
}

// Translate an edge-function reason code to a localized string, falling back
// to the raw code if no translation exists.
export function translateReason(t, reason) {
  if (!reason) return '';
  const key = `error.${reason}`;
  const translated = t(key);
  return translated === key ? reason : translated;
}
