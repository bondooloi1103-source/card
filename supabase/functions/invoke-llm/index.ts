import { handleOptions, json } from '../_shared/cors.ts';
import { ipHash, currentHourBucket } from '../_shared/ip.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const HOURLY_LIMIT = 30;

const FALLBACK_TEXT = 'Уучлаарай, миний бодол санаа одоо тогтворгүй байна. Дараа дахин асуугаарай.';

interface Body {
  prompt?: string;
  response_json_schema?: Record<string, unknown>;
}

function fallbackForSchema(schema: Record<string, unknown> | undefined): unknown {
  if (!schema || typeof schema !== 'object') return FALLBACK_TEXT;
  if (schema.type === 'object') {
    const out: Record<string, unknown> = {};
    const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    for (const k of Object.keys(props)) out[k] = fallbackForSchema(props[k]);
    if ('answer' in out) out.answer = FALLBACK_TEXT;
    if ('overall' in out) out.overall = FALLBACK_TEXT;
    return out;
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return FALLBACK_TEXT;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: Body;
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const prompt = body.prompt?.trim();
  if (!prompt) return json({ ok: false, reason: 'bad_request' }, 400);

  const schema = body.response_json_schema;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const limit = await checkAndIncrement(admin, await ipHash(req), currentHourBucket(), 'invoke-llm', HOURLY_LIMIT);
  if (!limit.allowed) {
    return json({ ok: true, reply: fallbackForSchema(schema), source: 'rate_limited' });
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return json({ ok: true, reply: fallbackForSchema(schema), source: 'no_key' });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.7,
    maxOutputTokens: 1024,
  };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  let reply: unknown = fallbackForSchema(schema);
  let source = 'fallback';
  try {
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (resp.status === 429) { source = 'quota_exceeded'; }
    else if (!resp.ok) { source = `gemini_${resp.status}`; }
    else {
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        if (schema) {
          try { reply = JSON.parse(text); source = 'gemini'; }
          catch { reply = fallbackForSchema(schema); source = 'parse_error'; }
        } else {
          reply = text.trim();
          source = 'gemini';
        }
      }
    }
  } catch (err) {
    console.error('gemini call failed', err);
    source = 'exception';
  }

  return json({ ok: true, reply, source });
});
