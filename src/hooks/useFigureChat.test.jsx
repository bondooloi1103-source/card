import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFigureChat } from '@/hooks/useFigureChat';

const mockFrom = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

vi.mock('@/lib/figureResponder', () => ({
  tryAnswer: () => null,
}));

const figure = {
  fig_id: 1, name: 'Чингис Хаан', yrs: '1162–1227',
  role: 'r', bio: 'b', achs: [], fact: 'f', quote: 'q', qattr: 'a',
};

beforeEach(() => {
  mockFrom.mockReset();
  mockInvoke.mockReset();
  sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

function chatRowQuery(messages) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: messages ? { messages } : null,
            error: null,
          }),
        }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe('useFigureChat — owned mode', () => {
  it('hydrates messages from card_chats when owned and userId present', async () => {
    const stored = [
      { role: 'user', text: 'hi', lang: 'mn', ts: 1 },
      { role: 'ai', text: 'sain uu', lang: 'mn', ts: 2 },
    ];
    const q = chatRowQuery(stored);
    mockFrom.mockReturnValue(q);

    const { result } = renderHook(() =>
      useFigureChat(figure, { userId: 'u1', owned: true }),
    );
    await waitFor(() => expect(result.current.messages).toEqual(stored));
  });

  it('writes upsert to card_chats after a send (debounced)', async () => {
    vi.useFakeTimers();
    const q = chatRowQuery(null);
    mockFrom.mockReturnValue(q);
    mockInvoke.mockResolvedValue({ data: { ok: true, reply: 'r', source: 'edge' }, error: null });

    const { result } = renderHook(() =>
      useFigureChat(figure, { userId: 'u1', owned: true }),
    );
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.send('hi'); });
    await act(async () => { vi.advanceTimersByTime(600); await Promise.resolve(); });

    expect(q.upsert).toHaveBeenCalled();
    const upsertArgs = q.upsert.mock.calls[q.upsert.mock.calls.length - 1][0];
    expect(upsertArgs.user_id).toBe('u1');
    expect(upsertArgs.fig_id).toBe(1);
    expect(Array.isArray(upsertArgs.messages)).toBe(true);
  });
});

describe('useFigureChat — anonymous fallback', () => {
  it('uses sessionStorage when owned=false', async () => {
    const { result } = renderHook(() => useFigureChat(figure, { userId: null, owned: false }));
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0));
    expect(mockFrom).not.toHaveBeenCalled();
    const stored = sessionStorage.getItem('figureChat:1');
    expect(stored).toBeTruthy();
  });
});
