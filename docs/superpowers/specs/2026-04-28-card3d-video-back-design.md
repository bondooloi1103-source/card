# 3D card video back

**Date:** 2026-04-28
**Status:** Design (pending user review)

## Goal

The back face of `Card3D` becomes a user-controlled video player when an admin has uploaded a video for that figure. Falls back to the existing static back canvas / image when no video is uploaded.

## Non-goals

- Auto-play on flip. Playback is always user-initiated.
- Looping. Video plays once, ends on last frame, replay button reappears.
- Per-tab synchronization. Two tabs viewing the same card play independently.
- Inline editing of captions in admin. Admin uploads pre-authored WebVTT.

## Decisions captured during brainstorming

- Source: admin uploads per figure (D), fallback to existing static back image when no upload.
- Trigger: explicit play button overlay (B), one tap → plays once, no loop.
- Storage: file upload to a new Supabase Storage bucket (A).
- Audio: on by default with mute toggle (A).
- Captions: shown only while muted; admin uploads WebVTT (.vtt) alongside the MP4 (A).
- Architecture: hidden HTML `<video>` feeds a `THREE.VideoTexture` for the back-face material; DOM overlays for play/replay/mute buttons + caption strip (Approach 1).

## Behavior

### No video uploaded

The figure has no row in `figure_back_videos`. The back face renders the existing static canvas (or `figure.back_img` if set). No play overlay, no video element, no extra network requests.

### Video uploaded — first view

The figure has a row with a `video_path`. Back canvas now includes a centered ▶ glyph drawn into it (so the affordance survives 3D rotation). When the card is flipped flat to the camera and not being dragged, a DOM ▶ button appears as an absolutely positioned overlay; clicking it transitions to the playing state.

### Playing

A hidden `<video>` element is created (lazy — the very first play creates it). Its pixels feed a `THREE.VideoTexture` which becomes the back-face material's `map`. The video starts unmuted. A 🔊 button is the only overlay during playback.

### Muted

User clicks 🔊 → `videoEl.muted = true`, button switches to 🔇. If captions were uploaded, a caption strip becomes visible at the bottom 15% of the back face (DOM overlay, translucent black, white text). Caption text is read from `videoEl.textTracks[0].activeCues` via `cuechange`. Strip stays hidden in three cases: no captions uploaded for this figure (no `<track>` element), captions exist but no cue is currently active, or the video is unmuted. Muting a video without captions still works — audio simply turns off, with no visual indication beyond the 🔇 button state.

### Ended

On `videoEl.ended`, the texture freezes on the last frame, and a ▶ replay button reappears. Click → `currentTime = 0; play()` → back to playing.

### Card scrolled out of view

When IntersectionObserver reports the card visible-ratio < 0.3, the video is paused and its source removed (`videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load()`), releasing the decoder. Texture reverts to the static back canvas. On scroll-back-in, the user must click ▶ again — no auto-resume.

### One video at a time across all cards

A module-scoped `cardVideoLeader` registry pauses any previously-playing card video the moment another card calls `play()`. The user can never have multiple back-card videos playing in parallel.

### Admin uploads / replaces / deletes

In the AdminPanel, a new "Видео" tab lists all 52 figures. Each row shows current state (✓ with duration + cc badge, or `—`) and actions: Upload / Replace / + Captions / Delete. Replacing creates a new storage object with a fresh timestamp suffix and overwrites the row's `video_path`; the old object is deleted. The CDN never serves stale because URLs change.

## Schema

Migration: `supabase/migrations/20260428100000_figure_back_videos.sql`

```sql
create table figure_back_videos (
  fig_id        int primary key,
  video_path    text not null,
  captions_path text,
  duration_s    real,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);

alter table figure_back_videos enable row level security;
create policy "back_videos public read"  on figure_back_videos for select using (true);
create policy "back_videos admin write"  on figure_back_videos for all    using (is_admin());
```

Storage bucket: `figure-videos` (new), public read.

Object layout: `figure-videos/<fig_id>/back-<timestamp>.<ext>` (mp4 or vtt).

Cache-Control: `public, max-age=2592000`.

## Edge function

`supabase/functions/upload-figure-back-video/index.ts` — single function, three actions:

