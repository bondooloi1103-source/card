# Polish Pass — Async feedback, loading, empty/onboarding, mobile/a11y

**Context:** Quote game multiplayer, story system, and QR AI guide all shipped to master in late April 2026. A polish/UX audit of the six shipped flows (quote game, story player, QR scan, card collection, admin panel, auth/onboarding) surfaced 25 concrete rough edges clustering into four cross-cutting themes:

- **Async-feedback consistency** — silent error swallows, `alert()` instead of toast, missing aria-live, no error boundaries on async leaves.
- **Loading states** — missing skeletons, blocking spinners, no debounce on rapid input, no optimistic updates on admin CRUD.
- **Empty + onboarding states** — missing empty-state copy, leaderboard rank-out-of-range with no context, fullscreen exit hint absent, progress bar non-animating on unlock.
- **Mobile / a11y** — sticky filter pill not auto-scrolled into view, no password show/hide, file-size validated post-picker, missing aria-labels on icon buttons, no smooth scroll-to-bottom on chat.

Without a shared primitives layer, every page solved feedback differently. The design centralizes the patterns into one module and applies them across all 25 audit sites in a single coherent pass.

## 1. Scope

**In scope**
- New shared module `src/lib/feedback/` with six exports: `<Toast>` + `notify`, `<ErrorBoundary>`, `<Skeleton>` family, `<EmptyState>`, `<AsyncStatus>`, `useDebouncedValue`.
- Apply primitives to every site listed in the per-theme application plan (§4) — all 25 audit issues end-to-end (split into 26 line items because audit issue #4 covers two physical sites).
- Add Mongolian + English copy for every new user-facing string via existing `src/lib/i18n.jsx` `STRINGS` table.
- Behavior tests for all six primitives.
- Smoke tests on every page touched: assert the new state (skeleton, empty, error, success-toast) renders.

**Out of scope (deferred)**
- Network-offline detection / stale-data UI.
- Visual regression / screenshot tests.
- New runtime dependencies — uses `react-hot-toast`, Tailwind, Framer Motion already installed.
- Any refactoring beyond the 25 listed sites; diffs stay surgical.
- Translating *existing* user-facing strings the audit didn't flag.
- Loading-spinner consolidation outside the audit list.
- Renaming `OtpLogin.jsx` to match its actual username/password role (separate cleanup).

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Centralize primitives in one module (`src/lib/feedback/`) over per-page colocation. | Audit shows current rot came from *not* having one. Central module makes regressions reviewable in one place. |
| 2 | Build on `react-hot-toast` (already in deps) — do not introduce a competing toast lib. | Audit issue #4 explicitly notes "should use react-hot-toast like the rest of the app." |
| 3 | `<ErrorBoundary>` wraps async leaves only — narration playback, AI chat, admin CRUD form. Never page-level. | Page-level boundaries swallow real bugs and break React's dev overlay. |
| 4 | Skeleton dimensions hardcoded to current grid/card sizes. | Prevents CLS from skeleton ↔ real content mismatch. |
| 5 | All new user-facing copy goes through `STRINGS` in `src/lib/i18n.jsx` with both `mn` and `en`. | Project already i18n-aware; English-only toasts would feel patched-on. |
| 6 | Smoke tests on per-page wiring, not visual regression. | Vitest + RTL is the existing pattern; screenshot infra would be net-new tooling. |
| 7 | Optimistic update on admin figure CRUD only — not on game state, narration, or auth. | Game and auth need server confirmation; admin CRUD has predictable single-row writes. |
| 8 | Keep `OtpLogin.jsx` filename unchanged. Apply audit fixes to it as-is. | Renaming sprawls into routing/import changes outside polish scope. |
| 9 | `notify.error` uses `role="alert"` + `aria-live="assertive"`; `notify.success/info` uses `role="status"` + `aria-live="polite"`. | WCAG 2.1 patterns; matches user expectation that errors interrupt and successes don't. |
| 10 | Verify `base44`-prefixed code paths against `src/api/base44Client.js` (Supabase shim) — fixes apply through the shim. | The shim preserves the old API shape; subscription error handling lands on the shim's `subscribe` callback site. |

## 3. Architecture — `src/lib/feedback/`

### File layout

```
src/lib/feedback/
  index.js                  // re-exports
  Toast.jsx                 // <Toast/> + notify.{success,error,info,loading,promise}
  ErrorBoundary.jsx         // class component
  Skeleton.jsx              // <Skeleton.Card/>, <Skeleton.Row/>, <Skeleton.Grid count={n}/>, <Skeleton.Text lines={n}/>
  EmptyState.jsx            // <EmptyState icon title description action/>
  AsyncStatus.jsx           // <AsyncStatus loading error empty retry>{children}</AsyncStatus>
  useDebouncedValue.js      // hook
  __tests__/                // primitive unit tests (one file per export)
```

### Public API

#### `notify` + `<Toast>`

```js
import { notify } from '@/lib/feedback';

notify.success('toast.collection.cardSaved');     // i18n key
notify.error(err, { fallbackKey: 'toast.generic.networkError' });  // Error or string
notify.info('toast.story.fullscreenHint');
notify.loading('toast.admin.uploading');           // returns id; dismiss with notify.dismiss(id)
notify.promise(promiseFn, {
  loading: 'toast.admin.saving',
  success: 'toast.admin.saved',
  error:   'toast.admin.saveFailed',
});
```

`<Toast>` mounts the `<Toaster>` root once in `App.jsx`. Variant → `role` + `aria-live`:

| Variant | role | aria-live | Auto-dismiss |
|---|---|---|---|
| success / info | `status` | `polite` | 4s |
| error | `alert` | `assertive` | 6s |
| loading | `status` | `polite` | manual (`notify.dismiss`) |

`notify.error(err, opts)` accepts `Error | string | i18nKey`. Resolution order: explicit string/key → `err.message` if non-empty → `opts.fallbackKey` → generic `toast.generic.unknownError`.

#### `<ErrorBoundary fallback retry>`

```jsx
<ErrorBoundary
  fallback={({ error, retry }) => <ErrorCard message={error.message} onRetry={retry} />}
>
  <NarrationPlayer/>
</ErrorBoundary>
```

- Class component. `componentDidCatch` logs to console in dev, calls `notify.error` once.
- `retry` resets `hasError` state; consumer re-mounts children.
- Wraps async leaves only: narration playback, ScanChat AI calls, admin CRUD form. Never wraps a whole page or route.

#### `<Skeleton>` family

```jsx
<Skeleton.Grid count={12} variant="card" />   // for MyCollection, Leaderboard
<Skeleton.Row count={5} />                     // for tabular lists
<Skeleton.Card />                              // single card
<Skeleton.Text lines={3} />                    // for first-slide story text
```

Tailwind `animate-pulse` + sized to match real content. Variants:

| Variant | Dimensions |
|---|---|
| `card` | `aspect-[3/4]`, `rounded-xl` (matches card deck) |
| `row` | `h-12`, `w-full`, `rounded` (matches leaderboard row) |
| `text` | per-line `h-4`, `w-{full|3/4|5/6}` cycling |

#### `<EmptyState icon title description action>`

```jsx
<EmptyState
  icon={<BookOpen className="w-12 h-12 text-amber-400/60" />}
  title="empty.collection.title"               // i18n key
  description="empty.collection.description"
  action={<Button onClick={openScanner}>{t('empty.collection.action')}</Button>}
/>
```

All three text fields accept i18n key OR string. Action is optional ReactNode.

#### `<AsyncStatus loading error empty retry>`

```jsx
<AsyncStatus
  loading={isLoading}
  error={error}
  empty={!data?.length}
  retry={refetch}
  loadingFallback={<Skeleton.Grid count={12} variant="card" />}
  emptyFallback={<EmptyState ... />}
>
  <CardGrid data={data} />
</AsyncStatus>
```

Render priority: `loading` → `error` → `empty` → `children`.
- Default `loadingFallback`: `<Skeleton.Card />` single.
- Default `errorFallback`: small inline error card with `Retry` button (calls `retry`).
- Default `emptyFallback`: minimal `<EmptyState>` with generic copy.

#### `useDebouncedValue(value, delayMs = 250)`

Standard debounce hook. Used in `AdminPanel.jsx:238` figure search.

```js
const debouncedQuery = useDebouncedValue(query, 250);
// run filter against debouncedQuery, not query
```

### App-level wiring

- `src/App.jsx` — mount `<Toaster />` once at root (replacing any ad-hoc instance).
- `src/lib/i18n.jsx` — extend `STRINGS` with new keys under namespaces `toast.*`, `empty.*`, `error.*`, `loading.*`. Both `mn` and `en` required for every new key.

## 4. Per-theme application plan — 25 issues mapped

### Theme A — feedback consistency (9 sites)

| # | Site | Change |
|---|---|---|
| 1 | `GameQuoteGuess.jsx:88-90` | Wrap submit catch with `notify.error(err, { fallbackKey: 'toast.quote.submitFailed' })`. |
| 2 | `LiveRoomLobby.jsx:13` | Replace `alert()` with `notify.error`. |
| 3 | `StoryChapter.jsx:92-99` | Wrap narration in `<ErrorBoundary>`; on catch, `notify.error('toast.story.narrationFailed')` with retry. |
| 4 | `StoryChapter.jsx:102-129` | Pre-fetch failure → silent log → `notify.info('toast.story.prefetchFailed')` (low-priority). |
| 5 | `AdminPanel.jsx:59-72` | base44 subscription error handler → `notify.error('toast.admin.realtimeFailed')`. |
| 6 | `AdminPanel.jsx` figure CRUD | Wrap save in `notify.promise`. |
| 7 | `OtpLogin.jsx:162,228,300` | Inline error divs gain `role="alert" aria-live="assertive"`; submit success calls `notify.success('toast.auth.loginSuccess')` before navigate. |
| 8 | `ScanChat.jsx` AI calls | Wrap in `<ErrorBoundary>`; AI error → `notify.error('toast.scan.aiFailed')`. |
| 9 | `OtpLogin.jsx:88-101` | Add success toast before redirect. |

### Theme B — loading states (6 sites)

| # | Site | Change |
|---|---|---|
| 10 | `MyCollection.jsx` initial render | Wrap grid in `<AsyncStatus>` with `<Skeleton.Grid count={12} variant="card"/>`. |
| 11 | `Leaderboard.jsx:89-92` | Wrap rows in `<AsyncStatus>` with `<Skeleton.Row count={20}/>`. |
| 12 | `StoryChapter.jsx:67-83` | First-slide text replaced by `<Skeleton.Text lines={3}/>` until `narrationText` ready. |
| 13 | `ScanChat.jsx:108` | Disabled input + visible "AI is thinking…" indicator (i18n: `loading.scan.aiThinking`). |
| 14 | `GameQuoteGuess.jsx:134-140` | Replace blocking spinner with non-blocking `<Skeleton.Card/>` overlay; round-build still happens but UI doesn't freeze. |
| 15 | `AdminPanel.jsx:238-240` | Search input uses `useDebouncedValue(query, 250)`. |
| 16 | `AdminPanel.jsx` figure save | Optimistic update via `setState` before `await`; rollback on error inside `notify.promise` rejection. |

### Theme C — empty + onboarding (5 sites)

| # | Site | Change |
|---|---|---|
| 17 | `MyCollection.jsx:168` | `<EmptyState>` with i18n copy explaining "scan QR codes to collect" + CTA pointing to QR onboarding info. |
| 18 | `Leaderboard.jsx:128-145` | When user rank > 20, render context line below visible list: "You are #47 of N players" (i18n `leaderboard.contextLine`). |
| 19 | `ScanChat.jsx:84-95` | Banner copy updated to explain *why* sign-up enables saving (history, devices, offline). New i18n keys. |
| 20 | `StoryChapter.jsx:134-145` | Fullscreen mode gains a chip overlay: "Press Esc to exit" (i18n `story.fullscreenExitHint`); fades after 3s. |
| 21 | `MyCollection.jsx:149-164` | Wrap progress bar fill in Framer Motion `<motion.div>` with `animate={{ width }}` on unlock; spring transition. |

### Theme D — mobile / a11y (5 inline)

| # | Site | Change |
|---|---|---|
| 22 | `MyCollection.jsx:119` | Sticky filter pill: on `activeCategory` change, `pillRef.current?.scrollIntoView({ inline: 'center', behavior: 'smooth' })`. |
| 23 | `OtpLogin.jsx:135` | Add `<button>` show/hide toggle with eye icon; toggles input `type` between `password` and `text`. |
| 24 | `AdminPanel.jsx:191-193` | Add `<input accept="audio/*">` and `onChange` validates `file.size <= MAX_BYTES` before calling upload helper; size cap from existing `MAX_AUDIO_BYTES` constant or new one if missing. |
| 25 | `ScanChat.jsx:60-73` | Lang toggle buttons gain `aria-label={t('scan.langToggle.aria.<mn|en>')}`. |
| 26 | `ScanChat.jsx:76-81` | New-message scroll: replace instant `scrollTop = scrollHeight` with `scrollIntoView({ behavior: 'smooth', block: 'end' })` on the bottom sentinel ref. |

(26 line items because issue #4 from audit covers two physical sites that share root cause.)

## 5. Data flow

No new persistent state. Existing data flow unchanged.

- `notify` calls write to react-hot-toast's internal store (in-memory).
- `<ErrorBoundary>` state is local component state.
- `<AsyncStatus>` is a pure wrapper over consumer-provided `loading/error/empty` props.
- `useDebouncedValue` holds a single `useState` + `useEffect` timer.
- Optimistic admin updates write to local React state before `await` resolves; on error, state is rolled back from a captured pre-update snapshot.

## 6. Testing

### Primitive tests (~30 cases across 6 files)

- `Toast.test.jsx` — i18n key resolves; `notify.error(err)` resolves message order (string/key → err.message → fallback); aria-live attribute matches variant; dedupe on duplicate within window.
- `ErrorBoundary.test.jsx` — catches thrown render error; renders `fallback`; `retry` resets hasError; logs once.
- `Skeleton.test.jsx` — `Grid count={n}` renders n children; variant maps to expected Tailwind classes; `Text lines={n}` renders n bars.
- `EmptyState.test.jsx` — accepts string + i18n key for each text prop; action renders when provided; no action when omitted.
- `AsyncStatus.test.jsx` — loading wins over error wins over empty wins over children; `retry` invoked on click; default fallbacks render when not overridden.
- `useDebouncedValue.test.js` — vitest fake timers: value updates after delay; rapid changes only emit final.

### Per-page smoke tests (~25 cases across ~12 files)

For every page touched, assert the new state renders:
- `MyCollection.test.jsx` — empty state renders with zero cards; skeleton renders during load; pill scrollIntoView called on category change (mock `scrollIntoView`).
- `Leaderboard.test.jsx` — skeleton rows render during load; rank context line renders when user is below visible threshold.
- `StoryChapter.test.jsx` — narration error triggers ErrorBoundary fallback + toast; first-slide skeleton renders; fullscreen exit hint chip renders + dismisses.
- `ScanChat.test.jsx` — "AI thinking" indicator renders during fetch; aria-label present on lang toggles; scrollIntoView called on new message.
- `AdminPanel.test.jsx` — search input debounces (fake timers); file-size pre-validation rejects oversized file before upload; CRUD save uses notify.promise; subscription error fires notify.error.
- `OtpLogin.test.jsx` — error divs have aria-live; password toggle reveals/hides; success toast fires before navigate.
- `GameQuoteGuess.test.jsx` — submit error fires notify.error; non-blocking skeleton renders during round build.
- `LiveRoomLobby.test.jsx` — error fires notify.error (no `alert()`).

Existing tests stay green; no rewrites required.

### Acceptance

- All 196 existing vitest cases + ~55 new = ~251 total, all green.
- Lint clean.
- Manual QA pass against six flow areas after merge: open every page, trigger one error, one empty, one success per page where applicable.

## 7. New i18n keys (preview list)

All keys land in `src/lib/i18n.jsx` `STRINGS` with `mn` + `en`. Final wording during implementation; this is the namespace shape:

```
toast.generic.networkError
toast.generic.unknownError
toast.quote.submitFailed
toast.story.narrationFailed
toast.story.prefetchFailed
toast.scan.aiFailed
toast.admin.realtimeFailed
toast.admin.saving / saved / saveFailed / uploading
toast.auth.loginSuccess

empty.collection.title / description / action
empty.leaderboard.title / description     // grep first; reuse if present, else add
leaderboard.contextLine             // "You are #{rank} of {total}"

loading.scan.aiThinking
story.fullscreenExitHint
scan.banner.signUpReason.title / body
scan.langToggle.aria.mn / en
```

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wide blast radius — ~12 files touched, one bad merge could regress multiple flows. | Smoke tests per page; manual QA pass over six flows post-merge; small commits per theme so revert is targeted. |
| `<ErrorBoundary>` over-catch suppresses real bugs. | Wrap async leaves only, never pages; in dev, also re-throw to console after `notify.error` so React dev overlay still surfaces stack traces. |
| Skeleton/CLS mismatch if dimensions drift. | Dimensions hardcoded to current sizes; smoke tests assert skeleton container dimensions; manual review against deployed UI before merge. |
| i18n coverage gap — new key added in `mn` only or `en` only. | Spec lists every new key with both locales required; PR description checklist explicitly calls for both. |
| Optimistic update inconsistency — rollback fails to restore exact prior state. | Snapshot via structuredClone before update; rollback restores from snapshot only. Limit to single-row admin CRUD; not used in game/auth. |
| `notify.promise` swallows error so consumer can't react. | Document that `notify.promise` re-throws after toast; consumers can still `.catch` if needed. |
| `OtpLogin.jsx` keeping its misleading filename invites future confusion. | Out-of-scope here, but record the cleanup in followups. |

## 9. Followups (not in this spec)

- Rename `OtpLogin.jsx` → matching its actual auth role (username/password); pure rename + import sweep.
- Network-offline detection + stale-data UI (`navigator.onLine`, retry-with-backoff banner).
- Visual regression infra (Playwright + screenshot diff) if drift recurs.
- Loading-spinner consolidation across non-audit sites if the next polish audit flags more.
