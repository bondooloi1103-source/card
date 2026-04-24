import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Narration engine. Plays either a pre-recorded audio URL OR browser
 * SpeechSynthesis on `text`. Exposes the same interface either way.
 */
export function useNarration({ text, audioUrl, lang = 'mn', autoPlay = false, onDone } = {}) {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const audioRef = useRef(null);
  const utterRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const mode = audioUrl ? 'audio' : 'tts';

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
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = lang === 'en' ? 'en-US' : 'mn-MN';
    u.rate = 0.96;
    u.onstart = () => setStatus('playing');
    u.onend = () => {
      setStatus('done');
      setProgress(1);
      utterRef.current = null;
      onDoneRef.current?.();
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, audioUrl, lang]);

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
  }, [mode, audioUrl]);

  const audioProps = useMemo(
    () => ({ ref: audioRef, src: audioUrl, preload: 'metadata', className: 'hidden' }),
    [audioUrl],
  );

  return { status, progress, charIndex, play, pause, stop, audioProps, mode };
}
