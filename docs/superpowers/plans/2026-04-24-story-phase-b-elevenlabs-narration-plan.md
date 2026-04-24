# Story Phase B — ElevenLabs Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-TTS-only narration with ElevenLabs-generated audio served from the `voice-cache` bucket. Per-figure character voices (via a new `figure_voices` table) with cascade fallback to narrator → browser TTS on any failure. Authenticated users get a 60/hr rate limit; anonymous stays at 10/hr. Admin Voices tab for voice ID curation and chapter pre-rendering.

**Architecture:** The existing `speak` edge function already returns cached URLs by `sha256(lang|voice_id|text)`. This phase (a) lets callers override `voice_id` via request body, (b) splits rate-limit buckets between authed/anon users, and (c) expands the response with a `source` field so the client knows when to cascade. The `useNarration` hook (from Phase A) gains a new audio-URL-fetching step before falling back to browser TTS. No new audio stitching — one voice per slide.

**Tech Stack:** Supabase Edge Functions (Deno) + Postgres + Storage bucket + React + @tanstack/react-query (already installed) + Vitest.

---

## Spec

See `docs/superpowers/specs/2026-04-24-story-phase-b-elevenlabs-narration-design.md`.

## Phase A carry-over

Phase A already landed:
- `useNarration` hook at `src/hooks/useNarration.js`
- `StoryChapter` page at `src/pages/StoryChapter.jsx`
- `StoryPlayer.jsx` delegating to `useNarration`
- Narration currently uses browser `speechSynthesis` only; `audioUrl` branch exists but unused for chapter playback.

Phase B plugs into these seams.

## File Structure

### New files
- `supabase/migrations/20260425010000_figure_voices.sql` — DB migration.
- `src/hooks/useVoices.js` — React Query hook fetching `figure_voices` for a language.
- `src/components/admin/Voices.jsx` — admin voices curation tab.

### Modified files
- `supabase/functions/speak/index.ts` — accept `voice_id` override; auth-aware rate limits; `source` field in response.
- `src/hooks/useNarration.js` — call `speak` edge function; cascade on failure.
- `src/pages/StoryChapter.jsx` — wire `useVoices`, pass `voice_id` per slide; kick off background pre-fetch.
- `src/components/admin/AdminPanel.jsx` — register new Voices tab.
- `src/lib/i18n.jsx` — `admin.voices.*` keys.
- `supabase/tests/rls_smoke.sql` — append `figure_voices` RLS assertions.

---

## Task 1: `figure_voices` migration

**Files:**
- Create: `supabase/migrations/20260425010000_figure_voices.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260425010000_figure_voices.sql`:

```sql
-- Phase B: per-figure, per-language voice ID mapping for ElevenLabs narration.
create table figure_voices (
  fig_id      int  not null,
  lang        text not null check (lang in ('mn','en','cn')),
  voice_id    text not null,
  sample_url  text,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (fig_id, lang)
);

alter table figure_voices enable row level security;

create policy "voices public read" on figure_voices for select using (true);
create policy "voices admin write" on figure_voices for all    using (is_admin());
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `figure_voices` and the SQL above.

- [ ] **Step 3: Verify table exists**

Use `mcp__supabase__execute_sql` with `select count(*) from figure_voices;` — expect `0`.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/20260425010000_figure_voices.sql
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): figure_voices table + RLS"
```

---

## Task 2: Update `speak` edge function

**Files:**
- Modify: `supabase/functions/speak/index.ts`

Changes:
1. Accept optional `voice_id` in request body (overrides env default).
2. Parse JWT if present; use `user:${uid}` rate-limit bucket at 60/hr; else anon IP bucket at 10/hr.
3. Expand response with `source: 'cache' | 'synth' | 'fallback'`.

- [ ] **Step 1: Replace the file**

Overwrite `supabase/functions/speak/index.ts` with:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { ipHash, currentHourBucket } from '../_shared/ip.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';

const ANON_HOURLY_LIMIT = 10;
const AUTHED_HOURLY_LIMIT = 60;
const BUCKET = 'voice-cache';

