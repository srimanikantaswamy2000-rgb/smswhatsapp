/**
 * Push .env.local -> Vercel, guaranteed BOM-free.
 *
 * Why this exists
 * ---------------
 * Every value in the Vercel project had a leading U+FEFF (BOM), almost
 * certainly from bulk-importing a UTF-8-with-BOM .env file. A BOM in an
 * env value is invisible in every UI but fatal at runtime: it lands in
 * HTTP header values ("apikey"), and both undici and the browser reject
 * a header containing a code point > 255 —
 *   TypeError: Cannot convert argument to a ByteString ... value of 65279
 * which broke every server-side Supabase call AND browser login.
 *
 * This script re-adds each var with the BOM and surrounding whitespace
 * stripped. Values are streamed to the Vercel CLI over stdin so they
 * never appear in argv, logs, or the terminal.
 *
 * Usage:
 *   node scripts/sync-vercel-env.mjs            # dry run
 *   node scripts/sync-vercel-env.mjs --apply    # write to Vercel
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const TARGET = 'production';
const PROD_URL = 'https://whatsapp-crm-test.vercel.app';

/** Local-only artifacts that must never be pushed. */
const SKIP = new Set(['VERCEL_OIDC_TOKEN']);

/** Values that differ in production from local. */
const OVERRIDE = {
  // Local points at localhost; production must be the real origin or
  // WhatsApp cannot fetch the media links the AI agent sends.
  NEXT_PUBLIC_APP_URL: PROD_URL,
};

function parseEnv(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^﻿/, '');
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes, then any BOM inside them.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/^﻿/, '').trim();
    out.push([key, value]);
  }
  return out;
}

const entries = parseEnv(readFileSync('.env.local', 'utf8')).filter(
  ([k]) => !SKIP.has(k),
);

console.log(`${entries.length} variables to sync to ${TARGET}\n`);
for (const [k, v] of entries) {
  const value = OVERRIDE[k] ?? v;
  const overridden = OVERRIDE[k] ? '  (overridden for production)' : '';
  const bom = /^﻿/.test(value) ? ' !! STILL HAS BOM' : '';
  console.log(
    `  ${k.padEnd(32)} len=${String(value.length).padEnd(4)} first=${value.charCodeAt(0)}${bom}${overridden}`,
  );
}

if (!APPLY) {
  console.log('\nDRY RUN — re-run with --apply to write to Vercel.');
  process.exit(0);
}

console.log('\napplying…\n');
for (const [k, v] of entries) {
  const value = OVERRIDE[k] ?? v;
  // Remove first so add never hits "already exists". A missing var is
  // not an error here.
  try {
    execFileSync('npx', ['vercel', 'env', 'rm', k, TARGET, '--yes'], {
      stdio: 'ignore',
      shell: true,
    });
  } catch {
    /* not present — fine */
  }
  try {
    execFileSync('npx', ['vercel', 'env', 'add', k, TARGET], {
      input: value, // stdin: never in argv or logs
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: true,
    });
    console.log(`  ✓ ${k}`);
  } catch (err) {
    console.error(`  ✗ ${k}: ${String(err.stderr ?? err).slice(0, 120)}`);
  }
}
console.log('\nDone. A redeploy is required — NEXT_PUBLIC_* are inlined at build time.');
