// Supabase-backed replacement for the old localStorage auth store. Keeps the
// same exported signatures so OtpLogin.jsx and AdminPanel.jsx don't need to
// change call patterns (though several formerly-sync functions are now async).

import { supabase, usernameToEmail, emailToUsername } from '@/lib/supabase';
import {
  claimDeviceSession,
  clearStoredSessionId,
  stopHeartbeat,
} from '@/lib/deviceSession';

const BOOTSTRAP_CODE = 'ADMIN001';

// Module-scope cache of the parent's display name for the currently signed-in
// guest. Populated on login/register/claim; cleared on logout. Used by the
// in-game "+N XP → {parent}" banner.
let _parentDisplayName = null;

export const isGuest = () => {
  const s = currentSession();
  return !!s?.parent_user_id;
};

export const parentDisplayName = () => _parentDisplayName;

export const setParentDisplayName = (name) => {
  _parentDisplayName = name ?? null;
};

// Loads parent_username via the security-definer RPC. Returns null silently
// for non-guests or RPC failures (the banner just won't render).
export const refreshParentDisplayName = async () => {
  try {
    const { data, error } = await supabase.rpc('select_profile_with_parent');
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    _parentDisplayName = row?.parent_username ?? null;
    return _parentDisplayName;
  } catch {
    return null;
  }
};

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

    // Claim the device-session slot. New accounts won't conflict, but the row
    // still needs to exist so the heartbeat has something to update.
    const claim = await claimDeviceSession();
    if (claim?.ok === false && claim.blocked) {
      await supabase.auth.signOut();
      return {
        ok: false,
        reason: 'device_conflict',
        device_label: claim.device_label,
        last_seen: claim.last_seen,
      };
    }
    if (claim?.ok === false) {
      // Server error during claim: don't leave the user authenticated without a
      // device-session row (would lead to immediate heartbeat eviction or break
      // single-device enforcement).
      await supabase.auth.signOut();
      return { ok: false, reason: 'server' };
    }

    // Grant the starter pack on first registration (idempotent on the server side).
    try {
      await supabase.functions.invoke('grant-starter-pack', { body: {} });
    } catch (err) {
      console.warn('grant-starter-pack invoke failed (will retry next login)', err);
    }

    await refreshParentDisplayName();
    return { ok: true, account: { username } };
  } catch {
    return { ok: false, reason: 'server' };
  }
};

export const login = async ({ username, password, force = false }) => {
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

  const claim = await claimDeviceSession({ force });
  if (claim?.ok === false && claim.blocked) {
    await supabase.auth.signOut();
    return {
      ok: false,
      reason: 'device_conflict',
      device_label: claim.device_label,
      last_seen: claim.last_seen,
    };
  }
  if (claim?.ok === false) {
    // Server error during claim: don't leave the user authenticated without a
    // device-session row (would lead to immediate heartbeat eviction or break
    // single-device enforcement).
    await supabase.auth.signOut();
    return { ok: false, reason: 'server' };
  }

  // Grant the starter pack on first login (idempotent on the server side).
  try {
    await supabase.functions.invoke('grant-starter-pack', { body: {} });
  } catch (err) {
    console.warn('grant-starter-pack invoke failed (will retry next login)', err);
  }
  await refreshParentDisplayName();
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
      is_admin: !!user.app_metadata?.is_admin,
      parent_user_id: user.app_metadata?.parent_user_id ?? null,
      started_at: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
};

export const logout = async () => {
  clearStoredSessionId();
  stopHeartbeat();
  _parentDisplayName = null;
  await supabase.auth.signOut();
};
