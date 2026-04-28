// src/lib/i18n.test.jsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LangProvider, useLang } from '@/lib/i18n';

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
