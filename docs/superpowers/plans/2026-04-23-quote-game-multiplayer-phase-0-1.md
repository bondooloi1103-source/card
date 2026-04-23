# Quote Game Multiplayer — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 0 (foundation: seeded round generation, game tables, RLS, Edge Functions, leaderboard views, duel-expiry cron) and Phase 1 (async duels, duel summary, global leaderboard) from `docs/superpowers/specs/2026-04-23-quote-game-multiplayer-design.md`. Phase 2 (live rooms) and Phase 3 (tournaments) are intentionally excluded — they will each get their own plan.

**Architecture:** Solo game `GameQuoteGuess.jsx` gets refactored to pull its RNG seed from a session row. Async duels reuse that seed so both players see the identical round. Score verification happens server-side in a Deno Edge Function that re-computes the round from the stored seed; the client never writes `game_results` directly. Leaderboard is a Postgres view over `game_results` joined to `profiles`.

**Tech Stack:** React 18 + Vite + Vitest, Supabase (Postgres 15, Auth, Edge Functions on Deno), `@supabase/supabase-js` 2.104, Tailwind, existing ornament components.

---

## File structure

**Create:**
- `src/lib/seededRound.js` — deterministic mulberry32 PRNG + `buildRound(pool, allFigures, lang, size, seedString)`
- `src/lib/seededRound.test.js`
- `src/lib/gameApi.js` — thin wrapper over Supabase client for sessions/results/leaderboards
- `src/lib/gameApi.test.js`
- `src/pages/DuelIntro.jsx`
- `src/pages/DuelIntro.test.jsx`
- `src/pages/DuelSummary.jsx`
- `src/pages/DuelSummary.test.jsx`
- `src/pages/Leaderboard.jsx`
- `src/pages/Leaderboard.test.jsx`
- `supabase/functions/_shared/seededRound.ts` — Deno twin of `seededRound.js`
- `supabase/functions/_shared/seededRound.test.ts`
- `supabase/functions/game-create-session/index.ts`
- `supabase/functions/game-submit-result/index.ts`
- `supabase/migrations/20260424000000_game_tables.sql`
- `supabase/migrations/20260424000100_game_rls.sql`
- `supabase/migrations/20260424000200_game_jobs.sql` — `expire_open_duels` pg_cron only; other jobs deferred to later plans
- `supabase/migrations/20260424000300_game_leaderboard_views.sql`

**Modify:**
- `vitest.config.js` — include `*.test.jsx`, add `jsdom` env for component tests
- `package.json` / `package-lock.json` — add `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as devDeps
- `src/pages/GameQuoteGuess.jsx` — replace `Math.random()` with `seededRound`, accept `?session=<id>` query param, add "Challenge a friend" CTA
- `src/lib/i18n.jsx` — add new `game.*`, `duel.*`, `leaderboard.*` keys in both locales
- `src/components/Navbar.jsx` — add Leaderboard link (authenticated only)
- `src/App.jsx` — register `/duel/:id`, `/duel/:id/summary`, `/leaderboard` routes
- `supabase/tests/rls_smoke.sql` — add coverage for the 4 new tables
- `README.md` — add the two new Edge Functions to the deploy command list

---

## Task 0: Set up UI testing infrastructure

**Files:**
- Modify: `vitest.config.js`
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D jsdom@^25.0.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.5.0 @testing-library/user-event@^14.5.0
```

Expected: `package.json` gets four new entries under `devDependencies`, `package-lock.json` updated.

- [ ] **Step 2: Expand `vitest.config.js`**

Replace the file contents with:

```javascript
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 3: Create the test setup file**

Create `src/test/setup.js`:

```javascript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Verify the test runner boots**

Run:
```bash
npm test -- --run
```

Expected: either "No test files found" or the suite runs. No config errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/test/setup.js
git commit -m "test: enable jsdom + testing-library for component tests"
```

---

## Task 1: Seeded round generation (client)

**Files:**
- Create: `src/lib/seededRound.js`
- Create: `src/lib/seededRound.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/seededRound.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildRoundFromSeed, hashSeed, mulberry32 } from '@/lib/seededRound';

const FIXTURE_FIGURES = [
  { fig_id: 1, cat: 'khan',   name_en: 'A', name_mn: 'А', quote_en: 'quote A', quote_mn: 'ишлэл А' },
  { fig_id: 2, cat: 'khan',   name_en: 'B', name_mn: 'Б', quote_en: 'quote B', quote_mn: 'ишлэл Б' },
  { fig_id: 3, cat: 'khan',   name_en: 'C', name_mn: 'В', quote_en: 'quote C', quote_mn: 'ишлэл В' },
  { fig_id: 4, cat: 'khan',   name_en: 'D', name_mn: 'Г', quote_en: 'quote D', quote_mn: 'ишлэл Г' },
  { fig_id: 5, cat: 'khan',   name_en: 'E', name_mn: 'Д', quote_en: 'quote E', quote_mn: 'ишлэл Д' },
  { fig_id: 6, cat: 'warrior',name_en: 'F', name_mn: 'Е', quote_en: 'quote F', quote_mn: 'ишлэл Е' },
  { fig_id: 7, cat: 'warrior',name_en: 'G', name_mn: 'Ё', quote_en: 'quote G', quote_mn: 'ишлэл Ё' },
];

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const sa = [a(), a(), a(), a()];
    const sb = [b(), b(), b(), b()];
    expect(sa).toEqual(sb);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});

