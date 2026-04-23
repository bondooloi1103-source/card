# Supabase Backend Migration — Design

**Date:** 2026-04-23
**Status:** Draft — awaiting user review

## Purpose

Replace the localStorage stub at `src/api/base44Client.js` with a real backend on Supabase: Postgres for data, Supabase Auth for admin login, a custom access-code flow for end users, and Supabase Storage for figure images.

## Scope

- Data layer: `Figure`, `Collection`, `AppSettings` entities → Postgres tables.
- Auth: admins use email + password; end users redeem single-use access codes issued by admins.
- File storage: figure images (`front_img`, `back_img`) move to a Supabase Storage bucket.
- Seed: 52 figures loaded via SQL migration from the existing `src/lib/figuresData.js`.

**Out of scope:**
- Real LLM integration (the `InvokeLLM` stub stays as-is; returns the existing "unavailable" message).
- Migrating any data currently in users' `localStorage` (this app has no production users; we start clean).
- Deployment / hosting decisions (env vars are documented, actual deploy is a follow-up).

## Approach

**Approach 1 — drop-in replacement.** Keep the `base44.entities.X` and `base44.auth.X` interface. Rewrite the internals of `src/api/base44Client.js` so those same methods hit Supabase. The 40+ components that already call `Figure.list()`, `base44.auth.me()`, etc. keep working unchanged. This minimizes blast radius; renaming `base44` → `api` later is a mechanical codemod.

## Architecture

### Supabase project resources

**Tables** (all under `public` schema):

- `figures` — one row per historical figure, mirrors `Figure.jsonc` schema.
- `collections` — one row per user, holds that user's saved `fig_ids` and `earned_at` map.
- `app_settings` — key/value pairs for site-wide config.
- `access_codes` — admin-issued redemption codes.
- `profiles` — one row per auth user, holds display name and admin flag.

**Auth:**
- Admins: standard Supabase email + password. `profiles.is_admin = true` set manually by the first admin or via SQL.
- End users: redeem an access code via the `redeem-code` Edge Function. The function creates a Supabase auth user on first redemption and returns a session for that user on every subsequent redemption of the same code.

**Storage:**
- Bucket `figure-images`, public read, admin-only write (enforced via storage policies).
- `UploadFile` in `base44Client.js` maps to `supabase.storage.from('figure-images').upload(...)` and returns the public URL.

**Edge Functions:**
- `redeem-code` — accepts `{ code }`, validates it, and returns a Supabase session. Uses the service-role key server-side to create/link auth users and bypass RLS on `access_codes`. Session minting strategy: on every redemption, rotate the user's auth password to a fresh random string via `supabase.auth.admin.updateUserById`, then call `signInWithPassword` server-side with that string, and return the resulting session to the client. This avoids needing the project JWT secret and uses only documented admin APIs. Users created for codes have a synthetic email `code-<code>@codes.local` (never emailed, never user-visible).
- `generate-codes` — admin-only. Inserts N random codes into `access_codes`. Capped at 500 codes per call to prevent runaway generation.

### Data model

```sql
create table figures (
  id uuid primary key default gen_random_uuid(),
  fig_id integer unique not null check (fig_id between 1 and 999),
  cat text not null check (cat in ('khans','queens','warriors','political','cultural')),
  ico text,
  card text,
  name text not null,
  yrs text,
  role text,
  bio text,
  achs text[] default '{}',
  fact text,
  quote text,
  qattr text,
  rel integer[] default '{}',
  front_img text,
  back_img text,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  fig_ids integer[] default '{}',
  earned_at jsonb default '{}'::jsonb,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table access_codes (
  code text primary key,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);
```

**Notes:**
- `collections.user_id` replaces `Collection.user_email` from the old schema — we key on auth UID now.
- `access_codes.code` is the primary key. `redeemed_by` being non-null means the code is claimed; re-entering the code as that same user just restores their session.
- `updated_date` maintained by a trigger on each table.

### RLS policies

Admin flag lives in `auth.users.raw_app_meta_data.is_admin` so it ends up in the JWT automatically. Policies check it via `(auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true`. `profiles.is_admin` is a mirror for easy querying; the JWT claim is the source of truth for RLS.

- `figures`, `app_settings`: `select` public; `insert/update/delete` only when the JWT claim `is_admin` is true.
- `collections`: `select/insert/update/delete` only where `user_id = auth.uid()`.
- `access_codes`: no client access at all. Only Edge Functions (service-role) read/write.
- `profiles`: `select` self; `update` self (cannot change `is_admin`); `insert` handled by a trigger on `auth.users` that mirrors the `app_metadata.is_admin` value.

### Client interface (unchanged surface)

`src/api/base44Client.js` exports the same `base44` object with the same method names. Internally:

