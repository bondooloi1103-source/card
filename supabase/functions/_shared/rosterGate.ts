// Quote-bearing figures only — used by the live-room roster gate.
// Mirrors src/pages/GameQuoteGuess.jsx:19 (MIN_FIGS_FOR_ROSTER).
// Kept in a sibling file because supabase/functions/_shared/figures.ts is
// auto-overwritten by scripts/gen-shared-figures.mjs.
// Consumed by supabase/functions/create-session (Task 3 of live MP roster gate plan).
import { FIGURES } from './figures.ts';

export const QUOTE_FIG_IDS: number[] = FIGURES
  .filter((f) => f.quote != null && f.quote !== '')
  .map((f) => f.fig_id);

export const MIN_FIGS_FOR_ROSTER = 4;
