// Supabase-backed replacement for the old localStorage auth store. Keeps the
// same exported signatures so OtpLogin.jsx and AdminPanel.jsx don't need to
// change call patterns (though several formerly-sync functions are now async).

import { supabase, usernameToEmail, emailToUsername } from '@/lib/supabase';

const BOOTSTRAP_CODE = 'ADMIN001';

// ---------------------------------------------------------------------------
// Bootstrap hint — returns ADMIN001 only if it hasn't been redeemed yet.
// ---------------------------------------------------------------------------

export const bootstrapCode = async () => {
  try {
    const { data } = await supabase.functions.invoke('check-code', {
      body: { code: BOOTSTRAP_CODE },
    });
    return data?.ok ? BOOTSTRAP_CODE : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Invite-code management (admin-facing, via edge functions)
// ---------------------------------------------------------------------------

export const listInviteCodes = async () => {
  const { data, error } = await supabase.functions.invoke('list-codes', { body: {} });
  if (error) throw error;
  return data?.codes ?? [];
};

export const createInviteCode = async ({ grants_admin = false } = {}) => {
  const { data, error } = await supabase.functions.invoke('generate-codes', {
    body: { count: 1, grants_admin },
  });
  if (error) throw error;
  return { code: data?.codes?.[0] };
};

export const deleteInviteCode = async (code) => {
  const { error } = await supabase.functions.invoke('delete-code', { body: { code } });
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const listAccounts = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, is_admin, created_at');
  if (error) return [];
  return data ?? [];
};

// ---------------------------------------------------------------------------
// Register / login
// ---------------------------------------------------------------------------

export const checkInviteCode = async (code) => {
  try {
    const { data, error } = await supabase.functions.invoke('check-code', { body: { code } });
    if (error) return { ok: false, reason: 'server' };
    return data;
  } catch {
    return { ok: false, reason: 'server' };
  }
};

export const registerWithCode = async ({ code, username, password }) => {
  try {
    const { data, error } = await supabase.functions.invoke('redeem-code', {
      body: { code, username, password },
    });
    if (error) return { ok: false, reason: 'server' };
    if (!data?.ok) return data ?? { ok: false, reason: 'server' };

    const { error: setErr } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setErr) return { ok: false, reason: 'session_failed' };

    return { ok: true, account: { username } };
  } catch {
    return { ok: false, reason: 'server' };
  }
};

export const login = async ({ username, password }) => {
  const email = usernameToEmail(username);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
      const { data: p } = await supabase
        .from('profiles').select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
      return { ok: false, reason: p ? 'bad_password' : 'not_found' };
    }
    return { ok: false, reason: 'server' };
  }
  return { ok: true, account: { username } };
};

// ---------------------------------------------------------------------------
// Session — synchronous snapshot read from the supabase-js localStorage token.
// Matches the old authStore's sync contract for consumers like OtpLogin.
// ---------------------------------------------------------------------------

export const currentSession = () => {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = parsed?.user ?? parsed?.currentSession?.user;
    if (!user) return null;
    return {
      account_id: user.id,
      username: user.user_metadata?.username ?? emailToUsername(user.email) ?? '',
      started_at: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
};

export const logout = async () => {
  await supabase.auth.signOut();
};
