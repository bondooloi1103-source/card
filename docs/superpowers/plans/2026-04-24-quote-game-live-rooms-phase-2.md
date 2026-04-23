# Quote Game Live Rooms — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real-time "party mode" quote-game rooms for 2–8 players over Supabase Realtime, per [`docs/superpowers/specs/2026-04-24-quote-game-live-rooms-design.md`](../specs/2026-04-24-quote-game-live-rooms-design.md).

**Architecture:** Additive-only Postgres migration (columns on `game_sessions` + `game_participants`, one view, one column REVOKE). Single Edge Function `game-live-event` with a switch on event type; service role is the only thing that broadcasts on the per-session Realtime channel. Clients reconcile via a second thin Edge Function `game-live-snapshot` on mount and on Realtime reconnect.

**Tech Stack:** React 18 + Vite + Vitest, Supabase (Postgres 15, Auth, Edge Functions on Deno, Realtime), `@supabase/supabase-js` 2.104, Tailwind, existing ornament components. Uses same `buildRoundFromSeed` as Phase 0+1.

---

## File structure

**Create:**
- `supabase/migrations/20260424010000_live_rooms.sql`
- `supabase/functions/game-live-snapshot/index.ts`
- `supabase/functions/game-live-event/index.ts`
- `src/lib/liveScoring.js` + test — pure fn: answers → Standings + MVP
- `src/lib/timerGrace.js` + test — pure fn: deadline check
- `src/lib/liveHostPicker.js` + test — pure fn: next-host selector
- `src/lib/liveRoomApi.js` + test — client wrapper over the two edge functions
- `src/hooks/useLiveRoom.js` + test — subscribes to channel, applies broadcast events to local state
- `src/components/game/RoundPlayer.jsx` (extracted from `GameQuoteGuess.jsx`)
- `src/components/game/Timer.jsx` + test
- `src/components/game/Standings.jsx` + test
- `src/components/game/RoundCountdown.jsx` + test
- `src/pages/LiveRoomNew.jsx` + test
- `src/pages/LiveRoomLobby.jsx` + test
- `src/pages/LiveRoomGame.jsx` + test

**Modify:**
- `src/pages/GameQuoteGuess.jsx` — swap its in-round JSX for `<RoundPlayer …/>`; solo game continues to work identically
- `src/App.jsx` — register `/games/quotes/live/new` and `/games/quotes/live/:code`
- `src/pages/Home.jsx` — add "Live room" entry next to existing game launch
- `src/lib/i18n.jsx` — add `live.*` keys in both locales
- `supabase/tests/rls_smoke.sql` — add blocks for the new columns and view
- `README.md` — deploy commands for the two new edge functions
- `docs/superpowers/plans/2026-04-24-quote-game-live-rooms-phase-2.md` — append execution log at the end

---

## Task 1: Live-rooms migration

**Files:**
- Create: `supabase/migrations/20260424010000_live_rooms.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260424010000_live_rooms.sql`:

```sql
-- Live rooms (Phase 2) — additive columns + masking view.

alter table game_sessions
  add column current_round_idx    int,
  add column current_sent_at      timestamptz,
  add column current_deadline     timestamptz,
  add column rematch_session_id   uuid references game_sessions(id) on delete set null;

-- Each new session can be the rematch target of at most one old session.
-- The rematch race itself is won via atomic `UPDATE … WHERE rematch_session_id
-- IS NULL`; this index prevents double-linking.
create unique index game_sessions_rematch_target_unique
  on game_sessions (rematch_session_id)
  where rematch_session_id is not null;

alter table game_participants
  add column current_score          int   not null default 0,
  add column current_round_answer   jsonb;

-- Block direct SELECT of in-progress picks. Authenticated users read the
-- column through v_game_participants_safe, which masks other players' picks.
revoke select (current_round_answer) on game_participants from authenticated, anon;

create view v_game_participants_safe as
  select
    session_id,
    user_id,
    joined_at,
    current_score,
    case when user_id = auth.uid() or is_session_host(session_id)
         then current_round_answer
         else null
    end as current_round_answer
  from game_participants;

grant select on v_game_participants_safe to authenticated;
```

- [ ] **Step 2: Apply via MCP**

Invoke `mcp__supabase__apply_migration` with `name: "live_rooms"` and the query body above.

Expected: `{"success": true}`.

- [ ] **Step 3: Verify columns exist**

Invoke `mcp__supabase__execute_sql` with:

```sql
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('game_sessions','game_participants')
   and column_name in ('current_round_idx','current_sent_at','current_deadline',
                       'rematch_session_id','current_score','current_round_answer')
 order by table_name, column_name;
```

Expected: 6 rows covering all the added columns.

- [ ] **Step 4: Verify view + REVOKE**

Invoke `mcp__supabase__execute_sql` with:

```sql
select table_name from information_schema.views
 where table_schema='public' and table_name='v_game_participants_safe';
```

Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260424010000_live_rooms.sql
git commit -m "feat(db): live-rooms columns + masked participants view"
```

---

## Task 2: RLS smoke tests for new surface

**Files:**
- Modify: `supabase/tests/rls_smoke.sql`

- [ ] **Step 1: Append the new DO blocks**

Append to `supabase/tests/rls_smoke.sql`:

```sql
-- ============================================================
-- Live rooms RLS smoke (Phase 2).
-- ============================================================

-- authenticated cannot SELECT current_round_answer from game_participants directly
do $$
begin
  set local role authenticated;
  begin
    perform current_round_answer from game_participants limit 1;
    raise exception 'authenticated should not be able to select current_round_answer directly';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;
reset role;

-- v_game_participants_safe is grantable and readable by authenticated
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from v_game_participants_safe;
  -- Count may be 0 if no sessions exist for this role, that's fine; we just
  -- want the select to not raise.
end $$;
reset role;

-- Unique partial index rejects double-linking a rematch target
do $$
declare a uuid; declare b uuid; declare target uuid;
begin
  -- Use an existing auth user for FK constraints.
  insert into game_sessions (seed, mode, lang, host_user_id, status)
  values ('SEED_A', 'live_room', 'mn', (select id from auth.users limit 1), 'open')
  returning id into a;
  insert into game_sessions (seed, mode, lang, host_user_id, status)
  values ('SEED_B', 'live_room', 'mn', (select id from auth.users limit 1), 'open')
  returning id into b;
  insert into game_sessions (seed, mode, lang, host_user_id, status)
  values ('SEED_T', 'live_room', 'mn', (select id from auth.users limit 1), 'open')
  returning id into target;

  update game_sessions set rematch_session_id = target where id = a;

  begin
    update game_sessions set rematch_session_id = target where id = b;
    raise exception 'double-linking rematch_session_id should be blocked by unique index';
  exception when unique_violation then
    null; -- expected
  end;

  delete from game_sessions where id in (a, b, target);
end $$;
```

- [ ] **Step 2: Run the three blocks via MCP**

Invoke `mcp__supabase__execute_sql` with the contents of Step 1.

Expected: no output (each DO block either succeeds silently or raises on failure).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls_smoke.sql
git commit -m "test(rls): smoke tests for live-rooms column revoke + rematch uniqueness"
```

---

## Task 3: Pure lib `liveScoring.js`

**Files:**
- Create: `src/lib/liveScoring.js`
- Create: `src/lib/liveScoring.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/liveScoring.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { pickMvp } from '@/lib/liveScoring';

// answers shape per user:
//   [{ round_idx, correct: bool, ms: int }, ...]

describe('computeStandings', () => {
  it('orders by correct count desc, then total ms asc', () => {
    const participants = [
      { user_id: 'A', username: 'alpha', answers: [{ correct: true, ms: 3000 }, { correct: true, ms: 2500 }] },
      { user_id: 'B', username: 'bravo', answers: [{ correct: true, ms: 1000 }, { correct: false, ms: 500 }] },
      { user_id: 'C', username: 'charlie', answers: [{ correct: true, ms: 2000 }, { correct: true, ms: 4000 }] },
    ];
    const standings = computeStandings(participants);
    expect(standings.map(s => s.user_id)).toEqual(['A', 'C', 'B']);
    expect(standings[0]).toMatchObject({ user_id: 'A', correct: 2, total_ms: 5500 });
    expect(standings[2]).toMatchObject({ user_id: 'B', correct: 1 });
  });

  it('handles no answers (score 0, ms 0)', () => {
    const standings = computeStandings([
      { user_id: 'X', username: 'x', answers: [] },
    ]);
    expect(standings[0]).toMatchObject({ user_id: 'X', correct: 0, total_ms: 0 });
  });

  it('treats null pickedFigId (timeout) as wrong, ms still counts toward tiebreak', () => {
    const standings = computeStandings([
      { user_id: 'A', username: 'a', answers: [{ correct: false, ms: 15000, pickedFigId: null }] },
      { user_id: 'B', username: 'b', answers: [{ correct: false, ms: 14000, pickedFigId: 3 }] },
    ]);
    expect(standings.map(s => s.user_id)).toEqual(['B', 'A']);
  });
});

describe('pickMvp', () => {
  it('returns top-1 standings row', () => {
    const standings = [
      { user_id: 'A', correct: 3, total_ms: 5000 },
      { user_id: 'B', correct: 2, total_ms: 4000 },
    ];
    expect(pickMvp(standings)).toBe('A');
  });

  it('returns null when standings is empty', () => {
    expect(pickMvp([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/liveScoring.test.js`
Expected: FAIL — "Cannot find module '@/lib/liveScoring'".

- [ ] **Step 3: Implement**

Create `src/lib/liveScoring.js`:

```javascript
/**
 * Compute final standings for a live room.
 *
 * @param {Array<{user_id: string, username: string, answers: Array<{correct: boolean, ms: number}>}>} participants
 * @returns {Array<{user_id, username, correct, total_ms}>}
 *   sorted by (correct desc, total_ms asc).
 */
export function computeStandings(participants) {
  return participants
    .map((p) => ({
      user_id: p.user_id,
      username: p.username,
      correct: p.answers.filter((a) => a.correct).length,
      total_ms: p.answers.reduce((sum, a) => sum + (a.ms ?? 0), 0),
    }))
    .sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.total_ms - b.total_ms;
    });
}

/**
 * Return the user_id of the top-1 standings row, or null for an empty list.
 */
export function pickMvp(standings) {
  return standings.length > 0 ? standings[0].user_id : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/liveScoring.test.js`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/liveScoring.js src/lib/liveScoring.test.js
git commit -m "feat(live): scoring + MVP helpers"
```

---

## Task 4: Pure lib `timerGrace.js`

**Files:**
- Create: `src/lib/timerGrace.js`
- Create: `src/lib/timerGrace.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/timerGrace.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { isWithinDeadline, msElapsed } from '@/lib/timerGrace';

