import { useState, useEffect, useCallback, useRef } from 'react';
import { tryAnswer } from '@/lib/figureResponder';
import { supabase } from '@/lib/supabase';

const MAX_TURNS_KEPT = 50;
const MAX_TURNS_SENT_TO_LLM = 8;
const DB_WRITE_DEBOUNCE_MS = 500;

const OPENING = {
  mn: (name) => `Сайн уу. Би ${name} байна. Юу мэдмээр байна?`,
  en: (name) => `Greetings. I am ${name}. What would you like to know?`,
  cn: (name) => `你好。我是${name}。你想知道什么？`,
};

const UPSTREAM_FALLBACK = {
  mn: 'Уучлаарай, миний бодол санаа одоо тогтворгүй байна. Дараа дахин асуугаарай.',
  en: 'Forgive me — my thoughts are unsettled right now. Ask me again later.',
  cn: '抱歉，此刻我的思绪不宁。请稍后再问。',
};
const RATE_LIMITED_FALLBACK = UPSTREAM_FALLBACK;

const storageKey = (figId) => `figureChat:${figId}`;
function loadStored(figId) {
  try { return JSON.parse(sessionStorage.getItem(storageKey(figId)) || 'null'); }
  catch { return null; }
}
function saveStored(figId, data) {
  try { sessionStorage.setItem(storageKey(figId), JSON.stringify(data)); }
  catch { /* quota full, ignore */ }
}

export function useFigureChat(figure, { userId, owned } = {}) {
  const [messages, setMessages] = useState([]);
  const [lang, setLang] = useState('mn');
  const [busy, setBusy] = useState(false);
  const initialised = useRef(false);
  const dbWriteTimer = useRef(null);
  const useDb = Boolean(owned && userId);

  const scheduleDbWrite = useCallback((nextMessages) => {
    if (!useDb) return;
    if (dbWriteTimer.current) clearTimeout(dbWriteTimer.current);
    dbWriteTimer.current = setTimeout(async () => {
      await supabase
        .from('card_chats')
        .upsert(
          { user_id: userId, fig_id: figure.fig_id, messages: nextMessages },
          { onConflict: 'user_id,fig_id' },
        );
    }, DB_WRITE_DEBOUNCE_MS);
  }, [useDb, userId, figure]);

  // Mount: load history (DB if owned, else sessionStorage), or seed greeting.
  useEffect(() => {
    if (!figure || initialised.current) return;
    initialised.current = true;

    let cancelled = false;
    async function load() {
      if (useDb) {
        const { data } = await supabase
          .from('card_chats')
          .select('messages')
          .eq('user_id', userId)
          .eq('fig_id', figure.fig_id)
          .maybeSingle();
        if (cancelled) return;
        const stored = data?.messages;
        if (Array.isArray(stored) && stored.length > 0) {
          setMessages(stored);
          const last = stored[stored.length - 1];
          if (last?.lang) setLang(last.lang);
          return;
        }
      } else {
        const stored = loadStored(figure.fig_id);
        if (stored) {
          setMessages(stored.messages);
          setLang(stored.lang ?? 'mn');
          return;
        }
      }
      const opening = { role: 'ai', text: OPENING.mn(figure.name), lang: 'mn', ts: Date.now() };
      setMessages([opening]);
      if (useDb) scheduleDbWrite([opening]);
      else saveStored(figure.fig_id, { messages: [opening], lang: 'mn' });
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figure, useDb, userId]);

  const pushMessage = useCallback((msg) => {
    setMessages((prev) => {
      const next = [...prev, msg].slice(-MAX_TURNS_KEPT);
      if (useDb) scheduleDbWrite(next);
      else saveStored(figure.fig_id, { messages: next, lang });
      return next;
    });
  }, [figure, lang, useDb, scheduleDbWrite]);

  const switchLang = useCallback((newLang) => {
    setLang(newLang);
    pushMessage({ role: 'ai', text: OPENING[newLang](figure.name), lang: newLang, ts: Date.now() });
  }, [figure, pushMessage]);

  const send = useCallback(async (text) => {
    if (!text?.trim() || busy) return;
    const userMsg = { role: 'user', text: text.trim(), lang, ts: Date.now() };
    pushMessage(userMsg);
    setBusy(true);

    const ruleAnswer = tryAnswer(figure, userMsg.text, lang);
    if (ruleAnswer) {
      pushMessage({ role: 'ai', text: ruleAnswer, lang, source: 'rule', ts: Date.now() });
      setBusy(false);
      return;
    }

    try {
      const history = messages.slice(-MAX_TURNS_SENT_TO_LLM).map((m) => ({ role: m.role, text: m.text }));
      const { data, error } = await supabase.functions.invoke('ask-figure', {
        body: {
          figure: {
            name: figure.name, yrs: figure.yrs, role: figure.role, bio: figure.bio,
            achs: figure.achs, fact: figure.fact, quote: figure.quote, qattr: figure.qattr,
          },
          question: userMsg.text, lang, history,
        },
      });
      const replyText = (!error && data?.ok && data.reply) ? data.reply : UPSTREAM_FALLBACK[lang];
      pushMessage({ role: 'ai', text: replyText, lang, source: data?.source ?? 'error', ts: Date.now() });
    } catch (err) {
      console.error('ask-figure invoke failed', err);
      pushMessage({ role: 'ai', text: UPSTREAM_FALLBACK[lang], lang, source: 'exception', ts: Date.now() });
    }
    setBusy(false);
  }, [figure, lang, busy, pushMessage, messages]);

  const clearChat = useCallback(() => {
    sessionStorage.removeItem(storageKey(figure.fig_id));
    initialised.current = false;
    setMessages([]);
  }, [figure]);

  return { messages, lang, busy, send, switchLang, clearChat };
}

export const __internals = { MAX_TURNS_SENT_TO_LLM, UPSTREAM_FALLBACK, RATE_LIMITED_FALLBACK };