```jsonc
// upload video
{ "action": "upload-video", "fig_id": 1, "duration_s": 42.3 }   // body is multipart with file
// upload captions
{ "action": "upload-captions", "fig_id": 1 }                    // body is multipart with file
// delete
{ "action": "delete", "fig_id": 1 }
```

Logic per action:

1. Verify `Authorization: Bearer <jwt>` (Bearer-prefix early reject like `claim-session`).
2. Verify `is_admin` via `profiles.is_admin`. Reject 403 if not.
3. **upload-video**: validate MIME `video/mp4`, size ≤ 50 MB, `duration_s` ≤ 60 (from request body — admin client measured it). If a previous row exists for this `fig_id`, delete the old `video_path` object first. Upload new object as `<fig_id>/back-<now()>.mp4`. Upsert row with new `video_path` + `duration_s` + `uploaded_by` + `uploaded_at`.
4. **upload-captions**: validate MIME `text/vtt` (or `text/plain` accepted as alias), size ≤ 100 KB, body starts with `WEBVTT`. Delete old `captions_path` object if any. Upload as `<fig_id>/back-<now()>.vtt`. Update row's `captions_path`.
5. **delete**: delete both objects from storage if present, delete the row.

Returns the public URL on success, error reason code on failure.

## Client integration

### Read path: `useFigureBackVideos`

New hook `src/hooks/useFigureBackVideos.js`. Single TanStack Query that fetches all rows from `figure_back_videos` once per session (cached `staleTime: 5 min`). Exposes `videosById: { [fig_id]: { url, captionsUrl, durationS } }`.

### `Figures.jsx` and other gallery pages

Pass the per-figure video record into Card3D as `figure.back_video_url` + `figure.back_captions_url` + `figure.back_video_duration` (merged from the hook output).

### `Card3D.jsx`

Extends the existing component. New module-scoped state:
- A persistent hidden `<video>` element pool (one per `Card3D` instance, lazily allocated on first play, destroyed on unmount or scroll-out).
- A `THREE.VideoTexture` swapped onto `materials[5].map` when video state is `playing` or `ended`. Reverted to the static canvas texture when `no_video` or video is torn down.
- DOM overlays inside the existing return JSX:
  - ▶ play button (visible when `back_video_url` is set + state is `ready`)
  - ▶ replay button (when state is `ended`)
  - 🔊 / 🔇 mute toggle (when state is `playing`)
  - caption strip (when state is `playing` AND `videoEl.muted` AND at least one active cue)
- All overlays use `pointer-events: none` on the wrapper, `pointer-events: auto` only on individual interactive elements when `isShowingBack && !isDragging`.

### `cardVideoLeader.js`

```js
let currentId = null;
let currentPause = null;
export function takeLeadership(id, pauseFn) {
  if (currentId && currentId !== id && currentPause) currentPause();
  currentId = id;
  currentPause = pauseFn;
}
export function releaseLeadership(id) {
  if (currentId === id) { currentId = null; currentPause = null; }
}
```

Card3D calls `takeLeadership(figure.fig_id, () => videoEl.pause())` in its play handler and `releaseLeadership(figure.fig_id)` on `ended`/teardown.

### AdminPanel

New sub-component `src/components/admin/BackVideos.jsx`. Wired into `AdminPanel.jsx` as a new `<TabsTrigger value="back-videos">Видео</TabsTrigger>` next to the existing voices tab.

### i18n

New keys in `src/lib/i18n.jsx`:

```js
'card.video.play':       { mn: 'Тоглуулах', en: 'Play' }
'card.video.replay':     { mn: 'Дахин',     en: 'Replay' }
'card.video.mute':       { mn: 'Дуугүй',    en: 'Mute' }
'card.video.unmute':     { mn: 'Дуутай',    en: 'Unmute' }
'admin.backVideos.tab':  { mn: 'Видео',     en: 'Videos' }
'admin.backVideos.upload':   { mn: 'Хуулах',  en: 'Upload' }
'admin.backVideos.replace':  { mn: 'Солих',  en: 'Replace' }
'admin.backVideos.delete':   { mn: 'Устгах', en: 'Delete' }
'admin.backVideos.captions': { mn: 'Хадмал', en: 'Captions' }
'admin.backVideos.tooBig':   { mn: 'Файл хэт том ({mb} MB > 50 MB)', en: 'File too large ({mb} MB > 50 MB)' }
'admin.backVideos.tooLong':  { mn: 'Видео хэт урт ({s}s > 60s)',     en: 'Video too long ({s}s > 60s)' }
```