const DEFAULT_VOICE_IDS: Record<string, string | undefined> = {
  mn: Deno.env.get('ELEVENLABS_VOICE_ID_MN'),
  en: Deno.env.get('ELEVENLABS_VOICE_ID_EN'),
  cn: Deno.env.get('ELEVENLABS_VOICE_ID_CN'),
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: { text?: string; lang?: string; voice_id?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request', source: 'fallback' }, 400); }

  const lang = (body.lang === 'en' || body.lang === 'cn') ? body.lang : 'mn';
  const text = body.text?.trim() ?? '';
  if (!text || text.length > 800) {
    return json({ ok: false, reason: 'bad_text', source: 'fallback' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Determine rate-limit bucket + quota based on auth.
  let bucketKey: string;
  let quota: number;
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authed.auth.getUser();
    if (userData?.user) {
      bucketKey = `user:${userData.user.id}`;
      quota = AUTHED_HOURLY_LIMIT;
    } else {
      bucketKey = await ipHash(req);
      quota = ANON_HOURLY_LIMIT;
    }
  } else {
    bucketKey = await ipHash(req);
    quota = ANON_HOURLY_LIMIT;
  }

  const effectiveVoiceId = body.voice_id?.trim() || DEFAULT_VOICE_IDS[lang];
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!effectiveVoiceId || !elevenKey) {
    return json({ ok: false, reason: 'no_key', source: 'fallback' });
  }

  const key = await sha256Hex(`${lang}|${effectiveVoiceId}|${text}`);
  const path = `${key}.mp3`;
  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  // Cache hit skips rate limit — cached audio is free.
  try {
    const head = await fetch(publicUrl, { method: 'HEAD' });
    if (head.ok) return json({ ok: true, url: publicUrl, source: 'cache' });
  } catch { /* fall through to synth */ }

  // Apply rate limit before synth.
  const hourBucket = currentHourBucket();
  const limit = await checkAndIncrement(admin, bucketKey, hourBucket, 'speak', quota);
  if (!limit.allowed) {
    return json({ ok: false, reason: 'rate_limited', source: 'fallback' });
  }

  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenKey,
        'accept': 'audio/mpeg',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.7 },
      }),
    });
    if (resp.status === 429 || !resp.ok) {
      return json({ ok: false, reason: `eleven_${resp.status}`, source: 'fallback' });
    }
    const audio = new Uint8Array(await resp.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, audio, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
    if (upErr) {
      console.error('voice-cache upload failed', upErr);
      return json({ ok: false, reason: 'upload_failed', source: 'fallback' });
    }
    return json({ ok: true, url: publicUrl, source: 'synth' });
  } catch (err) {
    console.error('elevenlabs call failed', err);
    return json({ ok: false, reason: 'exception', source: 'fallback' });
  }
});
```

- [ ] **Step 2: Deploy via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with name `speak`, entrypoint `index.ts`, `verify_jwt: false`, and the files array containing this index.ts plus the existing shared `_shared/cors.ts`, `_shared/ip.ts`, `_shared/rate-limit.ts`.

- [ ] **Step 3: Smoke test the deployed function**

From the browser dev console on a logged-in session:

```js
const { data, error } = await window.supabase.functions.invoke('speak', {
  body: { text: 'Сайн байна уу', lang: 'mn' },
});
console.log({ data, error });
```

Expected: `{ ok: true, url: '…', source: 'synth' }` on first call; `source: 'cache'` on second.

- [ ] **Step 4: Commit**

```
git add supabase/functions/speak/index.ts
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): speak accepts voice_id override + authed rate limits"
```

---

## Task 3: `useVoices` hook + test

**Files:**
- Create: `src/hooks/useVoices.js`
- Create: `src/hooks/useVoices.test.js`

- [ ] **Step 1: Write the failing test first**

```js
// src/hooks/useVoices.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVoices } from '@/hooks/useVoices';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

function wrap(client) {
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { mockFrom.mockReset(); });

