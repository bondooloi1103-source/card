// src/lib/guestApi.js
// Thin wrappers over the 5 guest-account edge functions.
import { supabase } from './supabase';

async function call(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || 'invoke_failed');
  if (data?.ok === false) throw new Error(data.reason || 'unknown');
  return data;
}

export async function initGuestSlots() {
  return call('guest-init-slots', {});
}

export async function generateGuestToken(slot_idx) {
  return call('guest-generate-token', { slot_idx });
}

export async function claimGuestToken(token) {
  return call('guest-claim-token', { token });
}

export async function revokeGuestSlot(slot_idx) {
  return call('guest-revoke-slot', { slot_idx });
}

export async function listGuestSlots() {
  return call('guest-list-slots', {});
}