describe('hashSeed', () => {
  it('returns a 32-bit integer', () => {
    const h = hashSeed('GQ7K4R2A9M');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('is deterministic for the same input', () => {
    expect(hashSeed('ABC')).toBe(hashSeed('ABC'));
  });
});

describe('buildRoundFromSeed', () => {
  it('produces byte-identical output for the same (seed, lang, size, fixtures)', () => {
    const r1 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    const r2 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    expect(r1).toEqual(r2);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('produces a different round for a different seed', () => {
    const r1 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    const r2 = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED002');
    expect(r1).not.toEqual(r2);
  });

  it('respects round size (capped at pool size)', () => {
    const r = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 5, 'SEED001');
    expect(r).toHaveLength(5);
    expect(new Set(r.map(q => q.figId)).size).toBe(5); // unique figures
  });

  it('each question has 4 options including the correct one', () => {
    const r = buildRoundFromSeed(FIXTURE_FIGURES, 'en', 3, 'SEED001');
    for (const q of r) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.correct);
    }
  });

  it('skips figures without a quote in the active locale', () => {
    const figs = [
      ...FIXTURE_FIGURES,
      { fig_id: 99, cat: 'khan', name_en: 'Mute', name_mn: 'Чимээгүй' /* no quotes */ },
    ];
    const r = buildRoundFromSeed(figs, 'en', 10, 'SEED001');
    expect(r.every(q => q.figId !== 99)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/seededRound.test.js`
Expected: FAIL — "Cannot find module '@/lib/seededRound'".

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/seededRound.js`:

```javascript
// mulberry32 — tiny deterministic 32-bit PRNG.
// Same seed -> same sequence, in Node and in browsers.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

// FNV-1a 32-bit hash of a string -> unsigned 32-bit integer.
export function hashSeed(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffleWith(rand, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function quoteFor(figure, lang) {
  if (lang === 'en') {
    return { quote: figure.quote_en ?? null, qattr: figure.qattr_en ?? null };
  }
  return { quote: figure.quote_mn ?? null, qattr: figure.qattr_mn ?? null };
}

function nameFor(figure, lang) {
  return lang === 'en' ? (figure.name_en ?? figure.name_mn) : (figure.name_mn ?? figure.name_en);
}

/**
 * Build a deterministic round. Same (pool, lang, size, seedString) -> identical output.
 * Filters out figures without a quote in the active locale.
 */
export function buildRoundFromSeed(allFigures, lang, size, seedString) {
  const rand = mulberry32(hashSeed(seedString));
  const pool = allFigures
    .map((f) => {
      const { quote, qattr } = quoteFor(f, lang);
      return quote ? { figure: f, quote, qattr } : null;
    })
    .filter(Boolean);

  const sampled = shuffleWith(rand, pool).slice(0, Math.min(size, pool.length));

  return sampled.map(({ figure, quote, qattr }) => {
    const sameCat = allFigures.filter(
      (f) => f.cat === figure.cat && f.fig_id !== figure.fig_id,
    );
    const wrongPool = sameCat.length >= 3
      ? sameCat
      : allFigures.filter((f) => f.fig_id !== figure.fig_id);
    const wrongs = shuffleWith(rand, wrongPool).slice(0, 3).map((f) => nameFor(f, lang));
    const correct = nameFor(figure, lang);
    return {
      figId: figure.fig_id,
      quote,
      qattr,
      correct,
      options: shuffleWith(rand, [correct, ...wrongs]),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run src/lib/seededRound.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seededRound.js src/lib/seededRound.test.js
git commit -m "feat(game): deterministic seeded round generation"
```

---

## Task 2: Seeded round generation (Deno twin for Edge Functions)

**Files:**
- Create: `supabase/functions/_shared/seededRound.ts`
- Create: `supabase/functions/_shared/seededRound.test.ts`

Rationale: Edge Functions run under Deno and can't import from `src/`. The TS port uses the exact same algorithm so client and server produce byte-identical rounds for the same seed.

- [ ] **Step 1: Create the Deno test**

Create `supabase/functions/_shared/seededRound.test.ts`:

```typescript
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildRoundFromSeed, hashSeed, mulberry32 } from './seededRound.ts';

const F = [
  { fig_id: 1, cat: 'khan',    name_en: 'A', name_mn: 'А', quote_en: 'a', quote_mn: 'а' },
  { fig_id: 2, cat: 'khan',    name_en: 'B', name_mn: 'Б', quote_en: 'b', quote_mn: 'б' },
  { fig_id: 3, cat: 'khan',    name_en: 'C', name_mn: 'В', quote_en: 'c', quote_mn: 'в' },
  { fig_id: 4, cat: 'khan',    name_en: 'D', name_mn: 'Г', quote_en: 'd', quote_mn: 'г' },
  { fig_id: 5, cat: 'khan',    name_en: 'E', name_mn: 'Д', quote_en: 'e', quote_mn: 'д' },
  { fig_id: 6, cat: 'warrior', name_en: 'F', name_mn: 'Е', quote_en: 'f', quote_mn: 'е' },
  { fig_id: 7, cat: 'warrior', name_en: 'G', name_mn: 'Ё', quote_en: 'g', quote_mn: 'ё' },
];

Deno.test('hashSeed is deterministic', () => {
  assertEquals(hashSeed('ABC'), hashSeed('ABC'));
});

Deno.test('mulberry32 is deterministic', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assertEquals([a(), a(), a()], [b(), b(), b()]);
});

Deno.test('buildRoundFromSeed is deterministic', () => {
  const r1 = buildRoundFromSeed(F, 'en', 3, 'SEED001');
  const r2 = buildRoundFromSeed(F, 'en', 3, 'SEED001');
  assertEquals(r1, r2);
});

Deno.test('round size respected and each question has 4 options', () => {
  const r = buildRoundFromSeed(F, 'en', 5, 'SEED001');
  assertEquals(r.length, 5);
  for (const q of r) {
    assertEquals(q.options.length, 4);
    assert(q.options.includes(q.correct));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-read supabase/functions/_shared/seededRound.test.ts`
Expected: FAIL — "Module not found ./seededRound.ts".

- [ ] **Step 3: Create the Deno module**

Create `supabase/functions/_shared/seededRound.ts`:

```typescript
export interface Figure {
  fig_id: number;
  cat: string;
  name_en?: string;
  name_mn?: string;
  quote_en?: string | null;
  quote_mn?: string | null;
  qattr_en?: string | null;
  qattr_mn?: string | null;
}

export interface RoundQuestion {
  figId: number;
  quote: string;
  qattr: string | null;
  correct: string;
  options: string[];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

export function hashSeed(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffleWith<T>(rand: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function quoteFor(f: Figure, lang: 'mn' | 'en') {
  if (lang === 'en') return { quote: f.quote_en ?? null, qattr: f.qattr_en ?? null };
  return { quote: f.quote_mn ?? null, qattr: f.qattr_mn ?? null };
}

function nameFor(f: Figure, lang: 'mn' | 'en'): string {
  return lang === 'en' ? (f.name_en ?? f.name_mn ?? '') : (f.name_mn ?? f.name_en ?? '');
}

export function buildRoundFromSeed(
  allFigures: Figure[],
  lang: 'mn' | 'en',
  size: number,
  seedString: string,
): RoundQuestion[] {
  const rand = mulberry32(hashSeed(seedString));
  const pool = allFigures
    .map((f) => {
      const { quote, qattr } = quoteFor(f, lang);
      return quote ? { figure: f, quote, qattr } : null;
    })
    .filter((x): x is { figure: Figure; quote: string; qattr: string | null } => x !== null);

  const sampled = shuffleWith(rand, pool).slice(0, Math.min(size, pool.length));

  return sampled.map(({ figure, quote, qattr }) => {
    const sameCat = allFigures.filter((f) => f.cat === figure.cat && f.fig_id !== figure.fig_id);
    const wrongPool = sameCat.length >= 3
      ? sameCat
      : allFigures.filter((f) => f.fig_id !== figure.fig_id);
    const wrongs = shuffleWith(rand, wrongPool).slice(0, 3).map((f) => nameFor(f, lang));
    const correct = nameFor(figure, lang);
    return {
      figId: figure.fig_id,
      quote,
      qattr,
      correct,
      options: shuffleWith(rand, [correct, ...wrongs]),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --allow-read supabase/functions/_shared/seededRound.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/seededRound.ts supabase/functions/_shared/seededRound.test.ts
git commit -m "feat(game): Deno twin of seededRound for Edge Functions"
```

---

## Task 3: Game tables migration

**Files:**
- Create: `supabase/migrations/20260424000000_game_tables.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260424000000_game_tables.sql`:

```sql
-- Tournaments first (game_sessions FKs to it).
create table tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  seed        text not null,
  lang        text not null check (lang in ('mn','en')),
  round_size  int  not null default 10 check (round_size between 5 and 20),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  uuid not null references auth.users(id) on delete restrict,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table game_sessions (
  id             uuid primary key default gen_random_uuid(),
  seed           text not null,
  mode           text not null check (mode in ('solo','async_duel','live_room','tournament')),
  lang           text not null check (lang in ('mn','en')),
  round_size     int  not null default 10 check (round_size between 5 and 20),
  host_user_id   uuid not null references auth.users(id) on delete cascade,
  tournament_id  uuid references tournaments(id) on delete set null,
  status         text not null default 'open'
                   check (status in ('open','in_progress','complete','abandoned')),
  join_code      text unique,
  timer_s        int check (timer_s in (10, 15, 20)),
  player_cap     int default 8 check (player_cap between 2 and 8),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  starts_at      timestamptz,
  ends_at        timestamptz
);

create index game_sessions_join_code_idx
  on game_sessions (join_code) where join_code is not null;
create index game_sessions_tournament_id_idx
  on game_sessions (tournament_id);
create index game_sessions_open_expires_idx
  on game_sessions (status, expires_at) where status = 'open';

create table game_participants (
  session_id  uuid not null references game_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- tournament_id denormalized from session so we can build a unique partial index.
create table game_results (
  session_id    uuid not null references game_sessions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete set null,
  score         int  not null check (score >= 0),
  total         int  not null check (total > 0),
  answers       jsonb not null,
  completed_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index game_results_user_completed_idx
  on game_results (user_id, completed_at desc);
create index game_results_session_idx
  on game_results (session_id);
create unique index game_results_unique_per_tournament
  on game_results (user_id, tournament_id) where tournament_id is not null;
```

- [ ] **Step 2: Apply the migration locally and verify it loads**

Run:
```bash
supabase db reset
```

Expected: migration applies cleanly, no errors. If `supabase start` hasn't been run, run that first.

- [ ] **Step 3: Verify tables exist**

Run:
```bash
supabase db execute --query "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('tournaments','game_sessions','game_participants','game_results') order by table_name;"
```

Expected: exactly those 4 rows in alphabetical order.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260424000000_game_tables.sql
git commit -m "feat(db): game_sessions/participants/results/tournaments tables"
```

---

## Task 4: RLS helpers + policies migration

**Files:**
- Create: `supabase/migrations/20260424000100_game_rls.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260424000100_game_rls.sql`:

```sql
-- SECURITY DEFINER helpers prevent self-referential recursion in RLS SELECT policies.
create or replace function is_session_participant(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from game_participants
    where session_id = sid and user_id = auth.uid()
  );
$$;

create or replace function is_session_host(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from game_sessions
    where id = sid and host_user_id = auth.uid()
  );
$$;

alter table tournaments        enable row level security;
alter table game_sessions      enable row level security;
alter table game_participants  enable row level security;
alter table game_results       enable row level security;

-- --- tournaments ---
create policy "tournaments public read when published"
  on tournaments for select using (published = true or is_admin());
create policy "tournaments admin write"
  on tournaments for insert with check (is_admin());
create policy "tournaments admin update"
  on tournaments for update using (is_admin()) with check (is_admin());
create policy "tournaments admin delete"
  on tournaments for delete using (is_admin());

-- --- game_sessions ---
create policy "game_sessions host and participants read"
  on game_sessions for select using (
    host_user_id = auth.uid()
    or is_session_participant(id)
    or (tournament_id is not null
        and exists (select 1 from tournaments t
                    where t.id = game_sessions.tournament_id and t.published))
    or is_admin()
  );
create policy "game_sessions authenticated insert as host"
  on game_sessions for insert to authenticated
  with check (host_user_id = auth.uid());
-- Host can update status and timing; host_user_id is managed by the Edge Function
-- (service role) only, so the WITH CHECK locks the host column from changing.
create policy "game_sessions host update"
  on game_sessions for update
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());
create policy "game_sessions host delete when open/abandoned"
  on game_sessions for delete using (
    host_user_id = auth.uid() and status in ('open', 'abandoned')
  );

-- --- game_participants ---
create policy "game_participants members read"
  on game_participants for select using (
    is_session_participant(session_id) or is_session_host(session_id) or is_admin()
  );
create policy "game_participants self join"
  on game_participants for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from game_sessions s where s.id = session_id and s.status = 'open')
  );
create policy "game_participants self leave while open"
  on game_participants for delete using (
    user_id = auth.uid()
    and exists (select 1 from game_sessions s where s.id = session_id and s.status = 'open')
  );

-- --- game_results ---
-- Reads: any participant of the session can see all results for that session.
create policy "game_results session members read"
  on game_results for select using (
    is_session_participant(session_id) or is_admin()
  );
-- Writes blocked for authenticated/anon. Service role (Edge Function) bypasses RLS.
create policy "game_results no client insert"
  on game_results for insert to authenticated with check (false);
```

- [ ] **Step 2: Apply and verify policies exist**

Run:
```bash
supabase db reset
supabase db execute --query "select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('tournaments','game_sessions','game_participants','game_results') order by tablename, policyname;"
```

Expected: at least 11 policies across the 4 tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260424000100_game_rls.sql
git commit -m "feat(db): RLS policies + SECURITY DEFINER helpers for game tables"
```

---

## Task 5: Duel expiry pg_cron job migration

**Files:**
- Create: `supabase/migrations/20260424000200_game_jobs.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260424000200_game_jobs.sql`:

```sql
-- Requires pg_cron (Supabase has it available, enable if not already).
create extension if not exists pg_cron;

create or replace function expire_open_duels()
returns void
language sql
security definer
set search_path = public
as $$
  update game_sessions
     set status = 'abandoned'
   where mode = 'async_duel'
     and status = 'open'
     and expires_at is not null
     and expires_at < now();
$$;

-- Every 15 minutes.
select cron.schedule(
  'expire-open-duels',
  '*/15 * * * *',
  $$select expire_open_duels();$$
);
```

- [ ] **Step 2: Apply and verify**

Run:
```bash
supabase db reset
supabase db execute --query "select jobname, schedule from cron.job where jobname = 'expire-open-duels';"
```

Expected: one row, schedule `*/15 * * * *`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260424000200_game_jobs.sql
git commit -m "feat(db): pg_cron job to expire stale async duels"
```

---

## Task 6: Leaderboard views migration

**Files:**
- Create: `supabase/migrations/20260424000300_game_leaderboard_views.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260424000300_game_leaderboard_views.sql`:

```sql
-- Weekly leaderboard: aggregates game_results over the trailing 7 days.
create view game_leaderboard_weekly as
  select r.user_id,
         p.username,
         sum(r.score)                                        as total_points,
         count(*)                                            as games_played,
         round(avg(r.score::numeric / r.total) * 100, 1)     as accuracy_pct
    from game_results r
    join public.profiles p on p.id = r.user_id
   where r.completed_at >= now() - interval '7 days'
   group by r.user_id, p.username;

-- Mirror, no time filter.
create view game_leaderboard_all_time as
  select r.user_id,
         p.username,
         sum(r.score)                                        as total_points,
         count(*)                                            as games_played,
         round(avg(r.score::numeric / r.total) * 100, 1)     as accuracy_pct
    from game_results r
    join public.profiles p on p.id = r.user_id
   group by r.user_id, p.username;

grant select on game_leaderboard_weekly   to authenticated;
grant select on game_leaderboard_all_time to authenticated;
```

- [ ] **Step 2: Apply and smoke-check**

Run:
```bash
supabase db reset
supabase db execute --query "select count(*) from game_leaderboard_weekly;"
```

Expected: `0` (no results yet), not an error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260424000300_game_leaderboard_views.sql
git commit -m "feat(db): weekly and all-time leaderboard views"
```

---

## Task 7: Extend RLS smoke tests

**Files:**
- Modify: `supabase/tests/rls_smoke.sql`

- [ ] **Step 1: Append new DO blocks**

Append to the end of `supabase/tests/rls_smoke.sql`:

```sql
-- ============================================================
-- Game tables RLS smoke
-- ============================================================

-- anon cannot read game_sessions
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from game_sessions;
  if n <> 0 then raise exception 'anon should see 0 game_sessions, got %', n; end if;
end $$;
reset role;

-- anon cannot insert into game_results
do $$
begin
  set local role anon;
  begin
    insert into game_results (session_id, user_id, score, total, answers)
    values (gen_random_uuid(), gen_random_uuid(), 1, 1, '[]'::jsonb);
    raise exception 'anon insert into game_results should have been denied';
  exception when insufficient_privilege or check_violation or others then
    -- expected
  end;
end $$;
reset role;

-- authenticated cannot insert into game_results (blocked by policy)
do $$
begin
  set local role authenticated;
  begin
    insert into game_results (session_id, user_id, score, total, answers)
    values (gen_random_uuid(), gen_random_uuid(), 1, 1, '[]'::jsonb);
    raise exception 'authenticated insert into game_results should have been denied';
  exception when insufficient_privilege or check_violation or others then
    -- expected
  end;
end $$;
reset role;

-- anon cannot read tournaments that are not published
do $$
declare tid uuid;
declare n int;
begin
  insert into tournaments (name, seed, lang, starts_at, ends_at, created_by, published)
  values ('hidden', 'S', 'mn', now(), now() + interval '1 day',
          (select id from auth.users limit 1), false)
  returning id into tid;

  set local role anon;
  select count(*) into n from tournaments where id = tid;
  reset role;

  if n <> 0 then raise exception 'anon should not see unpublished tournament'; end if;

  delete from tournaments where id = tid;
end $$;
```

- [ ] **Step 2: Run the smoke tests**

Run:
```bash
supabase db execute --file supabase/tests/rls_smoke.sql
```

Expected: no output (each DO block either succeeds silently or raises on failure).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls_smoke.sql
git commit -m "test(rls): smoke tests for game tables"
```

---

## Task 8: Edge Function `game-create-session`

**Files:**
- Create: `supabase/functions/game-create-session/index.ts`

Existing patterns to follow: `supabase/functions/redeem-code/index.ts` (CORS, service-role client, `{ ok, reason }` response shape).

- [ ] **Step 1: Write the function**

Create `supabase/functions/game-create-session/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const MODES = new Set(['solo', 'async_duel', 'live_room', 'tournament']);
const LANGS = new Set(['mn', 'en']);

function randSeed(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function randJoinCode(): string {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, O, 0-9 for easier typing
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: {
    mode?: string;
    lang?: string;
    round_size?: number;
    tournament_id?: string;
    timer_s?: number;
    player_cap?: number;
    from_session_id?: string;
  };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const mode = body.mode ?? 'solo';
  const lang = body.lang ?? 'mn';
  const roundSize = body.round_size ?? 10;

  if (!MODES.has(mode)) return json({ ok: false, reason: 'bad_mode' }, 400);
  if (!LANGS.has(lang)) return json({ ok: false, reason: 'bad_lang' }, 400);
  if (!Number.isInteger(roundSize) || roundSize < 5 || roundSize > 20) {
    return json({ ok: false, reason: 'bad_round_size' }, 400);
  }

  const admin = createClient(url, service);

  // --- Seed resolution ---
  let seed = randSeed();
  let tournamentId: string | null = null;

  if (mode === 'tournament') {
    if (!body.tournament_id) return json({ ok: false, reason: 'bad_request' }, 400);
    const { data: t, error: tErr } = await admin
      .from('tournaments')
      .select('id, seed, lang, round_size, starts_at, ends_at, published')
      .eq('id', body.tournament_id)
      .maybeSingle();
    if (tErr || !t) return json({ ok: false, reason: 'not_found' }, 404);
    const now = Date.now();
    if (new Date(t.starts_at).getTime() > now || new Date(t.ends_at).getTime() < now) {
      return json({ ok: false, reason: 'tournament_closed' }, 400);
    }
    seed = t.seed;
    tournamentId = t.id;
    // force-align lang and round_size with tournament
    body.lang = t.lang;
    body.round_size = t.round_size;
  }

  if (mode === 'async_duel' && body.from_session_id) {
    // Promote an existing solo session: reuse its seed, flip its mode.
    const { data: fromSession, error: fsErr } = await admin
      .from('game_sessions')
      .select('id, seed, host_user_id, mode, lang, round_size')
      .eq('id', body.from_session_id)
      .maybeSingle();
    if (fsErr || !fromSession) return json({ ok: false, reason: 'not_found' }, 404);
    if (fromSession.host_user_id !== userId) return json({ ok: false, reason: 'forbidden' }, 403);
    if (fromSession.mode !== 'solo') return json({ ok: false, reason: 'already_promoted' }, 409);

    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { error: upErr } = await admin
      .from('game_sessions')
      .update({ mode: 'async_duel', expires_at: expires })
      .eq('id', fromSession.id);
    if (upErr) return json({ ok: false, reason: 'server' }, 500);

    return json({
      ok: true,
      id: fromSession.id,
      seed: fromSession.seed,
      join_code: null,
      share_path: `/duel/${fromSession.id}`,
    });
  }

  // --- Build insert payload ---
  const insert: Record<string, unknown> = {
    seed,
    mode,
    lang: body.lang ?? lang,
    round_size: body.round_size ?? roundSize,
    host_user_id: userId,
    tournament_id: tournamentId,
    status: 'open',
  };

  if (mode === 'live_room') {
    const timer = body.timer_s ?? 15;
    const cap = body.player_cap ?? 8;
    if (![10, 15, 20].includes(timer)) return json({ ok: false, reason: 'bad_timer' }, 400);
    if (!Number.isInteger(cap) || cap < 2 || cap > 8) {
      return json({ ok: false, reason: 'bad_cap' }, 400);
    }
    insert.timer_s = timer;
    insert.player_cap = cap;
    insert.join_code = randJoinCode();
  }

  if (mode === 'async_duel') {
    insert.expires_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  }

  const { data: session, error: insErr } = await admin
    .from('game_sessions')
    .insert(insert)
    .select('id, seed, join_code')
    .single();

  if (insErr || !session) return json({ ok: false, reason: 'server' }, 500);

  // Creator auto-joins as participant.
  await admin.from('game_participants').insert({ session_id: session.id, user_id: userId });

  const sharePath =
    mode === 'async_duel' ? `/duel/${session.id}`
    : mode === 'live_room' ? `/game/live/${session.join_code}`
    : null;

  return json({
    ok: true,
    id: session.id,
    seed: session.seed,
    join_code: session.join_code,
    share_path: sharePath,
  });
});
```

- [ ] **Step 2: Serve locally**

Run in a separate terminal:
```bash
supabase functions serve game-create-session --env-file ./supabase/functions/.env
```

- [ ] **Step 3: Exercise the happy path**

First grab a session token (replace values with a real local test user — the README's bootstrap admin flow or `supabase auth signup` via a test script). Then call:

```bash
curl -s -X POST http://localhost:54321/functions/v1/game-create-session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"solo","lang":"mn","round_size":10}'
```

Expected: `{"ok":true,"id":"<uuid>","seed":"<10-char>","join_code":null,"share_path":null}`.

- [ ] **Step 4: Exercise a rejection**

```bash
curl -s -X POST http://localhost:54321/functions/v1/game-create-session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"solo","lang":"xx"}'
```

Expected: `{"ok":false,"reason":"bad_lang"}` with status 400.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-create-session/index.ts
git commit -m "feat(functions): game-create-session Edge Function"
```

---

## Task 9: Edge Function `game-submit-result`

**Files:**
- Create: `supabase/functions/game-submit-result/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/game-submit-result/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { buildRoundFromSeed, Figure } from '../_shared/seededRound.ts';

interface IncomingAnswer {
  idx: number;
  pickedFigId: number | null;
  ms: number;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { session_id?: string; answers?: IncomingAnswer[] };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  if (!body.session_id || !Array.isArray(body.answers)) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const admin = createClient(url, service);

  // Session must exist and not be complete/abandoned.
  const { data: session, error: sErr } = await admin
    .from('game_sessions')
    .select('id, seed, lang, round_size, status, mode, tournament_id')
    .eq('id', body.session_id)
    .maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  if (session.status === 'abandoned') return json({ ok: false, reason: 'abandoned' }, 410);
  if (session.status === 'complete' && session.mode === 'solo') {
    return json({ ok: false, reason: 'already_submitted' }, 409);
  }

  // User must be a participant (auto-enrolled for async_duel on opening; must exist otherwise).
  const { data: part } = await admin
    .from('game_participants')
    .select('user_id')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part) {
    // For async_duel: auto-enroll the opener (player B).
    if (session.mode === 'async_duel') {
      const { error: pInsErr } = await admin
        .from('game_participants')
        .insert({ session_id: session.id, user_id: userId });
      if (pInsErr) return json({ ok: false, reason: 'server' }, 500);
    } else {
      return json({ ok: false, reason: 'not_participant' }, 403);
    }
  }

  // Already submitted?
  const { data: existing } = await admin
    .from('game_results')
    .select('user_id')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return json({ ok: false, reason: 'already_submitted' }, 409);

  // Load figures and rebuild the authoritative round.
  const { data: figures, error: fErr } = await admin
    .from('figures')
    .select('fig_id, cat, name_en, name_mn, quote_en, quote_mn, qattr_en, qattr_mn')
    .order('fig_id');
  if (fErr || !figures) return json({ ok: false, reason: 'server' }, 500);

  const round = buildRoundFromSeed(
    figures as Figure[],
    session.lang as 'mn' | 'en',
    session.round_size,
    session.seed,
  );

  // Re-score. Client sends pickedFigId; we recompute correctness against the
  // server-built round. The `correct` flag the client may have sent is ignored.
  let score = 0;
  const verifiedAnswers: Array<{
    idx: number;
    pickedFigId: number | null;
    correct: boolean;
    ms: number;
  }> = [];
  for (const a of body.answers) {
    const q = round[a.idx];
    if (!q) continue;
    const correct = a.pickedFigId === q.figId;
    if (correct) score++;
    verifiedAnswers.push({
      idx: a.idx,
      pickedFigId: a.pickedFigId,
      correct,
      ms: Math.max(0, Math.min(120000, a.ms | 0)),
    });
  }

  const total = round.length;

  const { error: insErr } = await admin.from('game_results').insert({
    session_id: session.id,
    user_id: userId,
    tournament_id: session.tournament_id,
    score,
    total,
    answers: verifiedAnswers,
  });
  if (insErr) return json({ ok: false, reason: 'server' }, 500);

  // --- Status transition ---
  if (session.mode === 'solo') {
    await admin.from('game_sessions').update({ status: 'complete' }).eq('id', session.id);
  } else if (session.mode === 'async_duel') {
    const { count } = await admin
      .from('game_results')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id);
    if ((count ?? 0) >= 2) {
      await admin.from('game_sessions').update({ status: 'complete' }).eq('id', session.id);
    }
  }

  return json({
    ok: true,
    score,
    total,
    correct_fig_ids: round.map((q) => q.figId),
  });
});
```

- [ ] **Step 2: Serve and manually exercise**

Run:
```bash
supabase functions serve game-submit-result --env-file ./supabase/functions/.env
```

Create a solo session via `game-create-session`, then submit:
```bash
curl -s -X POST http://localhost:54321/functions/v1/game-submit-result \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<uuid>","answers":[{"idx":0,"pickedFigId":1,"ms":3400}]}'
```

Expected: `{"ok":true,"score":0 or 1,"total":10,"correct_fig_ids":[...]}`.

- [ ] **Step 3: Exercise duplicate-submission rejection**

Re-run the same curl.
Expected: `{"ok":false,"reason":"already_submitted"}` with status 409.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-submit-result/index.ts
git commit -m "feat(functions): game-submit-result with server-side score verification"
```

---

## Task 10: Client API wrapper

**Files:**
- Create: `src/lib/gameApi.js`
- Create: `src/lib/gameApi.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gameApi.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession, submitResult, fetchSession, fetchSessionResults, fetchLeaderboard } from '@/lib/gameApi';

vi.mock('@/lib/supabaseClient', () => {
  const fnInvoke = vi.fn();
  const from = vi.fn();
  return {
    supabase: {
      functions: { invoke: fnInvoke },
      from,
    },
  };
});

import { supabase } from '@/lib/supabaseClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSession', () => {
  it('invokes the Edge Function with the given payload', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, id: 's1', seed: 'SEED001', join_code: null, share_path: null },
      error: null,
    });
    const res = await createSession({ mode: 'solo', lang: 'mn', round_size: 10 });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-create-session', {
      body: { mode: 'solo', lang: 'mn', round_size: 10 },
    });
    expect(res).toEqual({ id: 's1', seed: 'SEED001', join_code: null, share_path: null });
  });

  it('throws when the function returns ok:false', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, reason: 'bad_lang' },
      error: null,
    });
    await expect(createSession({ mode: 'solo', lang: 'xx' })).rejects.toThrow('bad_lang');
  });
});

