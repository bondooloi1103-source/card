import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSetSession = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a) => mockSignInWithPassword(...a),
      setSession: (...a) => mockSetSession(...a),
      signOut: () => Promise.resolve({}),
    },
    functions: { invoke: (...a) => mockInvoke(...a) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
  usernameToEmail: (u) => `${u}@app.local`,
  emailToUsername: (e) => e.split('@')[0],
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockSignInWithPassword.mockReset();
  mockSetSession.mockReset();
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('authStore.login', () => {
  it('invokes grant-starter-pack after successful login', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    });
    // grant-starter-pack is the only invoke call in the happy path
    mockInvoke.mockResolvedValue({ data: { ok: true, granted: true }, error: null });

    const { login } = await import('@/lib/authStore');
    const res = await login({ username: 'testuser', password: 'pass123' });

    expect(res.ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('grant-starter-pack', { body: {} });
  });

  it('does not invoke grant-starter-pack when login fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    // from().select().eq().maybeSingle() returns null (user not found) by default mock

    const { login } = await import('@/lib/authStore');
    await login({ username: 'nouser', password: 'wrong' });

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// registerWithCode
// ---------------------------------------------------------------------------

describe('authStore.registerWithCode', () => {
  it('invokes grant-starter-pack after successful registration', async () => {
    // redeem-code returns a session
    mockInvoke.mockImplementation((fn) => {
      if (fn === 'redeem-code') {
        return Promise.resolve({
          data: {
            ok: true,
            session: { access_token: 'tok', refresh_token: 'ref' },
          },
          error: null,
        });
      }
      // grant-starter-pack
      return Promise.resolve({ data: { ok: true, granted: true }, error: null });
    });
    mockSetSession.mockResolvedValue({ error: null });

    const { registerWithCode } = await import('@/lib/authStore');
    const res = await registerWithCode({ code: 'CODE1', username: 'newuser', password: 'pw' });

    expect(res.ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('grant-starter-pack', { body: {} });
  });

  it('does not invoke grant-starter-pack when redeem-code fails', async () => {
    mockInvoke.mockImplementation((fn) => {
      if (fn === 'redeem-code') {
        return Promise.resolve({ data: null, error: { message: 'bad code' } });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    });

    const { registerWithCode } = await import('@/lib/authStore');
    const res = await registerWithCode({ code: 'BAD', username: 'x', password: 'y' });

    expect(res.ok).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith('grant-starter-pack', expect.anything());
  });

  it('does not invoke grant-starter-pack when setSession fails', async () => {
    mockInvoke.mockImplementation((fn) => {
      if (fn === 'redeem-code') {
        return Promise.resolve({
          data: {
            ok: true,
            session: { access_token: 'tok', refresh_token: 'ref' },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    mockSetSession.mockResolvedValue({ error: { message: 'session error' } });

    const { registerWithCode } = await import('@/lib/authStore');
    const res = await registerWithCode({ code: 'CODE1', username: 'newuser', password: 'pw' });

    expect(res.ok).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith('grant-starter-pack', expect.anything());
  });
});
