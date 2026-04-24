import { useMemo } from 'react';

/** Split text on sentence boundaries. Supports Latin and Mongolian (᠃) punctuation. */
export function chunkText(text) {
  if (!text) return [];
  const matches = text.match(/[^.!?᠃]+[.!?᠃]*/g) || [];
  return matches.map((m) => m.trim()).filter(Boolean);
}

export default function Subtitles({ text, charIndex = 0, static: isStatic = false, className = '' }) {
  const chunks = useMemo(() => chunkText(text), [text]);
  if (chunks.length === 0) return null;

  if (isStatic) {
    return (
      <p className={`font-display text-[17px] md:text-[19px] text-ivory/90 leading-relaxed ${className}`}>
        {text}
      </p>
    );
  }

  // Pick the chunk whose cumulative length most recently passed charIndex.
  let cumulative = 0;
  let active = 0;
  for (let i = 0; i < chunks.length; i++) {
    cumulative += chunks[i].length + 1;
    if (charIndex < cumulative) { active = i; break; }
    active = Math.min(i + 1, chunks.length - 1);
  }

  return (
    <div className={`font-display text-[17px] md:text-[19px] text-ivory/90 leading-relaxed min-h-[3.5em] ${className}`}>
      <p key={active}>{chunks[active]}</p>
    </div>
  );
}
