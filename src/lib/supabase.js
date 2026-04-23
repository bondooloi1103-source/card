import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Supabase env vars missing. Copy .env.example to .env and fill in values.');
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const usernameToEmail = (username) => `${username.trim().toLowerCase()}@users.local`;
export const emailToUsername = (email) => email?.replace(/@users\.local$/, '') || null;
