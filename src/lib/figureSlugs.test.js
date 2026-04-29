import { describe, it, expect } from 'vitest';
import {
  FIGURE_SLUG_TO_ID,
  FIGURE_ID_TO_SLUG,
  resolveCardParam,
} from '@/lib/figureSlugs';

describe('figureSlugs', () => {
  it('builds a slug for every figure (1..52)', () => {
    for (let id = 1; id <= 52; id++) {
      expect(FIGURE_ID_TO_SLUG[id]).toBeTruthy();
      expect(FIGURE_ID_TO_SLUG[id]).toMatch(/^[A-Z0-9_]+_\d{3}$/);
    }
  });

  it('round-trips slug → id → slug', () => {
    for (const [slug, id] of Object.entries(FIGURE_SLUG_TO_ID)) {
      expect(FIGURE_ID_TO_SLUG[id]).toBe(slug);
    }
  });

  it('strips diacritics from English names (Ögedei → OGEDEI)', () => {
    expect(FIGURE_ID_TO_SLUG[2]).toBe('OGEDEI_KHAN_002');
  });

  it('Genghis Khan resolves cleanly', () => {
    expect(FIGURE_ID_TO_SLUG[1]).toBe('GENGHIS_KHAN_001');
    expect(FIGURE_SLUG_TO_ID.GENGHIS_KHAN_001).toBe(1);
  });

  describe('resolveCardParam', () => {
    it('accepts numeric ids', () => {
      expect(resolveCardParam('1')).toBe(1);
      expect(resolveCardParam('52')).toBe(52);
    });

    it('accepts canonical slugs case-insensitively', () => {
      expect(resolveCardParam('GENGHIS_KHAN_001')).toBe(1);
      expect(resolveCardParam('genghis_khan_001')).toBe(1);
    });

    it('accepts FIG_NNN shorthand', () => {
      expect(resolveCardParam('FIG_001')).toBe(1);
      expect(resolveCardParam('fig_007')).toBe(7);
    });

    it('returns null for unknown / out-of-range', () => {
      expect(resolveCardParam('UNKNOWN_999')).toBe(null);
      expect(resolveCardParam('999')).toBe(null);
      expect(resolveCardParam('0')).toBe(null);
      expect(resolveCardParam('')).toBe(null);
      expect(resolveCardParam(null)).toBe(null);
      expect(resolveCardParam(undefined)).toBe(null);
    });
  });
});