## Performance

- Lazy-allocated `<video>` elements (none created until user clicks play on a given card).
- `cardVideoLeader` enforces at most one playing video at a time across all cards on the page.
- Visibility threshold of 0.3 on IntersectionObserver triggers full video teardown (decoder released, texture reverted to canvas).
- 30-day CDN cache on stored objects.
- Captions track set to `mode = 'hidden'` so the browser doesn't render its default overlay (we render our own).

## Testing

### Unit tests (vitest + jsdom)

- `src/components/admin/BackVideos.test.jsx`:
  - Renders figure list, status badges correct for each state.
  - Over-50-MB file rejected client-side, edge fn not called.
  - Over-60-s video rejected after `loadedmetadata`, edge fn not called.
  - Successful upload invokes `upload-figure-back-video` with `action: 'upload-video'`.
  - Captions upload accepts `WEBVTT`-prefixed text, rejects non-VTT.
  - Delete confirms and invokes `action: 'delete'`.
- `src/components/Card3D.test.jsx`:
  - No `back_video_url` → no `<video>` element after mount.
  - Click ▶ overlay → `<video>` appears with correct `src`, `play()` called.
  - `ended` event → replay overlay shown; click → `currentTime=0`, `play()` called.
  - Mute toggle flips `videoEl.muted`; caption strip visible only when muted AND active cue exists.
  - Drag-rotation hides overlays (overlay element gets `pointer-events: none` or unmounts).
  - Unmount pauses video, clears `src`, releases `cardVideoLeader`.
- `src/lib/cardVideoLeader.test.js`: two cards calling `takeLeadership` → first is paused; `releaseLeadership` clears the leader.

### Manual test plan

1. Admin signs in, opens AdminPanel → Видео tab. List shows all 52 figures with — status.
2. Upload a 30 s MP4 + matching VTT for figure 1. Status flips to ✓ 0:30 · cc.
3. Open public site, navigate to gallery. Card 1 back face shows ▶ glyph in the canvas.
4. Flip card 1 → DOM ▶ button appears. Click it → video plays with audio. 🔊 mute button appears.
5. Click 🔊 → videoEl muted, caption strip appears at bottom, syncs with VTT cues. Click 🔇 → strip disappears, audio resumes.
6. Let video end → last frame stays visible, replay button reappears. Click → plays from start.
7. Drag card 1 to rotate → all overlays disappear during rotation. Stop dragging while back is flat → overlays return.
8. Scroll card 1 off-screen by 50%+ → DevTools Network tab shows video request canceled; reflipping back later shows ▶ again (full re-load).
9. Card 2 (no video) → ▶ absent, current static back as today.
10. Click play on card 1, then immediately on card 3 → card 1 auto-pauses, card 3 plays.
11. Admin replaces card 1's video → public users see the new video on next page load (CDN URL changed via timestamp).
12. Admin deletes card 1's video → row gone, public site reverts to static back.

## Risks and trade-offs

- **Decoder pressure on low-end devices.** A user playing one card video while still viewing 49 other cards in WebGL is fine; mobile Safari can choke if multiple decoders ever became active. The single-leader registry + visibility-based teardown should keep it to 1 decoder maximum.
- **Letterboxed back face.** Most videos are landscape; the card is portrait. Black bars top/bottom are unavoidable without cropping (which we explicitly avoid). If admins want full-bleed, they should author portrait videos.
- **WebVTT authoring overhead.** Asking admins to produce timed `.vtt` files is more work than typing a transcript. Accepted for v1; if this becomes a friction point, fall back to the plain-text-strip pattern from option B in brainstorming.
- **Storage costs.** 52 figures × ~50 MB = 2.6 GB worst case. Supabase free tier is 1 GB. Worth flagging for the operator before launch — paid plan or strict size limits required if every figure gets a video.
- **CDN cache invalidation via path change.** Cleaner than HTTP `Cache-Control: no-cache` because old browsers and intermediate proxies sometimes ignore that. The trade-off is one orphan storage object per replace, which the edge fn cleans up.
- **No transcoding.** We trust the admin to upload a web-compatible MP4 (H.264 + AAC). If they upload an obscure codec, video playback fails silently in some browsers. v1 acceptance.
