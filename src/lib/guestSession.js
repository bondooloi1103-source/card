// src/lib/guestSession.js
// Guest claim flow: hand the parent-shared token to guest-claim-token,
// install the returned session, and start the existing single-device heartbeat.
import { claimGuestToken } from './guestApi';
import { supabase } from './supabase';
import { setStoredSessionId, startHeartbeat } from './deviceSession';
import { setParentDisplayName } from './authStore';

export async function claimGuestSession(rawToken) {
  const r = await claimGuestToken(rawToken);
  const { error } = await supabase.auth.setSession({
    access_token: r.access_token,
    refresh_token: r.refresh_token,
  });
  if (error) throw error;
  setStoredSessionId(r.session_id);
  setParentDisplayName(r.parent_username);
  startHeartbeat();
  return { parent_username: r.parent_username, guest_username: r.guest_username };
}