describe('submitResult', () => {
  it('posts answers and returns the score', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, score: 7, total: 10, correct_fig_ids: [1, 2] },
      error: null,
    });
    const res = await submitResult({ session_id: 's1', answers: [{ idx: 0, pickedFigId: 1, ms: 2500 }] });
    expect(res).toEqual({ score: 7, total: 10, correct_fig_ids: [1, 2] });
  });
});

describe('fetchSession', () => {
  it('queries game_sessions by id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 's1', seed: 'S' }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ select });

    const res = await fetchSession('s1');
    expect(supabase.from).toHaveBeenCalledWith('game_sessions');
    expect(eq).toHaveBeenCalledWith('id', 's1');
    expect(res).toEqual({ id: 's1', seed: 'S' });
  });
});

describe('fetchLeaderboard', () => {
  it('reads from the weekly view by default', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ username: 'a', total_points: 9 }], error: null });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    supabase.from.mockReturnValue({ select });

    const res = await fetchLeaderboard('weekly', 20);
    expect(supabase.from).toHaveBeenCalledWith('game_leaderboard_weekly');
    expect(order).toHaveBeenCalledWith('total_points', { ascending: false });
    expect(limit).toHaveBeenCalledWith(20);
    expect(res).toEqual([{ username: 'a', total_points: 9 }]);
  });

  it('reads from the all-time view when asked', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    supabase.from.mockReturnValue({ select: () => ({ order }) });
    await fetchLeaderboard('all_time', 20);
    expect(supabase.from).toHaveBeenCalledWith('game_leaderboard_all_time');
  });
});

