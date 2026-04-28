// src/lib/deviceSession.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Node.js 22+ ships a built-in `localStorage` backed by a file that shadows
// jsdom's Storage implementation. Install a real in-memory Storage so that
// `localStorage.clear/setItem/getItem/removeItem` all work in every env.
(function installStorage() {
  const store = new Map();
  const impl = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
  // Expose on every global reference that tests might use.
  try { Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true }); } catch { /* already defined */ }
  try { Object.defineProperty(globalThis, 'sessionStorage', { value: impl, configurable: true, writable: true }); } catch { /* already defined */ }
  // Also set on window so window.localStorage === localStorage.
  if (typeof window !== 'undefined' && window !== globalThis) {
    try { Object.defineProperty(window, 'localStorage', { value: impl, configurable: true, writable: true }); } catch { /* already defined */ }
  }
})();

const mockInvoke = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: (...a) => mockSignOut(...a) },
    functions: { invoke: (...a) => mockInvoke(...a) },
  },
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockSignOut.mockReset();
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deviceSession.claimDeviceSession', () => {
  it('stores session_id when claim succeeds (non-exempt)', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { ok: true, exempt: false, session_id: 'sid-1' },
      error: null,
    });
    const mod = await import('@/lib/deviceSession');
    const res = await mod.claimDeviceSession();
    expect(res).toEqual({ ok: true, exempt: false, session_id: 'sid-1' });
    expect(localStorage.getItem('mhh.device_session_id')).toBe('sid-1');
    mod.stopHeartbeat();
  });

  it('does not store session_id when admin is exempt', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { ok: true, exempt: true },
      error: null,
    });
    const mod = await import('@/lib/deviceSession');
    const res = await mod.claimDeviceSession();
    expect(res).toEqual({ ok: true, exempt: true });
    expect(localStorage.getItem('mhh.device_session_id')).toBeNull();
    mod.stopHeartbeat();
  });

  it('returns blocked payload without storing on conflict', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { ok: false, blocked: true, device_label: 'Chrome', last_seen: '2026-04-28T00:00:00Z' },
      error: null,
    });
    const mod = await import('@/lib/deviceSession');
    const res = await mod.claimDeviceSession();
    expect(res).toEqual({
      ok: false, blocked: true, device_label: 'Chrome', last_seen: '2026-04-28T00:00:00Z',
    });
    expect(localStorage.getItem('mhh.device_session_id')).toBeNull();
  });
});

describe('deviceSession heartbeat', () => {
  it('fires heartbeat on interval and on evicted callback signs out', async () => {
    vi.useFakeTimers();
    localStorage.setItem('mhh.device_session_id', 'sid-1');
    mockInvoke.mockResolvedValue({ data: { ok: false, evicted: true }, error: null });
    mockSignOut.mockResolvedValue({});

    const mod = await import('@/lib/deviceSession');
    const onEvicted = vi.fn();
    mod.onEvicted(onEvicted);
    mod.startHeartbeat();

    await vi.advanceTimersByTimeAsync(30_000);
    // Allow microtasks queued by the heartbeat tick to settle.
    await vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledWith('session-heartbeat', {
      body: { session_id: 'sid-1' },
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(localStorage.getItem('mhh.device_session_id')).toBeNull();
    expect(onEvicted).toHaveBeenCalledTimes(1);

    mod.stopHeartbeat();
  });

  it('exempt response stops the heartbeat without signing out', async () => {
    vi.useFakeTimers();
    localStorage.setItem('mhh.device_session_id', 'sid-1');
    mockInvoke.mockResolvedValue({ data: { ok: true, exempt: true }, error: null });

    const mod = await import('@/lib/deviceSession');
    const onEvicted = vi.fn();
    mod.onEvicted(onEvicted);
    mod.startHeartbeat();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(onEvicted).not.toHaveBeenCalled();
    expect(localStorage.getItem('mhh.device_session_id')).toBe('sid-1');

    // After exempt response, additional ticks should not call invoke again.
    mockInvoke.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockInvoke).not.toHaveBeenCalled();

    mod.stopHeartbeat();
  });

  it('clearStoredSessionId removes localStorage entry', async () => {
    localStorage.setItem('mhh.device_session_id', 'sid-1');
    const mod = await import('@/lib/deviceSession');
    mod.clearStoredSessionId();
    expect(localStorage.getItem('mhh.device_session_id')).toBeNull();
  });
});
