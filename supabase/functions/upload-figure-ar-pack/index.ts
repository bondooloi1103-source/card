import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';

const MAX_PACK_BYTES = 30 * 1024 * 1024;
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

    if (action === 'upload-pack') {
      const file = form.get('file');
      const orderRaw = String(form.get('target_order') ?? '');
      if (!(file instanceof File)) return json({ ok: false, reason: 'bad_request' }, 400);
      if (file.size > MAX_PACK_BYTES) return json({ ok: false, reason: 'too_large' }, 400);
      if (!file.name.toLowerCase().endsWith('.mind')) {
        return json({ ok: false, reason: 'bad_extension' }, 400);
      }

      let targetOrder: number[];
      try {
        const parsed = JSON.parse(orderRaw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return json({ ok: false, reason: 'bad_target_order' }, 400);
        }
        targetOrder = parsed.map((v) => Number(v));
        if (targetOrder.some((v) => !Number.isInteger(v) || v <= 0)) {
          return json({ ok: false, reason: 'bad_target_order' }, 400);
        }
      } catch {
        return json({ ok: false, reason: 'bad_target_order' }, 400);
      }

      const { data: existing } = await admin
        .from('figure_ar_pack')
        .select('pack_path')
        .eq('id', 1)
        .maybeSingle();

      const newPath = `pack/ar-${Date.now()}.mind`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from(BUCKET).upload(newPath, buf, {
        contentType: 'application/octet-stream',
        cacheControl: '2592000',
        upsert: false,
      });
      if (upErr) return json({ ok: false, reason: 'upload_failed', detail: upErr.message }, 500);

      const { error: rowErr } = await admin
        .from('figure_ar_pack')
        .upsert({
          id: 1,
          pack_path: newPath,
          target_order: targetOrder,
          uploaded_by: adminUserId,
          uploaded_at: new Date().toISOString(),
        });
      if (rowErr) {
        await admin.storage.from(BUCKET).remove([newPath]);
        return json({ ok: false, reason: 'server', detail: rowErr.message }, 500);
      }

      if (existing?.pack_path && existing.pack_path !== newPath) {
        await admin.storage.from(BUCKET).remove([existing.pack_path]);
      }

      const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${newPath}`;
      return json({ ok: true, pack_path: newPath, public_url: publicUrl, target_count: targetOrder.length });
    }

    return json({ ok: false, reason: 'bad_action' }, 400);
  }

  const body: { action?: string } = await req.json().catch(() => ({}));
  if (body.action !== 'delete-pack') return json({ ok: false, reason: 'bad_request' }, 400);

  const { data: existing } = await admin
    .from('figure_ar_pack')
    .select('pack_path')
    .eq('id', 1)
    .maybeSingle();
  if (existing?.pack_path) {
    await admin.storage.from(BUCKET).remove([existing.pack_path]);
    await admin.from('figure_ar_pack').delete().eq('id', 1);
  }
  return json({ ok: true });
});
