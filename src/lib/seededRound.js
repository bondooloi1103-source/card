export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

export function hashSeed(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffleWith(rand, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function quoteFor(figure, lang) {
  if (lang === 'en') {
    return { quote: figure.quote_en ?? null, qattr: figure.qattr_en ?? null };
  }
  return { quote: figure.quote_mn ?? null, qattr: figure.qattr_mn ?? null };
}

function nameFor(figure, lang) {
  return lang === 'en' ? (figure.name_en ?? figure.name_mn) : (figure.name_mn ?? figure.name_en);
}

export function buildRoundFromSeed(allFigures, lang, size, seedString) {
  const rand = mulberry32(hashSeed(seedString));
  const pool = allFigures
    .map((f) => {
      const { quote, qattr } = quoteFor(f, lang);
      return quote ? { figure: f, quote, qattr } : null;
    })
    .filter(Boolean);

  const sampled = shuffleWith(rand, pool).slice(0, Math.min(size, pool.length));

  return sampled.map(({ figure, quote, qattr }) => {
    const sameCat = allFigures.filter(
      (f) => f.cat === figure.cat && f.fig_id !== figure.fig_id,
    );
    const wrongPool = sameCat.length >= 3
      ? sameCat
      : allFigures.filter((f) => f.fig_id !== figure.fig_id);
    const wrongs = shuffleWith(rand, wrongPool).slice(0, 3).map((f) => nameFor(f, lang));
    const correct = nameFor(figure, lang);
    return {
      figId: figure.fig_id,
      quote,
      qattr,
      correct,
      options: shuffleWith(rand, [correct, ...wrongs]),
    };
  });
}
