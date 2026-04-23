# Quote Game Multiplayer — Design Spec

**Date:** 2026-04-23
**Status:** Approved (design), pending implementation plan
**Affected surface:** `src/pages/GameQuoteGuess.jsx`, new pages under `/app/game/*` and `/app/leaderboard`, new Supabase migrations + Edge Functions.

## 1. Goal

Extend the existing solo "Whose words?" quote-attribution game with three layered multiplayer capabilities:

1. **Async duels** — challenge a friend with a share link; both play the same seed; scores compared side-by-side.
2. **Live rooms** — 2–8 players join a code, race through the same round in real time with per-question timer and reveal phase.
3. **Tournaments** — admin-scheduled, time-boxed, fixed-seed events with a public leaderboard and medals.

All three share one foundation (seed-based deterministic round generation + session/result tables + RLS). The leaderboard is a thin view on top of `game_results` and is delivered with Phase 1.

## 2. Non-goals

- In-game chat (deferred — add later if requested).
- User-submitted questions / custom rounds.
- Voice or video in live rooms.
- Ranked matchmaking. Live rooms are invite-by-code only.
- Native mobile app. Web-only, responsive.
- User-created tournaments (admin-created only; user-run events need moderation work that isn't scoped here).

## 3. Phasing

Each phase ends in a shippable feature. Stopping between phases must leave the app in a fully functional state.

| Phase | Scope | User-visible? |
|---|---|---|
| 0 — Foundation | Seeded RNG, core tables, RLS, submission Edge Function | No |
| 1 — Async duels + leaderboard | Challenge-a-friend flow, duel summary, weekly + all-time leaderboard | Yes |
| 2 — Live rooms | Host/join by code, realtime lobby, live round with timer, reveals, standings | Yes |
| 3 — Tournaments | Admin tournament creation, public tournaments page, medals | Yes |

## 4. Phase 0 — Foundation

### 4.1 Seeded round generation

Current `buildRound` in `src/pages/GameQuoteGuess.jsx` uses `Math.random()` for pool sampling, wrong-answer selection, and option order. This is replaced with a seeded PRNG so two devices given the same seed produce the exact same round.

- **PRNG:** `mulberry32` (tiny, deterministic, well-distributed). Seeded from a 32-bit hash of the session's base32 seed string.
- **API:** `buildRound(pool, allFigures, lang, size, seedString)` — pure function, no globals.
- **Seed format:** 10-char base32 (Crockford), generated server-side via `gen_random_bytes` in Postgres. E.g. `GQ7K4R2A9M`.
- **Determinism guarantee:** given the same `(pool, seedString, lang)`, the returned array is byte-identical across Node and browsers. Covered by unit test.

`FIGURES` order in `figuresData` is treated as the canonical ordering; adding or reordering figures invalidates old seeds. This is acceptable — old sessions persist their raw questions if needed (see §4.3).

### 4.2 Tables

Four new tables, all with RLS enabled from the start. Create in this order to avoid forward FK references: `tournaments` → `game_sessions` → `game_participants` → `game_results`.

```sql
tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  seed        text not null,
  lang        text not null check (lang in ('mn','en')),
  round_size  int  not null default 10,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  uuid not null references auth.users(id) on delete restrict,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

game_sessions (
  id             uuid primary key default gen_random_uuid(),
  seed           text not null,
  mode           text not null check (mode in ('solo','async_duel','live_room','tournament')),
  lang           text not null check (lang in ('mn','en')),
  round_size     int  not null default 10 check (round_size between 5 and 20),
  host_user_id   uuid not null references auth.users(id) on delete cascade,
  tournament_id  uuid references tournaments(id) on delete set null,
  status         text not null default 'open'
                   check (status in ('open','in_progress','complete','abandoned')),
  join_code      text unique,        -- 6-char, live_room only
  timer_s        int check (timer_s in (10,15,20)),  -- live_room only
  player_cap     int default 8 check (player_cap between 2 and 8),  -- live_room only
  expires_at     timestamptz,        -- async_duel: created_at + 7d
  created_at     timestamptz not null default now(),
  starts_at      timestamptz,        -- live_room & tournament
  ends_at        timestamptz         -- live_room & tournament
);

game_participants (
  session_id  uuid not null references game_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- tournament_id is denormalized from game_sessions so we can enforce
-- "one submission per user per tournament" with a unique partial index
-- (can't build a partial index across a join).
game_results (
  session_id    uuid not null references game_sessions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete set null,
  score         int  not null,
  total         int  not null,
  answers       jsonb not null,   -- [{idx, pickedFigId, correct, ms}]
  completed_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);
```

Indexes:
- `game_sessions(join_code)` partial where `join_code is not null`
- `game_sessions(tournament_id)`
- `game_sessions(status, expires_at)` partial where `status = 'open'` (for expiry sweep)
- `game_results(user_id, completed_at desc)`
- `game_results(session_id)`
- `unique (user_id, tournament_id) where tournament_id is not null` on `game_results` — one entry per tournament per user.

### 4.3 RLS policies

Use the existing `is_admin()` helper from `init_schema.sql`. To avoid self-referential recursion in participant/result SELECT policies, define a `SECURITY DEFINER` helper:

```sql
create or replace function is_session_participant(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from game_participants
    where session_id = sid and user_id = auth.uid()
  );
$$;

create or replace function is_session_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from game_sessions
    where id = sid and host_user_id = auth.uid()
  );
$$;
```

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `game_sessions` | `host_user_id = auth.uid()` OR `is_session_participant(id)` OR `tournament_id in (select id from tournaments where published)` OR `is_admin()` | authenticated AND `host_user_id = auth.uid()` | `is_session_host(id)` AND `with check` restricts mutable columns to `{status, starts_at, ends_at, expires_at}` only. Host reassignment (`host_user_id`) happens via Edge Function (service role). | host only, and only while `status in ('open','abandoned')` |
| `game_participants` | `is_session_participant(session_id)` OR `is_session_host(session_id)` | authenticated AND `user_id = auth.uid()` AND session is `open` | none | self, and only while session is `open` |
| `game_results` | `is_session_participant(session_id)` | **blocked for end users**; writes only via service-role Edge Function (§4.4) | none (immutable) | none |
| `tournaments` | `published = true` OR `is_admin()` | `is_admin()` | `is_admin()` | `is_admin()` |

`game_results` insert is denied for authenticated/anon; only the service-role key used by `game-submit-result` can write, which means client-supplied `score` can never bypass server verification.

### 4.4 Edge Functions

All functions follow the error-shape and language-handling pattern already established in `supabase/functions/redeem-code/`.

- **`game-create-session`** — input: `{ mode, lang, round_size, tournament_id?, timer_s?, player_cap?, from_session_id? }`. Creates session row, generates seed (or copies from `from_session_id` when promoting a solo → async_duel, or from `tournament.seed` when `mode='tournament'`), generates a unique `join_code` for live rooms, sets `expires_at = now() + interval '7 days'` for async_duel, auto-inserts caller as participant, returns `{ id, seed, join_code, share_url }`.
- **`game-submit-result`** — input: `{ session_id, answers }`. Loads session, re-runs `buildRound` with server-side seed, verifies each answer's `pickedFigId` is among the options presented for that round index, recomputes `correct` and `score`. Rejects if session is `abandoned`/`complete`, if user already has a result, or if user is not a participant. Inserts `game_results` (copying `session.tournament_id` into the denormalized column). Flips session `status` to `complete` when appropriate (solo: immediately; async_duel: when both participants have results). Returns `{ score, total, correct_ids }`.
- **`game-live-event`** — input: `{ session_id, event, payload }`. Host-only events: `start`, `next_question`, `reveal`, `end`, `host_transfer`. Player-only events: `answer`, `join`. Validates auth, enforces state machine (e.g. `answer` only during active question window), updates session/participants as needed, and broadcasts on Realtime channel `game:session:<id>`. For `answer`, the function uses its own receipt timestamp (minus the broadcast timestamp stored on the session) as the authoritative `ms` — clients do not report timing.

### 4.6 Background jobs

- **`expire_open_duels`** — `pg_cron` job running every 15 min. Sets `status='abandoned'` where `mode='async_duel' and status='open' and now() > expires_at`.
- **`finalize_tournaments`** — `pg_cron` job running every 5 min. For each tournament where `ends_at < now() and not published`: sets `published=true`, computes gold/silver/bronze from `game_results` sorted by `(score desc, accuracy desc, completed_at asc)`, inserts rows into `user_achievements`.
- **`end_stale_live_rooms`** — `pg_cron` job running every 2 min. Sets `status='abandoned'` for live rooms with `status='in_progress'` and no participant presence for > 5 min (tracked via last-event timestamp on the session).

### 4.5 Leaderboard view

Joins the existing `public.profiles` table (which stores `username` and is populated by the `handle_new_user` trigger from `init_schema.sql`).

```sql
create view game_leaderboard_weekly as
  select r.user_id,
         p.username,
         sum(r.score)     as total_points,
         count(*)         as games_played,
         round(avg(r.score::numeric / r.total) * 100, 1) as accuracy_pct
  from game_results r
  join public.profiles p on p.id = r.user_id
  where r.completed_at >= now() - interval '7 days'
  group by r.user_id, p.username;
```

Plus a mirror `game_leaderboard_all_time` without the time filter. Views run with the querying user's permissions; grant `select` to `authenticated` role. The app only renders them to logged-in users.

## 5. Phase 1 — Async duels + leaderboard

### 5.1 Flow

1. Player A finishes any solo game. End screen gets a new primary CTA: **"Challenge a friend"** (alongside existing "Play again").
2. Tapping it calls `game-create-session(mode='async_duel', lang=current, round_size=10)` — the *solo* session A just played is promoted in place: its mode flips from `solo` to `async_duel`, and A's result is carried over. Share URL returned.
3. Share sheet surfaces `share_url` = `{origin}/app/game/duel/{session_id}` with a pre-filled message (localized).
4. Player B opens the URL:
   - If not logged in → sees a preview card (challenger username, round size, language, "score to beat: 8") and the app's login/invite-code flow.
   - If logged in → lands on the duel intro: *"{A} challenged you. 10 questions. Same for both. Score to beat: 8."* → plays the same seed.
5. On B's finish, `game-submit-result` persists B's result. Both users see the **duel summary page**:
   - Both scores side-by-side.
   - Per-question grid: A's pick vs B's pick vs correct answer, marked ✓/✗.
   - Average answer time per player (if captured; otherwise hidden).
   - **Rematch** button → creates a new session with a fresh seed, roles swapped (B hosts).

### 5.2 Rules

- A cannot replay their own side. If they reopen the duel URL, they see the summary (if B has played) or "waiting for {B to accept}".
- B has one attempt. Second attempt → 409, show existing result.
- A duel is `abandoned` after 7 days if B never submits. A sees "expired" on their profile.
- Solo games that aren't promoted to duels stay `mode='solo'` and do not count toward duels, but they *do* count toward the leaderboard.

### 5.3 Leaderboard page

New route `/app/leaderboard`. Two tabs:

- **This week** — rows from `game_leaderboard_weekly`.
- **All time** — rows from `game_leaderboard_all_time`.

Columns: rank, username, games played, total points, accuracy %. Top 20 shown. If the current user is outside the top 20, a pinned row shows their own rank at the bottom.

Tie-breaking: higher accuracy first, then fewer games played (quality > volume).

### 5.4 UI surfaces changed

- `GameQuoteGuess.jsx` — add "Challenge a friend" button to end screen; replace `Math.random` with seeded RNG; read seed from session if one is provided via `?session=<id>` query param.
- New `src/pages/DuelSummary.jsx` and `src/pages/DuelIntro.jsx`.
- New `src/pages/Leaderboard.jsx`.
- `Navbar.jsx` — add Leaderboard link (authenticated only).

## 6. Phase 2 — Live rooms

### 6.1 Flow

1. From game landing (or `/app/game/live/new`) the user clicks **Live room** → `game-create-session(mode='live_room', ...)` with configurable round size (5/10/15), language, per-question timer (10/15/20s), player cap (default 8). Returns `join_code`.
2. Host lands in **lobby** showing: code `KHANAX`, share URL `/app/game/live/{code}`, QR code, player list, round settings (editable by host while `status='open'`), **Start** button (disabled until ≥2 players).
3. Others join via URL or by entering code on `/app/game/live` → call join endpoint → added to `game_participants` → appear in host's lobby via Realtime presence.
4. Host presses **Start** → Edge Function flips `status='in_progress'` and broadcasts `start` with countdown timestamp. Clients render 3-2-1 synced to the broadcast. The host is always a player — they play every round alongside everyone else.
5. Each question phase:
   - All clients render the same question using the seed + round index broadcast by host.
   - Timer bar counts down from `timer_s`. Picking locks in locally and submits via `game-live-event {event:'answer'}`.
   - Server validates (authed, in this session, round index matches, not already answered this round), broadcasts `answer_submitted { user_id, correct, ms }` *without* revealing picked option yet.
   - Timer expiry → clients auto-submit null answer.
   - When all players have answered OR timer is 0 → host's client calls `reveal`.
6. **Reveal phase (3s):** correct answer highlighted, each player's card shows ✓/✗ and ms, running standings updated. Then host calls `next_question`, or `end` if last.
7. **Results screen:** final standings, "MVP" (highest correct-and-fast score), rematch (new session, same roster invited automatically via broadcast).

### 6.2 Realtime model

- One Supabase Realtime channel per session: `game:session:<session_id>`.
- **Presence** → lobby player list and "online now" indicators.
- **Broadcast events** (authoritative from server via `game-live-event`):
  - `lobby_update` — settings changed by host.
  - `start` — payload `{ server_start_ts }` for countdown sync.
  - `question` — payload `{ round_idx }` (client computes question from seed).
  - `answer_submitted` — `{ user_id, correct, ms }` (no picked option until reveal).
  - `reveal` — `{ round_idx, correct_fig_id, standings }`.
  - `end` — `{ final_standings }`.
- All writes go through the Edge Function; clients never `broadcast` directly, so a malicious client can't fake events.

### 6.3 Edge cases

- **Host disconnects:** presence drops trigger `game-live-event {event:'host_gone'}` from any client; server reassigns `host_user_id` to the next-longest-present participant. If no participants remain for 60s, session flips to `abandoned`.
- **Late joiners:** blocked once `status='in_progress'`. Show "room in progress" with a button to create their own.
- **Reconnect:** on reconnect, client fetches session state and jumps to current phase. If they missed answering the current question, they're marked as no-answer for that round.
- **Network desync:** clients trust server-broadcast `round_idx` as truth.

### 6.4 UI surfaces changed

- New `src/pages/LiveRoomHost.jsx` (lobby with host controls).
- New `src/pages/LiveRoomPlayer.jsx` (join by code, lobby view, in-round view, results view).
- New `src/components/game/Timer.jsx`, `Standings.jsx`, `RoundCountdown.jsx`.
- `GameQuoteGuess.jsx` may be refactored to extract the round-playing component (`<RoundPlayer seed={} onSubmit={} mode="live"|"solo" />`) so live and solo share the same question UI. This refactor is a specific, scoped improvement — in scope per the "fix things you're working in" principle.

### 6.5 Player cap

Hard cap at 8. Reveal phase remains readable at 8 seats. Increasing this is a future design problem (grouped reveals, scrollable standings).

## 7. Phase 3 — Tournaments

### 7.1 Admin flow

- Admin panel gains a **Tournaments** tab (`src/components/admin/Tournaments.jsx`).
- Create form: name, language, round size, start/end timestamps. Seed auto-generated on save.
- List shows upcoming / active / past with participant counts and status.
- Admin can `publish` past tournaments (makes them visible to non-admins). Tournaments auto-publish at `ends_at`.

### 7.2 Player flow

- Public route `/app/tournaments` lists published tournaments (upcoming + active + past).
- During the window, any authenticated user can click **Play** → `game-create-session(mode='tournament', tournament_id=...)` using the tournament's seed → play through → result auto-linked.
- One attempt per tournament per user (enforced server-side via unique partial index on `game_results(user_id)` where session.tournament_id is not null).
- Each tournament has a leaderboard view filtering `game_results` by `tournament_id`.

### 7.3 Medals

Minimal achievements surface. New table:

```sql
user_achievements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,       -- 'tournament_gold'|'silver'|'bronze'
  ref_id     uuid,                -- tournament id
  awarded_at timestamptz not null default now()
);
```

Awarded by an Edge Function `tournament-finalize` triggered when admin publishes (or by pg_cron at `ends_at`). Profile page surfaces the medals as small icons next to the username.

## 8. Anti-cheat

- All `game_results` inserts flow through `game-submit-result` (service role), which re-runs the deterministic round and re-verifies answers. Client-submitted `score` is ignored — score is always computed server-side from `answers`.
- Seed is server-generated. Clients derive questions from it, they don't choose it.
- Live rooms: answer `ms` is measured server-side (time between `question` broadcast and `answer` event receipt), not client-reported.
- Tournament entry enforced by a unique constraint, not by client state.
- Leaderboard reflects only server-verified results.

## 9. Error handling

| Situation | Response | UX |
|---|---|---|
| Duel URL invalid or session deleted | 404 | "Challenge not found" + CTA to start a solo game |
| Duel expired (>7d, status='abandoned') | 410 | "This challenge has expired" + "Challenge someone new" |
| Already submitted for session | 409 | Redirect to duel summary |
| Seed mismatch / tampered submission | 400 | Discard submission, log, show generic "Couldn't save result" |
| Live room join after start | 403 | "Room in progress — ask the host for a new one" |
| Host drops | Automatic reassignment, then abandonment after 60s empty | Toast: "Host left — {newHost} is now host" |
| Edge Function timeout / network error on submit | Client retries with exponential backoff up to 3 attempts, surfaces error after | Toast: "Couldn't save your result. Tap to retry." |

All user-facing strings localized (mn/en) via existing `useLang` + `t()` pattern.

## 10. Testing

- **Seeded RNG determinism:** unit test — same seed + lang + FIGURES → byte-identical round output, in Node and JSDOM.
- **`game-submit-result`:** unit/integration — rejects bad picks, rejects duplicate submits, writes correct score, works for all modes.
- **RLS smoke:** extend `supabase/tests/rls_smoke.sql` with cases per new table (host sees own session, non-participant blocked, results immutable, etc.).
- **Leaderboard view:** SQL test asserting correct aggregation and time filtering.
- **Live rooms:** mock Realtime channel in tests for component behavior (timer expiry, reveal, standings). End-to-end multi-browser test deferred to a dedicated E2E plan.
- **Tournament lifecycle:** integration test for `finalize_tournaments` pg_cron job awarding gold/silver/bronze correctly, including tie-breaking.
- **Duel expiry:** integration test for `expire_open_duels` pg_cron job flipping stale duels to `abandoned`.

## 11. Migration & rollout

- Phase 0 migration: `20260424000000_game_tables.sql` + `20260424000100_game_rls.sql` + `20260424000200_game_jobs.sql` (pg_cron schedules) + deploy three Edge Functions.
- Phase 1: ship behind no flag — purely additive UI.
- Phase 2: gated by a client-side feature flag `VITE_LIVE_ROOMS_ENABLED` so we can deploy code before flipping it on.
- Phase 3: admin-only until first tournament is created, so no public surface to gate.

No data backfill needed — these are all new tables.

## 12. Open decisions locked in (from brainstorm)

- **Anti-cheat:** server-side re-computation (yes).
- **Live room cap:** 8.
- **Async duel expiry:** 7 days.
- **Tournament creation:** admin-only.
- **Leaderboard:** language-agnostic (mn + en counted together).

## 13. Implementation plan

To be written in `docs/superpowers/plans/2026-04-23-quote-game-multiplayer.md` via the `writing-plans` skill after this spec is approved.
