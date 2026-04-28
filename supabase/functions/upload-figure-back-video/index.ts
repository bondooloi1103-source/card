import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;   // 50 MB
const MAX_CAPTIONS_BYTES = 100 * 1024;      // 100 KB
const MAX_DURATION_S = 60;
const BUCKET = 'figure-videos';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }
  const userJwt = authHeader.slice(7).trim();
  if (!userJwt) return json({ ok: false, reason: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // Verify caller is an admin.
  const { data: userResp, error: userErr } = await admin.auth.getUser(userJwt);
  if (userErr || !userResp.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userResp.user.id)
    .maybeSingle();
  if (profErr) return json({ ok: false, reason: 'server' }, 500);
  if (!profile?.is_admin) return json({ ok: false, reason: 'forbidden' }, 403);
  const adminUserId = userResp.user.id;

  // Parse the multipart body for upload actions; JSON for delete.
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const action = String(form.get('action') ?? '');
    const figIdRaw = form.get('fig_id');
    const figId = Number(figIdRaw);
    if (!Number.isInteger(figId) || figId <= 0) return json({ ok: false, reason: 'bad_request' }, 400);

    if (action === 'upload-video') {
      const file = form.get('file');
      const durationSRaw = form.get('duration_s');
      const durationS = Number(durationSRaw);
      if (!(file instanceof File)) return json({ ok: false, reason: 'bad_request' }, 400);
      if (file.type !== 'video/mp4') return json({ ok: false, reason: 'bad_mime' }, 400);
      if (file.size > MAX_VIDEO_BYTES) return json({ ok: false, reason: 'too_large' }, 400);
      if (!Number.isFinite(durationS) || durationS <= 0 || durationS > MAX_DURATION_S) {
        return json({ ok: false, reason: 'too_long' }, 400);
      }

      // Read existing row to delete its old object before overwriting.
      const { data: existing } = await admin
        .from('figure_back_videos')
        .select('video_path')
        .eq('fig_id', figId)
        .maybeSingle();
      if (existing?.video_path) {
        await admin.storage.from(BUCKET).remove([existing.video_path]);
      }

      const newPath = `${figId}/back-${Date.now()}.mp4`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from(BUCKET).upload(newPath, buf, {
        contentType: 'video/mp4',
        cacheControl: '2592000',
        upsert: false,
      });
      if (upErr) return json({ ok: false, reason: 'upload_failed', detail: upErr.message }, 500);

      const { error: rowErr } = await admin
        .from('figure_back_videos')
        .upsert({
          fig_id: figId,
          video_path: newPath,
          duration_s: durationS,
          uploaded_by: adminUserId,
          uploaded_at: new Date().toISOString(),
        }, { onConflict: 'fig_id' });
      if (rowErr) return json({ ok: false, reason: 'server', detail: rowErr.message }, 500);

      const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${newPath}`;
      return json({ ok: true, video_path: newPath, public_url: publicUrl });
    }

    if (action === 'upload-captions') {
      const file = form.get('file');
      if (!(file instanceof File)) return json({ ok: false, reason: 'bad_request' }, 400);
      if (file.type !== 'text/vtt' && file.type !== 'text/plain') {
        return json({ ok: false, reason: 'bad_mime' }, 400);
      }
      if (file.size > MAX_CAPTIONS_BYTES) return json({ ok: false, reason: 'too_large' }, 400);
      const text = await file.text();
      if (!text.trimStart().startsWith('WEBVTT')) {
        return json({ ok: false, reason: 'bad_format' }, 400);
      }

      const { data: existing } = await admin
        .from('figure_back_videos')
        .select('captions_path, video_path')
        .eq('fig_id', figId)
        .maybeSingle();
      if (!existing?.video_path) {
        return json({ ok: false, reason: 'no_video' }, 400);
      }
      if (existing.captions_path) {
        await admin.storage.from(BUCKET).remove([existing.captions_path]);
      }

      const newPath = `${figId}/back-${Date.now()}.vtt`;
      const buf = new TextEncoder().encode(text);
      const { error: upErr } = await admin.storage.from(BUCKET).upload(newPath, buf, {
        contentType: 'text/vtt',
        cacheControl: '2592000',
        upsert: false,
      });
      if (upErr) return json({ ok: false, reason: 'upload_failed', detail: upErr.message }, 500);

      const { error: rowErr } = await admin
        .from('figure_back_videos')
        .update({ captions_path: newPath })
        .eq('fig_id', figId);
      if (rowErr) return json({ ok: false, reason: 'server', detail: rowErr.message }, 500);

      const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${newPath}`;
      return json({ ok: true, captions_path: newPath, public_url: publicUrl });
    }

    return json({ ok: false, reason: 'bad_action' }, 400);
  }

  // JSON body — only for delete.
  const body: { action?: string; fig_id?: number } = await req.json().catch(() => ({}));
  if (body.action !== 'delete') return json({ ok: false, reason: 'bad_request' }, 400);
  const figId = Number(body.fig_id);
  if (!Number.isInteger(figId) || figId <= 0) return json({ ok: false, reason: 'bad_request' }, 400);

  const { data: existing } = await admin
    .from('figure_back_videos')
    .select('video_path, captions_path')
    .eq('fig_id', figId)
    .maybeSingle();
  if (existing) {
    const paths = [existing.video_path, existing.captions_path].filter((p): p is string => !!p);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('figure_back_videos').delete().eq('fig_id', figId);
  }
  return json({ ok: true });
});
