// src/lib/guestApi.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initGuestSlots,
  generateGuestToken,
  claimGuestToken,
  revokeGuestSlot,
  listGuestSlots,
} from '@/lib/guestApi';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '@/lib/supabase';

beforeEach(() => vi.clearAllMocks());

describe('initGuestSlots', () => {
  it('invokes guest-init-slots with empty body', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await initGuestSlots();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('guest-init-slots', { body: {} });
  });

  it('throws on ok:false', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, reason: 'guests_cannot_init' }, error: null });
    await expect(initGuestSlots()).rejects.toThrow('guests_cannot_init');
  });
});

describe('generateGuestToken', () => {
  it('invokes guest-generate-token with slot_idx and returns url+expires_at', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, url: 'https://x/guest/join?token=abc', expires_at: '2030-01-01T00:00:00Z' },
      error: null,
    });
    const r = await generateGuestToken(2);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('guest-generate-token', { body: { slot_idx: 2 } });
    expect(r.url).toMatch(/\?token=/);
  });

  it('throws on rate_limited', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, reason: 'rate_limited' }, error: null });
    await expect(generateGuestToken(2)).rejects.toThrow('rate_limited');
  });
});

describe('claimGuestToken', () => {
  it('invokes guest-claim-token and returns access/refresh + session_id', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        access_token: 'a',
        refresh_token: 'r',
        session_id: 'sid',
        parent_username: 'p',
        guest_username: 'g',
      },
      error: null,
    });
    const r = await claimGuestToken('rawtok');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('guest-claim-token', { body: { token: 'rawtok' } });
    expect(r.access_token).toBe('a');
    expect(r.session_id).toBe('sid');
  });

  it('throws expired_or_invalid on bad token', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, reason: 'expired_or_invalid' }, error: null });
    await expect(claimGuestToken('bad')).rejects.toThrow('expired_or_invalid');
  });
});

describe('revokeGuestSlot', () => {
  it('invokes guest-revoke-slot with slot_idx', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await revokeGuestSlot(3);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('guest-revoke-slot', { body: { slot_idx: 3 } });
  });
});

describe('listGuestSlots', () => {
  it('invokes guest-list-slots and returns slots[]', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        slots: [
          { slot_idx: 1, auth_user_id: null, display_name: null, claimed_at: null, online: false },
        ],
      },
      error: null,
    });
    const r = await listGuestSlots();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('guest-list-slots', { body: {} });
    expect(r.slots).toHaveLength(1);
  });
});
