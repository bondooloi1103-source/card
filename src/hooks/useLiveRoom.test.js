import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLiveRoom } from '@/hooks/useLiveRoom';

vi.mock('@/lib/liveRoomApi', () => ({ snapshot: vi.fn() }));

const channelHandlers = {};
const fakeChannel = {
  on: vi.fn((_type, _filter, cb) => { channelHandlers[_type] = cb; return fakeChannel; }),
  subscribe: vi.fn((cb) => { cb?.('SUBSCRIBED'); return fakeChannel; }),
  unsubscribe: vi.fn(),
  send: vi.fn(),
  track: vi.fn(),
  presenceState: vi.fn(() => ({})),
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => fakeChannel),
    removeChannel: vi.fn(),
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
  },
}));

import { snapshot } from '@/lib/liveRoomApi';

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(channelHandlers)) delete channelHandlers[k];
  snapshot.mockResolvedValue({
    session: { id: 's1', status: 'open' },
    participants: [],
  });
});

describe('useLiveRoom', () => {
  it('fetches snapshot on mount and returns session state', async () => {
    const { result } = renderHook(() => useLiveRoom('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.id).toBe('s1');
  });

  it('opens a private channel and authenticates Realtime', async () => {
    const { supabase } = await import('@/lib/supabase');
    const { result } = renderHook(() => useLiveRoom('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(supabase.realtime.setAuth).toHaveBeenCalled();
    expect(supabase.channel).toHaveBeenCalledWith(
      'game:session:s1',
      { config: { private: true } },
    );
  });

  it('applies lobby_update broadcasts to participants', async () => {
    const { result } = renderHook(() => useLiveRoom('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      channelHandlers.broadcast?.({
        event: 'lobby_update',
        payload: { players: [{ user_id: 'A', username: 'alpha' }], settings: {} },
      });
    });
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0].user_id).toBe('A');
  });
});