describe('useVoices', () => {
  it('returns voiceIdFor that maps figId -> voice_id for the active lang', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({
          data: [
            { fig_id: 1, lang: 'mn', voice_id: 'vid_A' },
            { fig_id: 3, lang: 'mn', voice_id: 'vid_B' },
          ],
          error: null,
        }),
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useVoices('mn'), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.voiceIdFor(1)).toBe('vid_A');
    expect(result.current.voiceIdFor(3)).toBe('vid_B');
    expect(result.current.voiceIdFor(99)).toBeNull();
  });

  it('returns null on query error', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: new Error('boom') }),
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useVoices('mn'), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.voiceIdFor(1)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `useVoices.js`**

```js
// src/hooks/useVoices.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Fetch figure_voices for `lang` once per session. Returns:
 *   { isLoading, voiceIdFor(figId): string | null }
 */
export function useVoices(lang) {
  const query = useQuery({
    queryKey: ['figure_voices', lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figure_voices')
        .select('fig_id, voice_id')
        .eq('lang', lang);
      if (error) throw error;
      const map = new Map();
      for (const row of data ?? []) map.set(row.fig_id, row.voice_id);
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const voiceIdFor = (figId) => {
    if (!query.data) return null;
    return query.data.get(figId) ?? null;
  };

  return { isLoading: query.isLoading, voiceIdFor };
}
```

- [ ] **Step 3: Run tests**

```
npm run test -- --run src/hooks/useVoices.test.js
```

Expected: 2/2 PASS.

- [ ] **Step 4: Commit**

```
git add src/hooks/useVoices.js src/hooks/useVoices.test.js
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): useVoices hook fetches figure_voices via React Query"
```

---

## Task 4: Extend `useNarration` to call `speak` + cascade fallback

**Files:**
- Modify: `src/hooks/useNarration.js`

The Phase A hook takes `audioUrl` directly. Phase B inserts a step: if no `audioUrl` passed but we have `text` and the caller opted in via `useSpeak: true`, fetch an URL from the `speak` edge function (with optional `voice_id`). On fallback response, retry without `voice_id` (narrator); on repeated fallback, let the existing browser-TTS path handle it.

- [ ] **Step 1: Replace the hook body**

Overwrite `src/hooks/useNarration.js`:

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

async function fetchSpokenUrl({ text, lang, voiceId }) {
  const body = { text, lang };
  if (voiceId) body.voice_id = voiceId;
  const { data, error } = await supabase.functions.invoke('speak', { body });
  if (error) return { url: null, source: 'fallback' };
  return {
    url: data?.url ?? null,
    source: data?.source ?? 'fallback',
  };
}

/**
 * Narration engine.
 * Props:
 *   text        string to narrate
 *   audioUrl    optional pre-resolved audio URL (skips speak)
 *   lang        'mn' | 'en' | 'cn'
 *   voiceId     optional ElevenLabs voice id (per-figure character voice)
 *   useSpeak    when true, call the `speak` edge function before falling back to TTS
 *   autoPlay    begin on mount / change
 *   onDone      called when narration finishes
 */
