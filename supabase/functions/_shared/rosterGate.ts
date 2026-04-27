// Quote-bearing figures only — used by the live-room roster gate.
// Mirrors src/pages/GameQuoteGuess.jsx:19 (MIN_FIGS_FOR_ROSTER).
// Kept in a sibling file because supabase/functions/_shared/figures.ts is
// auto-overwritten by scripts/gen-shared-figures.mjs.
// Consumed by supabase/functions/create-session (Task 3 of live MP roster gate plan).
import { FIGURES, type SharedFigure } from './figures.ts';

export const QUOTE_FIG_IDS: number[] = FIGURES
  .filter((f) => f.quote != null && f.quote !== '')
  .map((f) => f.fig_id);

export const MIN_FIGS_FOR_ROSTER = 4;

// Filter the FIGURES list to only the gated subset for live rooms.
// Used by both game-create-session (post-auth lookup) and the runtime
// handlers in game-live-event that need to rebuild the authoritative
// round from the same pool the client uses. NULL/empty means "use the
// full FIGURES set" (legacy rows or verified-too-few-cards fallback).
export function figurePoolFor(eligibleFigIds: number[] | null | undefined): SharedFigure[] {
  if (!eligibleFigIds || eligibleFigIds.length === 0) return FIGURES;
  const ids = new Set(eligibleFigIds);
  return FIGURES.filter((f) => ids.has(f.fig_id));
}