describe('fetchSessionResults', () => {
  it('returns all results for a session', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ user_id: 'u1', score: 8 }, { user_id: 'u2', score: 6 }],
      error: null,
    });
    supabase.from.mockReturnValue({ select: () => ({ eq }) });

    const res = await fetchSessionResults('s1');
    expect(eq).toHaveBeenCalledWith('session_id', 's1');
    expect(res).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/gameApi.test.js`
Expected: FAIL — "Cannot find module '@/lib/gameApi'" (and possibly `supabaseClient`).

- [ ] **Step 3: Check where the Supabase client is exported**

Run: `grep -rn "createClient\|supabase-js" src/lib 2>&1 | head -10`

If an existing Supabase client is exported from somewhere other than `@/lib/supabaseClient`, adjust the mock and imports to that path. If no such export exists, create `src/lib/supabaseClient.js`:

```javascript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

(If a different path already exists, delete the test's mock import and re-point it.)

- [ ] **Step 4: Write the implementation**

Create `src/lib/gameApi.js`:

```javascript
import { supabase } from '@/lib/supabaseClient';

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message ?? 'function_error');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

export async function createSession({ mode, lang, round_size, tournament_id, timer_s, player_cap, from_session_id }) {
  const body = { mode, lang, round_size };
  if (tournament_id) body.tournament_id = tournament_id;
  if (timer_s) body.timer_s = timer_s;
  if (player_cap) body.player_cap = player_cap;
  if (from_session_id) body.from_session_id = from_session_id;
  const { id, seed, join_code, share_path } = await invoke('game-create-session', body);
  return { id, seed, join_code, share_path };
}

export async function submitResult({ session_id, answers }) {
  const { score, total, correct_fig_ids } = await invoke('game-submit-result', { session_id, answers });
  return { score, total, correct_fig_ids };
}

export async function fetchSession(id) {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('id, seed, mode, lang, round_size, host_user_id, status, expires_at, created_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchSessionResults(sessionId) {
  const { data, error } = await supabase
    .from('game_results')
    .select('session_id, user_id, score, total, answers, completed_at')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchLeaderboard(kind /* 'weekly' | 'all_time' */, limit = 20) {
  const view = kind === 'all_time' ? 'game_leaderboard_all_time' : 'game_leaderboard_weekly';
  const { data, error } = await supabase
    .from(view)
    .select('user_id, username, total_points, games_played, accuracy_pct')
    .order('total_points', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- --run src/lib/gameApi.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gameApi.js src/lib/gameApi.test.js src/lib/supabaseClient.js
git commit -m "feat(game): client API wrapper for sessions/results/leaderboard"
```

---

## Task 11: Refactor `GameQuoteGuess.jsx` to use seeded RNG + `?session=<id>`

**Files:**
- Modify: `src/pages/GameQuoteGuess.jsx`

Behavior change: when a `?session=<id>` query param is present, fetch the session, use its `seed`, use its `lang`. When no param is present, create a new solo session first, then play it. Also persist answers locally as the user plays so submit at end can include ms timings.

- [ ] **Step 1: Read the current file to lock in the existing UI surface**

Read `src/pages/GameQuoteGuess.jsx`. The only parts being modified are:
- `buildPool` / `buildRound` calls (replaced with `buildRoundFromSeed`)
- `useEffect` that initializes the round
- The `choose` handler (records ms-since-question-shown)
- The `next` / finish handler (calls `submitResult` when done)
- The results screen (adds the "Challenge a friend" CTA — Task 12)

- [ ] **Step 2: Replace the file with the refactored version**

Write `src/pages/GameQuoteGuess.jsx`:

```jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Trophy, Share2 } from 'lucide-react';
import { FIGURES } from '@/lib/figuresData';
import { useLang, figureName, figureQuote } from '@/lib/i18n';
import { buildRoundFromSeed } from '@/lib/seededRound';
import { createSession, submitResult, fetchSession } from '@/lib/gameApi';
import CornerTicks from '@/components/ornaments/CornerTicks';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';
import BrassButton from '@/components/ornaments/BrassButton';

const ROUND_SIZE = 10;

export default function GameQuoteGuess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, lang: activeLang } = useLang();
  const sessionIdFromUrl = params.get('session');

  // Session state: either loaded from URL, or created here for a fresh solo.
  const [sessionState, setSessionState] = useState(null); // { id, seed, lang, round_size, mode }
  const [loadError, setLoadError] = useState(null);

  // Initialize session.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (sessionIdFromUrl) {
          const s = await fetchSession(sessionIdFromUrl);
          if (cancelled) return;
          setSessionState(s);
        } else {
          // Fresh solo game.
          const { id, seed } = await createSession({
            mode: 'solo',
            lang: activeLang,
            round_size: ROUND_SIZE,
          });
          if (cancelled) return;
          setSessionState({ id, seed, lang: activeLang, round_size: ROUND_SIZE, mode: 'solo' });
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message ?? 'load_failed');
      }
    }
    init();
    return () => { cancelled = true; };
  }, [sessionIdFromUrl, activeLang]);

  // Build round deterministically once we have a session.
  const round = useMemo(() => {
    if (!sessionState) return [];
    return buildRoundFromSeed(FIGURES, sessionState.lang, sessionState.round_size, sessionState.seed);
  }, [sessionState]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null); // option string
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]); // persisted on submit
  const questionStartRef = useRef(Date.now());

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [idx]);

  const choose = useCallback((opt) => {
    if (picked !== null) return;
    setPicked(opt);
    const q = round[idx];
    const ms = Date.now() - questionStartRef.current;
    const pickedFigIdFromOption = (() => {
      // Map option (string name) back to fig_id by searching FIGURES.
      const match = FIGURES.find((f) => figureName(f, sessionState.lang) === opt);
      return match?.fig_id ?? null;
    })();
    const isCorrect = opt === q.correct;
    if (isCorrect) setScore((s) => s + 1);
    setAnswers((prev) => [...prev, { idx, pickedFigId: pickedFigIdFromOption, ms }]);
  }, [picked, round, idx, sessionState]);

  const next = useCallback(async () => {
    if (idx + 1 >= round.length) {
      setDone(true);
      if (!submitted && sessionState) {
        setSubmitted(true);
        try {
          await submitResult({ session_id: sessionState.id, answers });
        } catch (err) {
          // Non-fatal; UI can still show local score. Log for telemetry.
          console.error('submit failed:', err);
        }
      }
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  }, [idx, round.length, submitted, sessionState, answers]);

  const restart = useCallback(async () => {
    setIdx(0); setPicked(null); setScore(0); setDone(false); setSubmitted(false); setAnswers([]);
    try {
      const { id, seed } = await createSession({
        mode: 'solo',
        lang: activeLang,
        round_size: ROUND_SIZE,
      });
      setSessionState({ id, seed, lang: activeLang, round_size: ROUND_SIZE, mode: 'solo' });
    } catch (err) {
      setLoadError(err.message ?? 'load_failed');
    }
  }, [activeLang]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-6 text-center">
        <div className="space-y-4 max-w-md">
          <Fleuron size={48} className="mx-auto opacity-60" />
          <p className="font-prose italic text-ivory/70">{t('game.loadFailed')}</p>
          <button onClick={() => navigate(-1)} className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass hover:text-ivory">
            ← {t('fd.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!sessionState || round.length === 0) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
      </div>
    );
  }

  const q = round[idx];
  const pickedRight = picked === q?.correct;
  const pct = Math.round(((idx + (picked ? 1 : 0)) / round.length) * 100);

  return (
    <div className="min-h-screen bg-ink contour-bg">
      {/* Top bar */}
      <div className="relative z-20 max-w-[60rem] mx-auto px-5 md:px-8 pt-6 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('fd.back')}
        </button>
        <div className="flex items-center gap-3">
          <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
            {String(idx + 1).padStart(2, '0')} / {String(round.length).padStart(2, '0')}
          </span>
          <span className="font-meta text-[10px] tracking-[0.22em] text-brass/60">·</span>
          <span className="font-meta text-[10px] tracking-[0.28em] text-ivory">
            {activeLang === 'en' ? 'Score' : 'Оноо'}: {score}
          </span>
        </div>
      </div>

      {/* Heading */}
      <div className="relative max-w-[60rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-4">
        <CodexRule caption={activeLang === 'en' ? 'CODEX · GAME' : 'КОДЕКС · ТОГЛООМ'} fleuronSize={20} />
        <h1 className="display-title text-[clamp(2rem,5vw,3.5rem)] text-ivory" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70, "WONK" 1, "wght" 540' }}>
          {activeLang === 'en' ? 'Whose ' : 'Хэний '}
          <span className="text-seal">{activeLang === 'en' ? 'words?' : 'үг вэ?'}</span>
        </h1>
        <p className="prose-body italic text-ivory/70 max-w-lg mx-auto">
          {activeLang === 'en' ? 'Read the quotation below and pick the figure who said it.' : 'Доорх ишлэлийг уншиж, хэн хэлснийг сонгоорой.'}
        </p>
        <div className="max-w-md mx-auto h-[2px] bg-brass/20 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-seal to-brass transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div key={idx} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }} className="relative max-w-[56rem] mx-auto px-5 md:px-8 pb-16 space-y-8">
            <section className="relative bg-ink/60 border border-brass/35 px-6 md:px-12 py-10">
              <CornerTicks size={14} inset={8} thickness={1} opacity={0.95} />
              <span className="font-meta text-[9.5px] tracking-[0.32em] uppercase text-brass/70 block text-center mb-5">
                {activeLang === 'en' ? 'Quotation' : 'Ишлэл'}
              </span>
              <p className="font-display italic text-[clamp(1.2rem,3.2vw,2.1rem)] leading-snug text-ivory text-center" style={{ fontVariationSettings: '"opsz" 72, "SOFT" 80, "WONK" 1' }}>
                &laquo; {q.quote} &raquo;
              </p>
            </section>

            <div className="grid sm:grid-cols-2 gap-3">
              {q.options.map((opt, i) => {
                const isCorrect = opt === q.correct;
                const isPicked = picked === opt;
                const showResult = picked !== null;
                let style = 'border-brass/40 hover:border-brass text-ivory bg-ink/40';
                if (showResult) {
                  if (isCorrect) style = 'border-green-500/70 text-green-400 bg-green-500/10';
                  else if (isPicked) style = 'border-seal/70 text-seal bg-seal/10';
                  else style = 'border-border text-ivory/55 bg-ink/30 opacity-60';
                }
                return (
                  <button key={i} onClick={() => choose(opt)} disabled={picked !== null} className={`group relative flex items-center gap-4 px-5 py-4 border ${style} text-left transition-colors`}>
                    <span className="font-meta text-[9px] tracking-[0.3em] text-brass/70">{['I','II','III','IV'][i]}.</span>
                    <span className="font-display text-[15px] leading-tight flex-1" style={{ fontVariationSettings: '"opsz" 30, "SOFT" 50' }}>{opt}</span>
                    {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {showResult && isPicked && !isCorrect && <XCircle className="w-4 h-4 text-seal" />}
                  </button>
                );
              })}
            </div>

            {picked !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
                <p className={`font-prose italic text-[15px] ${pickedRight ? 'text-green-400' : 'text-seal'}`}>
                  {pickedRight
                    ? (activeLang === 'en' ? '✓ Correct.' : '✓ Зөв байна.')
                    : (activeLang === 'en' ? `✗ It was: ${q.correct}` : `✗ Зөв хариулт: ${q.correct}`)}
                  {q.qattr && (
                    <span className="ml-2 font-meta text-[10px] tracking-[0.22em] uppercase text-brass/60">— {q.qattr}</span>
                  )}
                </p>
                <BrassButton variant="primary" size="sm" onClick={next}>
                  {idx + 1 >= round.length ? (activeLang === 'en' ? 'Finish' : 'Дүгнэлт') : (activeLang === 'en' ? 'Next →' : 'Дараах →')}
                </BrassButton>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <ResultScreen
            score={score}
            total={round.length}
            lang={activeLang}
            sessionId={sessionState.id}
            mode={sessionState.mode}
            onReplay={restart}
            navigate={navigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultScreen({ score, total, lang, sessionId, mode, onReplay, navigate }) {
  const [challenging, setChallenging] = useState(false);

  async function challengeFriend() {
    setChallenging(true);
    try {
      const { id, share_path } = await createSession({
        mode: 'async_duel',
        lang,
        round_size: total,
        from_session_id: sessionId,
      });
      const url = `${window.location.origin}${share_path}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: lang === 'en' ? "Whose words?" : 'Хэний үг вэ?',
            text: lang === 'en'
              ? `I scored ${score}/${total}. Beat me?`
              : `Би ${score}/${total} оноо авлаа. Намайг давж чадах уу?`,
            url,
          });
        } catch { /* user canceled */ }
      } else {
        await navigator.clipboard.writeText(url);
        alert(lang === 'en' ? 'Link copied to clipboard.' : 'Холбоос хуулагдсан.');
      }
    } catch (err) {
      alert((lang === 'en' ? 'Failed: ' : 'Алдаа: ') + (err.message ?? 'unknown'));
    } finally {
      setChallenging(false);
    }
  }

  return (
    <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="relative max-w-[44rem] mx-auto px-5 md:px-8 pb-20 text-center space-y-7">
      <Fleuron size={44} className="mx-auto opacity-80" />
      <div>
        <div className="font-display text-[clamp(3rem,8vw,6rem)] leading-none text-ivory" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1, "wght" 560' }}>
          {score} <span className="text-brass/60">/ {total}</span>
        </div>
        <p className="font-meta text-[10px] tracking-[0.32em] uppercase text-brass/70 mt-2">
          {lang === 'en' ? 'Final score' : 'Эцсийн оноо'}
        </p>
      </div>

      <div className="relative bg-ink/60 border border-brass/30 p-6">
        <CornerTicks size={12} inset={6} thickness={1} opacity={0.85} />
        <Trophy className="w-5 h-5 text-brass mx-auto" />
        <p className="font-prose italic text-ivory/80 mt-3">{scoreVerdict(score, total, lang)}</p>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <BrassButton variant="ghost" size="sm" onClick={() => navigate('/app')}>
          {lang === 'en' ? 'Back to Codex' : 'Кодекс руу'}
        </BrassButton>
        <BrassButton variant="primary" size="sm" onClick={onReplay} icon={<RefreshCw className="w-3 h-3" />}>
          {lang === 'en' ? 'Play again' : 'Дахин тоглох'}
        </BrassButton>
        {mode === 'solo' && (
          <BrassButton variant="primary" size="sm" onClick={challengeFriend} icon={<Share2 className="w-3 h-3" />} disabled={challenging}>
            {lang === 'en' ? 'Challenge a friend' : 'Найздаа сорилт илгээх'}
          </BrassButton>
        )}
      </div>
    </motion.div>
  );
}

