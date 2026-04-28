// src/lib/deviceSession.js
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'mhh.device_session_id';
const HEARTBEAT_MS = 30_000;

let timer = null;
let onEvictedCallback = null;
let evicting = false;

export function getStoredSessionId() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function setStoredSessionId(id) {
  try { localStorage.setItem(SESSION_KEY, id); } catch { /* private mode */ }
}

export function clearStoredSessionId() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

export function onEvicted(cb) {
  onEvictedCallback = cb;
}

function buildDeviceLabel() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  return `${browser} on ${os}`;
}

export async function claimDeviceSession({ force = false } = {}) {
  const { data, error } = await supabase.functions.invoke('claim-session', {
    body: { device_label: buildDeviceLabel(), force },
  });
  if (error) return { ok: false, reason: 'server' };
  if (!data) return { ok: false, reason: 'server' };

  if (data.ok && !data.exempt) {
    setStoredSessionId(data.session_id);
    startHeartbeat();
  }
  return data;
}

export function startHeartbeat() {
  stopHeartbeat();
  timer = setInterval(tick, HEARTBEAT_MS);
}

export function stopHeartbeat() {
  if (timer) { clearInterval(timer); timer = null; }
}

async function tick() {
  if (evicting) return;
  const session_id = getStoredSessionId();
  if (!session_id) return;

  let result;
  try {
    result = await supabase.functions.invoke('session-heartbeat', {
      body: { session_id },
    });
  } catch {
    return; // network blip — try again next tick
  }
  const data = result?.data;
  if (!data) return;

  if (data.exempt) { stopHeartbeat(); return; }
  if (data.evicted) {
    evicting = true;
    stopHeartbeat();
    clearStoredSessionId();
    try { await supabase.auth.signOut(); } catch { /* best-effort */ }
    try { onEvictedCallback?.(); } finally { evicting = false; }
  }
}
