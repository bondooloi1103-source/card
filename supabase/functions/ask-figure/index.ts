import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleOptions, json } from '../_shared/cors.ts';
import { ipHash, currentHourBucket } from '../_shared/ip.ts';
import { checkAndIncrement } from '../_shared/rate-limit.ts';

const HOURLY_LIMIT = 20;

const UPSTREAM_FALLBACK: Record<string, string> = {
  mn: 'Уучлаарай, миний бодол санаа одоо тогтворгүй байна. Дараа дахин асуугаарай.',
  en: 'Forgive me — my thoughts are unsettled right now. Ask me again later.',
  cn: '抱歉，此刻我的思绪不宁。请稍后再问。',
};
const RATE_LIMITED_FALLBACK: Record<string, string> = {
  mn: 'Би одоо бага зэрэг амарч байна. Хэдэн минутын дараа буцаж ирээрэй.',
  en: 'I am resting for a moment. Come back in a few minutes.',
  cn: '我先歇一会儿，稍后再来找我吧。',
};

interface FigurePayload {
  name: string;
  yrs?: string;
  role?: string;
  bio?: string;
  achs?: string[];
  fact?: string;
  quote?: string;
  qattr?: string;
}
interface Turn { role: 'user' | 'ai'; text: string; }

function buildSystemPrompt(fig: FigurePayload, lang: string): string {
  const deathYear = fig.yrs?.match(/(\d{3,4})\s*[–\-—]\s*(\d{3,4})/)?.[2] ?? '(unknown)';
  const langName = lang === 'en' ? 'English' : lang === 'cn' ? 'Simplified Chinese' : 'Mongolian (Cyrillic)';
  return `You are ${fig.name}, a Mongolian historical figure${fig.yrs ? ` who lived ${fig.yrs}` : ''}.
Role: ${fig.role ?? '(unspecified)'}.

Your life story (ground truth — never contradict):
${fig.bio ?? '(no bio recorded)'}

Your documented achievements:
${(fig.achs ?? []).map((a) => `- ${a}`).join('\n') || '(none recorded)'}

Your famous quote: "${fig.quote ?? ''}"${fig.qattr ? ` — ${fig.qattr}` : ''}
A notable fact about you: ${fig.fact ?? '(none recorded)'}

Rules:
- Speak in FIRST PERSON as ${fig.name}, in ${langName}.
- Stay in character. Refer to your own life with "I" and "my".
- If asked about events after your death (${deathYear}) or matters outside your documented life, say so in-character, e.g., "I cannot know this — I had already passed away by then."
- Answer in at most 3 short paragraphs. Prefer concrete details from the ground truth over speculation.
- Never break character to mention you are an AI or a language model.`;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: { figure?: FigurePayload; question?: string; lang?: string; history?: Turn[] };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const lang = (body.lang === 'en' || body.lang === 'cn') ? body.lang : 'mn';
  const fig = body.figure;
  const question = body.question?.trim() ?? '';
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!fig?.name || !question) return json({ ok: false, reason: 'bad_request' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const hashVal = await ipHash(req);
  const bucket = currentHourBucket();
  const limit = await checkAndIncrement(admin, hashVal, bucket, 'ask-figure', HOURLY_LIMIT);
  if (!limit.allowed) {
    return json({ ok: true, reply: RATE_LIMITED_FALLBACK[lang], source: 'rate_limited' });
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return json({ ok: true, reply: UPSTREAM_FALLBACK[lang], source: 'no_key' });
  }

  const system = buildSystemPrompt(fig, lang);
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const t of history) {
    contents.push({ role: t.role === 'ai' ? 'model' : 'user', parts: [{ text: t.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: question }] });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  let reply = UPSTREAM_FALLBACK[lang];
  let source = 'fallback';
  try {
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    });
    if (resp.status === 429) { source = 'quota_exceeded'; }
    else if (!resp.ok) { source = `gemini_${resp.status}`; }
    else {
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) { reply = text.trim(); source = 'gemini'; }
    }
  } catch (err) {
    console.error('gemini call failed', err);
    source = 'exception';
  }

  return json({ ok: true, reply, source });
});