function scoreVerdict(score, total, lang) {
  const pct = score / total;
  if (lang === 'en') {
    if (pct >= 0.9) return 'A scholar of the steppe — exceptional.';
    if (pct >= 0.7) return 'Strong knowledge of the codex.';
    if (pct >= 0.5) return 'A respectable showing.';
    if (pct >= 0.3) return 'A start — read on, the chronicle awaits.';
    return 'The codex is patient. Try again.';
  }
  if (pct >= 0.9) return 'Тал нутгийн жинхэнэ судлаач — гайхалтай.';
  if (pct >= 0.7) return 'Кодекстээ тулгуурласан мэдлэг бий.';
  if (pct >= 0.5) return 'Дунд зэргийн амжилт.';
  if (pct >= 0.3) return 'Эхлэл сайхан — кодекс хүлээж байна.';
  return 'Кодекс тэвчээртэй. Дахин оролдоорой.';
}
```

- [ ] **Step 3: Run typecheck and lint**

Run:
```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Boot the dev server and play one solo round**

Run: `npm run dev`, open the game at `/games/quotes`, play through 10 questions.

Expected: game plays as before, ends on the results screen with a new "Challenge a friend" button. Network tab shows two POSTs to the Edge Functions (create-session on entry, submit-result on finish).

- [ ] **Step 5: Commit**