export function useNarration({
  text,
  audioUrl,
  lang = 'mn',
  voiceId,
  useSpeak = false,
  autoPlay = false,
  onDone,
} = {}) {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [resolvedUrl, setResolvedUrl] = useState(audioUrl ?? null);
  const [source, setSource] = useState(audioUrl ? 'provided' : 'idle');
  const audioRef = useRef(null);
  const utterRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Resolve audio URL through `speak` edge function with cascade fallback.
  useEffect(() => {
    if (audioUrl) {
      setResolvedUrl(audioUrl);
      setSource('provided');
      return;
    }
    if (!useSpeak || !text) {
      setResolvedUrl(null);
      setSource('tts');
      return;
    }
    let cancelled = false;
    (async () => {
      const first = await fetchSpokenUrl({ text, lang, voiceId });
      if (cancelled) return;
      if (first.url) {
        setResolvedUrl(first.url);
        setSource(first.source);
        return;
      }
      // character voice failed → retry with narrator default
      if (voiceId) {
        const second = await fetchSpokenUrl({ text, lang });
        if (cancelled) return;
        if (second.url) {
          setResolvedUrl(second.url);
          setSource(second.source);
          return;
        }
      }
      // full fallback — browser TTS path
      setResolvedUrl(null);
      setSource('tts');
    })();
    return () => { cancelled = true; };
  }, [text, audioUrl, lang, voiceId, useSpeak]);

  const mode = resolvedUrl ? 'audio' : 'tts';

  const pickVoice = useCallback(() => {
    if (!ttsSupported) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const code = lang === 'en' ? 'en' : 'mn';
    return voices.find((v) => v.lang?.toLowerCase().startsWith(code))
      ?? voices.find((v) => v.lang?.toLowerCase().includes(code))
      ?? voices[0] ?? null;
  }, [lang, ttsSupported]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (ttsSupported) window.speechSynthesis.cancel();
    utterRef.current = null;
    setStatus('idle');
    setProgress(0);
    setCharIndex(0);
  }, [ttsSupported]);

  const play = useCallback(() => {
    if (mode === 'audio') {
      audioRef.current?.play().catch(() => setStatus('idle'));
      return;
    }
    if (!ttsSupported || !text) return;
    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = lang === 'en' ? 'en-US' : 'mn-MN';
    u.rate = 0.96;
    u.onstart = () => setStatus('playing');
    u.onend = () => { setStatus('done'); setProgress(1); utterRef.current = null; onDoneRef.current?.(); };
    u.onerror = () => { setStatus('idle'); utterRef.current = null; };
    u.onboundary = (ev) => {
      if (typeof ev.charIndex === 'number' && text.length > 0) {
        setCharIndex(ev.charIndex);
        setProgress(Math.min(1, ev.charIndex / text.length));
      }
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }, [mode, ttsSupported, text, status, pickVoice, lang]);

  const pause = useCallback(() => {
    if (mode === 'audio') { audioRef.current?.pause(); return; }
    if (ttsSupported) { window.speechSynthesis.pause(); setStatus('paused'); }
  }, [mode, ttsSupported]);

  useEffect(() => {
    stop();
    if (autoPlay) {
      const id = setTimeout(() => play(), 0);
      return () => clearTimeout(id);
    }
  }, [text, resolvedUrl, lang]);

  useEffect(() => {
    if (mode !== 'audio' || !audioRef.current) return;
    const el = audioRef.current;
    const onPlay = () => setStatus('playing');
    const onPause = () => setStatus((s) => (s === 'done' ? 'done' : 'paused'));
    const onEnded = () => { setStatus('done'); setProgress(1); onDoneRef.current?.(); };
    const onTime = () => {
      if (el.duration && isFinite(el.duration)) setProgress(Math.min(1, el.currentTime / el.duration));
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
    };
  }, [mode, resolvedUrl]);

  const audioProps = useMemo(
    () => ({ ref: audioRef, src: resolvedUrl ?? undefined, preload: 'metadata', className: 'hidden' }),
    [resolvedUrl],
  );

  return { status, progress, charIndex, play, pause, stop, audioProps, mode, source };
}
```

- [ ] **Step 2: Run full suite to confirm no regression**

```
npm run test -- --run
```

Expected: all prior Phase A tests still green. The default behavior (no `useSpeak` flag) is unchanged — StoryPlayer consumers on FigureDetail still work.

- [ ] **Step 3: Commit**

```
git add src/hooks/useNarration.js
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): useNarration calls speak with cascade fallback"
```

---

## Task 5: `StoryChapter` — wire `useVoices`, pass `voice_id`, pre-fetch

**Files:**
- Modify: `src/pages/StoryChapter.jsx`

- [ ] **Step 1: Wire `useVoices` + pass voice_id to `useNarration`**

In `src/pages/StoryChapter.jsx`:

1. Add imports at the top (after existing imports):

```js
import { useVoices } from '@/hooks/useVoices';
```

2. Inside the component body, add after the `eraDef` line:

```js
  const { voiceIdFor } = useVoices(lang);
```

3. Compute the current slide's voice id (near the `narrationText` useMemo):

```js
  const slideVoiceId = useMemo(() => {
    if (!slide || slide.kind !== 'figure') return null;
    return voiceIdFor(slide.figure.fig_id);
  }, [slide, voiceIdFor]);