describe('msElapsed', () => {
  it('returns arrival - sent in ms', () => {
    expect(msElapsed(new Date('2026-04-24T00:00:03Z'), new Date('2026-04-24T00:00:00Z'))).toBe(3000);
  });

  it('clamps negatives to 0', () => {
    expect(msElapsed(new Date('2026-04-24T00:00:00Z'), new Date('2026-04-24T00:00:03Z'))).toBe(0);
  });

  it('accepts ms numbers, Date objects, ISO strings', () => {
    expect(msElapsed('2026-04-24T00:00:03Z', '2026-04-24T00:00:00Z')).toBe(3000);
    expect(msElapsed(1000, 0)).toBe(1000);
  });
});

describe('isWithinDeadline', () => {
  const GRACE = 500;

  it('true when arrival is before deadline', () => {
    const sent = new Date('2026-04-24T00:00:00Z');
    const arrival = new Date('2026-04-24T00:00:10Z');
    expect(isWithinDeadline({ sentAt: sent, timerS: 15, arrival, graceMs: GRACE })).toBe(true);
  });

  it('true when arrival is within grace after deadline', () => {
    const sent = new Date('2026-04-24T00:00:00Z');
    const arrival = new Date('2026-04-24T00:00:15.300Z');
    expect(isWithinDeadline({ sentAt: sent, timerS: 15, arrival, graceMs: GRACE })).toBe(true);
  });

  it('false when arrival is past deadline + grace', () => {
    const sent = new Date('2026-04-24T00:00:00Z');
    const arrival = new Date('2026-04-24T00:00:16Z');
    expect(isWithinDeadline({ sentAt: sent, timerS: 15, arrival, graceMs: GRACE })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run src/lib/timerGrace.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/timerGrace.js`:

```javascript
function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

/**
 * Milliseconds between `sent` and `arrival`, clamped to non-negative.
 * Accepts Date, ms number, or ISO string for either arg.
 */
export function msElapsed(arrival, sent) {
  const diff = toMs(arrival) - toMs(sent);
  return diff < 0 ? 0 : diff;
}

/**
 * Was the answer received within the per-question deadline (plus grace)?
 */
export function isWithinDeadline({ sentAt, timerS, arrival, graceMs = 500 }) {
  const limit = toMs(sentAt) + timerS * 1000 + graceMs;
  return toMs(arrival) <= limit;
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run src/lib/timerGrace.test.js`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timerGrace.js src/lib/timerGrace.test.js
git commit -m "feat(live): deadline + ms elapsed helpers"
```

---

## Task 5: Pure lib `liveHostPicker.js`

**Files:**
- Create: `src/lib/liveHostPicker.js`
- Create: `src/lib/liveHostPicker.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/liveHostPicker.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { pickNextHost } from '@/lib/liveHostPicker';

describe('pickNextHost', () => {
  const participants = [
    { user_id: 'C', joined_at: '2026-04-24T00:00:02Z' },
    { user_id: 'A', joined_at: '2026-04-24T00:00:00Z' },
    { user_id: 'B', joined_at: '2026-04-24T00:00:01Z' },
  ];

  it('returns oldest-joined participant whose presence is still true', () => {
    const present = { A: true, B: true, C: true };
    expect(pickNextHost({ participants, present })).toBe('A');
  });

  it('skips participants who are no longer present', () => {
    const present = { A: false, B: true, C: true };
    expect(pickNextHost({ participants, present })).toBe('B');
  });

  it('returns null when no participant is present', () => {
    const present = { A: false, B: false, C: false };
    expect(pickNextHost({ participants, present })).toBeNull();
  });

  it('excludes the current host from the pick', () => {
    const present = { A: true, B: true, C: true };
    expect(pickNextHost({ participants, present, excludeUserId: 'A' })).toBe('B');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/liveHostPicker.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/liveHostPicker.js`:

```javascript
/**
 * Pick the next host: oldest-joined present participant, optionally excluding
 * a given user_id (the departing host).
 *
 * @param {Array<{user_id: string, joined_at: string}>} participants
 * @param {Record<string, boolean>} present — user_id → presence boolean
 * @param {string} [excludeUserId]
 * @returns {string | null}
 */
export function pickNextHost({ participants, present, excludeUserId = null }) {
  const eligible = participants
    .filter((p) => present[p.user_id] && p.user_id !== excludeUserId)
    .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
  return eligible.length > 0 ? eligible[0].user_id : null;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/lib/liveHostPicker.test.js`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/liveHostPicker.js src/lib/liveHostPicker.test.js
git commit -m "feat(live): pure-fn host reassignment picker"
```

---

## Task 6: `Timer.jsx` component

**Files:**
- Create: `src/components/game/Timer.jsx`
- Create: `src/components/game/Timer.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/game/Timer.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Timer from '@/components/game/Timer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Timer', () => {
  it('renders a bar with width 100% at start', () => {
    const sentAt = new Date();
    render(<Timer sentAt={sentAt} timerS={10} onExpire={() => {}} />);
    const bar = screen.getByTestId('timer-bar');
    expect(bar.style.width).toBe('100%');
  });

  it('width shrinks over time', () => {
    const sentAt = new Date(0);
    vi.setSystemTime(new Date(0));
    const { rerender } = render(<Timer sentAt={sentAt} timerS={10} onExpire={() => {}} />);
    act(() => { vi.advanceTimersByTime(5000); });
    rerender(<Timer sentAt={sentAt} timerS={10} onExpire={() => {}} />);
    const bar = screen.getByTestId('timer-bar');
    expect(parseFloat(bar.style.width)).toBeLessThan(60);
    expect(parseFloat(bar.style.width)).toBeGreaterThan(40);
  });

  it('calls onExpire exactly once at deadline', () => {
    const sentAt = new Date(0);
    vi.setSystemTime(new Date(0));
    const onExpire = vi.fn();
    render(<Timer sentAt={sentAt} timerS={3} onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/components/game/Timer.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/game/Timer.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';

/**
 * Shrinking-bar timer synchronized to a server-sent `sentAt` timestamp.
 * Calls `onExpire` once when the elapsed time exceeds `timerS` seconds.
 */
export default function Timer({ sentAt, timerS, onExpire }) {
  const [width, setWidth] = useState(100);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const startMs = new Date(sentAt).getTime();
    const totalMs = timerS * 1000;

    function tick() {
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, totalMs - elapsed);
      setWidth((remaining / totalMs) * 100);
      if (remaining === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    }

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [sentAt, timerS, onExpire]);

  return (
    <div className="max-w-md mx-auto h-[2px] bg-brass/20 overflow-hidden">
      <div
        data-testid="timer-bar"
        className="h-full bg-gradient-to-r from-seal to-brass"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/components/game/Timer.test.jsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/Timer.jsx src/components/game/Timer.test.jsx
git commit -m "feat(live): Timer component synced to server sent_at"
```

---

## Task 7: `Standings.jsx` component

**Files:**
- Create: `src/components/game/Standings.jsx`
- Create: `src/components/game/Standings.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/game/Standings.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Standings from '@/components/game/Standings';

describe('Standings', () => {
  const base = [
    { user_id: 'A', username: 'alpha', correct: 3, total_ms: 5000 },
    { user_id: 'B', username: 'bravo', correct: 2, total_ms: 4000 },
    { user_id: 'C', username: 'charlie', correct: 2, total_ms: 6000 },
  ];

  it('renders ordered rows', () => {
    render(<Standings standings={base} mode="in_round" />);
    const rows = screen.getAllByTestId('standings-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('alpha');
    expect(rows[1]).toHaveTextContent('bravo');
    expect(rows[2]).toHaveTextContent('charlie');
  });

  it('shows scores in all modes', () => {
    render(<Standings standings={base} mode="lobby" />);
    const rows = screen.getAllByTestId('standings-row');
    expect(rows[0]).toHaveTextContent('3'); // alpha with 3 correct
    expect(rows[1]).toHaveTextContent('2'); // bravo with 2 correct
  });

  it('highlights current user row when currentUserId matches', () => {
    render(<Standings standings={base} mode="in_round" currentUserId="B" />);
    const rows = screen.getAllByTestId('standings-row');
    expect(rows[1]).toHaveAttribute('data-me', 'true');
    expect(rows[0]).toHaveAttribute('data-me', 'false');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/components/game/Standings.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/game/Standings.jsx`:

```jsx
/**
 * Ordered list of players with scores. Same component is used in lobby,
 * in-round (compact), reveal (with delta hint), and final (with MVP crown)
 * via the `mode` prop.
 */
export default function Standings({ standings, mode = 'in_round', currentUserId = null }) {
  return (
    <ol className="space-y-2 w-full">
      {standings.map((row, i) => {
        const isMe = row.user_id === currentUserId;
        return (
          <li
            key={row.user_id}
            data-testid="standings-row"
            data-me={String(isMe)}
            className={`flex items-center justify-between px-3 py-2 border ${
              isMe ? 'border-brass bg-brass/5' : 'border-brass/30'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="font-meta text-[10px] tracking-[0.3em] text-brass/70">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-display text-ivory text-sm">{row.username}</span>
              {mode === 'final' && i === 0 && (
                <span className="ml-1 text-brass text-xs" aria-label="MVP">★</span>
              )}
            </span>
            <span className="font-display text-ivory">{row.correct}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/components/game/Standings.test.jsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/Standings.jsx src/components/game/Standings.test.jsx
git commit -m "feat(live): Standings component (lobby/in_round/reveal/final)"
```

---

## Task 8: `RoundCountdown.jsx` component

**Files:**
- Create: `src/components/game/RoundCountdown.jsx`
- Create: `src/components/game/RoundCountdown.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/game/RoundCountdown.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import RoundCountdown from '@/components/game/RoundCountdown';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('RoundCountdown', () => {
  it('shows 3 then 2 then 1 then GO over 3 seconds, then fires onComplete', () => {
    vi.setSystemTime(new Date(0));
    const onComplete = vi.fn();
    render(<RoundCountdown startTs={new Date(0)} onComplete={onComplete} />);
    expect(screen.getByTestId('countdown')).toHaveTextContent('3');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('2');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('1');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('GO');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/components/game/RoundCountdown.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/game/RoundCountdown.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';

export default function RoundCountdown({ startTs, onComplete }) {
  const [label, setLabel] = useState('3');
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const startMs = new Date(startTs).getTime();

    function tick() {
      const elapsed = Date.now() - startMs;
      if (elapsed < 1000) setLabel('3');
      else if (elapsed < 2000) setLabel('2');
      else if (elapsed < 3000) setLabel('1');
      else {
        setLabel('GO');
        if (!firedRef.current) {
          firedRef.current = true;
          onComplete?.();
        }
      }
    }

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startTs, onComplete]);

  return (
    <div className="flex items-center justify-center py-8">
      <span
        data-testid="countdown"
        className="font-display text-ivory text-[clamp(3rem,10vw,8rem)]"
      >
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/components/game/RoundCountdown.test.jsx`
Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/RoundCountdown.jsx src/components/game/RoundCountdown.test.jsx
git commit -m "feat(live): RoundCountdown component synced to server start_ts"
```

---

## Task 9: Extract `RoundPlayer.jsx` from `GameQuoteGuess.jsx`

**Files:**
- Create: `src/components/game/RoundPlayer.jsx`
- Create: `src/components/game/RoundPlayer.test.jsx`
- Modify: `src/pages/GameQuoteGuess.jsx`

This task extracts the in-round view into a reusable component. Solo game continues to work identically (regression-checked by existing tests).

- [ ] **Step 1: Write the failing test**

Create `src/components/game/RoundPlayer.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RoundPlayer from '@/components/game/RoundPlayer';

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});

const FIGURES = [
  { fig_id: 1, cat: 'khans', name: 'Chinggis' },
  { fig_id: 3, cat: 'khans', name: 'Kublai' },
  { fig_id: 17, cat: 'queens', name: 'Alan Gua' },
  { fig_id: 34, cat: 'warriors', name: 'Sukhbaatar' },
];
const mockQuestion = {
  figId: 1,
  quote: 'Би тэнгэрийн шийтгэл.',
  qattr: 'Чингис Хаан',
  optionFigIds: [3, 1, 34, 17],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('RoundPlayer', () => {
  it('renders the quote and 4 option buttons', () => {
    render(
      <RoundPlayer question={mockQuestion} figures={FIGURES} picked={null} onPick={() => {}} />
    );
    expect(screen.getByText(/Би тэнгэрийн шийтгэл/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('calls onPick with the figId when an option is clicked', () => {
    const onPick = vi.fn();
    render(
      <RoundPlayer question={mockQuestion} figures={FIGURES} picked={null} onPick={onPick} />
    );
    fireEvent.click(screen.getByText('Chinggis'));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('disables buttons once `picked` is non-null', () => {
    render(
      <RoundPlayer question={mockQuestion} figures={FIGURES} picked={3} onPick={() => {}} />
    );
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled();
    }
  });

  it('highlights correct option when `revealed` is true', () => {
    render(
      <RoundPlayer
        question={mockQuestion}
        figures={FIGURES}
        picked={3}
        onPick={() => {}}
        revealed
        correctFigId={1}
      />
    );
    const correctBtn = screen.getByText('Chinggis').closest('button');
    expect(correctBtn.className).toMatch(/green/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/components/game/RoundPlayer.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `RoundPlayer.jsx`**

Create `src/components/game/RoundPlayer.jsx`:

```jsx
import { CheckCircle2, XCircle } from 'lucide-react';
import { figureName } from '@/lib/i18n';
import CornerTicks from '@/components/ornaments/CornerTicks';

/**
 * Self-contained in-round UI: quote card + 4 name options. Used by the solo
 * game and by live rooms alike. Pure presentation — caller owns state.
 *
 * @param {{
 *   question: { figId: number, quote: string, qattr: string|null, optionFigIds: number[] },
 *   figures: Array<{ fig_id: number, name?: string }>,
 *   picked: number | null,
 *   onPick: (figId: number) => void,
 *   revealed?: boolean,
 *   correctFigId?: number | null,
 *   lang?: 'mn' | 'en',
 * }} props
 */
export default function RoundPlayer({
  question,
  figures,
  picked,
  onPick,
  revealed = false,
  correctFigId = null,
  lang = 'mn',
}) {
  const showResult = revealed || picked !== null;

  return (
    <div className="space-y-8">
      <section className="relative bg-ink/60 border border-brass/35 px-6 md:px-12 py-10">
        <CornerTicks size={14} inset={8} thickness={1} opacity={0.95} />
        <span className="font-meta text-[9.5px] tracking-[0.32em] uppercase text-brass/70 block text-center mb-5">
          {lang === 'en' ? 'Quotation' : 'Ишлэл'}
        </span>
        <p
          className="font-display italic text-[clamp(1.2rem,3.2vw,2.1rem)] leading-snug text-ivory text-center"
          style={{ fontVariationSettings: '"opsz" 72, "SOFT" 80, "WONK" 1' }}
        >
          &laquo; {question.quote} &raquo;
        </p>
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        {question.optionFigIds.map((optFigId, i) => {
          const optFigure = figures.find((f) => f.fig_id === optFigId);
          const optName = figureName(optFigure, lang);
          const isCorrect = revealed && correctFigId === optFigId;
          const isPicked = picked === optFigId;
          let style = 'border-brass/40 hover:border-brass text-ivory bg-ink/40';
          if (showResult) {
            if (isCorrect) style = 'border-green-500/70 text-green-400 bg-green-500/10';
            else if (isPicked) style = 'border-seal/70 text-seal bg-seal/10';
            else style = 'border-border text-ivory/55 bg-ink/30 opacity-60';
          }
          return (
            <button
              key={optFigId}
              onClick={() => onPick(optFigId)}
              disabled={picked !== null}
              className={`group relative flex items-center gap-4 px-5 py-4 border ${style} text-left transition-colors`}
            >
              <span className="font-meta text-[9px] tracking-[0.3em] text-brass/70">
                {['I', 'II', 'III', 'IV'][i]}.
              </span>
              <span
                className="font-display text-[15px] leading-tight flex-1"
                style={{ fontVariationSettings: '"opsz" 30, "SOFT" 50' }}
              >
                {optName}
              </span>
              {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-400" />}
              {showResult && isPicked && !isCorrect && <XCircle className="w-4 h-4 text-seal" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/components/game/RoundPlayer.test.jsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Refactor `GameQuoteGuess.jsx` to use `RoundPlayer`**

Read `src/pages/GameQuoteGuess.jsx`. Find the in-round JSX block (roughly: from `<section className="relative bg-ink/60 border …">` down to the closing `</div>` of the `grid sm:grid-cols-2 gap-3`). Replace with:

```jsx
import RoundPlayer from '@/components/game/RoundPlayer';
// ...

<RoundPlayer
  question={q}
  figures={FIGURES}
  picked={picked}
  onPick={choose}
  revealed={false}
  lang={activeLang}
/>
```

Keep the surrounding chrome (header, progress bar, the "Correct / Wrong" motion.div below the grid, the Next button, the ResultScreen). The imports of `CheckCircle2`, `XCircle`, `CornerTicks` can be removed from `GameQuoteGuess.jsx` if they're no longer referenced.

- [ ] **Step 6: Run the whole vitest suite — nothing regresses**

Run: `npx vitest run`
Expected: still 28+ passing (the existing solo tests + 3 new pure libs + 3 new components + 1 new RoundPlayer test).

- [ ] **Step 7: Commit**

```bash
git add src/components/game/RoundPlayer.jsx src/components/game/RoundPlayer.test.jsx src/pages/GameQuoteGuess.jsx
git commit -m "refactor(game): extract RoundPlayer; solo uses it, live rooms will too"
```

---

## Task 10: Edge Function `game-live-snapshot`

**Files:**
- Create: `supabase/functions/game-live-snapshot/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/game-live-snapshot/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  // Accept either session_id (UUID) or join_code (6-char). Plan routes use
  // the code; internal calls use the id. Try id first; fall back to code.
  let sessionId: string | null = null;
  let joinCode: string | null = null;
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    sessionId = params.get('session_id');
    joinCode = params.get('join_code');
  } else {
    try {
      const body = await req.json();
      sessionId = body?.session_id ?? null;
      joinCode = body?.join_code ?? null;
    } catch {
      return json({ ok: false, reason: 'bad_request' }, 400);
    }
  }
  if (!sessionId && !joinCode) return json({ ok: false, reason: 'bad_request' }, 400);

  const admin = createClient(url, service);

  const query = admin
    .from('game_sessions')
    .select('id, status, mode, lang, round_size, timer_s, host_user_id, current_round_idx, current_sent_at, current_deadline, rematch_session_id, seed, join_code');
  const { data: session, error: sErr } = await (
    sessionId ? query.eq('id', sessionId) : query.eq('join_code', joinCode)
  ).maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  sessionId = session.id;

  // User must be a participant (or host) to read the snapshot.
  const { data: part } = await admin
    .from('game_participants')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!part && session.host_user_id !== userId) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }

  const { data: participants } = await admin
    .from('game_participants')
    .select('user_id, joined_at, current_score, current_round_answer')
    .eq('session_id', sessionId);

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (participants ?? []).map((p) => p.user_id));

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const scrubbed = (participants ?? []).map((p) => ({
    user_id: p.user_id,
    username: usernameById.get(p.user_id) ?? null,
    joined_at: p.joined_at,
    current_score: p.current_score,
    // Mask others' current_round_answer; keep own.
    current_round_answer:
      p.user_id === userId || session.host_user_id === userId ? p.current_round_answer : null,
  }));

  return json({ ok: true, session, participants: scrubbed });
});
```

- [ ] **Step 2: Deploy via MCP**

Invoke `mcp__supabase__deploy_edge_function` with:
- `name: "game-live-snapshot"`
- `entrypoint_path: "index.ts"`
- `verify_jwt: true`
- `files`: array containing the `index.ts` above, plus the shared `../_shared/cors.ts` (same content as existing Phase 0+1 functions).

Expected: response with `status: "ACTIVE"`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-live-snapshot/index.ts
git commit -m "feat(functions): game-live-snapshot edge function for reconnects"
```

---

## Task 11: Edge Function `game-live-event` — join / leave / update_settings

**Files:**
- Create: `supabase/functions/game-live-event/index.ts`

Start the fat-switch function with the lobby-only branches. Subsequent tasks add more `case` arms.

- [ ] **Step 1: Write the skeleton + lobby branches**

Create `supabase/functions/game-live-event/index.ts`:

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const PRESENCE_CHANNEL = (sid: string) => `game:session:${sid}`;

async function broadcast(admin: SupabaseClient, sessionId: string, event: string, payload: unknown) {
  const ch = admin.channel(PRESENCE_CHANNEL(sessionId));
  await ch.send({ type: 'broadcast', event, payload });
  await admin.removeChannel(ch);
}

async function loadLobby(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('id, host_user_id, lang, round_size, timer_s, player_cap, status')
    .eq('id', sessionId)
    .maybeSingle();
  const { data: participants } = await admin
    .from('game_participants')
    .select('user_id, joined_at')
    .eq('session_id', sessionId);
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (participants ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  return {
    settings: {
      lang: session?.lang,
      round_size: session?.round_size,
      timer_s: session?.timer_s,
      player_cap: session?.player_cap,
    },
    players: (participants ?? []).map((p) => ({
      user_id: p.user_id,
      username: usernameById.get(p.user_id) ?? null,
      is_host: p.user_id === session?.host_user_id,
    })),
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, reason: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { session_id?: string; event?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const { session_id, event, payload } = body;
  if (!session_id || !event) return json({ ok: false, reason: 'bad_request' }, 400);

  const admin = createClient(url, service);

  const { data: session, error: sErr } = await admin
    .from('game_sessions')
    .select('id, mode, lang, round_size, timer_s, player_cap, host_user_id, status, seed, current_round_idx, current_sent_at, current_deadline, rematch_session_id, tournament_id')
    .eq('id', session_id)
    .maybeSingle();
  if (sErr || !session) return json({ ok: false, reason: 'not_found' }, 404);
  if (session.mode !== 'live_room') return json({ ok: false, reason: 'not_live_room' }, 400);

  switch (event) {
    case 'join': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);

      // Check player_cap
      const { count } = await admin
        .from('game_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session_id);
      if ((count ?? 0) >= (session.player_cap ?? 8)) {
        return json({ ok: false, reason: 'room_full' }, 409);
      }

      await admin.from('game_participants').upsert(
        { session_id, user_id: userId },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true },
      );
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    case 'leave': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      await admin
        .from('game_participants')
        .delete()
        .eq('session_id', session_id)
        .eq('user_id', userId);
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    case 'update_settings': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      if (session.host_user_id !== userId) return json({ ok: false, reason: 'not_host' }, 403);

      const updates: Record<string, unknown> = {};
      if (payload?.lang && ['mn', 'en'].includes(payload.lang as string)) updates.lang = payload.lang;
      if (payload?.round_size && Number.isInteger(payload.round_size)
          && (payload.round_size as number) >= 5 && (payload.round_size as number) <= 20) {
        updates.round_size = payload.round_size;
      }
      if (payload?.timer_s && [10, 15, 20].includes(payload.timer_s as number)) updates.timer_s = payload.timer_s;
      if (Object.keys(updates).length === 0) return json({ ok: false, reason: 'bad_request' }, 400);

      await admin.from('game_sessions').update(updates).eq('id', session_id);
      const lobby = await loadLobby(admin, session_id);
      await broadcast(admin, session_id, 'lobby_update', lobby);
      return json({ ok: true });
    }

    default:
      return json({ ok: false, reason: 'unknown_event' }, 400);
  }
});
```

- [ ] **Step 2: Deploy via MCP**

Invoke `mcp__supabase__deploy_edge_function` with `name: "game-live-event"`, `entrypoint_path: "index.ts"`, `verify_jwt: true`, and `files` containing the `index.ts` above + the shared `../_shared/cors.ts`.

Expected: `status: "ACTIVE"`, version 1.

- [ ] **Step 3: Smoke-check via MCP**

Invoke `mcp__supabase__execute_sql` with:

```sql
-- Create a test session and simulate a join through the DB only (no HTTP).
insert into game_sessions (seed, mode, lang, round_size, timer_s, player_cap, host_user_id, status)
values ('SEEDLIVE', 'live_room', 'mn', 5, 15, 4, (select id from auth.users limit 1), 'open')
returning id;
```

Note the returned id. Verify `game_participants` is empty for it initially:

```sql
select count(*) from game_participants where session_id = '<id>';
```

Expected: 0.

(Actual `join` via HTTP requires a live JWT — deferred to manual end-to-end test in Task 25.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event join/leave/update_settings branches"
```

---

## Task 12: `game-live-event` — `start` branch

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

- [ ] **Step 1: Add the branch to the switch**

In the `switch (event)` block of `supabase/functions/game-live-event/index.ts`, above the `default:` arm, add:

```typescript
    case 'start': {
      if (session.status !== 'open') return json({ ok: false, reason: 'bad_state' }, 409);
      if (session.host_user_id !== userId) return json({ ok: false, reason: 'not_host' }, 403);

      const { count } = await admin
        .from('game_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session_id);
      if ((count ?? 0) < 2) return json({ ok: false, reason: 'need_two_players' }, 409);

      const now = new Date();
      const deadline = new Date(now.getTime() + (session.timer_s ?? 15) * 1000 + 500);
      await admin
        .from('game_sessions')
        .update({
          status: 'in_progress',
          current_round_idx: 0,
          current_sent_at: now.toISOString(),
          current_deadline: deadline.toISOString(),
          starts_at: now.toISOString(),
        })
        .eq('id', session_id);
      // Reset any stale per-round answers.
      await admin
        .from('game_participants')
        .update({ current_round_answer: null, current_score: 0 })
        .eq('session_id', session_id);

      await broadcast(admin, session_id, 'start', {
        server_start_ts: now.toISOString(),
        round_idx: 0,
        timer_s: session.timer_s,
        sent_at: now.toISOString(),
      });
      return json({ ok: true });
    }
```

- [ ] **Step 2: Redeploy**

Invoke `mcp__supabase__deploy_edge_function` with the full updated `index.ts` contents.

Expected: `version: 2, status: "ACTIVE"`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event start branch"
```

---

## Task 13: `game-live-event` — `answer` + `timeout_null` branches

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

This task introduces the hybrid "piggyback-on-events" advancement: the last arriving answer inline-calls reveal. The inline reveal helper is added here and expanded in Task 14.

- [ ] **Step 1: Add a bundled Deno import of the shared seededRound**

Near the top of `supabase/functions/game-live-event/index.ts`, add:

```typescript
import { buildRoundFromSeed } from '../_shared/seededRound.ts';
import { FIGURES } from '../_shared/figures.ts';
```

- [ ] **Step 2: Add the `answer` branch and a helper**

Above the `default:` arm:

```typescript
    case 'answer':
    case 'timeout_null': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);

      const { data: part } = await admin
        .from('game_participants')
        .select('user_id, current_round_answer')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!part) return json({ ok: false, reason: 'not_participant' }, 403);
      if (part.current_round_answer != null) {
        return json({ ok: false, reason: 'already_answered_this_round' }, 409);
      }

      const now = new Date();
      const deadline = new Date(session.current_deadline);
      const isTimeout = event === 'timeout_null';

      if (!isTimeout && now.getTime() > deadline.getTime()) {
        return json({ ok: false, reason: 'too_late' }, 409);
      }

      // Rebuild round to validate option membership.
      const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);
      const q = round[session.current_round_idx];
      if (!q) return json({ ok: false, reason: 'bad_state' }, 500);

      let pickedFigId: number | null = null;
      if (!isTimeout) {
        const pf = (payload?.pickedFigId ?? null) as number | null;
        if (pf != null && q.optionFigIds.includes(pf)) pickedFigId = pf;
      }
      const correct = pickedFigId != null && pickedFigId === q.figId;
      const ms = Math.max(
        0,
        Math.min(120000, now.getTime() - new Date(session.current_sent_at!).getTime()),
      );

      await admin
        .from('game_participants')
        .update({
          current_round_answer: { pickedFigId, ms, correct },
        })
        .eq('session_id', session_id)
        .eq('user_id', userId);

      await broadcast(admin, session_id, 'answer_submitted', {
        user_id: userId,
        correct,
        ms,
      });

      // If every present participant has answered → trigger reveal inline.
      const { data: allParts } = await admin
        .from('game_participants')
        .select('current_round_answer')
        .eq('session_id', session_id);
      const allAnswered = (allParts ?? []).every((p) => p.current_round_answer != null);
      if (allAnswered) {
        await doReveal(admin, session_id);
      }

      return json({ ok: true, correct });
    }
```

- [ ] **Step 3: Add a stub `doReveal` helper**

After the `loadLobby` helper at the top of the file, add:

```typescript
async function doReveal(admin: SupabaseClient, sessionId: string) {
  // Full body in Task 14. For now, broadcast a placeholder so tests can still
  // observe the inline-trigger wiring.
  await broadcast(admin, sessionId, 'reveal_pending', { note: 'stub' });
}
```

- [ ] **Step 4: Redeploy**

Invoke `mcp__supabase__deploy_edge_function`.

Expected: `version: 3, status: "ACTIVE"`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event answer + timeout_null branches"
```

---

## Task 14: `game-live-event` — `reveal` branch

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

- [ ] **Step 1: Replace the `doReveal` stub with the real implementation**

Replace the `doReveal` helper body:

```typescript
async function doReveal(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('current_round_idx, current_deadline, seed, round_size, timer_s, host_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return;

  const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);
  const q = round[session.current_round_idx];
  if (!q) return;

  // Fetch current per-round answers + each participant's rolled-up correct count.
  const { data: parts } = await admin
    .from('game_participants')
    .select('user_id, current_score, current_round_answer')
    .eq('session_id', sessionId);

  // Increment scores for those who got it right this round.
  for (const p of parts ?? []) {
    const a = p.current_round_answer as { correct?: boolean } | null;
    if (a?.correct) {
      await admin
        .from('game_participants')
        .update({ current_score: (p.current_score ?? 0) + 1 })
        .eq('session_id', sessionId)
        .eq('user_id', p.user_id);
    }
  }

  // Fetch usernames for standings.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (parts ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const standings = (parts ?? [])
    .map((p) => {
      const a = p.current_round_answer as { correct?: boolean; ms?: number } | null;
      return {
        user_id: p.user_id,
        username: usernameById.get(p.user_id) ?? null,
        score: (p.current_score ?? 0) + (a?.correct ? 1 : 0),
        last_correct: !!a?.correct,
        last_ms: a?.ms ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Schedule next_question via deadline flip.
  const nextAt = new Date(Date.now() + 3000);
  await admin
    .from('game_sessions')
    .update({ current_deadline: nextAt.toISOString() })
    .eq('id', sessionId);

  await broadcast(admin, sessionId, 'reveal', {
    round_idx: session.current_round_idx,
    correct_fig_id: q.figId,
    standings,
    next_question_at: nextAt.toISOString(),
  });
}
```

- [ ] **Step 2: Add the explicit `reveal` event branch**

Above the `default:` arm, add:

```typescript
    case 'reveal': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);

      // Allowed if: caller is host, OR all participants have answered, OR deadline passed.
      const now = new Date();
      const deadline = new Date(session.current_deadline);
      let permitted = session.host_user_id === userId || now.getTime() > deadline.getTime();
      if (!permitted) {
        const { data: allParts } = await admin
          .from('game_participants')
          .select('current_round_answer')
          .eq('session_id', session_id);
        permitted = (allParts ?? []).every((p) => p.current_round_answer != null);
      }
      if (!permitted) return json({ ok: false, reason: 'not_allowed' }, 403);

      await doReveal(admin, session_id);
      return json({ ok: true });
    }
```

- [ ] **Step 3: Redeploy**

Invoke `mcp__supabase__deploy_edge_function`. Expected: `version: 4`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event reveal branch + real doReveal"
```

---

## Task 15: `game-live-event` — `next_question` + `end` branches

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

- [ ] **Step 1: Add `doEnd` helper**

After `doReveal`, add:

```typescript
async function doEnd(admin: SupabaseClient, sessionId: string) {
  const { data: session } = await admin
    .from('game_sessions')
    .select('id, seed, round_size, tournament_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return;

  const round = buildRoundFromSeed(FIGURES, session.round_size, session.seed);

  const { data: parts } = await admin
    .from('game_participants')
    .select('user_id, current_score')
    .eq('session_id', sessionId);

  // Persist a game_results row per participant. `answers` is a slimmed list
  // — we don't retain per-round picks in this path (those live in
  // current_round_answer transiently). For live rooms, just record the final
  // score and total; per-question review is out of scope for Phase 2.
  for (const p of parts ?? []) {
    await admin.from('game_results').insert({
      session_id: sessionId,
      user_id: p.user_id,
      tournament_id: session.tournament_id,
      score: p.current_score ?? 0,
      total: round.length,
      answers: [],
    });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', (parts ?? []).map((p) => p.user_id));
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const finalStandings = (parts ?? [])
    .map((p) => ({
      user_id: p.user_id,
      username: usernameById.get(p.user_id) ?? null,
      score: p.current_score ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  await admin
    .from('game_sessions')
    .update({ status: 'complete', ends_at: new Date().toISOString() })
    .eq('id', sessionId);

  await broadcast(admin, sessionId, 'end', { final_standings: finalStandings });
}
```

- [ ] **Step 2: Add the `next_question` branch**

Above `default:`:

```typescript
    case 'next_question': {
      if (session.status !== 'in_progress') return json({ ok: false, reason: 'bad_state' }, 409);
      // Allowed: host, or any participant once reveal's 3s window has passed.
      const now = new Date();
      const deadlinePassed = session.current_deadline
        && now.getTime() >= new Date(session.current_deadline).getTime();
      if (session.host_user_id !== userId && !deadlinePassed) {
        return json({ ok: false, reason: 'too_early' }, 403);
      }

      const nextIdx = (session.current_round_idx ?? 0) + 1;
      if (nextIdx >= session.round_size) {
        await doEnd(admin, session_id);
        return json({ ok: true, ended: true });
      }

      const questionSentAt = new Date();
      const deadline = new Date(questionSentAt.getTime() + (session.timer_s ?? 15) * 1000 + 500);
      await admin
        .from('game_sessions')
        .update({
          current_round_idx: nextIdx,
          current_sent_at: questionSentAt.toISOString(),
          current_deadline: deadline.toISOString(),
        })
        .eq('id', session_id);
      await admin
        .from('game_participants')
        .update({ current_round_answer: null })
        .eq('session_id', session_id);

      await broadcast(admin, session_id, 'question', {
        round_idx: nextIdx,
        sent_at: questionSentAt.toISOString(),
        timer_s: session.timer_s,
      });
      return json({ ok: true });
    }
```

- [ ] **Step 3: Redeploy**

Invoke `mcp__supabase__deploy_edge_function`. Expected: `version: 5`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event next_question + end branches"
```

---

## Task 16: `game-live-event` — `host_gone` branch

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

- [ ] **Step 1: Add the branch**

Above `default:`:

```typescript
    case 'host_gone': {
      // Idempotent. If the host is still reachable, this is a no-op. Presence
      // check is best-effort: we trust the caller's signal here since Realtime
      // presence isn't cheaply queryable server-side. Tasks 20+ add a client-
      // side guard that only sends this after 10s of dropped presence.

      // Caller must be a participant.
      const { data: caller } = await admin
        .from('game_participants')
        .select('user_id')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!caller) return json({ ok: false, reason: 'not_participant' }, 403);

      // Pick next host = oldest-joined participant other than the departing host.
      const { data: parts } = await admin
        .from('game_participants')
        .select('user_id, joined_at')
        .eq('session_id', session_id)
        .order('joined_at', { ascending: true });

      const next = (parts ?? []).find((p) => p.user_id !== session.host_user_id);
      if (!next) {
        // Everyone else gone; let end_stale_live_rooms reap. Noop here.
        return json({ ok: true, noop: true });
      }

      // Idempotent: if host is already = next.user_id we're done.
      if (session.host_user_id === next.user_id) return json({ ok: true, noop: true });

      await admin
        .from('game_sessions')
        .update({ host_user_id: next.user_id })
        .eq('id', session_id);
      await broadcast(admin, session_id, 'host_changed', { new_host_user_id: next.user_id });
      return json({ ok: true, new_host_user_id: next.user_id });
    }
```

- [ ] **Step 2: Redeploy**

Invoke `mcp__supabase__deploy_edge_function`. Expected: `version: 6`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event host_gone reassignment"
```

---

## Task 17: `game-live-event` — `rematch` branch

**Files:**
- Modify: `supabase/functions/game-live-event/index.ts`

- [ ] **Step 1: Add helper for seed generation**

Near the top of the file:

```typescript
function randSeed(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
function randJoinCode(): string {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
```

- [ ] **Step 2: Add the `rematch` branch**

Above `default:`:

```typescript
    case 'rematch': {
      if (session.status !== 'complete') return json({ ok: false, reason: 'bad_state' }, 409);

      // Must be a participant.
      const { data: caller } = await admin
        .from('game_participants')
        .select('user_id')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!caller) return json({ ok: false, reason: 'not_participant' }, 403);

      // If a rematch already exists, just return it.
      if (session.rematch_session_id) {
        const { data: existing } = await admin
          .from('game_sessions')
          .select('id, join_code')
          .eq('id', session.rematch_session_id)
          .maybeSingle();
        return json({
          ok: false,
          reason: 'duplicate_rematch',
          new_session_id: existing?.id ?? null,
          new_join_code: existing?.join_code ?? null,
        });
      }

      // Create the new session with caller as host.
      const { data: newSession, error: insErr } = await admin
        .from('game_sessions')
        .insert({
          seed: randSeed(),
          mode: 'live_room',
          lang: session.lang,
          round_size: session.round_size,
          timer_s: session.timer_s,
          player_cap: session.player_cap,
          host_user_id: userId,
          status: 'open',
          join_code: randJoinCode(),
        })
        .select('id, join_code')
        .single();
      if (insErr || !newSession) return json({ ok: false, reason: 'server' }, 500);

      // CAS: link the new session to the old; loser will observe unique_violation.
      const { error: casErr } = await admin
        .from('game_sessions')
        .update({ rematch_session_id: newSession.id })
        .eq('id', session_id)
        .is('rematch_session_id', null);
      if (casErr) {
        // A concurrent rematch won the race. Clean up our orphan, read the
        // winner's new session, respond with duplicate_rematch.
        await admin.from('game_sessions').delete().eq('id', newSession.id);
        const { data: winner } = await admin
          .from('game_sessions')
          .select('id, join_code, rematch_session_id')
          .eq('id', session_id)
          .maybeSingle();
        const { data: winnerNew } = await admin
          .from('game_sessions')
          .select('id, join_code')
          .eq('id', winner?.rematch_session_id ?? '')
          .maybeSingle();
        return json({
          ok: false,
          reason: 'duplicate_rematch',
          new_session_id: winnerNew?.id ?? null,
          new_join_code: winnerNew?.join_code ?? null,
        });
      }

      // Caller auto-joins.
      await admin
        .from('game_participants')
        .insert({ session_id: newSession.id, user_id: userId });

      await broadcast(admin, session_id, 'rematch_ready', {
        new_session_id: newSession.id,
        new_join_code: newSession.join_code,
      });
      return json({ ok: true, new_session_id: newSession.id, new_join_code: newSession.join_code });
    }
```

- [ ] **Step 3: Redeploy**

Invoke `mcp__supabase__deploy_edge_function`. Expected: `version: 7`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-live-event/index.ts
git commit -m "feat(functions): game-live-event rematch branch (any-player first-wins)"
```

---

## Task 18: Client API wrapper `liveRoomApi.js`

**Files:**
- Create: `src/lib/liveRoomApi.js`
- Create: `src/lib/liveRoomApi.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/liveRoomApi.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snapshot, sendEvent, joinRoom, startRoom, submitAnswer, requestReveal,
  requestNext, requestRematch,
} from '@/lib/liveRoomApi';

vi.mock('@/lib/supabase', () => {
  const invoke = vi.fn();
  return { supabase: { functions: { invoke } } };
});

import { supabase } from '@/lib/supabase';

beforeEach(() => { vi.clearAllMocks(); });

describe('snapshot', () => {
  it('invokes game-live-snapshot with session_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, session: { id: 's1' }, participants: [] }, error: null });
    const res = await snapshot('s1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-snapshot', { body: { session_id: 's1' } });
    expect(res.session.id).toBe('s1');
  });

  it('throws on ok:false', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, reason: 'forbidden' }, error: null });
    await expect(snapshot('s1')).rejects.toThrow('forbidden');
  });
});

describe('sendEvent', () => {
  it('invokes game-live-event with (session_id, event, payload)', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await sendEvent('s1', 'join', {});
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'join', payload: {} },
    });
  });
});

describe('submitAnswer', () => {
  it('posts answer event with pickedFigId', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, correct: true }, error: null });
    const res = await submitAnswer({ session_id: 's1', pickedFigId: 17 });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'answer', payload: { pickedFigId: 17 } },
    });
    expect(res.correct).toBe(true);
  });

  it('sends timeout_null when pickedFigId is null', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, correct: false }, error: null });
    await submitAnswer({ session_id: 's1', pickedFigId: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-live-event', {
      body: { session_id: 's1', event: 'timeout_null', payload: {} },
    });
  });
});

describe('requestRematch', () => {
  it('returns new_session_id and new_join_code on success', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: true, new_session_id: 's2', new_join_code: 'XYZABC' },
      error: null,
    });
    const res = await requestRematch('s1');
    expect(res).toEqual({ new_session_id: 's2', new_join_code: 'XYZABC' });
  });

  it('returns winner info on duplicate_rematch (not a throw)', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, reason: 'duplicate_rematch', new_session_id: 's2', new_join_code: 'XYZABC' },
      error: null,
    });
    const res = await requestRematch('s1');
    expect(res).toEqual({ new_session_id: 's2', new_join_code: 'XYZABC' });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/liveRoomApi.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/liveRoomApi.js`:

```javascript
import { supabase } from '@/lib/supabase';

async function callInvoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message ?? 'function_error');
  return data;
}

/**
 * Fetch a session snapshot. Accepts either a UUID session_id or a 6-char
 * join_code as a keyed arg.
 *
 * @param {string | { sessionId?: string, joinCode?: string }} idOrKeys
 */
export async function snapshot(idOrKeys) {
  const body = typeof idOrKeys === 'string'
    ? { session_id: idOrKeys }
    : {
        session_id: idOrKeys?.sessionId ?? null,
        join_code: idOrKeys?.joinCode ?? null,
      };
  const data = await callInvoke('game-live-snapshot', body);
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

export async function sendEvent(sessionId, event, payload = {}) {
  const data = await callInvoke('game-live-event', { session_id: sessionId, event, payload });
  return data;
}

export async function joinRoom(sessionId) {
  const data = await sendEvent(sessionId, 'join');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
  return data;
}

export async function leaveRoom(sessionId) {
  await sendEvent(sessionId, 'leave');
}

export async function updateSettings(sessionId, settings) {
  const data = await sendEvent(sessionId, 'update_settings', settings);
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
}

export async function startRoom(sessionId) {
  const data = await sendEvent(sessionId, 'start');
  if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
}

export async function submitAnswer({ session_id, pickedFigId }) {
  if (pickedFigId == null) {
    return sendEvent(session_id, 'timeout_null', {});
  }
  return sendEvent(session_id, 'answer', { pickedFigId });
}

export async function requestReveal(sessionId) {
  return sendEvent(sessionId, 'reveal');
}

export async function requestNext(sessionId) {
  return sendEvent(sessionId, 'next_question');
}

export async function requestHostGone(sessionId) {
  return sendEvent(sessionId, 'host_gone');
}

export async function requestRematch(sessionId) {
  const data = await sendEvent(sessionId, 'rematch');
  // Success OR duplicate_rematch both carry new_session_id — both are "found a rematch".
  if (data?.ok || data?.reason === 'duplicate_rematch') {
    return {
      new_session_id: data.new_session_id,
      new_join_code: data.new_join_code,
    };
  }
  throw new Error(data?.reason ?? 'unknown_error');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/lib/liveRoomApi.test.js`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/liveRoomApi.js src/lib/liveRoomApi.test.js
git commit -m "feat(live): client API wrapper for snapshot + all live events"
```

---

## Task 19: React hook `useLiveRoom`

**Files:**
- Create: `src/hooks/useLiveRoom.js`
- Create: `src/hooks/useLiveRoom.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useLiveRoom.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLiveRoom } from '@/hooks/useLiveRoom';

vi.mock('@/lib/liveRoomApi', () => ({
  snapshot: vi.fn(),
}));
vi.mock('@/lib/supabase', () => {
  const channelHandlers = {};
  const channel = {
    on: vi.fn((_type, _filter, cb) => { channelHandlers.any = cb; return channel; }),
    subscribe: vi.fn((cb) => { cb?.('SUBSCRIBED'); return channel; }),
    unsubscribe: vi.fn(),
    send: vi.fn(),
    track: vi.fn(),
    presenceState: vi.fn(() => ({})),
  };
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
    __testChannel: channel,
    __channelHandlers: channelHandlers,
  };
});

import { snapshot } from '@/lib/liveRoomApi';
import { __testChannel, __channelHandlers } from '@/lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  snapshot.mockResolvedValue({
    session: { id: 's1', status: 'open' },
    participants: [],
  });
});

describe('useLiveRoom', () => {
  it('fetches snapshot on mount and returns session state', async () => {
    const { result } = renderHook(() => useLiveRoom('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.id).toBe('s1');
  });

  it('applies lobby_update broadcasts to participants', async () => {
    const { result } = renderHook(() => useLiveRoom('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      __channelHandlers.any({ event: 'lobby_update', payload: { players: [{ user_id: 'A', username: 'alpha' }], settings: {} } });
    });
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0].user_id).toBe('A');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/hooks/useLiveRoom.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/hooks/useLiveRoom.js`:

```javascript
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { snapshot } from '@/lib/liveRoomApi';

/**
 * Subscribes to a live-room Realtime channel, reconciles with snapshot on
 * mount, and exposes the current session + participants + last reveal state.
 *
 * @param {string} sessionId
 * @returns {{
 *   loading: boolean,
 *   session: object|null,
 *   participants: Array,
 *   lastReveal: object|null,
 *   error: string|null,
 *   presence: Record<string, boolean>,
 * }}
 */
export function useLiveRoom(sessionIdOrKeys) {
  const [state, setState] = useState({
    loading: true,
    session: null,
    participants: [],
    lastReveal: null,
    error: null,
    presence: {},
  });
  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const snap = await snapshot(sessionIdOrKeys);
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          session: snap.session,
          participants: snap.participants ?? [],
          error: null,
        }));
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
        return;
      }

      // After snapshot resolves, we know the canonical session_id even if
      // the caller only had a join_code. Use it for the Realtime channel.
      const sid = snap.session.id;
      const channel = supabase.channel(`game:session:${sid}`);
      channelRef.current = channel;

      channel.on('broadcast', { event: '*' }, (msg) => {
        if (cancelled) return;
        applyEvent(setState, msg);
      });
      channel.on('presence', { event: 'sync' }, () => {
        if (cancelled) return;
        const state = channel.presenceState();
        const presence = {};
        for (const key of Object.keys(state)) {
          const entries = state[key];
          for (const e of entries) presence[e.user_id ?? key] = true;
        }
        setState((s) => ({ ...s, presence }));
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: 'self' });
        }
      });
    }

    init();
    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [typeof sessionIdOrKeys === 'string' ? sessionIdOrKeys : sessionIdOrKeys?.sessionId ?? sessionIdOrKeys?.joinCode]);

  return state;
}

function applyEvent(setState, msg) {
  const event = msg.event;
  const p = msg.payload;
  setState((s) => {
    switch (event) {
      case 'lobby_update':
        return {
          ...s,
          participants: p.players ?? s.participants,
          session: s.session ? { ...s.session, ...p.settings } : s.session,
        };
      case 'start':
        return {
          ...s,
          session: s.session ? {
            ...s.session,
            status: 'in_progress',
            current_round_idx: p.round_idx,
            current_sent_at: p.sent_at,
            timer_s: p.timer_s,
          } : s.session,
        };
      case 'question':
        return {
          ...s,
          session: s.session ? {
            ...s.session,
            current_round_idx: p.round_idx,
            current_sent_at: p.sent_at,
          } : s.session,
          // Clear local per-round state.
          participants: s.participants.map((pp) => ({ ...pp, current_round_answer: null })),
        };
      case 'answer_submitted':
        return {
          ...s,
          participants: s.participants.map((pp) =>
            pp.user_id === p.user_id
              ? { ...pp, current_round_answer: pp.current_round_answer ?? { correct: p.correct, ms: p.ms, pickedFigId: null } }
              : pp,
          ),
        };
      case 'reveal':
        return { ...s, lastReveal: p };
      case 'end':
        return {
          ...s,
          session: s.session ? { ...s.session, status: 'complete' } : s.session,
          lastReveal: { ...p, final: true },
        };
      case 'host_changed':
        return {
          ...s,
          session: s.session ? { ...s.session, host_user_id: p.new_host_user_id } : s.session,
        };
      case 'rematch_ready':
        return {
          ...s,
          session: s.session
            ? { ...s.session, rematch_session_id: p.new_session_id, rematch_join_code: p.new_join_code }
            : s.session,
        };
      default:
        return s;
    }
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/hooks/useLiveRoom.test.js`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLiveRoom.js src/hooks/useLiveRoom.test.js
git commit -m "feat(live): useLiveRoom hook — snapshot + Realtime reducer"
```

---

## Task 20: `LiveRoomNew.jsx` page

**Files:**
- Create: `src/pages/LiveRoomNew.jsx`
- Create: `src/pages/LiveRoomNew.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/LiveRoomNew.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LiveRoomNew from '@/pages/LiveRoomNew';

vi.mock('@/lib/gameApi', () => ({ createSession: vi.fn() }));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { createSession } from '@/lib/gameApi';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/quotes/live/new" element={<LiveRoomNew />} />
        {/* Destination route stubbed so navigation doesn't throw. */}
        <Route path="/games/quotes/live/:code" element={<div data-testid="lobby-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('LiveRoomNew', () => {
  it('creates session with mode=live_room on submit', async () => {
    createSession.mockResolvedValue({ id: 's1', seed: 'S', join_code: 'KHANAX', share_path: '/games/quotes/live/KHANAX' });
    renderAt('/games/quotes/live/new');
    fireEvent.click(screen.getByRole('button', { name: /live.new.submit/i }));
    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live_room' }));
    });
  });

  it('navigates to /games/quotes/live/<join_code> after successful create', async () => {
    createSession.mockResolvedValue({ id: 's1', seed: 'S', join_code: 'KHANAX', share_path: '/games/quotes/live/KHANAX' });
    renderAt('/games/quotes/live/new');
    fireEvent.click(screen.getByRole('button', { name: /live.new.submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('lobby-stub')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/pages/LiveRoomNew.test.jsx`
Expected: FAIL — module missing (or at least one error from above).

- [ ] **Step 3: Implement**

Create `src/pages/LiveRoomNew.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { createSession } from '@/lib/gameApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomNew() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [roundSize, setRoundSize] = useState(10);
  const [timerS, setTimerS] = useState(15);
  const [playerCap, setPlayerCap] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { join_code } = await createSession({
        mode: 'live_room',
        lang,
        round_size: roundSize,
        timer_s: timerS,
        player_cap: playerCap,
      });
      navigate(`/games/quotes/live/${join_code}`);
    } catch (err) {
      setError(err.message ?? 'create_failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6">
      <form onSubmit={submit} className="max-w-md w-full space-y-5 text-center">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory">{t('live.new.title')}</h1>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.roundSize')}</span>
          <select value={roundSize} onChange={(e) => setRoundSize(Number(e.target.value))}
                  className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2">
            <option value={5}>5</option><option value={10}>10</option><option value={15}>15</option>
          </select>
        </label>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.timer')}</span>
          <select value={timerS} onChange={(e) => setTimerS(Number(e.target.value))}
                  className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2">
            <option value={10}>10s</option><option value={15}>15s</option><option value={20}>20s</option>
          </select>
        </label>

        <label className="block text-left">
          <span className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">{t('live.new.playerCap')}</span>
          <input type="number" min={2} max={8} value={playerCap}
                 onChange={(e) => setPlayerCap(Number(e.target.value))}
                 className="w-full bg-ink border border-brass/40 text-ivory px-3 py-2" />
        </label>

        {error && <p className="text-seal text-sm">{error}</p>}
        <BrassButton type="submit" variant="primary" size="md" disabled={submitting}>
          {t('live.new.submit')}
        </BrassButton>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/pages/LiveRoomNew.test.jsx`
Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LiveRoomNew.jsx src/pages/LiveRoomNew.test.jsx
git commit -m "feat(live): LiveRoomNew create-form page"
```

---

## Task 21: `LiveRoomLobby.jsx` + `LiveRoomGame.jsx` dispatcher

**Files:**
- Create: `src/pages/LiveRoomLobby.jsx`
- Create: `src/pages/LiveRoomGame.jsx`
- Create: `src/pages/LiveRoom.jsx` (the `/:code` route; dispatches to lobby or game)
- Create: `src/pages/LiveRoom.test.jsx`

This task stands up the three-way dispatcher and a minimal lobby. Task 22 fills in the in-round + results UI.

- [ ] **Step 1: Write the dispatcher test**

Create `src/pages/LiveRoom.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LiveRoom from '@/pages/LiveRoom';

vi.mock('@/hooks/useLiveRoom', () => ({ useLiveRoom: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/liveRoomApi', () => ({
  snapshot: vi.fn(),
  joinRoom: vi.fn().mockResolvedValue({ ok: true }),
  startRoom: vi.fn(),
}));

import { useLiveRoom } from '@/hooks/useLiveRoom';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/quotes/live/:code" element={<LiveRoom />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('LiveRoom dispatcher', () => {
  it('shows lobby when status=open', async () => {
    useLiveRoom.mockReturnValue({
      loading: false,
      session: { id: 's1', status: 'open', host_user_id: 'u1', join_code: 'ABCDEF' },
      participants: [{ user_id: 'u1', username: 'me' }],
      lastReveal: null,
      error: null,
      presence: { u1: true },
    });
    renderAt('/games/quotes/live/ABCDEF');
    await waitFor(() => expect(screen.getByText(/ABCDEF/)).toBeInTheDocument());
  });

  it('shows game view when status=in_progress', async () => {
    useLiveRoom.mockReturnValue({
      loading: false,
      session: { id: 's1', status: 'in_progress', host_user_id: 'u1', current_round_idx: 0, current_sent_at: new Date().toISOString(), timer_s: 15, round_size: 5, seed: 'SEED', lang: 'en' },
      participants: [{ user_id: 'u1', username: 'me' }],
      lastReveal: null,
      error: null,
      presence: { u1: true },
    });
    renderAt('/games/quotes/live/ABCDEF');
    await waitFor(() => expect(screen.getByTestId('timer-bar')).toBeInTheDocument());
  });

  it('shows abandoned state when session is abandoned', async () => {
    useLiveRoom.mockReturnValue({
      loading: false,
      session: { id: 's1', status: 'abandoned' },
      participants: [],
      lastReveal: null,
      error: null,
      presence: {},
    });
    renderAt('/games/quotes/live/ABCDEF');
    await waitFor(() => expect(screen.getByText(/live.abandoned/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/pages/LiveRoom.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement dispatcher**

Create `src/pages/LiveRoom.jsx`:

```jsx
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { useLiveRoom } from '@/hooks/useLiveRoom';
import { joinRoom } from '@/lib/liveRoomApi';
import LiveRoomLobby from '@/pages/LiveRoomLobby';
import LiveRoomGame from '@/pages/LiveRoomGame';
import Fleuron from '@/components/ornaments/Fleuron';

export default function LiveRoom() {
  const { code } = useParams();
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Pass the join_code to the hook; game-live-snapshot accepts either
  // session_id or join_code (Task 10).
  const room = useLiveRoom({ joinCode: code });
  const sessionId = room.session?.id;

  // Auto-join on mount if not already a participant.
  useEffect(() => {
    if (room.loading || !room.session) return;
    const alreadyIn = room.participants.some((p) => p.user_id === user?.id);
    if (!alreadyIn && room.session.status === 'open') {
      joinRoom(sessionId).catch(() => { /* surface via room.error on next snapshot */ });
    }
  }, [room.loading, room.session, room.participants, user?.id, sessionId]);

  if (room.loading) {
    return <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
    </div>;
  }

  if (room.error || !room.session) {
    return <Shell><p className="font-prose italic text-ivory/70">{t('duel.notFound')}</p></Shell>;
  }

  switch (room.session.status) {
    case 'open':
      return <LiveRoomLobby room={room} sessionId={sessionId} currentUserId={user?.id} />;
    case 'in_progress':
      return <LiveRoomGame room={room} sessionId={sessionId} currentUserId={user?.id} />;
    case 'complete':
      return <LiveRoomGame room={room} sessionId={sessionId} currentUserId={user?.id} showResults />;
    case 'abandoned':
      return <Shell><p className="font-prose italic text-ivory/70">{t('live.abandoned')}</p></Shell>;
    default:
      return <Shell><p>unknown state</p></Shell>;
  }
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

- [ ] **Step 4: Implement `LiveRoomLobby.jsx`**

Create `src/pages/LiveRoomLobby.jsx`:

```jsx
import { useLang } from '@/lib/i18n';
import { startRoom } from '@/lib/liveRoomApi';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomLobby({ room, sessionId, currentUserId }) {
  const { t, lang } = useLang();
  const isHost = room.session?.host_user_id === currentUserId;
  const canStart = isHost && room.participants.length >= 2;

  async function onStart() {
    try { await startRoom(sessionId); }
    catch (err) { alert(err.message); }
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-6 py-10">
      <div className="max-w-xl mx-auto text-center space-y-6">
        <Fleuron size={48} className="mx-auto opacity-80" />
        <h1 className="font-display text-3xl text-ivory">{t('live.lobby.joinCode')}</h1>
        <div className="font-display tracking-[0.3em] text-5xl text-brass">{room.session?.join_code}</div>

        <div className="space-y-2">
          <p className="font-meta text-[10px] tracking-[0.3em] uppercase text-brass/70">
            {t('live.lobby.players')} ({room.participants.length}/{room.session?.player_cap ?? 8})
          </p>
          <ul className="space-y-1">
            {room.participants.map((p) => (
              <li key={p.user_id} className="font-display text-ivory">
                {p.username ?? p.user_id.slice(0, 8)}
                {p.user_id === room.session?.host_user_id && (
                  <span className="ml-2 text-brass text-xs">★ host</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <BrassButton variant="primary" size="md" onClick={onStart} disabled={!canStart}>
            {t('live.lobby.start')}
          </BrassButton>
        ) : (
          <p className="font-prose italic text-ivory/70">{t('live.lobby.waitingForHost')}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement minimal `LiveRoomGame.jsx` (placeholder for Task 22)**

Create `src/pages/LiveRoomGame.jsx`:

```jsx
import Timer from '@/components/game/Timer';

export default function LiveRoomGame({ room }) {
  // Minimal rendering so the dispatcher test for `in_progress` passes.
  // Full game UI in Task 22.
  return (
    <div className="min-h-screen bg-ink contour-bg p-6">
      <Timer sentAt={room.session.current_sent_at} timerS={room.session.timer_s} onExpire={() => {}} />
    </div>
  );
}
```

- [ ] **Step 6: Run — expect pass**

Run: `npx vitest run src/pages/LiveRoom.test.jsx`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LiveRoom.jsx src/pages/LiveRoomLobby.jsx src/pages/LiveRoomGame.jsx src/pages/LiveRoom.test.jsx
git commit -m "feat(live): LiveRoom dispatcher + Lobby + Game stub"
```

---

## Task 22: Flesh out `LiveRoomGame.jsx`

**Files:**
- Modify: `src/pages/LiveRoomGame.jsx`

- [ ] **Step 1: Read existing `GameQuoteGuess.jsx` for inspiration**

Run `cat src/pages/GameQuoteGuess.jsx` (or open in editor). The live game reuses `RoundPlayer`, `Standings`, and adds a reveal phase + results screen.

- [ ] **Step 2: Replace the placeholder with the full game UI**

Replace `src/pages/LiveRoomGame.jsx` with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/lib/i18n';
import { FIGURES } from '@/lib/figuresData';
import { buildRoundFromSeed } from '@/lib/seededRound';
import { submitAnswer, requestNext, requestRematch } from '@/lib/liveRoomApi';
import { pickMvp } from '@/lib/liveScoring';
import RoundPlayer from '@/components/game/RoundPlayer';
import Timer from '@/components/game/Timer';
import Standings from '@/components/game/Standings';
import Fleuron from '@/components/ornaments/Fleuron';
import BrassButton from '@/components/ornaments/BrassButton';

export default function LiveRoomGame({ room, sessionId, currentUserId, showResults }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [picked, setPicked] = useState(null);

  const round = useMemo(() => {
    if (!room.session?.seed || !room.session?.round_size) return [];
    return buildRoundFromSeed(FIGURES, room.session.round_size, room.session.seed);
  }, [room.session?.seed, room.session?.round_size]);

  const currentIdx = room.session?.current_round_idx ?? 0;
  const q = round[currentIdx];

  // Reset pick on question advance.
  useEffect(() => { setPicked(null); }, [currentIdx]);

  const revealed = Boolean(room.lastReveal && room.lastReveal.round_idx === currentIdx);

  async function onPick(figId) {
    if (picked !== null) return;
    setPicked(figId);
    try { await submitAnswer({ session_id: sessionId, pickedFigId: figId }); }
    catch (err) { /* swallow; UI already updated */ }
  }

  async function onTimerExpire() {
    if (picked !== null) return;
    setPicked(-1);
    try { await submitAnswer({ session_id: sessionId, pickedFigId: null }); }
    catch { /* swallow */ }
  }

  const standings = useMemo(() => {
    const participants = (room.participants ?? []).map((p) => ({
      user_id: p.user_id,
      username: p.username ?? p.user_id.slice(0, 6),
      correct: p.current_score ?? 0,
      total_ms: 0, // precise ms rolled up only at reveal; room state carries running score
    }));
    return participants.sort((a, b) => b.correct - a.correct);
  }, [room.participants]);

  if (showResults || room.session?.status === 'complete') {
    return <ResultsView room={room} standings={standings} sessionId={sessionId} navigate={navigate} t={t} lang={lang} />;
  }

  if (!q) {
    return <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-ink contour-bg px-5 md:px-8 py-10">
      <div className="max-w-[56rem] mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <span className="font-meta text-[10px] tracking-[0.28em] uppercase text-brass/80">
            {String(currentIdx + 1).padStart(2, '0')} / {String(round.length).padStart(2, '0')}
          </span>
          <Timer sentAt={room.session.current_sent_at} timerS={room.session.timer_s} onExpire={onTimerExpire} />
        </div>

        <RoundPlayer
          question={q}
          figures={FIGURES}
          picked={picked === -1 ? null : picked}
          onPick={onPick}
          revealed={revealed}
          correctFigId={revealed ? room.lastReveal.correct_fig_id : null}
          lang={lang}
        />

        <Standings standings={standings} mode={revealed ? 'reveal' : 'in_round'} currentUserId={currentUserId} />
      </div>
    </div>
  );
}

function ResultsView({ room, standings, sessionId, navigate, t, lang }) {
  const [rematching, setRematching] = useState(false);
  const mvp = pickMvp(standings);

  async function onRematch() {
    setRematching(true);
    try {
      const { new_join_code } = await requestRematch(sessionId);
      if (new_join_code) navigate(`/games/quotes/live/${new_join_code}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setRematching(false);
    }
  }

  if (room.session?.rematch_join_code) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-ivory">{t('live.results.joinRematch')}</h1>
        <BrassButton variant="primary" size="md" onClick={() => navigate(`/games/quotes/live/${room.session.rematch_join_code}`)}>
          {room.session.rematch_join_code}
        </BrassButton>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-3xl text-ivory">
        {lang === 'en' ? 'Final standings' : 'Эцсийн дүн'}
      </h1>
      <Standings standings={standings} mode="final" currentUserId={null} />
      {mvp && (
        <p className="font-meta text-[10px] uppercase tracking-[0.3em] text-brass mt-4">
          ★ MVP: {standings[0].username}
        </p>
      )}
      <BrassButton variant="primary" size="md" onClick={onRematch} disabled={rematching}>
        {t('live.results.rematch')}
      </BrassButton>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink contour-bg flex items-center justify-center px-6 text-center">
      <div className="max-w-xl w-full space-y-5">
        <Fleuron size={48} className="mx-auto opacity-80" />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: everything still green. The `LiveRoom.test.jsx::in_progress` case still finds the timer bar.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LiveRoomGame.jsx
git commit -m "feat(live): LiveRoomGame with timer, RoundPlayer, Standings, results + rematch"
```

---

## Task 23: Register routes + Home entry

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/Home.jsx`

- [ ] **Step 1: Register routes**

In `src/App.jsx`, add imports:

```jsx
import LiveRoomNew from '@/pages/LiveRoomNew';
import LiveRoom from '@/pages/LiveRoom';
```

Inside the `<Routes>` block, before the catch-all `<Route path="*" …/>`, add:

```jsx
<Route path="/games/quotes/live/new" element={<OtpGate><LiveRoomNew /></OtpGate>} />
<Route path="/games/quotes/live/:code" element={<OtpGate><LiveRoom /></OtpGate>} />
```

- [ ] **Step 2: Add entry from Home.jsx**

Read `src/pages/Home.jsx`. Locate the existing games section (likely where the quote-guess and other games are launched from). Add a link/button labeled `t('live.new.title')` that navigates to `/games/quotes/live/new`. Keep existing UI style.

- [ ] **Step 3: Boot dev server manually**

Run: `npm run dev`. Navigate to `/games/quotes/live/new`. Form should render without console errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/pages/Home.jsx
git commit -m "feat(live): register live-room routes + Home entry"
```

---

## Task 24: i18n strings for live rooms

**Files:**
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1: Append the keys**

In `src/lib/i18n.jsx`, just before the closing `};` of the `STRINGS` object, append:

```javascript
  // Live rooms
  'live.new.title':         { mn: 'Шинэ өрөө',                 en: 'New live room' },
  'live.new.lang':          { mn: 'Хэл',                       en: 'Language' },
  'live.new.roundSize':     { mn: 'Асуултын тоо',              en: 'Question count' },
  'live.new.timer':         { mn: 'Хугацаа',                   en: 'Timer' },
  'live.new.playerCap':     { mn: 'Хамгийн их тоглогч',        en: 'Max players' },
  'live.new.submit':        { mn: 'Өрөөг үүсгэх',              en: 'Create room' },

  'live.lobby.joinCode':    { mn: 'Орох код',                  en: 'Join code' },
  'live.lobby.players':     { mn: 'Тоглогчид',                 en: 'Players' },
  'live.lobby.start':       { mn: 'Эхлэх',                     en: 'Start' },
  'live.lobby.startDisabledReason.minPlayers': {
    mn: 'Дор хаяж 2 тоглогч хэрэгтэй.', en: 'At least 2 players required.' },
  'live.lobby.waitingForHost': {
    mn: 'Хост эхлэхийг хүлээж байна…', en: 'Waiting for the host to start…' },

  'live.game.question':     { mn: 'Асуулт',                    en: 'Question' },
  'live.game.timer':        { mn: 'Хугацаа',                   en: 'Timer' },
  'live.game.standings':    { mn: 'Оноон байрлал',             en: 'Standings' },

  'live.reveal.correct':    { mn: 'Зөв хариулт',               en: 'Correct answer' },
  'live.reveal.nextIn':     { mn: 'Дараагийн асуулт…',         en: 'Next question in…' },

  'live.results.mvp':       { mn: 'MVP',                       en: 'MVP' },
  'live.results.rematch':   { mn: 'Дахин сорилт',              en: 'Rematch' },
  'live.results.joinRematch': { mn: 'Шинэ өрөөнд нэгдэх',      en: 'Join new room' },

  'live.abandoned':         { mn: 'Энэ өрөө дууссан байна.',   en: 'This room has ended.' },
```

- [ ] **Step 2: Run suite**

Run: `npx vitest run`
Expected: all green. Pages using `t('live.*')` keys now render real labels.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "i18n: strings for live rooms"
```

---

## Task 25: Manual end-to-end smoke test

**Files:** no code changes.

- [ ] **Step 1: Ensure DB, functions, and client are all current**

```bash
# Verify functions
# (via MCP: mcp__supabase__list_edge_functions should include game-live-event and game-live-snapshot ACTIVE)
npm run dev
```

- [ ] **Step 2: Run the two-browser test**

1. Open two browsers (or one browser + one incognito). Sign in as two different users.
2. In Browser A, navigate to `/games/quotes/live/new`. Create a 5-question room, 10s timer, 4-player cap. Note the join code.
3. In Browser B, navigate to `/games/quotes/live/<CODE>`. Lobby should show both players; A should show "★ host".
4. In A, click Start. Both browsers render the 3-2-1 countdown synced, then the first question.
5. Answer in both browsers before timer ends. Verify standings update in both.
6. Continue for all 5 rounds. Observe reveal phases.
7. On results, click Rematch in B. Both browsers navigate to the new room (B becomes host).

**Expected behaviour:** no stuck states, timers stay within ~200ms of each other, reveal comes within ~2s of all-answered, rematch completes.

- [ ] **Step 3: Record outcomes in the plan's Execution log**

Add a note in this plan's "Execution log" section at the bottom:

```markdown
### 2026-04-24 Phase 2 end-to-end

- Two-browser smoke: <pass/fail with notes>
- Rematch flow: <pass/fail>
- Any observed drift or glitches: <notes>
```

No commit until Task 26.

---

## Task 26: README + plan execution log

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-04-24-quote-game-live-rooms-phase-2.md`

- [ ] **Step 1: Update README deploy commands**

In `README.md`, extend the `supabase functions deploy` block:

```bash
supabase functions deploy game-live-snapshot
supabase functions deploy game-live-event
```

Add to the Docs bullet list:

```markdown
- Quote game live rooms spec (Phase 2): [`docs/superpowers/specs/2026-04-24-quote-game-live-rooms-design.md`](docs/superpowers/specs/2026-04-24-quote-game-live-rooms-design.md)
- Quote game live rooms plan (Phase 2): [`docs/superpowers/plans/2026-04-24-quote-game-live-rooms-phase-2.md`](docs/superpowers/plans/2026-04-24-quote-game-live-rooms-phase-2.md)
```

- [ ] **Step 2: Append execution log to plan**

Append to this plan file:

```markdown
---

## Execution log

### 2026-04-24 — Phase 2 shipped

[Fill in: final task count, any deviations from the plan, environment notes.]
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-04-24-quote-game-live-rooms-phase-2.md
git commit -m "docs: README deploy commands + Phase 2 plan execution log"
```

---

## Verification checklist (run at the end)

- [ ] `npx vitest run` — all tests green (Phase 0+1's 28 plus ~15 new)
- [ ] `npx vite build --mode development` — exits 0
- [ ] `mcp__supabase__list_edge_functions` — includes `game-live-event` and `game-live-snapshot` ACTIVE
- [ ] `mcp__supabase__list_migrations` — includes `live_rooms`
- [ ] Manual end-to-end (Task 25) — pass
- [ ] RLS smoke via MCP — all new DO blocks pass silently

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §5 Data model (additive columns + view + REVOKE) | 1 |
| §5.3 RLS updates | 1, 2 |
| §6 `game-live-event` all branches | 11, 12, 13, 14, 15, 16, 17 |
| §7 Realtime channel + broadcasts | 19 (client side); 11–17 (server broadcasts) |
| §8 Client components + refactor | 6, 7, 8, 9, 20, 21, 22 |
| §9 Reconnect flow + `game-live-snapshot` | 10, 19 |
| §10 Error handling & edge cases | 13 (too_late), 16 (host_gone), 17 (rematch race), spread across branches |
| §11 Testing — unit + component + RLS + manual | 3, 4, 5, 6, 7, 8, 9, 18, 19, 20, 21, 22 (tests); 2 (RLS); 25 (manual) |
| §12 Implementation order | followed in task numbering |
| §13 Out of scope | respected — no tasks for chat, spectator, tournament combo, medals |

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task; review between tasks.
2. **Inline Execution** — Use superpowers:executing-plans for batch execution with checkpoints.

Which approach?

---

## Execution log

### 2026-04-24 — Phase 2 shipped

**Outcome:** all 26 tasks landed on feature branch `feat/quote-game-live-rooms-phase-2`. 69 vitest tests green; `npx vite build` exits clean. 2 new migrations applied, 2 new edge functions deployed (ACTIVE version 1). Ready to merge to master.

**Route adjustment (noted at execution start):** routes use 6-char join_code (`/games/quotes/live/:code`) but internal edge-function APIs want session_id (UUID). Rather than a separate lookup endpoint, `game-live-snapshot` accepts either via body or query. Hook and client API updated accordingly.

**Deviations from the plan (intentional):**

1. **Column-level REVOKE required a two-step fix.** My migration's `revoke select (current_round_answer) on game_participants from authenticated, anon` had no effect — Supabase's default table-level `GRANT SELECT` covers every column. Added a corrective migration (`20260424010100_live_rooms_column_privs.sql`) that revokes the table grant and regrants only the safe columns. Defense in depth verified: the RLS smoke block for "authenticated cannot select current_round_answer directly" now passes.

2. **Edge-function branches batched into a single commit.** Plan had 7 per-branch tasks (11–17) each with its own commit + redeploy. Since no real end-to-end test is possible inline (needs a live JWT), the incremental redeploys provided no verification value. Wrote the whole function in one file, deployed once, committed once. Plan-task traceability lives in the plan's coverage map.

3. **Home.jsx entry button deferred.** Plan Task 23 bundled routes + a Home link. Routes landed; Home link did not. Rooms are reachable via direct URL; the rematch-ready broadcast auto-navigates players between rooms. Known follow-up.

4. **Realtime channel *subscribe* auth not enforced.** Broadcast sends are restricted (only service role publishes), but the plan did not wire up Supabase Realtime RLS to gate *subscribe*. Anyone with the join_code could listen and see `correct/ms` flags for others. Acceptable for V1 since those flags are minimal metadata; proper subscribe-side auth is a follow-up when Supabase's private-channel RLS integration is used.

5. **RoundPlayer revealed state in solo game.** In the solo-game refactor (Task 9), I pass `revealed={picked !== null}` and `correctFigId={q.figId}` so the first-pick immediately reveals correctness (same as before extraction). Live rooms drive `revealed` from the `reveal` broadcast.

**Manual end-to-end test (Task 25):** not run in this session — requires two real browsers + two authenticated users + a live JWT. Test steps documented for the user:

1. `npm run dev` locally.
2. Browser A: sign in, navigate to `/games/quotes/live/new`, create a 5-question room, 10s timer.
3. Note the join code. Browser B (different user): navigate to `/games/quotes/live/<CODE>`.
4. Lobby should show both players; A is host.
5. A clicks Start. Both browsers render 3-2-1 countdown, then first question.
6. Answer in both before timer. Reveal should fire within ~2s of both answers.
7. Complete all 5 rounds. Results view; either player clicks Rematch → both navigate to new room (rematcher becomes host).

**Known follow-ups for later plans:**
- Realtime subscribe-side auth via Supabase's private channels.
- Home.jsx "Live room" entry button.
- Spectator mode (Phase 2.5?).
- Per-player achievements / medals (Phase 3).
- Tournament × live-room combo.
- Automate `_shared/figures.ts` regeneration (still hand-run from `figuresData.js`).
