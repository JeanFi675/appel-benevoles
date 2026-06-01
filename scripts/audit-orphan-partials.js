#!/usr/bin/env node
/**
 * Audit orphan EJS partials.
 *
 * Detection scope:
 *  - Every .html file under src/partials/**.
 *
 * For each partial, count references via `include(...)` directives across all
 * project HTML (root + partials). Match by absolute-style path (the actual
 * include format used in this codebase, e.g. `/src/partials/x/y.html`). The
 * partial's own file is excluded from the reference set.
 *
 * Output: text report to stdout (saved by caller to audit/23_orphan_partials.txt).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// All HTML files: root + everything under src/partials and src/.
const allHtml = [];
for (const name of readdirSync(ROOT)) {
  if (name.endsWith('.html')) allHtml.push(join(ROOT, name));
}
const srcDir = join(ROOT, 'src');
allHtml.push(...walk(srcDir, ['.html']));

const partials = walk(join(srcDir, 'partials'), ['.html']);

// Build a lookup of file -> content (for reference counting).
const contents = new Map();
for (const f of allHtml) contents.set(f, readFileSync(f, 'utf8'));

/**
 * Resolve an EJS include path (absolute-style "/src/..." or relative
 * "../foo.html") to an absolute filesystem path. `fromFile` is the file
 * containing the include directive.
 */
function resolveIncludePath(fromFile, includeArg) {
  if (includeArg.startsWith('/')) {
    return resolve(ROOT, includeArg.slice(1));
  }
  return resolve(dirname(fromFile), includeArg);
}

// Build the full set of resolved include targets across the project.
// Map: absolute partial path -> array of [refererFile, rawArg].
const includesByTarget = new Map();
const includeRegex = /include\(\s*['"`]([^'"`]+)['"`]/g;
for (const [file, content] of contents) {
  let m;
  includeRegex.lastIndex = 0;
  while ((m = includeRegex.exec(content))) {
    const resolved = resolveIncludePath(file, m[1]);
    if (!includesByTarget.has(resolved)) includesByTarget.set(resolved, []);
    includesByTarget.get(resolved).push({ from: file, raw: m[1] });
  }
}

const results = [];
for (const partial of partials) {
  const refs = (includesByTarget.get(partial) || []).filter((r) => r.from !== partial);
  results.push({
    partial: relative(ROOT, partial).replaceAll(sep, '/'),
    refs: refs.length,
    referers: refs.map((r) => `${relative(ROOT, r.from).replaceAll(sep, '/')} (as '${r.raw}')`),
  });
}

console.log('# Orphan EJS partials audit');
console.log(`# Generated: ${new Date().toISOString()}`);
console.log(`# Partials scanned: ${partials.length}`);
const orphans = results.filter((r) => r.refs === 0);
console.log(`# Orphans (refs=0): ${orphans.length}`);
console.log('');
console.log('## Orphans');
if (orphans.length === 0) {
  console.log('(none)');
} else {
  for (const o of orphans.sort((a, b) => a.partial.localeCompare(b.partial))) {
    console.log(`- ${o.partial}`);
  }
}
console.log('');
console.log('## All partials (refs, file, referers)');
for (const r of results.sort((a, b) => a.partial.localeCompare(b.partial))) {
  console.log(`- refs=${r.refs}  ${r.partial}`);
  if (r.referers.length) {
    for (const f of r.referers) console.log(`    ↳ ${f}`);
  }
}
