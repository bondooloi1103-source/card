// src/lib/i18n.test.jsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LangProvider, useLang, STRINGS } from '@/lib/i18n';

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

describe('i18n t() interpolation', () => {
  it('substitutes {var} placeholders from the second argument', () => {
    const wrapper = ({ children }) => <LangProvider>{children}</LangProvider>;
    const { result } = renderHook(() => useLang(), { wrapper });
    // auth.deviceConflictBody is 'Сүүлд: {device} · {lastSeen} өмнө' in mn
    const out = result.current.t('auth.deviceConflictBody', { device: 'Chrome on Windows', lastSeen: '3 min' });
    expect(out).toBe('Сүүлд: Chrome on Windows · 3 min өмнө');
  });

  it('returns template unchanged when no vars provided', () => {
    const wrapper = ({ children }) => <LangProvider>{children}</LangProvider>;
    const { result } = renderHook(() => useLang(), { wrapper });
    const out = result.current.t('auth.deviceConflictBody');
    expect(out).toBe('Сүүлд: {device} · {lastSeen} өмнө');
  });

  it('returns key unchanged for unknown key', () => {
    const wrapper = ({ children }) => <LangProvider>{children}</LangProvider>;
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.t('does.not.exist')).toBe('does.not.exist');
  });
});
