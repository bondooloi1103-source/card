import { useState, useEffect, useCallback, useRef } from 'react';
import { tryAnswer } from '@/lib/figureResponder';
import { supabase } from '@/lib/supabase';

const MAX_TURNS_KEPT = 20;
const MAX_TURNS_SENT_TO_LLM = 8;

const OPENING = {
  mn: (name) => `Би бол ${name}. Та надаас юу асуух вэ?`,
  en: (name) => `I am ${name}. What would you like to ask me?`,
  cn: (name) => `我是${name}。你想问我什么？`,
};

const UPSTREAM_FALLBACK = {
  mn: 'Уучлаарай, миний бодол санаа одоо тогтворгүй байна. Дараа дахин асуугаарай.',
  en: 'Forgive me — my thoughts are unsettled right now. Ask me again later.',
  cn: '抱歉，此刻我的思绪不宁。请稍后再问。',
};

const RATE_LIMITED_FALLBACK = {
  mn: 'Би одоо бага зэрэг амарч байна. Хэдэн минутын дараа буцаж ирээрэй.',
  en: 'I am resting for a moment. Come back in a few minutes.',
  cn: '我先歇一会儿，稍后再来找我吧。',
};

const storageKey = (figId) => `chat:fig:${figId}`;

function loadStored(figId) {
  try {
    const raw = sessionStorage.getItem(storageKey(figId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(figId, data) {
  try {
    sessionStorage.setItem(storageKey(figId), JSON.stringify(data));
  } catch { /* quota full, ignore */ }
}

export function useFigureChat(figure) {
  const [messages, setMessages] = useState([]);
  const [lang, setLang] = useState('mn');
  const [busy, setBusy] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (!figure || initialised.current) return;
    initialised.current = true;

    const stored = loadStored(figure.fig_id);
    if (stored) {
      setMessages(stored.messages);
      setLang(stored.lang ?? 'mn');
    } else {
      const opening = {
        role: 'ai', text: OPENING.mn(figure.name), lang: 'mn', ts: Date.now(),
      };
      setMessages([opening]);
      saveStored(figure.fig_id, { messages: [opening], lang: 'mn' });
    }
  }, [figure]);

  const pushMessage = useCallback((msg) => {
    setMessages((prev) => {
      const next = [...prev, msg].slice(-MAX_TURNS_KEPT);
      saveStored(figure.fig_id, { messages: next, lang });
      return next;
    });
  }, [figure, lang]);

  const switchLang = useCallback((newLang) => {
    setLang(newLang);
    const greeting = {
      role: 'ai', text: OPENING[newLang](figure.name), lang: newLang, ts: Date.now(),
    };
    pushMessage(greeting);
  }, [figure, pushMessage]);

  const send = useCallback(async (text) => {
    if (!text?.trim() || busy) return;
    const userMsg = { role: 'user', text: text.trim(), lang, ts: Date.now() };
    pushMessage(userMsg);
    setBusy(true);

    // Tier 1: rule-based (MN only).
    const ruleAnswer = tryAnswer(figure, userMsg.text, lang);
    if (ruleAnswer) {
      pushMessage({ role: 'ai', text: ruleAnswer, lang, source: 'rule', ts: Date.now() });
      setBusy(false);
      return;
    }

    // Tier 2: edge function ask-figure.
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const { data, error } = await supabase.functions.invoke('ask-figure', {
        body: {
          figure: {
            name: figure.name,
            yrs: figure.yrs,
            role: figure.role,
            bio: figure.bio,
            achs: figure.achs,
            fact: figure.fact,
            quote: figure.quote,
            qattr: figure.qattr,
          },
          question: userMsg.text,
          lang,
          history,
        },
      });
      const text = (!error && data?.ok && data.reply) ? data.reply : UPSTREAM_FALLBACK[lang];
      pushMessage({ role: 'ai', text, lang, source: data?.source ?? 'error', ts: Date.now() });
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
