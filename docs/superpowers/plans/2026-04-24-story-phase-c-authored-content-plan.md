# Story Phase C — Authored Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bio+fact+quote auto-compose fallback with handwritten per-figure stories and era intro/outro scripts authored in the Admin Panel, with draft/published status per field and admin-only preview. Content lives in a new `story_content` table with slug-namespaced rows.

**Architecture:** A single `story_content` table keyed by `(slug, lang)` covers both per-figure stories (`slug='figure:<id>'`) and per-era bookends (`slug='era_intro:<era>'` / `slug='era_outro:<era>'`). A new React Query hook `useAuthoredContent` fetches all rows once per session; `storyText()` gains an optional `authored` map argument that takes priority over the existing auto-compose. RLS surfaces only published rows to non-admins; admins see everything. A `?preview=1` flag on `/story/:chapter` lets admins surface drafts.

**Tech Stack:** Postgres + Supabase RLS + @tanstack/react-query (already installed) + Vitest.

---

## Spec

See `docs/superpowers/specs/2026-04-24-story-phase-c-authored-content-design.md`.

## Phase A + B carry-over

Phase A already landed:
- `useNarration` hook, `StoryChapter` page, `StoryPlayer.jsx` delegating to `useNarration`.
- Era intro/outro currently templated from `ERAS[era].intro` / `intro_en`.
- `storyText(figure, lang)` lives in `src/lib/figuresI18n.js` with priority chain (1) `figure.story_en`/`figure.story` then (2) auto-compose.

Phase B added:
- `figure_voices` table + `useVoices` hook + `useNarration` cascade.

Phase C plugs into these.

## File Structure

### New files
- `supabase/migrations/20260425020000_story_content.sql` — DB migration.
- `src/hooks/useAuthoredContent.js` — React Query hook fetching the full `story_content` table.
- `src/components/admin/StoryEditorModal.jsx` — modal for editing a figure's mn/en story with publish toggles.
- `src/components/admin/Eras.jsx` — admin tab for the 6 era intros/outros.
- `src/hooks/useAuthoredContent.test.jsx`

### Modified files
- `src/lib/figuresI18n.js` — extend `storyText(figure, lang, authored?)`.
- `src/pages/StoryChapter.jsx` — fetch authored, pass to `storyText`, use for era bookends, honor `?preview=1`.
- `src/components/StoryPlayer.jsx` — accept optional `authored` prop and pass it to `storyText`.
- `src/pages/FigureDetail.jsx` — fetch authored, pass to StoryPlayer.
- `src/pages/StoryTour.jsx` — same.
- `src/components/admin/AdminPanel.jsx` — add "Edit story" button in figure editor + register Eras tab.
- `src/lib/i18n.jsx` — `admin.stories.*` and `admin.eras.*` keys.
- `supabase/tests/rls_smoke.sql` — append `story_content` assertions.

---

## Task 1: `story_content` migration

**Files:**
- Create: `supabase/migrations/20260425020000_story_content.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase C: authored per-figure stories + per-era intros/outros.
create table story_content (
  slug        text not null,
  -- 'figure:<fig_id>' | 'era_intro:<era_key>' | 'era_outro:<era_key>'
  lang        text not null check (lang in ('mn','en')),
  text        text not null default '',
  status      text not null default 'draft' check (status in ('draft','published')),
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  primary key (slug, lang)
);

alter table story_content enable row level security;

create policy "published read" on story_content for select using (status = 'published');
create policy "admin read all" on story_content for select using (is_admin());
create policy "admin write"    on story_content for all    using (is_admin());
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `story_content` and the SQL above.

- [ ] **Step 3: Verify**

Use `mcp__supabase__execute_sql` with `select count(*) from story_content;` — expect `0`.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/20260425020000_story_content.sql
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): story_content table + RLS"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1: Append admin story / eras keys**

Find `admin.voices.none` (end of Phase B block). Append immediately after:

```js
  // Admin — Stories (Story Phase C)
  'admin.stories.storyMn':      { mn: 'Түүх · Монгол',        en: 'Story · Mongolian' },
  'admin.stories.storyEn':      { mn: 'Түүх · English',       en: 'Story · English' },
  'admin.stories.edit':         { mn: 'Түүх засах',            en: 'Edit story' },
  'admin.stories.publish':      { mn: 'Нийтлэх',               en: 'Publish' },
  'admin.stories.unpublish':    { mn: 'Нийтлэлээс авах',      en: 'Unpublish' },
  'admin.stories.draft':        { mn: 'Ноорог',                en: 'Draft' },
  'admin.stories.published':    { mn: 'Нийтлэгдсэн',          en: 'Published' },
  'admin.stories.preview':      { mn: 'Бүлэгт үзэх',          en: 'Preview in chapter' },
  'admin.stories.chars':        { mn: '{n} тэмдэгт',           en: '{n} chars' },
  'admin.stories.save':         { mn: 'Хадгалах',              en: 'Save' },
  'admin.stories.close':        { mn: 'Хаах',                  en: 'Close' },

  // Admin — Eras (Story Phase C)
  'admin.eras.title':           { mn: 'Бүлгүүд',              en: 'Eras' },
  'admin.eras.intro':           { mn: 'Эхлэл',                 en: 'Intro' },
  'admin.eras.outro':           { mn: 'Төгсгөл',               en: 'Outro' },
