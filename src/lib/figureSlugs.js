import { FIGURES } from '@/lib/figuresData';
import { FIGURE_NAMES_EN } from '@/lib/figuresI18n';

const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALNUM = /[^A-Za-z0-9]+/g;
const TRIM_UNDERSCORES = /^_+|_+$/g;

function asciify(s) {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(NON_ALNUM, '_')
    .replace(TRIM_UNDERSCORES, '')
    .toUpperCase();
}

function buildSlug(fig) {
  const en = FIGURE_NAMES_EN[fig.fig_id] || fig.name;
  const base = asciify(en) || 'FIG';
  const id3 = String(fig.fig_id).padStart(3, '0');
  return `${base}_${id3}`;
}

export const FIGURE_SLUG_TO_ID = {};
export const FIGURE_ID_TO_SLUG = {};

for (const fig of FIGURES) {
  const slug = buildSlug(fig);
  FIGURE_SLUG_TO_ID[slug] = fig.fig_id;
  FIGURE_ID_TO_SLUG[fig.fig_id] = slug;
}

export function resolveCardParam(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric > 0 && FIGURE_ID_TO_SLUG[numeric]) {
    return numeric;
  }

  const upper = trimmed.toUpperCase();
  if (FIGURE_SLUG_TO_ID[upper]) return FIGURE_SLUG_TO_ID[upper];

  const padded = upper.match(/^FIG_(\d{1,3})$/);
  if (padded) {
    const id = Number(padded[1]);
    if (FIGURE_ID_TO_SLUG[id]) return id;
  }

  return null;
}
