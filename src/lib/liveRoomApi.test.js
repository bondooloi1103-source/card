import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snapshot, sendEvent, joinRoom, startRoom, submitAnswer, requestRematch,
} from '@/lib/liveRoomApi';

vi.mock('@/lib/supabase', () => {
  const invoke = vi.fn();
  return { supabase: { functions: { invoke } } };
});

import { supabase } from '@/lib/supabase';

beforeEach(() => { vi.clearAllMocks(); });

describe('snapshot', () => {
  it('accepts a session_id string', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, session: { id: 's1' }, participants: [] }, error: null });
    const res = await snapshot('s1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-snapshot', { body: { session_id: 's1' } });
    expect(res.session.id).toBe('s1');
  });

  it('accepts a joinCode keyed arg', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, session: { id: 's1' }, participants: [] }, error: null });
    await snapshot({ joinCode: 'ABCDEF' });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-snapshot', {
      body: { session_id: null, join_code: 'ABCDEF' },
    });
  });

  it('throws on ok:false', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, reason: 'forbidden' }, error: null });
    await expect(snapshot('s1')).rejects.toThrow('forbidden');
  });
});

describe('sendEvent', () => {
  it('posts to game-live-event', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await sendEvent('s1', 'join', {});
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'join', payload: {} },
    });
  });
});

describe('submitAnswer', () => {
  it('posts answer event with pickedFigId', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, correct: true }, error: null });
    const res = await submitAnswer({ session_id: 's1', pickedFigId: 17 });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'answer', payload: { pickedFigId: 17 } },
    });
    expect(res.correct).toBe(true);
  });

  it('sends timeout_null when pickedFigId is null', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await submitAnswer({ session_id: 's1', pickedFigId: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'timeout_null', payload: {} },
    });
  });
});

describe('requestRematch', () => {
  it('returns new_session_id on success', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, new_session_id: 's2', new_join_code: 'XYZABC' },
      error: null,
    });
    const res = await requestRematch('s1');
    expect(res).toEqual({ new_session_id: 's2', new_join_code: 'XYZABC' });
  });

  it('returns winner info on duplicate_rematch', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, reason: 'duplicate_rematch', new_session_id: 's2', new_join_code: 'XYZABC' },
      error: null,
    });
    const res = await requestRematch('s1');
    expect(res).toEqual({ new_session_id: 's2', new_join_code: 'XYZABC' });
  });
});
