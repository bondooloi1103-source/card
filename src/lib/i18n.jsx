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
  'nav.admin':     { mn: 'Админ',        en: 'Admin' },

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
  'live.lobby.rosterFigures':   { mn: 'Цуглуулсан дүрсүүд', en: 'Roster figures' },
  'live.lobby.allFigures':      { mn: 'Бүгд',                 en: 'All figures' },
  'live.lobby.allFiguresHint':  {
    mn: 'Хост 4-өөс цөөн ишлэлт дүрс цуглуулсан тул бүх дүрс ашиглана.',
    en: 'Host has fewer than 4 quote-bearing figures, so the full set is in play.',
  },
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
  'error.roster_lookup_failed': {
    mn: 'Цуглуулга шалгахад алдаа гарлаа. Дахин оролдоорой.',
    en: 'Could not check your collection. Please try again.',
  },

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

  // Story Phase A
  'story.play':             { mn: 'Эхлүүлэх',              en: 'Play' },
  'story.pause':            { mn: 'Түр зогсоох',           en: 'Pause' },
  'story.prev':             { mn: 'Өмнөх',                 en: 'Previous' },
  'story.next':             { mn: 'Дараагийн',             en: 'Next' },
  'story.fullscreen':       { mn: 'Дэлгэц дүүрэн',         en: 'Fullscreen' },
  'story.exitFullscreen':   { mn: 'Дэлгэц буцаах',         en: 'Exit fullscreen' },
  'story.chapter':          { mn: 'Бүлэг',                 en: 'Chapter' },
  'story.slideOf':          { mn: '{n} / {total}',         en: '{n} / {total}' },
  'story.intro.label':      { mn: 'Эхлэл',                 en: 'Prologue' },
  'story.outro.label':      { mn: 'Төгсгөл',               en: 'Epilogue' },
  'story.ending.title':     { mn: 'Бүлэг дуусав',          en: 'Chapter complete' },
  'story.ending.continue':  { mn: 'Үргэлжлүүлэх',          en: 'Continue' },
  'story.ending.done':      { mn: 'Кодекс дуусав. Баярлалаа.', en: 'The codex is complete. Thank you.' },
  'story.empty':            { mn: 'Бүлэг хоосон байна.',   en: 'This chapter is empty.' },
  'story.notFound':         { mn: 'Бүлэг олдсонгүй.',      en: 'Chapter not found.' },
  'chapters.play':          { mn: 'Энэ бүлгийн түүхийг үзэх', en: 'Play this chapter' },

  // Admin — Voices (Story Phase B)
  'admin.voices.title':           { mn: 'Дуу хоолой',                 en: 'Voices' },
  'admin.voices.assign':          { mn: 'Дуу хоолой оноох',          en: 'Assign voice' },
  'admin.voices.voiceIdLabel':    { mn: 'ElevenLabs voice_id',        en: 'ElevenLabs voice_id' },
  'admin.voices.preview':         { mn: 'Сонсох',                     en: 'Preview' },
  'admin.voices.save':            { mn: 'Хадгалах',                   en: 'Save' },
  'admin.voices.preRender':       { mn: 'Бүлгийг бэлтгэх',           en: 'Pre-render chapter' },
  'admin.voices.preRendering':    { mn: 'Бэлтгэж байна…',             en: 'Pre-rendering…' },
  'admin.voices.hasQuoteFilter':  { mn: 'Ишлэлтэй зүтгэлтнүүд',       en: 'Figures with a quote' },
  'admin.voices.none':            { mn: '— оноогдоогүй —',            en: '— unassigned —' },

  // Admin — Stories (Story Phase C)
  'admin.stories.storyMn':      { mn: 'Түүх · Монгол',        en: 'Story · Mongolian' },
  'admin.stories.storyEn':      { mn: 'Түүх · English',       en: 'Story · English' },
  'admin.stories.edit':         { mn: 'Түүх засах',            en: 'Edit story' },
  'admin.stories.publish':      { mn: 'Нийтлэх',               en: 'Publish' },
  'admin.stories.unpublish':    { mn: 'Нийтлэлээс авах',      en: 'Unpublish' },
  'admin.stories.draft':        { mn: 'Ноорог',                en: 'Draft' },
  'admin.stories.published':    { mn: 'Нийтлэгдсэн',          en: 'Published' },
  'admin.stories.preview':      { mn: 'Бүлэгт үзэх',          en: 'Preview in chapter' },
  'admin.stories.chars':        { mn: '{n} тэмдэгт',           en: '{n} chars' },
  'admin.stories.save':         { mn: 'Хадгалах',              en: 'Save' },
  'admin.stories.close':        { mn: 'Хаах',                  en: 'Close' },

  // Admin — Eras (Story Phase C)
  'admin.eras.title':           { mn: 'Бүлгүүд',              en: 'Eras' },
  'admin.eras.intro':           { mn: 'Эхлэл',                 en: 'Intro' },
  'admin.eras.outro':           { mn: 'Төгсгөл',               en: 'Outro' },

  // ─── Polish pass: feedback primitives ──────────────────────────────────
  // Generic toasts
  'toast.generic.networkError':   { mn: 'Сүлжээний алдаа гарлаа.',         en: 'Network error.' },
  'toast.generic.unknownError':   { mn: 'Үл мэдэгдэх алдаа.',                en: 'Unexpected error.' },
  'toast.generic.retry':          { mn: 'Дахин оролдох',                       en: 'Retry' },

  // Quote game
  'toast.quote.submitFailed':     { mn: 'Үр дүнг илгээж чадсангүй.',         en: 'Could not submit your result.' },

  // Story narration
  'toast.story.narrationFailed':  { mn: 'Дуу гарч чадсангүй.',                en: 'Narration failed.' },
  'toast.story.prefetchFailed':   { mn: 'Урьдчилан ачаалах амжилтгүй.',  en: 'Pre-fetch failed; the next slide may take a moment.' },

  // Scan chat
  'toast.scan.aiFailed':          { mn: 'AI хариулж чадсангүй.',                en: 'AI did not respond.' },

  // Admin
  'toast.admin.realtimeFailed':   { mn: 'Бодит цагийн холбоо тасарлаа.',  en: 'Live sync disconnected. Refresh to reconnect.' },
  'toast.admin.saving':           { mn: 'Хадгалж байна…',                       en: 'Saving…' },
  'toast.admin.saved':            { mn: 'Хадгалагдлаа.',                          en: 'Saved.' },
  'toast.admin.saveFailed':       { mn: 'Хадгалж чадсангүй.',                  en: 'Save failed.' },
  'toast.admin.uploading':        { mn: 'Байршуулж байна…',                  en: 'Uploading…' },
  'toast.admin.audioTooLarge':    { mn: 'Файл хэт том байна (дээд тал нь 5 MB).', en: 'File too large (5 MB max).' },

  // Auth
  'toast.auth.loginSuccess':      { mn: 'Тавтай морилно уу.',                  en: 'Welcome back.' },

  // Empty states
  'empty.collection.title':       { mn: 'Хөзрийн цуглуулга хоосон байна', en: 'Your codex is empty' },
  'empty.collection.description': { mn: 'Шинэ зүтгэлтэн нэмэхийн тулд QR код уншуулж эхэл.', en: 'Scan QR codes to collect figures into your codex.' },
  'empty.collection.action':      { mn: 'Хэрхэн уншуулах вэ?',           en: 'How does scanning work?' },
  'empty.leaderboard.title':      { mn: 'Тэргүүлэгчид хоосон',           en: 'No leaders yet' },
  'empty.leaderboard.description':{ mn: 'Эхлээд тоглож, эхний тэргүүлэгч бай.', en: 'Play a round to be the first on the board.' },
  'empty.generic.title':          { mn: 'Юу ч олдсонгүй',                       en: 'Nothing to show' },
  'empty.generic.description':    { mn: '',                                            en: '' },
  'empty.error.title':            { mn: 'Алдаа гарлаа',                          en: 'Something went wrong' },
  'empty.error.description':      { mn: 'Дахин оролдоно уу.',                  en: 'Please try again.' },

  // Leaderboard rank context
  'leaderboard.contextLine':      { mn: 'Та ${rank}-р байр / нийт ${total} тоглогч', en: 'You are #${rank} of ${total} players' },

  // Loading indicators
  'loading.scan.aiThinking':      { mn: 'AI бодож байна…',                      en: 'AI is thinking…' },

  // Story
  'story.fullscreenExitHint':     { mn: 'Esc дарж гарах',                       en: 'Press Esc to exit' },

  // Auth — single-device sign-in
  'auth.deviceConflictTitle':
    { mn: 'Энэ данс өөр төхөөрөмж дээр нэвтэрсэн байна',
      en: 'This account is already signed in elsewhere' },
  'auth.deviceConflictBody':
    { mn: 'Сүүлд: {device} · {lastSeen} өмнө',
      en: 'Last seen: {device} · {lastSeen} ago' },
  'auth.takeOverButton':
    { mn: 'Энэ төхөөрөмж дээр нэвтрэх',
      en: 'Sign in here anyway' },
  'auth.cancelButton':
    { mn: 'Болих',
      en: 'Cancel' },
  'auth.evictedBanner':
    { mn: 'Та өөр төхөөрөмж дээр нэвтэрсэн тул энэ төхөөрөмжөөс гарлаа.',
      en: 'You were signed out because this account signed in on another device.' },

  // Card3D — video back
  'card.video.play':       { mn: 'Тоглуулах',   en: 'Play' },
  'card.video.replay':     { mn: 'Дахин',       en: 'Replay' },
  'card.video.mute':       { mn: 'Дуугүй',      en: 'Mute' },
  'card.video.unmute':     { mn: 'Дуутай',      en: 'Unmute' },

  // Admin — back videos tab
  'admin.backVideos.tab':       { mn: 'Видео',  en: 'Videos' },
  'admin.backVideos.upload':    { mn: 'Хуулах', en: 'Upload' },
  'admin.backVideos.replace':   { mn: 'Солих',  en: 'Replace' },
  'admin.backVideos.delete':    { mn: 'Устгах', en: 'Delete' },
  'admin.backVideos.captions':  { mn: 'Хадмал', en: 'Captions' },
  'admin.backVideos.tooBig':    { mn: 'Файл хэт том ({mb} MB > 50 MB)', en: 'File too large ({mb} MB > 50 MB)' },
  'admin.backVideos.tooLong':   { mn: 'Видео хэт урт ({s}s > 60s)',     en: 'Video too long ({s}s > 60s)' },
  'admin.backVideos.notVtt':    { mn: 'WEBVTT файл байх ёстой',         en: 'Must be a WEBVTT file' },
  'admin.backVideos.notMp4':    { mn: 'MP4 файл байх ёстой', en: 'Must be an MP4 file' },
  'admin.backVideos.empty':     { mn: 'Видео байхгүй',                  en: 'No video' },

  // AR feature — public
  'ar.button.full':           { mn: 'AR харах',                              en: 'View in AR' },
  'ar.button.compact':        { mn: 'AR',                                    en: 'AR' },
  'ar.button.comingSoon':     { mn: 'AR — Тун удахгүй',                      en: 'AR — Coming soon' },
  'ar.button.tooltipDisabled':{ mn: 'Энэ дүрд AR удахгүй нэмэгдэнэ',         en: 'AR will be added for this figure soon' },
  'ar.loading':               { mn: 'AR-д бэлдэж байна…',                    en: 'Preparing AR…' },
  'ar.assetsMissing.title':   { mn: 'AR хараахан нээгдээгүй байна',          en: 'AR is not available yet' },
  'ar.assetsMissing.body':    { mn: 'Энэ дүрд AR файл удахгүй нэмэгдэнэ.',    en: 'AR for this figure is coming soon.' },
  'ar.back':                  { mn: 'Буцах',                                 en: 'Back' },
  'ar.mute':                  { mn: 'Дуу хаах',                              en: 'Mute' },
  'ar.unmute':                { mn: 'Дуу нээх',                              en: 'Unmute' },
  'ar.action.story':          { mn: 'Түүх',                                  en: 'Story' },
  'ar.action.quiz':           { mn: 'Шалгуур',                               en: 'Quiz' },
  'ar.action.askAi':          { mn: 'AI асуу',                               en: 'Ask AI' },
  'ar.action.voice':          { mn: 'Дуу',                                   en: 'Voice' },
  'ar.action.voiceStop':      { mn: 'Зогс',                                  en: 'Stop' },
  'ar.hint.framing':          { mn: 'Картыг камерын дунд аваачиж, гэрэлтэй газар барина уу', en: 'Hold the card centered in the camera in good light' },
  'ar.error.permission':      { mn: 'Камер-р хандах эрх олгоно уу',          en: 'Please allow camera access' },
  'ar.error.permission.retry':{ mn: 'Дахин оролдох',                         en: 'Try again' },
  'ar.error.noCamera':        { mn: 'Энэ төхөөрөмжид камер олдсонгүй',        en: 'No camera found on this device' },
  'ar.error.inAppBrowser':    { mn: 'Аппын дотор камер ашиглах боломжгүй. Safari/Chrome-оор нээнэ үү', en: 'Camera is not available inside in-app browsers. Open in Safari or Chrome.' },
  'ar.error.copyLink':        { mn: 'Холбоосыг хуулах',                      en: 'Copy link' },
  'ar.error.copied':          { mn: 'Хуулагдлаа',                            en: 'Copied' },
  'ar.error.slowConn':        { mn: 'Холболт удаан байна',                   en: 'Slow connection' },
  'ar.desktop.title':         { mn: 'Утсаараа сканнердана уу',                en: 'Scan with your phone' },
  'ar.desktop.subtitle':      { mn: 'Эсвэл дараах холбоосыг утсаараа нээнэ үү:', en: 'Or open this link on your phone:' },

  // AR feature — admin tab
  'admin.arTargets.tab':      { mn: 'AR',                                    en: 'AR' },
  'admin.arTargets.upload':   { mn: '.mind хуулах',                          en: 'Upload .mind' },
  'admin.arTargets.replace':  { mn: 'Солих',                                 en: 'Replace' },
  'admin.arTargets.delete':   { mn: 'Устгах',                                en: 'Delete' },
  'admin.arTargets.help':     { mn: 'Энэ файлыг MindAR Target Compiler (https://hiukim.github.io/mind-ar-js-doc/tools/compile)-аар хөрвүүлж авна уу. Картын урд талын зургийг оруулж, .mind файл татаж авч энд хуулна уу.',
                                en: 'Compile this file with the MindAR Target Compiler (https://hiukim.github.io/mind-ar-js-doc/tools/compile). Upload the card front image, download the .mind file, and upload it here.' },
  'admin.arTargets.empty':    { mn: 'AR файл байхгүй',                       en: 'No AR target' },
  'admin.arTargets.noVideoFirst': { mn: 'Видео хуулсны дараа боломжтой',     en: 'Upload video first' },
  'admin.arTargets.replaceWarn':  { mn: 'Хуучин AR файл устах болно. Үргэлжлүүлэх үү?', en: 'The previous AR target will be deleted. Continue?' },
  'admin.arTargets.tooBig':   { mn: '.mind файл хэт том ({mb} MB > 5 MB)',    en: 'File too large ({mb} MB > 5 MB)' },
  'admin.arTargets.notMind':  { mn: '.mind өргөтгөлтэй файл байх ёстой',     en: 'File must have a .mind extension' },
  'admin.models.tab':         { mn: '3D',                                    en: '3D' },
  'admin.models.upload':      { mn: '.glb хуулах',                           en: 'Upload .glb' },
  'admin.models.replace':     { mn: 'Солих',                                 en: 'Replace' },
  'admin.models.delete':      { mn: 'Устгах',                                en: 'Delete' },
  'admin.models.help':        { mn: '3D загвар (.glb эсвэл .gltf, 20MB хүртэл) хуулна уу. Загвар нь карт дээр AR-р харагдана. Видео мөн хуулсан байх шаардлагатай.', en: 'Upload a 3D model (.glb or .gltf, up to 20MB). The model will be projected onto the card in AR. A video must already be uploaded for this figure.' },
  'admin.models.empty':       { mn: '3D загвар байхгүй',                     en: 'No 3D model' },
  'admin.models.noVideoFirst':{ mn: 'Видео хуулсны дараа боломжтой',         en: 'Upload video first' },
  'admin.models.replaceWarn': { mn: 'Хуучин 3D загвар устах болно. Үргэлжлүүлэх үү?', en: 'The previous 3D model will be deleted. Continue?' },
  'admin.models.tooBig':      { mn: '.glb файл хэт том ({mb} MB > 20 MB)',    en: 'File too large ({mb} MB > 20 MB)' },
  'admin.models.notGlb':      { mn: '.glb эсвэл .gltf өргөтгөлтэй файл байх ёстой', en: 'File must have a .glb or .gltf extension' },
};

const LangContext = createContext({ lang: 'mn', setLang: () => {}, t: (k, v) => {
  if (!v) return k;
  return Object.keys(v).reduce((s, kk) => s.replaceAll(`{${kk}}`, String(v[kk])), k);
} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === 'undefined') return 'mn';
    try {
      const saved = window.localStorage?.getItem?.(LANG_KEY);
      return LOCALES.includes(saved) ? saved : 'mn';
    } catch (_) {
      return 'mn';
    }
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

  const t = useCallback((key, vars) => {
    const entry = STRINGS[key];
    const template = entry ? (entry[lang] ?? entry.mn ?? key) : key;
    if (!vars) return template;
    return Object.keys(vars).reduce(
      (s, k) => s.replaceAll(`{${k}}`, String(vars[k])),
      template,
    );
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
