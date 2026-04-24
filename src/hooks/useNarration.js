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
      if (voiceId) {
        const second = await fetchSpokenUrl({ text, lang });
        if (cancelled) return;
        if (second.url) {
          setResolvedUrl(second.url);
          setSource(second.source);
          return;
        }
      }
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
