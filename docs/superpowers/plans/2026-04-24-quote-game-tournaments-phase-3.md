# Plan — Quote-game tournaments (Phase 3)

**Spec:** `docs/superpowers/specs/2026-04-23-quote-game-multiplayer-design.md` §7.
**Phase target:** admin-created, time-boxed quote-game events with a public leaderboard and gold/silver/bronze medals.

## 0. State of the world (2026-04-24)

Already shipped on `master`:
- `tournaments` table + RLS (`published=true OR is_admin()` for reads; `is_admin()` for writes).
- `game_sessions.mode='tournament'` branch in `game-create-session` (rejects outside `[starts_at, ends_at]`, reuses `tournament.seed`, copies `lang`/`round_size`).
- `game_results.tournament_id` denormalized + `unique (user_id, tournament_id) where tournament_id is not null` — enforces one-attempt rule.
- `game-submit-result` already copies `session.tournament_id` into results.

What's missing (this plan):
- `user_achievements` table + RLS.
- `v_tournament_leaderboard` view (per-tournament standings).
- `finalize_tournament(uuid)` SQL function — awards gold/silver/bronze, flips `tournaments.published=true`.
- `finalize_tournaments` pg_cron job — every 5 min, finalizes any tournament whose `ends_at < now()` and is not yet published.
- Admin UI: Tournaments tab on `AdminPanel.jsx` (list/create/publish now).
- Public UI: `/app/tournaments` list + `/app/tournaments/:id` per-tournament page (leaderboard + Play CTA).
- Profile medal icons.
- i18n strings (mn/en).
- Tests (SQL + vitest).

## 1. Locked decisions (from spec §12)