```

4. Update the `useNarration` call to include the new props:

```js
  const { status, progress, charIndex, play, pause, stop } = useNarration({
    text: narrationText,
    lang,
    voiceId: slideVoiceId,
    useSpeak: true,
    autoPlay: true,
    onDone: advance,
  });
```

- [ ] **Step 2: Add background pre-fetch for upcoming slides**

Below the `useNarration` call, add:

```js
  // Background pre-fetch: warm the speak cache for upcoming slides.
  useEffect(() => {
    if (!playlist.length || slideIdx >= playlist.length - 1) return;
    if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return;
    const upcoming = playlist.slice(slideIdx + 1);
    const CONCURRENCY = 3;
    let cancelled = false;
    let cursor = 0;
    async function runOne() {
      while (!cancelled && cursor < upcoming.length) {
        const i = cursor++;
        const s = upcoming[i];
        const text = s.kind === 'figure'
          ? storyText(s.figure, lang)
          : s.kind === 'intro'
            ? `${eraDef.label}. ${lang === 'en' ? (eraDef.years_en || eraDef.years) : eraDef.years}. ${lang === 'en' ? (eraDef.intro_en || eraDef.intro) : eraDef.intro ?? ''}`
            : (lang === 'en' ? `Chapter ${eraDef.roman} complete.` : `Бүлэг ${eraDef.roman} дуусав.`);
        const vid = s.kind === 'figure' ? voiceIdFor(s.figure.fig_id) : null;
        const body = { text, lang };
        if (vid) body.voice_id = vid;
        try { await supabase.functions.invoke('speak', { body }); } catch { /* ignore */ }
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, () => runOne());
    Promise.allSettled(workers);
    return () => { cancelled = true; };
  }, [playlist, slideIdx, lang, voiceIdFor, eraDef]);
```

5. Add the supabase import at the top if not already present:

```js
import { supabase } from '@/lib/supabase';
```

- [ ] **Step 3: Update mock in `StoryChapter.test.jsx` so tests keep passing**

The existing test mocks `useNarration` but not `useVoices`. Add a mock at the top of `src/pages/StoryChapter.test.jsx` (alongside existing mocks):

```js
vi.mock('@/hooks/useVoices', () => ({
  useVoices: vi.fn(() => ({ isLoading: false, voiceIdFor: () => null })),
}));
```

Also mock the supabase import used by background pre-fetch:

```js
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
```

- [ ] **Step 4: Run the full suite**

```
npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add src/pages/StoryChapter.jsx src/pages/StoryChapter.test.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): StoryChapter passes voice_id + background pre-fetch"
```

---

## Task 6: Admin i18n strings

**Files:**
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1: Append admin voice keys**

Find the last `chapters.play` key block inserted in Phase A. Below it, append:

```js
  // Admin — Voices (Story Phase B)
  'admin.voices.title':           { mn: 'Дуу хоолой',                 en: 'Voices' },
  'admin.voices.assign':          { mn: 'Дуу хоолой оноох',          en: 'Assign voice' },
  'admin.voices.voiceIdLabel':    { mn: 'ElevenLabs voice_id',        en: 'ElevenLabs voice_id' },
  'admin.voices.preview':         { mn: 'Сонсох',                     en: 'Preview' },
  'admin.voices.save':            { mn: 'Хадгалах',                   en: 'Save' },
  'admin.voices.preRender':       { mn: 'Бүлгийг бэлтгэх',           en: 'Pre-render chapter' },
  'admin.voices.preRendering':    { mn: 'Бэлтгэж байна…',             en: 'Pre-rendering…' },
  'admin.voices.hasQuoteFilter':  { mn: 'Ишлэлтэй зүтгэлтнүүд',       en: 'Figures with a quote' },
  'admin.voices.none':            { mn: '— оноогдоогүй —',            en: '— unassigned —' },
  'admin.voices.previewLineMn':   { mn: 'Би бол {name}.',             en: 'I am {name}.' },
  'admin.voices.previewLineEn':   { mn: 'Би бол {name}.',             en: 'I am {name}.' },