- `base44.entities.Figure.list(sort, limit)` → `supabase.from('figures').select('*').order(...).limit(...)`
- `base44.entities.Figure.filter(query, sort, limit)` → same with `.eq()` per query key
- `base44.entities.Figure.create/update/delete` → Supabase equivalents
- `base44.entities.Collection.*` — reads/writes scoped to current user via RLS
- `base44.auth.me()` → wraps `supabase.auth.getUser()` and merges in `profiles` row (so `role: 'admin'` keeps working)
- `base44.auth.logout()` → `supabase.auth.signOut()`
- `base44.auth.redirectToLogin(returnTo)` → pushes to `/login?return=<returnTo>`
- `base44.integrations.Core.UploadFile({ file })` → Storage upload, returns `{ file_url }`
- `base44.integrations.Core.InvokeLLM(...)` — **unchanged stub**, still returns the "unavailable" message
- `base44.entities.X.subscribe(cb)` → Supabase Realtime channel subscription (keeps the current signature)

The Proxy-based entity accessor stays: any `base44.entities.<AnyName>` returns a CRUD wrapper. Unknown entity names map to non-existent tables and fail at query time with a clear error — same developer experience as today.

### Access-code flow

**Admin side** (in `AdminPanel`):
1. Admin clicks "Generate codes" and enters a count (1–500).
2. Client calls the `generate-codes` Edge Function. Function verifies the caller's JWT carries `app_metadata.is_admin = true`; rejects otherwise.
3. Function inserts N fresh random codes (8-char URL-safe base32, rejected and re-rolled on unique-constraint collision) into `access_codes` with `created_by = caller_id`.
4. Admin sees and copies codes from the admin panel.

**Code semantics:** each code is *single-redemption* in the sense that the first successful redemption creates and claims the account. Re-entering the *same* code on another device does not create a second user — it re-authenticates the already-claimed user. This makes the code a permanent login credential, not a one-time token.

**User side** (rewired `OtpLogin` page):
1. User types code → submit.
2. Client calls `redeem-code` Edge Function with `{ code }`.
3. Function looks up the code:
   - Not found → 404 error.
   - Found, never redeemed → create auth user, set `redeemed_by = new_user.id`, `redeemed_at = now()`, return a session.
   - Found, already redeemed → return a session for `redeemed_by`.
4. Client calls `supabase.auth.setSession(session)` and navigates into the app.
5. A `profiles` row is created by a DB trigger on `auth.users` insert.

This makes the code behave like a permanent login credential for that user. There is no email/phone on file unless the user adds one later via a profile screen (out of scope for this migration).

### Seed data

A SQL migration (`supabase/migrations/<timestamp>_seed_figures.sql`) inserts all 52 figures from `src/lib/figuresData.js`. After the migration, `figuresData.js` is deleted and any remaining imports are rewired to `Figure.list()`.

Default `app_settings` rows (site name, logo, etc.) are inserted in the same migration.

### Environment

Client:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge Functions:
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `SUPABASE_URL`

A `.env.example` file documents both. `.env` is gitignored.

## Error handling

- Network / Supabase errors surface with the existing toast patterns (already wired via `sonner` / `react-hot-toast`). No new global error boundary.
- `redeem-code` returns structured errors (`{ error: 'invalid' | 'rate_limited' | 'server' }`) and the `OtpLogin` page maps each to a Mongolian-language message.
- RLS denials surface as standard Supabase errors; existing `try/catch` sites already handle generic errors.

## Testing

- Manual: run the existing dev flow end-to-end — generate a code as admin, redeem as user, save a figure to Collection, verify RLS blocks cross-user reads.
- SQL: schema + RLS policies verified by writing a small set of Postgres `assert` statements in a `tests/rls_smoke.sql` file that's runnable via `supabase db test`.
- No new unit-test framework added in this PR (the project has no existing tests; adding one is a separate decision).

## Rollout

Single PR. Since there's no production data and no prior git history, this is a clean cutover. Steps:

1. Create a Supabase project (user does this manually; document in README).
2. Apply migrations + seed.
3. Deploy Edge Functions.
4. Ship the `src/api/base44Client.js` rewrite + `OtpLogin` rewire + `AdminPanel` code generator + env vars.
5. Delete `src/lib/figuresData.js`, delete the `base44/entities/*.jsonc` files (superseded by SQL migrations), delete LLM/`UploadFile` stubs from `base44Client.js` except the LLM "unavailable" message.

## Open questions resolved

- **Scope:** everything (data + auth + storage). Confirmed.
- **Auth:** admin email+password, end-user single-use admin-issued codes (not tied to email/phone). Confirmed.
- **Code behavior:** re-entering a used code logs in the same user (persistent account). Assumption, accepted.
- **Figures in DB, not in code:** accepted.