```bash
git add src/pages/GameQuoteGuess.jsx
git commit -m "feat(game): drive solo game through server-backed seeded sessions"
```

---

## Task 12: Add `game.loadFailed` and localization strings

**Files:**
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1: Append keys**

After the last `STRINGS` entry (right before the closing `};`), add:

```javascript
  // Game
  'game.loadFailed': {
    mn: 'Тоглоомыг ачаалахад алдаа гарлаа.',
    en: 'Failed to load the game.',
  },

  // Duel
  'duel.title':             { mn: 'Сорилт',                      en: 'Challenge' },
  'duel.intro.prefix':      { mn: '',                             en: '' },
  'duel.intro.challenged':  { mn: 'чамайг сорьсон',              en: 'challenged you' },
  'duel.intro.rules':       { mn: '{n} асуулт. Адилхан хоёулаа.', en: '{n} questions. Same for both.' },
  'duel.intro.toBeat':      { mn: 'Давах оноо:',                 en: 'Score to beat:' },
  'duel.intro.start':       { mn: 'Эхлэх',                        en: 'Play' },
  'duel.expired':           { mn: 'Энэ сорилт хугацаа нь дууссан байна.', en: 'This challenge has expired.' },
  'duel.notFound':          { mn: 'Сорилт олдсонгүй.',           en: 'Challenge not found.' },
  'duel.waiting':           { mn: 'Эсрэг талын тоглогч хүлээж байна…', en: 'Waiting for your opponent…' },

  'duel.summary.title':     { mn: 'Сорилтын дүн',                en: 'Duel summary' },
  'duel.summary.youWon':    { mn: 'Та ялсан!',                   en: 'You won!' },
  'duel.summary.theyWon':   { mn: '{name} ялсан.',               en: '{name} won.' },
  'duel.summary.tie':       { mn: 'Тэнцсэн үр дүн.',             en: 'It\'s a tie.' },
  'duel.summary.rematch':   { mn: 'Дахин сорилт',                en: 'Rematch' },

  // Leaderboard
  'leaderboard.title':      { mn: 'Тэргүүлэгчид',                en: 'Leaderboard' },
  'leaderboard.tab.weekly': { mn: 'Энэ 7 хоног',                en: 'This week' },
  'leaderboard.tab.all':    { mn: 'Бүх цаг',                    en: 'All time' },
  'leaderboard.col.rank':   { mn: '#',                            en: '#' },
  'leaderboard.col.user':   { mn: 'Тоглогч',                     en: 'Player' },
  'leaderboard.col.games':  { mn: 'Тоглоом',                     en: 'Games' },
  'leaderboard.col.points': { mn: 'Оноо',                        en: 'Points' },
  'leaderboard.col.acc':    { mn: 'Нарийвчлал',                  en: 'Accuracy' },
  'leaderboard.empty':      { mn: 'Одоогоор бичлэг алга.',       en: 'No scores yet.' },
  'leaderboard.yourRank':   { mn: 'Таны байр',                   en: 'Your rank' },
  'nav.leaderboard':        { mn: 'Тэргүүлэгчид',                en: 'Leaderboard' },
```

If the existing `t()` helper doesn't support interpolation like `{n}`, confirm whether it does before relying on it. Read `src/lib/i18n.jsx`'s `t` implementation; if no interpolation, the pages below will substitute manually. Either way, the English/Mongolian pairs stay the same.

- [ ] **Step 2: Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "i18n: strings for duel summary, leaderboard, game load error"
```

---

## Task 13: Duel intro page

**Files:**
- Create: `src/pages/DuelIntro.jsx`
- Create: `src/pages/DuelIntro.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/DuelIntro.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DuelIntro from '@/pages/DuelIntro';

vi.mock('@/lib/gameApi', () => ({
  fetchSession: vi.fn(),
  fetchSessionResults: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-B' } } }),
}));

