// Deno twin of src/lib/seededRound.js. Keep the two in lockstep:
// same algorithm, same output for the same (figures, size, seed).

import type { SharedFigure } from './figures.ts';

export interface RoundQuestion {
  figId: number;
  quote: string | null;
  qattr: string | null;
  optionFigIds: number[];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffleWith<T>(rand: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildRoundFromSeed(
  allFigures: SharedFigure[],
  size: number,
  seedString: string,
): RoundQuestion[] {
  const rand = mulberry32(hashSeed(seedString));
  const pool = allFigures.filter((f) => f.quote != null && f.quote !== '');
  const sampled = shuffleWith(rand, pool).slice(0, Math.min(size, pool.length));

  return sampled.map((figure) => {
    const sameCat = allFigures.filter(
      (f) => f.cat === figure.cat && f.fig_id !== figure.fig_id,
    );
    const wrongPool =
      sameCat.length >= 3
        ? sameCat
        : allFigures.filter((f) => f.fig_id !== figure.fig_id);
    const wrongs = shuffleWith(rand, wrongPool).slice(0, 3);
    const optionFigIds = shuffleWith(rand, [figure, ...wrongs]).map((f) => f.fig_id);

    return {
      figId: figure.fig_id,
      quote: figure.quote,
      qattr: figure.qattr,
      optionFigIds,
    };
  });
}
