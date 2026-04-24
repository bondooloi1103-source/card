#!/usr/bin/env node
// Generates supabase/functions/_shared/figures.ts from src/lib/figuresData.js.
// Usage: node scripts/gen-shared-figures.mjs          — write
//        node scripts/gen-shared-figures.mjs --check  — exit 1 if out of date
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'supabase/functions/_shared/figures.ts');
const check = process.argv.includes('--check');

const { FIGURES } = await import('../src/lib/figuresData.js');

const projected = FIGURES.map(({ fig_id, cat, quote, qattr }) => ({
  fig_id,
  cat,
  quote: quote ?? null,
  qattr: qattr ?? null,
}));

const lines = [
  'export interface SharedFigure {',
  '  fig_id: number;',
  '  cat: string;',
  '  quote: string | null;',
  '  qattr: string | null;',
  '}',
  '',
  '// Auto-generated from src/lib/figuresData.js — keep in sync.',
  'export const FIGURES: SharedFigure[] = [',
  ...projected.map((f, i) => {
    const comma = i < projected.length - 1 ? ',' : '';
    return `  ${JSON.stringify(f)}${comma}`;
  }),
  '];',
  '',
];

const output = lines.join('\n');

if (check) {
  const existing = readFileSync(outPath, 'utf8');
  if (existing !== output) {
    console.error(
      'figures.ts is out of date. Run: npm run gen:figures'
    );
    process.exit(1);
  }
  console.log('figures.ts is up to date.');
} else {
  writeFileSync(outPath, output, 'utf8');
  console.log(`Written ${projected.length} figures to ${outPath}`);
}