- Admin-only creation. No public submission for tournaments.
- Language-agnostic leaderboard (mn + en counted together for a given tournament). (Note: this means a tournament has one `lang` but the leaderboard view doesn't partition by lang. We keep this here since tournament.lang is fixed per tournament anyway.)
- One attempt per tournament per user (DB-enforced).
- Medals: gold/silver/bronze only; ties broken by `(score desc, completed_at asc)` then user_id as final tiebreaker.
- Finalize trigger: pg_cron every 5 min (not realtime). Admin can also manually publish early.
- Results visibility: all users can see the leaderboard of any `published=true` tournament. Before finalization, only admins can see the leaderboard.

## 2. Open questions (need user's pick before we start executing)

Only two low-stakes choices that aren't already locked by the spec:

**A.** Admin-only until first tournament is created, OR always-visible "Tournaments" nav (shows empty state before first one)?
  - *default:* always-visible nav with empty state. Discoverability > hiding.

**B.** On medal award, do we notify the winners in-app?
  - *default:* no — pure passive display on their profile. Ship notifications later if there's demand.

User picks with `Aa/Ab/Ba/Bb/all-defaults` or just says `go` to accept defaults.

## 3. Architecture overview

```
admin                                       any authenticated user
  │                                               │
  │ create tournament                             │
  ▼                                               │
  tournaments (RLS: admin write)                  │
  │                                               │
  │ pg_cron every 5 min                           │
  │ finalize_tournament(uuid)                     │
  │   — computes standings from game_results      │
  │   — inserts user_achievements (gold/silv/bron)│
  │   — flips tournaments.published=true          │
  │                                               │
  ▼                                               ▼
  v_tournament_leaderboard  <-------------  /app/tournaments/:id
  (rls already gated on tournaments.published)    /app/tournaments
  │                                               │
  ▼                                               ▼
  user_achievements    <-------   profile page medal icons
  (RLS: owner or admin read; service role write)
```

## 4. Tasks

### Task 1 — `user_achievements` table + RLS (migration)

`supabase/migrations/20260425000000_tournaments_phase3.sql`.

```sql
create table user_achievements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('tournament_gold','tournament_silver','tournament_bronze')),
  ref_id     uuid,                       -- tournament id for tournament_* kinds
  awarded_at timestamptz not null default now()
);

-- dedupe: one medal per user per tournament
create unique index user_achievements_one_medal_per_tournament
  on user_achievements (user_id, ref_id)
  where kind in ('tournament_gold','tournament_silver','tournament_bronze');

alter table user_achievements enable row level security;

create policy "achievements public read"
  on user_achievements for select using (true);
-- writes via service role only (no insert/update/delete policies for anon/auth)
```

**Exit:** migration applied via MCP; `select count(*) from user_achievements` returns 0; `insert ... from authenticated` is denied.

### Task 2 — `v_tournament_leaderboard` view

Same migration. A view (not materialized) so publish flips data immediately:

```sql
create or replace view v_tournament_leaderboard as
select
  gr.tournament_id,
  gr.user_id,
  p.username,
  gr.score,
  gr.total,
  gr.completed_at,
  row_number() over (
    partition by gr.tournament_id
    order by gr.score desc, gr.completed_at asc, gr.user_id
  ) as rank
from game_results gr
join profiles p on p.id = gr.user_id
where gr.tournament_id is not null;

grant select on v_tournament_leaderboard to authenticated, anon;
```

Note: the view's row-access is gated by the existing `game_results` RLS policies — non-admins see only rows belonging to published tournaments, which matches the spec.

**Exit:** admin sees all rows; non-admin sees only rows where `tournaments.published=true`.

### Task 3 — `finalize_tournament(uuid)` SQL function

Same migration. Idempotent: running twice on the same tournament must not create duplicate medals.

```sql
create or replace function finalize_tournament(tid uuid)
returns void
language plpgsql
security definer
as $$
declare r record;
begin
  -- award medals for top 3 (ties broken by completed_at, then user_id)
  for r in
    select user_id, row_number() over (
      order by score desc, completed_at asc, user_id
    ) as rn
    from game_results
    where tournament_id = tid
    order by score desc, completed_at asc, user_id
    limit 3
  loop
    insert into user_achievements (user_id, kind, ref_id)
    values (
      r.user_id,
      case r.rn when 1 then 'tournament_gold'
                when 2 then 'tournament_silver'
                else 'tournament_bronze' end,
      tid
    )
    on conflict (user_id, ref_id)
      where kind in ('tournament_gold','tournament_silver','tournament_bronze')
      do nothing;
  end loop;

  update tournaments set published = true where id = tid and not published;
end;
$$;

revoke all on function finalize_tournament(uuid) from public;
grant execute on function finalize_tournament(uuid) to service_role;
```

**Exit:** call it from SQL against a test tournament seeded with 5 results → 3 medal rows + `published=true`. Call it again → still 3 rows.

### Task 4 — `finalize_tournaments` pg_cron job

`supabase/migrations/20260425000100_tournament_jobs.sql`:

```sql
select cron.schedule(
  'finalize-tournaments',
  '*/5 * * * *',
  $$
  do $inner$
  declare t record;
  begin
    for t in select id from tournaments
              where ends_at < now() and not published
    loop
      perform finalize_tournament(t.id);
    end loop;
  end;
  $inner$;
  $$
);
```

**Exit:** `select jobname, schedule from cron.job where jobname='finalize-tournaments'` returns one row. Manually insert a past-ended tournament with results → within 5 min, `published=true` and medals exist.

### Task 5 — Admin Tournaments tab

`src/components/admin/Tournaments.jsx` (new). Wire into `AdminPanel.jsx` tab bar.

Features:
- List tab with `upcoming / active / past / published` filters.
- Create form: name (mn, trimmed), lang (mn|en), round_size (5..20), starts_at (datetime-local), ends_at (datetime-local). Seed auto-generated (`randSeed()`) client-side and sent as string.
- Row actions: `Publish now` → calls an RPC `finalize_tournament(id)` via `supabase.rpc`, which requires service-role. Since admins don't have service_role, add a thin edge function `tournament-finalize` that checks `is_admin()` and calls the SQL function with the service-role key.
- No edit/delete in V1 (spec is silent; keep scope tight).

**Exit:** manual test — admin creates a tournament, it appears in the upcoming filter; past tournament gets auto-finalized by cron; `Publish now` works for active tournaments.

### Task 6 — `tournament-finalize` edge function

`supabase/functions/tournament-finalize/index.ts`. Input: `{ tournament_id }`. Auth: user-JWT, `is_admin()` check via a `select is_admin()` RPC. Then `admin.rpc('finalize_tournament', { tid })`. Deploy via MCP. `verify_jwt: true`.

**Exit:** curl with admin JWT → 200 + medals created; curl with non-admin → 403.

### Task 7 — Public `/app/tournaments` page

`src/pages/Tournaments.jsx` (new). Route already has a spot in the auth-gated section (we'll register it in `App.jsx`). Lists tournaments in 3 sections — upcoming, active, past. Each card shows name, language pill, date range, participant count (`count(distinct game_results.user_id)`), and a CTA:
- Upcoming → disabled "Starts {relative}".
- Active → **Play** button → `createSession('tournament', { tournament_id })` → navigate to the returned session's quote-game URL.
- Past → **View leaderboard** → `/app/tournaments/:id`.

If user already has a `game_results` row for the tournament, CTA changes to **View your result**.

**Exit:** page renders correctly for all three sections, Play CTA creates a session for an active tournament, 409 from the edge function (already_entered) is surfaced as a friendly toast.

### Task 8 — Per-tournament leaderboard page

`src/pages/TournamentDetail.jsx` (new). Route `/app/tournaments/:id`. Reads `v_tournament_leaderboard` filtered by tournament_id, joined to `tournaments` metadata. Top-3 get medal icons (⚜️ placeholder or Tailwind-styled SVG — see Task 10). Your row is highlighted if you played.

**Exit:** after finalize, top-3 show medals; non-admin cannot load a leaderboard for an unpublished tournament.

### Task 9 — Admin **Publish now** + Tournament list helper RPC

The admin list needs a single query returning tournament rows + participant count. Add a view:

```sql
create or replace view v_tournament_admin_list as
select t.*,
       (select count(distinct user_id)
          from game_results where tournament_id = t.id) as participant_count
from tournaments t;

grant select on v_tournament_admin_list to authenticated;
-- guarded by tournaments RLS transitively? no — views don't inherit RLS. Add a gate:
create or replace function is_admin_now() returns boolean
language sql stable as $$ select is_admin() $$;
-- ... or simply filter in-query: the admin tab only queries this view when role='admin'
```

Decision: just add `is_admin()` guard within the view's where clause is cleaner but views can't have RLS — so require admin-side queries to include `where is_admin()=true` (evaluates per-row). Simpler: drop the view, run two parallel queries in the admin UI.

**Exit:** admin sees participant counts without N+1 queries.

### Task 10 — Profile medal icons

Edit `src/pages/Profile.jsx` (or equivalent user-facing profile; confirm at start of task). Query `user_achievements` filtered by `user_id=auth.uid()`. Render small icons next to username with a tooltip "Gold — {tournament name}".

Icon implementation: SVG — gold/silver/bronze circle with a numeral. Lives in `src/components/MedalIcon.jsx`.

**Exit:** after a finalize-test, your profile shows the correct medal.

### Task 11 — i18n strings

Extend `src/lib/i18n.jsx` with:
```
tournaments: { title, upcoming, active, past, play, viewLeaderboard, alreadyEntered,
               winners: 'Winners', noResults: 'No entries yet' },
admin: { tournaments: { new, name, lang, roundSize, startsAt, endsAt, publishNow,
                        seedAutoGenerated, createdBy } },
medals: { gold, silver, bronze, awardedIn }
```

For both `mn` and `en`. Mongolian wording: get the Chinggis voice right (short, not too formal).

**Exit:** language toggle flips all new strings.

### Task 12 — Tests

Add to `supabase/tests/rls_smoke.sql`:
- Non-admin user inserting into `user_achievements` is denied.
- Non-admin user reading `v_tournament_leaderboard` for an unpublished tournament returns empty.
- `finalize_tournament()` is idempotent.

Vitest:
- `src/pages/Tournaments.test.jsx` — renders 3 sections, Play CTA visible for active, disabled for upcoming.
- `src/pages/TournamentDetail.test.jsx` — top-3 show medal icons.
- `src/components/admin/Tournaments.test.jsx` — create form happy path; invalid date range shows error.

Edge function tests:
- `tournament-finalize` — admin succeeds, non-admin gets 403.

**Exit:** `npm run test` reports all new tests passing; existing 79 remain green.

### Task 13 — i18n review + manual end-to-end

Manual smoke test (user-driven):
1. Log in as admin. Create a tournament that started 1 minute ago and ends in 20 minutes.
2. Log out and log in as 2 regular users. Each plays through.
3. Wait for cron (or call `Publish now` as admin).
4. Refresh `/app/tournaments/:id`. Top-2 should show gold + silver.
5. Profile pages of the winners show the medal.

### Task 14 — Commit + execution log

One commit per logical group (migrations / edge function / client / tests / i18n / docs-execution-log). Final commit updates this plan file with an execution log at the bottom.

## 5. Risk + mitigation

- **RLS for `user_achievements`:** readable by all (by design — medals are public). If we later want to keep medals private per-user, add a toggle column. Not in V1.
- **`finalize_tournament()` idempotency:** unique partial index + `on conflict do nothing`. Re-running is safe.
- **pg_cron drift:** `*/5 * * * *` means tournaments finalize within 5 minutes of `ends_at`. Admin has `Publish now` for immediate finalization.
- **Privacy of leaderboard pre-publish:** the existing `game_sessions` RLS policy already gates reads by `published=true OR is_admin()` — the view inherits this through the underlying table. Confirmed in spec §4.3.
- **One-attempt enforcement:** unique partial index already in place. `createSession` should check first to give a friendly "already entered" error instead of a raw 23505.

## 6. Out of scope

- Tournament editing / deletion after creation.
- Tournament brackets (single-elimination between live-room games).
- Weekly / monthly recurring tournaments (cron-driven auto-create).
- Push notifications on medal award.
- Medal categories beyond top-3 (e.g., "participant", "streak").
- Tournament × live-room combo (noted as Phase 2.5 follow-up).

---

## Execution log (filled in during implementation)

TBD.
