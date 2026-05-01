// supabase/functions/_shared/assertActiveSession.ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export class SessionRevokedError extends Error {
  constructor() { super('session_revoked'); }
}

/**
 * Asserts the caller's JWT corresponds to a fresh active_sessions row whose
 * session_id matches what the client claims via X-Session-Id. Admins bypass
 * the check based on a DB-side is_admin lookup (NOT JWT-derived) so a demoted
 * admin's stale JWT loses the bypass on the next request.
 *
 * Throws SessionRevokedError on mismatch / missing.
 */
export async function assertActiveSession(
  admin: SupabaseClient,
  userId: string,
  providedSessionId: string | null,
): Promise<void> {
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.is_admin) return;

  if (!providedSessionId) throw new SessionRevokedError();
  const { data } = await admin
    .from('active_sessions')
    .select('session_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || data.session_id !== providedSessionId) {
    throw new SessionRevokedError();
  }
}
