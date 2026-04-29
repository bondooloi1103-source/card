import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const MAX_TARGET_BYTES = 5 * 1024 * 1024;
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

  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const action = String(form.get('action') ?? '');
    const figIdRaw = form.get('fig_id');
    const figId = Number(figIdRaw);
    if (!Number.isInteger(figId) || figId <= 0) return json({ ok: false, reason: 'bad_request' }, 400);

    if (action === 'upload-target') {
      const file = form.get('file');
      if (!(file instanceof File)) return json({ ok: false, reason: 'bad_request' }, 400);
      if (file.size > MAX_TARGET_BYTES) return json({ ok: false, reason: 'too_large' }, 400);
      if (!file.name.toLowerCase().endsWith('.mind')) {
        return json({ ok: false, reason: 'bad_extension' }, 400);
      }

      const { data: existing } = await admin
        .from('figure_back_videos')
        .select('video_path, ar_target_path')
        .eq('fig_id', figId)
        .maybeSingle();
      if (!existing?.video_path) {
        return json({ ok: false, reason: 'no_video' }, 400);
      }

      const newPath = `${figId}/target-${Date.now()}.mind`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from(BUCKET).upload(newPath, buf, {
        contentType: 'application/octet-stream',
        cacheControl: '2592000',
        upsert: false,
      });
      if (upErr) return json({ ok: false, reason: 'upload_failed', detail: upErr.message }, 500);

      const { error: rowErr } = await admin
        .from('figure_back_videos')
        .update({
          ar_target_path: newPath,
          uploaded_by: adminUserId,
          uploaded_at: new Date().toISOString(),
        })
        .eq('fig_id', figId);
      if (rowErr) {
        await admin.storage.from(BUCKET).remove([newPath]);
        return json({ ok: false, reason: 'server', detail: rowErr.message }, 500);
      }

      if (existing.ar_target_path && existing.ar_target_path !== newPath) {
        await admin.storage.from(BUCKET).remove([existing.ar_target_path]);
      }

      const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${newPath}`;
      return json({ ok: true, ar_target_path: newPath, public_url: publicUrl });
    }

    return json({ ok: false, reason: 'bad_action' }, 400);
  }

  const body: { action?: string; fig_id?: number } = await req.json().catch(() => ({}));
  if (body.action !== 'delete-target') return json({ ok: false, reason: 'bad_request' }, 400);
  const figId = Number(body.fig_id);
  if (!Number.isInteger(figId) || figId <= 0) return json({ ok: false, reason: 'bad_request' }, 400);

  const { data: existing } = await admin
    .from('figure_back_videos')
    .select('ar_target_path')
    .eq('fig_id', figId)
    .maybeSingle();
  if (existing?.ar_target_path) {
    await admin.storage.from(BUCKET).remove([existing.ar_target_path]);
    await admin
      .from('figure_back_videos')
      .update({ ar_target_path: null })
      .eq('fig_id', figId);
  }
  return json({ ok: true });
});
