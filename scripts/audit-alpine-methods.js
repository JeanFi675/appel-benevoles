#!/usr/bin/env node
/**
 * Audit Alpine.js methods and properties for dead-code detection.
 *
 * Detection scope:
 *  - Alpine.data("name", () => ({...}))         — Alpine components
 *  - Alpine.store("name", {...})                — Alpine global stores
 *  - export const XxxModule = {...}             — modules spread into Alpine.data
 *
 * For each top-level method/property declared inside these objects, the script
 * counts global references in src/**\/*.{js,html}. A name with a single occurrence
 * is its own declaration and therefore a candidate for removal.
 *
 * Output: text report to stdout (saved by caller to audit/22_alpine_methods.txt).
 *
 * Pragmatic regex-based parsing — sufficient for this codebase, not a full AST.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, 'src');

// ----- File walk -----------------------------------------------------------
function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const jsFiles = walk(SRC, ['.js']);
const allSourceFiles = walk(SRC, ['.js', '.html']);
// Also scan top-level HTML entry files (admin.html, debit.html, etc.) which carry Alpine attributes.
for (const name of readdirSync(ROOT)) {
  if (name.endsWith('.html')) allSourceFiles.push(join(ROOT, name));
}

// ----- Declaration discovery ----------------------------------------------
/**
 * Find the matching closing brace from a starting index pointing at `{`.
 * Returns the index of the matching `}` or -1.
 */
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extract top-level property/method names from an object literal body
 * (text between `{` and `}` at depth 1).
 *
 * Recognises:
 *   foo() {            → method shorthand
 *   foo: ...           → property
 *   async foo() {      → async method
 *   get foo() {        → getter
 *   set foo(...) {     → setter
 *
 * Skips spreads (`...Module`) — those are handled at the higher level.
 */
function extractTopLevelNames(body) {
  const names = new Set();
  let depth = 0;
  let inString = null; // null | '"' | "'" | "`"
  let inComment = null; // null | 'line' | 'block'
  let inRegex = false;

  // Tracks the last meaningful (non-whitespace, non-comment) character — used
  // to disambiguate `/` between division and regex literal.
  let lastTokenChar = '';
  // After these characters, a `/` starts a regex literal (heuristic).
  const REGEX_PREFIX = new Set([
    '',
    '(',
    ',',
    '=',
    '&',
    '|',
    '!',
    '?',
    ':',
    ';',
    '{',
    '}',
    '[',
    '+',
    '-',
    '*',
    '%',
    '^',
    '~',
    '<',
    '>',
    '\n',
  ]);

  // Collect substrings that are at depth 0 of the body (i.e. between commas).
  const chunks = [];
  let chunkStart = 0;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const next = body[i + 1];

    // Comment handling
    if (inComment === 'line') {
      if (c === '\n') inComment = null;
      continue;
    }
    if (inComment === 'block') {
      if (c === '*' && next === '/') {
        inComment = null;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (inRegex) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '[') {
        // Skip character class — `/` inside is literal.
        while (++i < body.length) {
          if (body[i] === '\\') {
            i++;
            continue;
          }
          if (body[i] === ']') break;
        }
        continue;
      }
      if (c === '/') {
        inRegex = false;
        // Skip flags (gimsuy)
        while (i + 1 < body.length && /[gimsuy]/.test(body[i + 1])) i++;
      }
      continue;
    }
    if (c === '/' && next === '/') {
      inComment = 'line';
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inComment = 'block';
      i++;
      continue;
    }
    if (c === '/' && REGEX_PREFIX.has(lastTokenChar)) {
      inRegex = true;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      lastTokenChar = c;
      continue;
    }

    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      chunks.push(body.slice(chunkStart, i));
      chunkStart = i + 1;
    }

    if (!/\s/.test(c)) lastTokenChar = c;
  }
  // Trailing chunk
  chunks.push(body.slice(chunkStart));

  // Strip JS comments (line + block) before identifier extraction so leading
  // comments above a method don't shadow its regex match.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const raw of chunks) {
    const chunk = stripComments(raw).trim();
    if (!chunk) continue;
    if (chunk.startsWith('...')) continue; // spread

    // Try property/method patterns. Allow leading async/get/set/static.
    const m = chunk.match(/^(?:async\s+|get\s+|set\s+|static\s+)*\*?\s*([a-zA-Z_$][\w$]*)\s*[(:=]/);
    if (m) names.add(m[1]);
  }
  return names;
}

/**
 * Find an object body following one of these patterns and extract its top-level keys.
 *   Alpine.data("name", () => ({...}))
 *   Alpine.data("name", function () { return { ... } })
 *   Alpine.store("name", { ... })
 *   export const XxxModule = { ... }
 */
function findDeclarations(file) {
  const src = readFileSync(file, 'utf8');
  const decls = [];

  // Alpine.data(...) — capture the inner object literal of `() => ({...})`
  const dataRegex = /Alpine\.data\(\s*["'`]([^"'`]+)["'`]\s*,\s*\(\s*\)\s*=>\s*\(\s*\{/g;
  let m;
  while ((m = dataRegex.exec(src))) {
    const braceIdx = src.indexOf('{', m.index + m[0].length - 1);
    const close = matchBrace(src, braceIdx);
    if (close < 0) continue;
    const body = src.slice(braceIdx + 1, close);
    decls.push({
      kind: `Alpine.data("${m[1]}")`,
      file,
      names: extractTopLevelNames(body),
    });
  }

  // Alpine.store("name", { ... })
  const storeRegex = /Alpine\.store\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
  while ((m = storeRegex.exec(src))) {
    const braceIdx = m.index + m[0].length - 1;
    const close = matchBrace(src, braceIdx);
    if (close < 0) continue;
    const body = src.slice(braceIdx + 1, close);
    decls.push({
      kind: `Alpine.store("${m[1]}")`,
      file,
      names: extractTopLevelNames(body),
    });
  }

  // export const XxxModule = { ... }
  const moduleRegex = /export\s+const\s+(\w*Module)\s*=\s*\{/g;
  while ((m = moduleRegex.exec(src))) {
    const braceIdx = m.index + m[0].length - 1;
    const close = matchBrace(src, braceIdx);
    if (close < 0) continue;
    const body = src.slice(braceIdx + 1, close);
    decls.push({
      kind: `module ${m[1]}`,
      file,
      names: extractTopLevelNames(body),
    });
  }

  return decls;
}

const declarations = jsFiles.flatMap(findDeclarations);

// ----- Reference counting --------------------------------------------------
// Pre-load every file once; count word-boundary occurrences per name across the
// whole source tree, then subtract the declaring chunk's own count (1 per decl).
const fileContents = new Map();
for (const f of allSourceFiles) fileContents.set(f, readFileSync(f, 'utf8'));

function countOccurrences(name) {
  const re = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  for (const content of fileContents.values()) {
    const matches = content.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

// Lifecycle hooks / framework-reserved names that Alpine calls without explicit reference.
const ALPINE_LIFECYCLE = new Set(['init', 'destroy']);

// ----- Report --------------------------------------------------------------
const allCandidates = [];
for (const d of declarations) {
  for (const name of d.names) {
    if (ALPINE_LIFECYCLE.has(name)) continue;
    const count = countOccurrences(name);
    if (count <= 1) {
      allCandidates.push({
        name,
        count,
        kind: d.kind,
        file: relative(ROOT, d.file).replaceAll(sep, '/'),
      });
    }
  }
}

console.log('# Alpine.js dead-method audit');
console.log(`# Generated: ${new Date().toISOString()}`);
console.log(`# Declarations scanned: ${declarations.length}`);
console.log(`# Names scanned: ${declarations.reduce((n, d) => n + d.names.size, 0)}`);
console.log(`# Candidates with <=1 reference: ${allCandidates.length}`);
console.log('');
console.log('## Declarations');
for (const d of declarations) {
  console.log(
    `- ${d.kind}  [${relative(ROOT, d.file).replaceAll(sep, '/')}]  (${d.names.size} top-level names)`
  );
}
console.log('');
console.log('## Candidates (name, refs, declared in)');
if (allCandidates.length === 0) {
  console.log('(none)');
} else {
  for (const c of allCandidates.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`- ${c.name}  refs=${c.count}  ${c.kind}  ${c.file}`);
  }
}
