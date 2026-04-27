import { describe, it, expect } from 'vitest';
import { STRINGS } from '@/lib/i18n';

describe('roster-gate i18n', () => {
  it('has bilingual error.roster_lookup_failed', () => {
    expect(STRINGS['error.roster_lookup_failed']).toBeDefined();
    expect(STRINGS['error.roster_lookup_failed'].mn).toMatch(/.+/);
    expect(STRINGS['error.roster_lookup_failed'].en).toMatch(/.+/);
  });
  it('has bilingual live.lobby.rosterFigures', () => {
    const s = STRINGS['live.lobby.rosterFigures'];
    expect(s?.mn).toMatch(/.+/);
    expect(s?.en).toMatch(/.+/);
  });
  it('has bilingual live.lobby.allFigures', () => {
    const s = STRINGS['live.lobby.allFigures'];
    expect(s?.mn).toMatch(/.+/);
    expect(s?.en).toMatch(/.+/);
  });
  it('has bilingual live.lobby.allFiguresHint', () => {
    const s = STRINGS['live.lobby.allFiguresHint'];
    expect(s?.mn).toMatch(/.+/);
    expect(s?.en).toMatch(/.+/);
  });
});
