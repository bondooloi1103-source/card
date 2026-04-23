import { describe, it, expect } from 'vitest';
import { buildRoundFromSeed, hashSeed, mulberry32 } from '@/lib/seededRound';

const FIXTURE_FIGURES = [
  { fig_id: 1, cat: 'khan',    name_en: 'A', name_mn: 'А', quote_en: 'quote A', quote_mn: 'ишлэл А' },
  { fig_id: 2, cat: 'khan',    name_en: 'B', name_mn: 'Б', quote_en: 'quote B', quote_mn: 'ишлэл Б' },
  { fig_id: 3, cat: 'khan',    name_en: 'C', name_mn: 'В', quote_en: 'quote C', quote_mn: 'ишлэл В' },
  { fig_id: 4, cat: 'khan',    name_en: 'D', name_mn: 'Г', quote_en: 'quote D', quote_mn: 'ишлэл Г' },
  { fig_id: 5, cat: 'khan',    name_en: 'E', name_mn: 'Д', quote_en: 'quote E', quote_mn: 'ишлэл Д' },
  { fig_id: 6, cat: 'warrior', name_en: 'F', name_mn: 'Е', quote_en: 'quote F', quote_mn: 'ишлэл Е' },
  { fig_id: 7, cat: 'warrior', name_en: 'G', name_mn: 'Ё', quote_en: 'quote G', quote_mn: 'ишлэл Ё' },
];

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const sa = [a(), a(), a(), a()];
    const sb = [b(), b(), b(), b()];
    expect(sa).toEqual(sb);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});

describe('hashSeed', () => {
  it('returns a 32-bit integer', () => {
    const h = hashSeed('GQ7K4R2A9M');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('is deterministic for the same input', () => {
    expect(hashSeed('ABC')).toBe(hashSeed('ABC'));
  });
});

describe('buildRoundFromSeed', () => {
  it('produces byte-identical output for the same (seed, lang, size, fixtures)', () => {
    const r1 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    const r2 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    expect(r1).toEqual(r2);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('produces a different round for a different seed', () => {
    const r1 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    const r2 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED002');
    expect(r1).not.toEqual(r2);
  });

  it('respects round size (capped at pool size)', () => {
    const r = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 5, 'SEED001');
    expect(r).toHaveLength(5);
    expect(new Set(r.map((q) => q.figId)).size).toBe(5);
  });

  it('each question has 4 options including the correct one', () => {
    const r = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    for (const q of r) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.correct);
    }
  });

  it('skips figures without a quote in the active locale', () => {
    const figs = [
      ...FIXTURE_FIGURES,
      { fig_id: 99, cat: 'khan', name_en: 'Mute', name_mn: 'Чимээгүй' },
    ];
    const r = buildRoundFromSeed(figs, 'en', 10, 'SEED001');
    expect(r.every((q) => q.figId !== 99)).toBe(true);
  });
});