```

- [ ] **Step 2: Commit**

```
git add src/lib/i18n.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "i18n: admin.voices.* for Story Phase B"
```

---

## Task 7: Admin `Voices` tab

**Files:**
- Create: `src/components/admin/Voices.jsx`
- Modify: `src/components/admin/AdminPanel.jsx`

- [ ] **Step 1: Create `Voices.jsx`**

```jsx
// src/components/admin/Voices.jsx
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FIGURES, ERA_KEYS, getEra } from '@/lib/figuresData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { storyText } from '@/lib/i18n';
import { buildChapterPlaylist } from '@/lib/storyPlaylist';

const LANGS = ['mn', 'en', 'cn'];

export default function AdminVoices({ onToast }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuoteOnly, setFilterQuoteOnly] = useState(true);
  const [editing, setEditing] = useState(null); // { fig_id, lang, voice_id }
  const [preRenderingEra, setPreRenderingEra] = useState(null);
  const [preRenderProgress, setPreRenderProgress] = useState({ done: 0, total: 0 });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('figure_voices')
      .select('fig_id, lang, voice_id');
    setLoading(false);
    if (error) { onToast('Ачаалахад алдаа: ' + error.message, true); return; }
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const voiceMap = useMemo(() => {
    const m = new Map(); // `${figId}:${lang}` -> voice_id
    for (const r of rows) m.set(`${r.fig_id}:${r.lang}`, r.voice_id);
    return m;
  }, [rows]);

  const visibleFigures = useMemo(() => {
    return FIGURES
      .filter((f) => !filterQuoteOnly || f.quote)
      .sort((a, b) => a.fig_id - b.fig_id);
  }, [filterQuoteOnly]);

  const save = async () => {
    if (!editing) return;
    const { fig_id, lang, voice_id } = editing;
    const { error } = await supabase
      .from('figure_voices')
      .upsert(
        { fig_id, lang, voice_id: voice_id.trim(), assigned_by: user?.id },
        { onConflict: 'fig_id,lang' },
      );
    if (error) { onToast('Хадгалахад алдаа: ' + error.message, true); return; }
    onToast('Хадгалагдлаа');
    setEditing(null);
    load();
  };

  const preview = async () => {
    if (!editing?.voice_id?.trim()) return;
    const figure = FIGURES.find((f) => f.fig_id === editing.fig_id);
    if (!figure) return;
    const sample = editing.lang === 'en'
      ? `I am ${figure.name}.`
      : `Би бол ${figure.name}.`;
    const { data } = await supabase.functions.invoke('speak', {
      body: { text: sample, lang: editing.lang, voice_id: editing.voice_id.trim() },
    });
    if (data?.url) new Audio(data.url).play();
    else onToast('Preview боломжгүй', true);
  };

  const preRenderChapter = async (era) => {
    setPreRenderingEra(era);
    const playlist = buildChapterPlaylist(era);
    setPreRenderProgress({ done: 0, total: playlist.length * LANGS.length });
    for (const slide of playlist) {
      for (const lang of LANGS) {
        if (lang === 'cn') continue; // skip cn for now unless narrator set
        const text = slide.kind === 'figure'
          ? storyText(slide.figure, lang === 'en' ? 'en' : 'mn')
          : slide.kind === 'intro'
            ? `${era} intro.`
            : `${era} outro.`;
        const vid = slide.kind === 'figure' ? voiceMap.get(`${slide.figure.fig_id}:${lang}`) : null;
        const body = { text, lang };
        if (vid) body.voice_id = vid;
        try { await supabase.functions.invoke('speak', { body }); } catch { /* ignore */ }
        setPreRenderProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    setPreRenderingEra(null);
    onToast(`Бүлэг ${era} бэлтгэгдлээ.`);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground font-body p-6">Ачаалж байна…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-cinzel text-base font-bold">Дуу хоолой</h3>
        <label className="flex items-center gap-2 text-xs font-body">
          <input
            type="checkbox"
            checked={filterQuoteOnly}
            onChange={(e) => setFilterQuoteOnly(e.target.checked)}
          />
          Ишлэлтэй
        </label>
      </div>

      {/* Per-era pre-render buttons */}
      <div className="flex flex-wrap gap-2">
        {ERA_KEYS.map((era) => (
          <Button
            key={era}
            size="sm"
            variant="outline"
            onClick={() => preRenderChapter(era)}
            disabled={preRenderingEra !== null}
          >
            {preRenderingEra === era
              ? `Бэлтгэж байна… ${preRenderProgress.done}/${preRenderProgress.total}`
              : `Бүлэг ${era} бэлтгэх`}
          </Button>
        ))}
      </div>

      <table className="w-full text-sm font-body">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="py-2 pr-4">Зүтгэлтэн</th>
            {LANGS.map((l) => <th key={l} className="py-2 px-3">{l.toUpperCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleFigures.map((f) => (
            <tr key={f.fig_id} className="border-b border-border/50">
              <td className="py-2 pr-4">{f.fig_id}. {f.name}</td>
              {LANGS.map((lang) => {
                const vid = voiceMap.get(`${f.fig_id}:${lang}`);
                return (
                  <td key={lang} className="py-2 px-3">
                    <button
                      onClick={() => setEditing({ fig_id: f.fig_id, lang, voice_id: vid ?? '' })}
                      className="text-xs underline decoration-dotted text-muted-foreground hover:text-foreground"
                    >
                      {vid ? `🎙 ${vid.slice(0, 8)}…` : '— оноох —'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="fixed inset-0 z-[400] bg-background/80 flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-4">
            <h4 className="font-cinzel text-sm">
              fig {editing.fig_id} · {editing.lang.toUpperCase()}
            </h4>
            <Input
              value={editing.voice_id}
              onChange={(e) => setEditing({ ...editing, voice_id: e.target.value })}
              placeholder="ElevenLabs voice_id"
            />
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Болих</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={preview}
                        disabled={!editing.voice_id.trim()}>
                  Сонсох
                </Button>
                <Button size="sm" onClick={save}
                        disabled={!editing.voice_id.trim()}>
                  Хадгалах
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the tab in `AdminPanel.jsx`**

Add the import near the existing admin imports:

```js
import AdminVoices from '@/components/admin/Voices';
```

Add the trigger next to the existing Tournaments one:

```jsx
          <TabsTrigger value="voices" className="gap-1.5 text-xs font-body">
            🎙 Дуу хоолой
          </TabsTrigger>
```

Add the content panel before `</Tabs>`:

```jsx
        {/* Voices */}
        <TabsContent value="voices" className="flex-1 overflow-auto p-6">
          <AdminVoices onToast={showToast} />
        </TabsContent>
```

- [ ] **Step 3: Verify build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/components/admin/Voices.jsx src/components/admin/AdminPanel.jsx
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "feat(story-b): Admin Voices tab with per-figure voice_id + pre-render"
```

---

## Task 8: SQL smoke tests for `figure_voices` RLS

**Files:**
- Modify: `supabase/tests/rls_smoke.sql`

- [ ] **Step 1: Append assertions**

Open `supabase/tests/rls_smoke.sql` and append:

```sql
-- ─── figure_voices (Story Phase B) ─────────────────────────────────────────
-- public read allowed
begin;
  set local role authenticated;
  select count(*) from figure_voices;  -- no error
commit;

-- anon can read (public sample pages)
begin;
  set local role anon;
  select count(*) from figure_voices;  -- no error
commit;

-- non-admin insert denied
begin;
  set local role authenticated;
  -- Assuming caller is NOT admin; expected: error
  do $$
  begin
    insert into figure_voices (fig_id, lang, voice_id) values (1, 'mn', 'test');
    raise exception 'expected RLS to reject non-admin insert';
  exception when insufficient_privilege or rls_violation then
    -- expected
    null;
  end $$;
rollback;
```

(Keep the style consistent with the existing file — if the file uses different assertion patterns, mirror those.)

- [ ] **Step 2: Commit**

```
git add supabase/tests/rls_smoke.sql
git -c user.email="indra@amjilt.com" -c user.name="Enkh" commit -m "test(story-b): figure_voices RLS smoke assertions"
```

---

## Task 9: Lint + tests + build sweep

- [ ] **Step 1: Lint**

```
npm run lint
```

Pre-existing errors are fine; new ones in Phase B files must be fixed inline.

- [ ] **Step 2: Full test suite**

```
npm run test -- --run
```

All green.

- [ ] **Step 3: Build**

```
npm run build
```

- [ ] **Step 4: Push**

```
git push origin master
```

---

## Task 10: Manual QA (user)

Start `npm run dev` and walk these scenarios:

- [ ] **A. Anon test (speak stays at 10/hr).** Open an incognito window → visit `/c/1` → type a message. The existing QR-AI flow should still work; `speak` calls with no JWT still hit the 10/hr cap.

- [ ] **B. Authed play (60/hr).** Log in. Open `/story/founding`. Narration should fetch via ElevenLabs on first play (`source: 'synth'` in Network); second play should be `source: 'cache'`. Advance through 11 slides without hitting the rate-limit — needs 60/hr authed.

- [ ] **C. Background pre-fetch.** Open Network tab. First slide plays; while it plays, you should see additional `speak` POSTs firing in parallel for slides 2..N. Open slide 2 manually — audio arrives instantly (cache hit).

- [ ] **D. Cascade fallback — bad voice_id.** In the Admin Voices tab, assign `nonexistent_voice` to a figure, e.g. fig 1 mn. Play founding chapter past fig 1. Expect: first `speak` call returns `source: 'fallback'`; client retries without `voice_id`; narrator voice plays. No error toast.

- [ ] **E. Cascade fallback — ElevenLabs offline.** In DevTools, block `api.elevenlabs.io` domain. Play a chapter. Expect: `speak` returns `source: 'fallback'` (or no URL); client falls back to browser `speechSynthesis`. No errors.

- [ ] **F. Admin Voices tab.** Open the admin panel → Voices tab. Filter by "Figures with a quote". Click a cell for fig 1 mn → paste any valid ElevenLabs voice_id → Preview → hear sample → Save. Tab reflects saved voice.

- [ ] **G. Pre-render chapter.** Click "Бүлэг founding бэлтгэх". Progress counter updates. Open the founding chapter — every slide should cache-hit on play.

- [ ] **H. Back-compat.** `/figure/1` StoryPlayer should continue to play narration as before. `/tour` StoryTour should still work. Neither uses the `useSpeak: true` flag by default, so they remain on browser TTS.

---

## Self-Review

**Spec coverage:**
- `figure_voices` table + RLS — Task 1
- `speak` voice_id override — Task 2
- Authed-user 60/hr rate limit — Task 2
- `source` field in response — Task 2
- Cache hit skips rate limit — Task 2
- Admin-read cascade — Task 4 (client reuses `speak`)
- `useVoices` hook — Task 3
- `useNarration` cascade (character → narrator → browser TTS) — Task 4
- Background pre-fetch (max 3 concurrent) — Task 5
- Data Saver respect — Task 5
- Admin Voices tab — Tasks 6, 7
- Per-era pre-render button — Task 7
- SQL smoke tests — Task 8

**Placeholder scan:** No "TBD"s.

**Type consistency:** `useVoices` returns `{ isLoading, voiceIdFor(figId) }`; consumed identically in StoryChapter (Task 5) and Admin Voices (Task 7). `useNarration` returns `{ status, progress, charIndex, play, pause, stop, audioProps, mode, source }` (new `source` field added).

**Scope check:** All tasks support a single sub-feature (narration upgrade). No decomposition needed.

**Risks:**
- The SQL smoke-test pattern mirrors existing rls_smoke.sql style; if it doesn't match, rewrite in the house style.
- Pre-render `cn` language is skipped in Task 7 code (no Chinese stories authored). If `cn` voices get added later, remove that skip.
- The `data-saver` check on `navigator.connection` is not supported in all browsers — absent means pre-fetch proceeds.