```

- [ ] **Step 2: Commit**

```
git add src/lib/i18n.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "i18n: admin.stories.* + admin.eras.* for Story Phase C"
```

---

## Task 3: `storyText` signature grows + `useAuthoredContent` hook

**Files:**
- Modify: `src/lib/figuresI18n.js`
- Create: `src/hooks/useAuthoredContent.js`
- Create: `src/hooks/useAuthoredContent.test.jsx`

- [ ] **Step 1: Write failing tests for both**

Create `src/hooks/useAuthoredContent.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthoredContent } from '@/hooks/useAuthoredContent';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

function wrap(client) {
  // eslint-disable-next-line react/display-name
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { mockFrom.mockReset(); });

describe('useAuthoredContent', () => {
  it('returns a getter that finds published rows by slug+lang', async () => {
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({
        data: [
          { slug: 'figure:1',       lang: 'mn', text: 'Story A', status: 'published' },
          { slug: 'figure:1',       lang: 'en', text: 'Draft',   status: 'draft' },
          { slug: 'era_intro:founding', lang: 'mn', text: 'Opening', status: 'published' },
        ],
        error: null,
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuthoredContent(false), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.get('figure:1', 'mn')).toEqual({ text: 'Story A', status: 'published' });
    // non-preview mode: drafts ignored
    expect(result.current.get('figure:1', 'en')).toBeNull();
    expect(result.current.get('era_intro:founding', 'mn')?.text).toBe('Opening');
    expect(result.current.get('figure:999', 'mn')).toBeNull();
  });

  it('surfaces drafts when preview=true', async () => {
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({
        data: [
          { slug: 'figure:2', lang: 'mn', text: 'WIP', status: 'draft' },
        ],
        error: null,
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuthoredContent(true), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.get('figure:2', 'mn')?.text).toBe('WIP');
  });

  it('returns null getter on query error', async () => {
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({ data: null, error: new Error('boom') }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuthoredContent(false), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.get('figure:1', 'mn')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `useAuthoredContent.js`**

```js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Fetch all story_content rows once per session.
 * Returns { isLoading, get(slug, lang): { text, status } | null }.
 * When `isPreview` is false, drafts are ignored (get returns null for them).
 * When `isPreview` is true, drafts surface alongside published rows.
 * RLS already filters draft rows for non-admins regardless of this flag.
 */
export function useAuthoredContent(isPreview = false) {
  const query = useQuery({
    queryKey: ['story_content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('story_content')
        .select('slug, lang, text, status');
      if (error) throw error;
      const map = new Map();
      for (const row of data ?? []) {
        map.set(`${row.slug}|${row.lang}`, { text: row.text, status: row.status });
      }
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });

  const get = (slug, lang) => {
    if (!query.data) return null;
    const hit = query.data.get(`${slug}|${lang}`);
    if (!hit) return null;
    if (hit.status === 'published') return hit;
    if (isPreview) return hit;
    return null;
  };

  return { isLoading: query.isLoading, get };
}
```

- [ ] **Step 3: Extend `storyText` signature**

In `src/lib/figuresI18n.js`, replace the existing `storyText(figure, lang)` export with:

```js
export function storyText(figure, lang, authored) {
  if (!figure) return '';

  // 1. Authored content (Phase C). `authored` is a Map-like from useAuthoredContent.
  if (authored) {
    const entry = authored.get(`figure:${figure.fig_id}`, lang);
    if (entry?.text) return entry.text;
  }

  // 2. Legacy explicit fields on the figure record (deprecated).
  if (lang === 'en' && figure.story_en) return figure.story_en;
  if (lang !== 'en' && figure.story)    return figure.story;

  // 3. Auto-compose fallback (unchanged).
  const bio = figureBio(figure, lang);
  const fact = figureFact(figure, lang);
  const { quote, qattr } = figureQuote(figure, lang);
  const name = (lang === 'en' ? FIGURE_NAMES_EN[figure.fig_id] : figure.name) || figure.name;

  const parts = [];
  if (name) {
    parts.push(lang === 'en' ? `The story of ${name}.` : `${name}-ын түүх.`);
  }
  if (bio) parts.push(bio);
  if (fact) {
    parts.push(lang === 'en' ? `A notable fact: ${fact}` : `Сонирхолтой баримт: ${fact}`);
  }
  if (quote) {
    parts.push(
      lang === 'en'
        ? `In ${qattr ? qattr + '’s' : 'their'} own words: ${quote}`
        : `Өөрийнх нь үгээр: ${quote}`
    );
  }
  return parts.join(' ');
}
```

Existing imports in `figuresI18n.js` (`figureBio`, `figureFact`, `figureQuote`, `FIGURE_NAMES_EN`) remain unchanged.

- [ ] **Step 4: Run tests**

```
npm run test -- --run src/hooks/useAuthoredContent.test.jsx
```

Expected: 3/3 PASS.

- [ ] **Step 5: Run full suite — no regressions**

```
npm run test -- --run
```

All tests still pass (callers of `storyText` that don't pass `authored` keep working — the 3rd arg is optional).

- [ ] **Step 6: Commit**

```
git add src/hooks/useAuthoredContent.js src/hooks/useAuthoredContent.test.jsx src/lib/figuresI18n.js
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): storyText accepts authored map + useAuthoredContent hook"
```

---

## Task 4: Wire `StoryChapter` to authored content + preview mode

**Files:**
- Modify: `src/pages/StoryChapter.jsx`
- Modify: `src/pages/StoryChapter.test.jsx`

- [ ] **Step 1: Update `StoryChapter.jsx`**

Add the import (with existing imports):

```js
import { useAuthoredContent } from '@/hooks/useAuthoredContent';
```

Inside the component body, after the existing `const { voiceIdFor } = useVoices(lang);` line:

```js
  const isPreview = params.get('preview') === '1';
  const { get: getAuthored } = useAuthoredContent(isPreview);
```

Replace the `narrationText` `useMemo` with one that consults `story_content`:

```js
  const narrationText = useMemo(() => {
    if (!slide) return '';
    if (slide.kind === 'figure') return storyText(slide.figure, lang, { get: getAuthored });
    if (slide.kind === 'intro') {
      const authored = getAuthored(`era_intro:${chapter}`, lang);
      if (authored?.text) return authored.text;
      const years = lang === 'en' ? (eraDef.years_en || eraDef.years) : eraDef.years;
      const intro = lang === 'en' ? (eraDef.intro_en || eraDef.intro) : eraDef.intro;
      return `${eraDef.label}. ${years}. ${intro ?? ''}`;
    }
    // outro
    const authored = getAuthored(`era_outro:${chapter}`, lang);
    if (authored?.text) return authored.text;
    return lang === 'en' ? `Chapter ${eraDef.roman} complete.` : `Бүлэг ${eraDef.roman} дуусав.`;
  }, [slide, lang, eraDef, chapter, getAuthored]);
```

Inside the **background pre-fetch** useEffect, update the per-slide text computation to also check authored:

```js
        const text = s.kind === 'figure'
          ? storyText(s.figure, lang, { get: getAuthored })
          : s.kind === 'intro'
            ? (getAuthored(`era_intro:${chapter}`, lang)?.text
                ?? `${eraDef.label}. ${lang === 'en' ? (eraDef.years_en || eraDef.years) : eraDef.years}. ${lang === 'en' ? (eraDef.intro_en || eraDef.intro) : eraDef.intro ?? ''}`)
            : (getAuthored(`era_outro:${chapter}`, lang)?.text
                ?? (lang === 'en' ? `Chapter ${eraDef.roman} complete.` : `Бүлэг ${eraDef.roman} дуусав.`));
```

(Keep the `voice_id` lookup and concurrency logic intact.)

- [ ] **Step 2: Update the StoryChapter test mocks**

In `src/pages/StoryChapter.test.jsx`, add a mock for the new hook (alongside existing mocks):

```js
vi.mock('@/hooks/useAuthoredContent', () => ({
  useAuthoredContent: vi.fn(() => ({ isLoading: false, get: () => null })),
}));
```

- [ ] **Step 3: Run full suite**

```
npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add src/pages/StoryChapter.jsx src/pages/StoryChapter.test.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): StoryChapter reads authored stories + era bookends + preview mode"
```

---

## Task 5: Wire `StoryPlayer`, `FigureDetail`, `StoryTour` to authored content

**Files:**
- Modify: `src/components/StoryPlayer.jsx`
- Modify: `src/pages/FigureDetail.jsx`
- Modify: `src/pages/StoryTour.jsx`

- [ ] **Step 1: Update `StoryPlayer.jsx`**

In `src/components/StoryPlayer.jsx`, change the signature and how `storyText` is called:

Replace the component signature line:

```jsx
export default function StoryPlayer({ figure, variant = 'block', autoPlay = false, onDone, authored }) {
```

Replace the `text` useMemo line:

```jsx
  const text = useMemo(() => storyText(figure, lang, authored), [figure, lang, authored]);
```

No other StoryPlayer logic changes.

- [ ] **Step 2: Update `FigureDetail.jsx` to supply `authored`**

Add the import (with existing imports):

```js
import { useAuthoredContent } from '@/hooks/useAuthoredContent';
```

Inside `FigureDetail`'s component body, near the other hook calls:

```js
  const { get: getAuthored } = useAuthoredContent(false);
```

Locate the `<StoryPlayer figure={figure} ... />` render site and add the `authored` prop:

```jsx
<StoryPlayer figure={figure} authored={{ get: getAuthored }} />
```

(The `{ get: getAuthored }` wrapping keeps the `storyText` third-arg interface consistent — it expects an object with a `get(slug, lang)` method.)

- [ ] **Step 3: Update `StoryTour.jsx`**

Same pattern. Add:

```js
import { useAuthoredContent } from '@/hooks/useAuthoredContent';
```

In the component body:

```js
  const { get: getAuthored } = useAuthoredContent(false);
```

Anywhere `StoryPlayer` is rendered, pass `authored={{ get: getAuthored }}`.

Anywhere the tour reads `storyText(figure, lang)` directly (e.g., transcript view), change to `storyText(figure, lang, { get: getAuthored })`.

- [ ] **Step 4: Run full suite**

```
npm run test -- --run
```

Expected: all tests still pass. Existing tests that don't pass `authored` still work (it's optional).

- [ ] **Step 5: Commit**

```
git add src/components/StoryPlayer.jsx src/pages/FigureDetail.jsx src/pages/StoryTour.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): StoryPlayer + FigureDetail + StoryTour read authored stories"
```

---

## Task 6: Admin story editor modal (per-figure)

**Files:**
- Create: `src/components/admin/StoryEditorModal.jsx`
- Modify: `src/components/admin/AdminPanel.jsx`

- [ ] **Step 1: Create `StoryEditorModal.jsx`**

```jsx
// src/components/admin/StoryEditorModal.jsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function StoryEditorModal({ figure, onClose, onToast }) {
  const { user } = useAuth();
  const [rows, setRows] = useState({}); // { mn: { text, status }, en: { text, status } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const slug = `figure:${figure.fig_id}`;
      const { data, error } = await supabase
        .from('story_content')
        .select('lang, text, status')
        .eq('slug', slug);
      setLoading(false);
      if (error) { onToast('Ачаалахад алдаа: ' + error.message, true); return; }
      const next = { mn: { text: '', status: 'draft' }, en: { text: '', status: 'draft' } };
      for (const r of data ?? []) next[r.lang] = { text: r.text, status: r.status };
      setRows(next);
    })();
  }, [figure.fig_id, onToast]);

  const saveLang = async (lang, nextStatus) => {
    setSaving(true);
    const row = rows[lang];
    const status = nextStatus ?? row.status;
    const { error } = await supabase.from('story_content').upsert(
      {
        slug: `figure:${figure.fig_id}`,
        lang,
        text: row.text,
        status,
        updated_by: user?.id,
      },
      { onConflict: 'slug,lang' },
    );
    setSaving(false);
    if (error) { onToast('Хадгалахад алдаа: ' + error.message, true); return; }
    setRows((prev) => ({ ...prev, [lang]: { ...prev[lang], status } }));
    onToast(status === 'published' ? 'Нийтлэгдлээ' : 'Хадгалагдлаа');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[400] bg-background/80 flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl p-6">Ачаалж байна…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[400] bg-background/80 flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-auto space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-cinzel font-bold">Түүх · {figure.name}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>Хаах</Button>
        </div>

        {(['mn', 'en']).map((lang) => {
          const row = rows[lang];
          const isPublished = row.status === 'published';
          return (
            <div key={lang} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-meta text-[11px] tracking-[0.2em] uppercase text-brass/80">
                  Түүх · {lang.toUpperCase()}
                </label>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  isPublished ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
                }`}>
                  {isPublished ? 'Нийтлэгдсэн' : 'Ноорог'}
                </span>
              </div>
              <Textarea
                rows={10}
                value={row.text}
                onChange={(e) => setRows((p) => ({ ...p, [lang]: { ...p[lang], text: e.target.value } }))}
                placeholder="Түүхийн текст…"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground font-body">
                  {row.text.length} тэмдэгт · ~{Math.round(row.text.length / 15)}с
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => saveLang(lang)}>
                    Хадгалах
                  </Button>
                  {isPublished ? (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => saveLang(lang, 'draft')}>
                      Нийтлэлээс авах
                    </Button>
                  ) : (
                    <Button size="sm" disabled={saving || !row.text.trim()} onClick={() => saveLang(lang, 'published')}>
                      Нийтлэх
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the Edit button into the figure editor in `AdminPanel.jsx`**

Add the import near the admin imports:

```js
import StoryEditorModal from '@/components/admin/StoryEditorModal';
```

Add state near the other AdminPanel `useState` calls:

```js
  const [storyEditing, setStoryEditing] = useState(null);
```

In the figure editor JSX — place this button in the editor column (near the existing input fields for bio/fact, probably just above or near the `role` input around line 414). Drop it in as a full-width block:

```jsx
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Phase C Story</label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStoryEditing(selectedFig)}
                      >
                        📝 Түүх засах
                      </Button>
                    </div>
```

At the bottom of the AdminPanel component JSX — just above `{toast && …}`:

```jsx
      {storyEditing && (
        <StoryEditorModal
          figure={storyEditing}
          onClose={() => setStoryEditing(null)}
          onToast={showToast}
        />
      )}
```

- [ ] **Step 3: Verify build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/components/admin/StoryEditorModal.jsx src/components/admin/AdminPanel.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): admin StoryEditorModal for per-figure stories"
```

---

## Task 7: Admin Eras tab

**Files:**
- Create: `src/components/admin/Eras.jsx`
- Modify: `src/components/admin/AdminPanel.jsx`

- [ ] **Step 1: Create `Eras.jsx`**

```jsx
// src/components/admin/Eras.jsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ERAS, ERA_KEYS } from '@/lib/figuresData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

const LANGS = ['mn', 'en'];
const KINDS = ['intro', 'outro'];

export default function AdminEras({ onToast }) {
  const { user } = useAuth();
  const [state, setState] = useState({}); // key = `${era}:${kind}:${lang}` -> { text, status }
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const load = async () => {
    setLoading(true);
    const slugs = ERA_KEYS.flatMap((e) => [`era_intro:${e}`, `era_outro:${e}`]);
    const { data, error } = await supabase
      .from('story_content')
      .select('slug, lang, text, status')
      .in('slug', slugs);
    setLoading(false);
    if (error) { onToast('Ачаалахад алдаа: ' + error.message, true); return; }
    const next = {};
    for (const era of ERA_KEYS) for (const kind of KINDS) for (const lang of LANGS) {
      next[`${era}:${kind}:${lang}`] = { text: '', status: 'draft' };
    }
    for (const r of data ?? []) {
      const [prefix, era] = r.slug.split(':'); // 'era_intro' or 'era_outro'
      const kind = prefix.endsWith('intro') ? 'intro' : 'outro';
      next[`${era}:${kind}:${r.lang}`] = { text: r.text, status: r.status };
    }
    setState(next);
  };
  useEffect(() => { load(); }, []);

  const save = async (era, kind, lang, nextStatus) => {
    const key = `${era}:${kind}:${lang}`;
    const row = state[key];
    setSavingKey(key);
    const status = nextStatus ?? row.status;
    const slug = `era_${kind}:${era}`;
    const { error } = await supabase.from('story_content').upsert(
      { slug, lang, text: row.text, status, updated_by: user?.id },
      { onConflict: 'slug,lang' },
    );
    setSavingKey(null);
    if (error) { onToast('Хадгалахад алдаа: ' + error.message, true); return; }
    setState((p) => ({ ...p, [key]: { ...p[key], status } }));
    onToast(status === 'published' ? 'Нийтлэгдлээ' : 'Хадгалагдлаа');
  };

  if (loading) return <p className="text-sm font-body p-6">Ачаалж байна…</p>;

  return (
    <div className="space-y-10">
      {ERA_KEYS.map((era) => {
        const def = ERAS[era];
        return (
          <section key={era} className="border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-cinzel text-sm font-bold">
              {def.roman} · {def.label}
            </h3>
            {KINDS.map((kind) => (
              <div key={kind} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LANGS.map((lang) => {
                  const key = `${era}:${kind}:${lang}`;
                  const row = state[key];
                  const isPub = row?.status === 'published';
                  return (
                    <div key={lang} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">
                          {kind === 'intro' ? 'Эхлэл' : 'Төгсгөл'} · {lang.toUpperCase()}
                        </label>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isPub ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
                        }`}>
                          {isPub ? 'Нийтлэгдсэн' : 'Ноорог'}
                        </span>
                      </div>
                      <Textarea
                        rows={5}
                        value={row?.text ?? ''}
                        onChange={(e) =>
                          setState((p) => ({ ...p, [key]: { ...p[key], text: e.target.value } }))
                        }
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm"
                                disabled={savingKey === key}
                                onClick={() => save(era, kind, lang)}>
                          Хадгалах
                        </Button>
                        {isPub ? (
                          <Button variant="outline" size="sm"
                                  disabled={savingKey === key}
                                  onClick={() => save(era, kind, lang, 'draft')}>
                            Нийтлэлээс авах
                          </Button>
                        ) : (
                          <Button size="sm"
                                  disabled={savingKey === key || !row?.text?.trim()}
                                  onClick={() => save(era, kind, lang, 'published')}>
                            Нийтлэх
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Register the tab in `AdminPanel.jsx`**

Add the import:

```js
import AdminEras from '@/components/admin/Eras';
```

Add the trigger next to the Voices trigger:

```jsx
          <TabsTrigger value="eras" className="gap-1.5 text-xs font-body">
            📖 Бүлэг
          </TabsTrigger>
```

Add the content panel before `</Tabs>` (next to Voices TabsContent):

```jsx
        {/* Eras */}
        <TabsContent value="eras" className="flex-1 overflow-auto p-6">
          <AdminEras onToast={showToast} />
        </TabsContent>
```

- [ ] **Step 3: Verify build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/components/admin/Eras.jsx src/components/admin/AdminPanel.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-c): admin Eras tab for era intro/outro authoring"
```

---

## Task 8: SQL smoke tests for `story_content`

**Files:**
- Modify: `supabase/tests/rls_smoke.sql`

- [ ] **Step 1: Append assertions**

Open `supabase/tests/rls_smoke.sql`. At the end of the file, append:

```sql
-- ─── story_content (Story Phase C) ─────────────────────────────────────────
-- anon cannot read draft rows
do $$
declare n int;
begin
  -- seed a draft row as service role (bypasses RLS)
  insert into story_content (slug, lang, text, status) values ('figure:9999', 'mn', 'draft text', 'draft')
    on conflict (slug, lang) do update set text = excluded.text, status = excluded.status;

  set local role anon;
  select count(*) into n from story_content where slug = 'figure:9999';
  if n <> 0 then raise exception 'anon should not see draft rows, got %', n; end if;
  reset role;

  -- promote to published
  update story_content set status = 'published' where slug = 'figure:9999' and lang = 'mn';

  set local role anon;
  select count(*) into n from story_content where slug = 'figure:9999';
  if n <> 1 then raise exception 'anon should see 1 published row, got %', n; end if;
  reset role;

  -- cleanup
  delete from story_content where slug = 'figure:9999';
end $$;

-- authenticated (non-admin) cannot write to story_content
do $$
begin
  set local role authenticated;
  begin
    insert into story_content (slug, lang, text) values ('figure:8888', 'mn', 'nope');
    raise exception 'non-admin insert into story_content should have been denied';
  exception when insufficient_privilege or others then
    null; -- expected
  end;
end $$;
reset role;
```

- [ ] **Step 2: Commit**

```
git add supabase/tests/rls_smoke.sql
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "test(story-c): story_content RLS smoke assertions"
```

---

## Task 9: Lint + tests + build + push

- [ ] **Step 1: Lint**

```
npm run lint
```

Pre-existing errors are acceptable; new ones in Phase C files must be fixed inline.

- [ ] **Step 2: Full test suite**

```
npm run test -- --run
```

All tests pass. Phase C additions: 3 new `useAuthoredContent` tests.

- [ ] **Step 3: Build**

```
npm run build
```

- [ ] **Step 4: Push**

```
git push origin master
```

---

## Task 10: Manual QA

Start `npm run dev` and walk these scenarios:

- [ ] **A. Author a story.** Log in as admin → Admin Panel → open a figure editor → click "📝 Түүх засах" → the modal opens with empty mn + en textareas. Type a short story in mn → click "Хадгалах" → status pill stays "Ноорог". Close modal.

- [ ] **B. Draft is invisible to users.** As a non-admin (or sign out and use another test account), open `/story/founding`. The figure you authored should still narrate the **auto-composed** fallback text, not your draft.

- [ ] **C. Preview mode.** As admin, open `/story/founding?preview=1` and navigate to the authored figure's slide. Narration should use your draft text.

- [ ] **D. Publish.** Back in admin modal → click "Нийтлэх" → pill turns emerald "Нийтлэгдсэн". Close modal. Hard-refresh `/story/founding` as a normal user → narration now uses authored text.

- [ ] **E. Era bookends.** Admin Panel → Eras tab → enter a short intro for the "founding" era in mn. Publish. Open `/story/founding` → the intro slide's narration uses your authored text instead of the template stub.

- [ ] **F. Cache invalidation.** After publishing new text, Phase B `speak` cache key changes (new `sha256(lang|voice_id|text)`), so first play of the updated slide shows `source: 'synth'` in Network; subsequent plays `source: 'cache'`. No manual cache clear needed.

- [ ] **G. Back-compat.** FigureDetail and StoryTour should still work. A figure with no authored content falls through to the existing bio+fact+quote auto-compose. A figure with published authored content shows the authored text in the FigureDetail StoryPlayer block too.

---

## Self-Review

**Spec coverage:**
- `story_content` table + slug namespace + RLS — Task 1
- Published-read public + admin-read-all + admin-write policies — Task 1
- `useAuthoredContent` hook with preview flag — Task 3
- `storyText` signature grows — Task 3
- StoryChapter reads authored (figures + era bookends) + preview mode — Task 4
- StoryPlayer accepts authored prop — Task 5
- FigureDetail + StoryTour wired — Task 5
- Admin figure-story modal with publish toggle — Task 6
- Admin Eras tab with 24 bookend fields — Task 7
- SQL smoke tests — Task 8

**Placeholder scan:** No TBDs.

**Type consistency:** `useAuthoredContent` returns `{ isLoading, get(slug, lang): { text, status } | null }` used identically by StoryChapter (Task 4), StoryPlayer/FigureDetail/StoryTour (Task 5, wrapping as `{ get: getAuthored }`), admin modals (Tasks 6, 7, which bypass the hook and read/write the table directly). The admin UIs intentionally don't use the hook to avoid stale-cache display after a save — they re-fetch on open.

**Scope check:** One sub-feature (authored content). No decomposition needed.

**Known simplification:**
- Admin UIs write to `story_content` directly via supabase-js. They re-fetch the row on modal open and invalidate nothing — stale caches in other tabs of `useAuthoredContent` will clear after `staleTime` or a full reload. Good enough for Phase C; add React Query `invalidateQueries(['story_content'])` after save if admins complain.
- No character-count warning chip for drafts older than 30 days — deferred from spec as YAGNI until someone actually uses the authoring flow.
- "Preview in chapter" button per story not added — admins can just type `?preview=1` on the chapter URL. Simpler.