import { fetchSession, fetchSessionResults } from '@/lib/gameApi';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/duel/:id" element={<DuelIntro />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DuelIntro', () => {
  it('shows the score-to-beat and a Play button when B has not yet played', async () => {
    fetchSession.mockResolvedValue({
      id: 's1', mode: 'async_duel', lang: 'en', round_size: 10,
      host_user_id: 'user-A', status: 'open',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 8, total: 10 },
    ]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText(/duel.intro.toBeat/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /duel.intro.start/i })).toBeInTheDocument();
      expect(screen.getByText(/8/)).toBeInTheDocument();
    });
  });

  it('redirects to summary if current user already submitted', async () => {
    fetchSession.mockResolvedValue({ id: 's1', mode: 'async_duel', status: 'complete' });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 8, total: 10 },
      { user_id: 'user-B', score: 7, total: 10 },
    ]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText(/duel.summary/i)).toBeTruthy(); // summary component renders summary header
    });
  });

  it('shows expired message when status=abandoned', async () => {
    fetchSession.mockResolvedValue({ id: 's1', mode: 'async_duel', status: 'abandoned' });
    fetchSessionResults.mockResolvedValue([]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText(/duel.expired/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/pages/DuelIntro.test.jsx`
Expected: FAIL — "Cannot find module '@/pages/DuelIntro'".

- [ ] **Step 3: Implement the page**

Create `src/pages/DuelIntro.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchSession, fetchSessionResults } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function DuelIntro() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { session: authSession } = useAuth();
  const navigate = useNavigate();
  const userId = authSession?.user?.id;

  const [state, setState] = useState({ loading: true, session: null, results: [], error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, r] = await Promise.all([fetchSession(id), fetchSessionResults(id)]);
        if (cancelled) return;
        setState({ loading: false, session: s, results: r, error: null });
      } catch (err) {
        if (!cancelled) setState({ loading: false, session: null, results: [], error: err.message ?? 'load_failed' });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // Side effects that react to state.
  useEffect(() => {
    if (state.loading || !state.session) return;
    if (state.session.status === 'complete' || state.results.some((r) => r.user_id === userId)) {
      navigate(`/duel/${id}/summary`, { replace: true });
    }
  }, [state, userId, navigate, id]);

  if (state.loading) {
    return <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
    </div>;
  }

  if (state.error || !state.session) {
    return <IntroShell><p className="font-prose italic text-ivory/70">{t('duel.notFound')}</p></IntroShell>;
  }

  if (state.session.status === 'abandoned') {
    return <IntroShell><p className="font-prose italic text-ivory/70">{t('duel.expired')}</p></IntroShell>;
  }

  const hostResult = state.results.find((r) => r.user_id === state.session.host_user_id);

  return (
    <IntroShell>
      <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('duel.title')}</p>
      <h1 className="font-display text-[clamp(2rem,5vw,3rem)] text-ivory">
        {lang === 'en' ? 'Whose words?' : 'Хэний үг вэ?'}
      </h1>
      <p className="font-prose italic text-ivory/80">
        {t('duel.intro.rules').replace('{n}', state.session.round_size)}
      </p>
      {hostResult && (
        <p className="font-meta text-[11px] tracking-[0.25em] uppercase text-brass">
          {t('duel.intro.toBeat')} <span className="text-ivory">{hostResult.score}</span>
        </p>
      )}
      <BrassButton variant="primary" size="md" onClick={() => navigate(`/games/quotes?session=${id}`)}>
        {t('duel.intro.start')}
      </BrassButton>
    </IntroShell>
  );
}

function IntroShell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run src/pages/DuelIntro.test.jsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DuelIntro.jsx src/pages/DuelIntro.test.jsx
git commit -m "feat(game): duel intro page"
```

---

## Task 14: Duel summary page

**Files:**
- Create: `src/pages/DuelSummary.jsx`
- Create: `src/pages/DuelSummary.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/DuelSummary.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DuelSummary from '@/pages/DuelSummary';

vi.mock('@/lib/gameApi', () => ({
  fetchSession: vi.fn(),
  fetchSessionResults: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-B' } } }),
}));

import { fetchSession, fetchSessionResults } from '@/lib/gameApi';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/duel/:id/summary" element={<DuelSummary />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('DuelSummary', () => {
  it('shows both scores side by side', async () => {
    fetchSession.mockResolvedValue({
      id: 's1', host_user_id: 'user-A', round_size: 10, lang: 'en',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 8, total: 10 },
      { user_id: 'user-B', score: 7, total: 10 },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  it('tells current user they lost when host scored higher', async () => {
    fetchSession.mockResolvedValue({ id: 's1', host_user_id: 'user-A', round_size: 10, lang: 'en' });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 9, total: 10 },
      { user_id: 'user-B', score: 5, total: 10 },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText(/duel.summary.theyWon/i)).toBeInTheDocument();
    });
  });

  it('shows waiting state if opponent has not played', async () => {
    fetchSession.mockResolvedValue({ id: 's1', host_user_id: 'user-A', round_size: 10, lang: 'en' });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-B', score: 7, total: 10 },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText(/duel.waiting/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/pages/DuelSummary.test.jsx`
Expected: FAIL — "Cannot find module '@/pages/DuelSummary'".

- [ ] **Step 3: Implement the page**

Create `src/pages/DuelSummary.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchSession, fetchSessionResults, createSession } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function DuelSummary() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id;

  const [state, setState] = useState({ loading: true, session: null, results: [], error: null });
  const [rematching, setRematching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, r] = await Promise.all([fetchSession(id), fetchSessionResults(id)]);
        if (cancelled) return;
        setState({ loading: false, session: s, results: r, error: null });
      } catch (err) {
        if (!cancelled) setState({ loading: false, session: null, results: [], error: err.message });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function rematch() {
    setRematching(true);
    try {
      const { id: newId, share_path } = await createSession({
        mode: 'async_duel',
        lang: state.session.lang,
        round_size: state.session.round_size,
      });
      // Current user becomes the new host; opens the game to play first.
      navigate(`/games/quotes?session=${newId}`);
    } catch (err) {
      alert(err.message ?? 'Failed to rematch');
    } finally {
      setRematching(false);
    }
  }

  if (state.loading) {
    return <Shell><div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin mx-auto" /></Shell>;
  }
  if (!state.session) {
    return <Shell><p className="font-prose italic text-ivory/70">{t('duel.notFound')}</p></Shell>;
  }

  const hostRes = state.results.find((r) => r.user_id === state.session.host_user_id);
  const guestRes = state.results.find((r) => r.user_id !== state.session.host_user_id);
  const isHost = userId === state.session.host_user_id;
  const mine = isHost ? hostRes : guestRes;
  const theirs = isHost ? guestRes : hostRes;

  if (!theirs) {
    return <Shell>
      <h1 className="font-display text-3xl text-ivory">{t('duel.summary.title')}</h1>
      <p className="font-prose italic text-ivory/70">{t('duel.waiting')}</p>
      {mine && <p className="font-meta text-[11px] uppercase tracking-[0.3em] text-brass">{mine.score} / {mine.total}</p>}
    </Shell>;
  }

  let verdict;
  if (mine.score > theirs.score) verdict = t('duel.summary.youWon');
  else if (mine.score < theirs.score) verdict = t('duel.summary.theyWon').replace('{name}', 'opponent');
  else verdict = t('duel.summary.tie');

  return (
    <Shell>
      <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('duel.summary.title')}</p>
      <div className="flex items-center justify-center gap-10 pt-2">
        <div>
          <div className="font-display text-5xl text-ivory">{mine.score}</div>
          <div className="font-meta text-[10px] text-brass/60 uppercase tracking-[0.28em]">{lang === 'en' ? 'You' : 'Та'}</div>
        </div>
        <div className="font-display text-2xl text-brass/60">vs</div>
        <div>
          <div className="font-display text-5xl text-ivory">{theirs.score}</div>
          <div className="font-meta text-[10px] text-brass/60 uppercase tracking-[0.28em]">{lang === 'en' ? 'Them' : 'Тэд'}</div>
        </div>
      </div>
      <p className="font-prose italic text-ivory/80 text-lg">{verdict}</p>

      <PerQuestionGrid mine={mine} theirs={theirs} />

      <div className="flex items-center justify-center gap-3 pt-4">
        <BrassButton variant="ghost" size="sm" onClick={() => navigate('/app')}>{lang === 'en' ? 'Back' : 'Буцах'}</BrassButton>
        <BrassButton variant="primary" size="sm" onClick={rematch} disabled={rematching}>
          {t('duel.summary.rematch')}
        </BrassButton>
      </div>
    </Shell>
  );
}

function PerQuestionGrid({ mine, theirs }) {
  const total = mine.total;
  return (
    <div className="grid grid-cols-10 gap-1 max-w-md mx-auto pt-2">
      {Array.from({ length: total }).map((_, i) => {
        const myA = mine.answers?.find((a) => a.idx === i);
        const theirA = theirs.answers?.find((a) => a.idx === i);
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className={`w-3 h-3 rounded-sm ${myA?.correct ? 'bg-green-500/80' : 'bg-seal/80'}`} />
            <span className={`w-3 h-3 rounded-sm ${theirA?.correct ? 'bg-green-500/80' : 'bg-seal/80'}`} />
          </div>
        );
      })}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run src/pages/DuelSummary.test.jsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DuelSummary.jsx src/pages/DuelSummary.test.jsx
git commit -m "feat(game): duel summary page with per-question grid and rematch"
```

---

## Task 15: Leaderboard page

**Files:**
- Create: `src/pages/Leaderboard.jsx`
- Create: `src/pages/Leaderboard.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/Leaderboard.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Leaderboard from '@/pages/Leaderboard';

vi.mock('@/lib/gameApi', () => ({
  fetchLeaderboard: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

import { fetchLeaderboard } from '@/lib/gameApi';

function R() {
  return render(<MemoryRouter><Leaderboard /></MemoryRouter>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('Leaderboard', () => {
  it('fetches and shows weekly by default', async () => {
    fetchLeaderboard.mockResolvedValue([
      { user_id: 'u1', username: 'alpha', total_points: 42, games_played: 6, accuracy_pct: 84.2 },
      { user_id: 'u2', username: 'bravo', total_points: 30, games_played: 5, accuracy_pct: 75.0 },
    ]);
    R();
    await waitFor(() => {
      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(fetchLeaderboard).toHaveBeenCalledWith('weekly', 20);
  });

  it('switches to all-time when the tab is clicked', async () => {
    fetchLeaderboard.mockResolvedValue([]);
    R();
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalled());

    fetchLeaderboard.mockClear();
    fetchLeaderboard.mockResolvedValue([]);

    fireEvent.click(screen.getByRole('button', { name: /leaderboard.tab.all/i }));
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalledWith('all_time', 20));
  });

  it('shows empty state', async () => {
    fetchLeaderboard.mockResolvedValue([]);
    R();
    await waitFor(() => {
      expect(screen.getByText(/leaderboard.empty/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/pages/Leaderboard.test.jsx`
Expected: FAIL — "Cannot find module '@/pages/Leaderboard'".

- [ ] **Step 3: Implement the page**

Create `src/pages/Leaderboard.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { fetchLeaderboard } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import CodexRule from '@/components/ornaments/CodexRule';

export default function Leaderboard() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id;

  const [tab, setTab] = useState('weekly'); // 'weekly' | 'all_time'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(tab, 20)
      .then((data) => { if (!cancelled) { setRows(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setRows([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tab]);

  const myRow = rows.find((r) => r.user_id === userId);
  const myRankVisible = myRow && rows.slice(0, 20).some((r) => r.user_id === userId);

  return (
    <div className="min-h-screen bg-ink contour-bg">
      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 font-meta text-[10px] tracking-[0.3em] uppercase text-brass/75 hover:text-ivory">
          <ArrowLeft className="w-3.5 h-3.5" /> {lang === 'en' ? 'Back' : 'Буцах'}
        </button>
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pt-8 pb-6 text-center space-y-3">
        <CodexRule caption={lang === 'en' ? 'CODEX · LEADERBOARD' : 'КОДЕКС · ТЭРГҮҮЛЭГЧИД'} fleuronSize={20} />
        <h1 className="display-title text-[clamp(2rem,5vw,3rem)] text-ivory" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 70' }}>
          {t('leaderboard.title')}
        </h1>
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pb-4 flex items-center justify-center gap-2">
        {[
          { key: 'weekly',   label: t('leaderboard.tab.weekly') },
          { key: 'all_time', label: t('leaderboard.tab.all') },
        ].map((tDef) => (
          <button
            key={tDef.key}
            onClick={() => setTab(tDef.key)}
            className={`px-4 py-2 font-meta text-[10px] tracking-[0.28em] uppercase border ${
              tab === tDef.key ? 'border-brass text-ivory' : 'border-brass/30 text-brass/70 hover:text-ivory'
            }`}
          >
            {tDef.label}
          </button>
        ))}
      </div>

      <div className="max-w-[50rem] mx-auto px-5 md:px-8 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Fleuron size={36} className="mx-auto opacity-60" />
            <p className="font-prose italic text-ivory/70">{t('leaderboard.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-ivory">
            <thead>
              <tr className="font-meta text-[9.5px] uppercase tracking-[0.28em] text-brass/70 border-b border-brass/30">
                <th className="text-left py-3 pl-3 w-10">{t('leaderboard.col.rank')}</th>
                <th className="text-left py-3">{t('leaderboard.col.user')}</th>
                <th className="text-right py-3 hidden sm:table-cell">{t('leaderboard.col.games')}</th>
                <th className="text-right py-3">{t('leaderboard.col.points')}</th>
                <th className="text-right py-3 pr-3">{t('leaderboard.col.acc')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((r, i) => (
                <tr key={r.user_id} className={`border-b border-brass/10 ${r.user_id === userId ? 'bg-brass/5' : ''}`}>
                  <td className="py-3 pl-3 font-meta text-[11px] text-brass">{i + 1}</td>
                  <td className="py-3 font-display">{r.username}</td>
                  <td className="py-3 text-right hidden sm:table-cell font-meta text-[12px] text-ivory/70">{r.games_played}</td>
                  <td className="py-3 text-right font-display">{r.total_points}</td>
                  <td className="py-3 pr-3 text-right font-meta text-[12px] text-ivory/70">{r.accuracy_pct}%</td>
                </tr>
              ))}
              {myRow && !myRankVisible && (
                <tr className="border-t-2 border-brass/30 bg-brass/5">
                  <td className="py-3 pl-3 font-meta text-[11px] text-brass">…</td>
                  <td className="py-3 font-display">{myRow.username} <span className="text-brass/60 text-[10px] ml-1">{t('leaderboard.yourRank')}</span></td>
                  <td className="py-3 text-right hidden sm:table-cell font-meta text-[12px] text-ivory/70">{myRow.games_played}</td>
                  <td className="py-3 text-right font-display">{myRow.total_points}</td>
                  <td className="py-3 pr-3 text-right font-meta text-[12px] text-ivory/70">{myRow.accuracy_pct}%</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run src/pages/Leaderboard.test.jsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Leaderboard.jsx src/pages/Leaderboard.test.jsx
git commit -m "feat(game): weekly + all-time leaderboard page"
```

---

## Task 16: Wire new routes + Navbar link

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Navbar.jsx`

- [ ] **Step 1: Register routes in `App.jsx`**

In `src/App.jsx`, add imports:

```jsx
import DuelIntro from '@/pages/DuelIntro';
import DuelSummary from '@/pages/DuelSummary';
import Leaderboard from '@/pages/Leaderboard';
```

Inside the existing `<Routes>` block, **before** the `<Route path="*" element={<PageNotFound />} />` catchall, add:

```jsx
<Route path="/duel/:id" element={<OtpGate><DuelIntro /></OtpGate>} />
<Route path="/duel/:id/summary" element={<OtpGate><DuelSummary /></OtpGate>} />
<Route path="/leaderboard" element={<OtpGate><Leaderboard /></OtpGate>} />
```

- [ ] **Step 2: Add Navbar entry**

Read `src/components/Navbar.jsx` first to find the existing link list pattern. Add a new link pointing to `/leaderboard` with label `t('nav.leaderboard')`. Place it adjacent to `nav.myteam` / `nav.collection` (authenticated-user items). Only render when the user is signed in — reuse whatever auth check the other authenticated items use.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Sign in as a test user. Verify:

1. `/leaderboard` loads and shows the empty state.
2. Play a solo game to completion; click "Challenge a friend" → a URL is copied/shared.
3. Open that URL in a second browser profile signed in as a different user → lands on the duel intro, shows score to beat, Play button leads into the round.
4. Complete the duel → both users can reach `/duel/:id/summary` and see both scores.
5. Return to `/leaderboard` → both users now appear in the weekly list.

- [ ] **Step 4: Run the full test suite + lint + typecheck**

```bash
npm test -- --run
npm run lint
npm run typecheck
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Navbar.jsx
git commit -m "feat(app): register duel + leaderboard routes and navbar link"
```

---

## Task 17: Update README with deploy commands

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Extend the `supabase functions deploy` list**

In `README.md` under "Supabase backend setup", append to the `supabase functions deploy ...` block:

```bash
supabase functions deploy game-create-session
supabase functions deploy game-submit-result
```

And append to the "Docs" bullet list:

```markdown
- Quote game multiplayer spec: [`docs/superpowers/specs/2026-04-23-quote-game-multiplayer-design.md`](docs/superpowers/specs/2026-04-23-quote-game-multiplayer-design.md)
- Quote game multiplayer plan (Phase 0+1): [`docs/superpowers/plans/2026-04-23-quote-game-multiplayer-phase-0-1.md`](docs/superpowers/plans/2026-04-23-quote-game-multiplayer-phase-0-1.md)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README deploy commands + links for quote game multiplayer"
```

---

## Verification checklist (run at the end)

- [ ] `npm test -- --run` — all tests green
- [ ] `npm run lint` — clean
- [ ] `npm run typecheck` — clean
- [ ] `supabase db execute --file supabase/tests/rls_smoke.sql` — no output (silent success)
- [ ] `deno test --allow-read supabase/functions/_shared/seededRound.test.ts` — green
- [ ] Manual: play solo game end-to-end; challenge a friend in a second browser; both scores show in `/leaderboard`.

---

## Spec coverage map

| Spec requirement | Task |
|---|---|
| §4.1 Seeded round generation | Tasks 1, 2 |
| §4.2 Tables (tournaments, sessions, participants, results) | Task 3 |
| §4.3 RLS + SECURITY DEFINER helpers | Task 4 |
| §4.4 Edge Functions `game-create-session`, `game-submit-result` | Tasks 8, 9 |
| §4.5 Leaderboard views | Task 6 |
| §4.6 `expire_open_duels` pg_cron | Task 5 |
| §5.1 Async duel flow (Challenge a friend, intro, summary, rematch) | Tasks 11, 13, 14 |
| §5.2 Duel rules (7d expiry, one submission per user, promotion rules) | Tasks 5, 8, 9 |
| §5.3 Leaderboard page (weekly + all-time, top 20 + pinned self) | Task 15 |
| §5.4 UI surface changes (Navbar link, new routes) | Task 16 |
| §8 Anti-cheat (server-side re-computation) | Task 9 |
| §9 Error handling (4xx codes for bad inputs, 409 for duplicate submit, 410 for expired) | Tasks 8, 9, 13, 14 |
| §10 Testing (determinism, submit verification, RLS smoke) | Tasks 1, 2, 7, 8, 9, 13, 14, 15 |
| §11 Migration files with correct dates | Tasks 3, 4, 5, 6 |
| §12 Locked-in decisions (7d expiry, language-agnostic leaderboard, server re-compute) | Tasks 5, 6, 9 |

Phase 2 (live rooms) and Phase 3 (tournaments) are deliberately out of scope — separate plans.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-quote-game-multiplayer-phase-0-1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
