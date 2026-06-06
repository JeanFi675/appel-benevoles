#!/usr/bin/env node
// Garde-fou — bloque les opérations Supabase ciblant la prod sans --force-prod.
//
// Charge .env puis .env.local (override, comme Vite).
// Détermine la cible (local vs prod) via VITE_SUPABASE_URL.
// Règle de blocage :
//   - cible == prod && pas de --force-prod → BLOCKED

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = {
  ...loadEnvFile(resolve(ROOT, '.env')),
  ...loadEnvFile(resolve(ROOT, '.env.local')),
};

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
const isLocal = /(?:127\.0\.0\.1|localhost)/.test(url);
const target = isLocal ? 'local' : 'prod';

const args = process.argv.slice(2);
const forceProd = args.includes('--force-prod');

if (target === 'prod' && !forceProd) {
  console.error('BLOCKED: production target requires --force-prod');
  console.error(`  Active VITE_SUPABASE_URL: ${url || '(unset)'}`);
  process.exit(1);
}

console.log(`check-env: OK (target=${target})`);
