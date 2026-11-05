#!/usr/bin/env node
// Fails the build if the built site could leak a secret or break our strict CSP.
// Usage: node scripts/check-dist.mjs [dist-dir] [src-dir]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';

const dist = process.argv[2] ?? 'apps/web/dist';
const src = process.argv[3] ?? 'apps/web/src';
const problems = [];
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.map']);
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bsk_(live|test)_[0-9A-Za-z]{16,}/, 'Stripe-style secret key'],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}/, 'GitHub token'],
  [/\bxox[abprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(api[_-]?key|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{16,}["']/i, 'hard-coded credential'],
];
const ALLOWED_ENV = new Set(['MODE', 'DEV', 'PROD', 'BASE_URL', 'SITE', 'SSR']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (!existsSync(dist)) {
  console.error(`check-dist: ${dist} not found. Run the build first.`);
  process.exit(2);
}

const headersFile = join(dist, '_headers');
const csp = existsSync(headersFile) ? readFileSync(headersFile, 'utf8') : '';

const titles = new Map();
for (const file of walk(dist)) {
  const ext = extname(file);
  if (ext === '.map') problems.push(`${file}: source map shipped to production`);
  if (!TEXT.has(ext)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of SECRETS) {
    const m = re.exec(text);
    if (m) problems.push(`${file}: looks like ${label} ("${m[0].slice(0, 24)}…")`);
  }
  if (process.env.CHECK_PROD && /localhost:\d+|127\.0\.0\.1/.test(text))
    problems.push(`${file}: points at a local dev server (set PUBLIC_API_URL for production)`);
  if (ext === '.html') {
    for (const [tag] of text.matchAll(/<[a-zA-Z][^>]*>/g)) {
      if (/^<style\b/i.test(tag)) problems.push(`${file}: inline <style> (blocked by CSP)`);
      if (/\sstyle=/i.test(tag)) problems.push(`${file}: inline style attribute (blocked by CSP)`);
      if (/\son[a-z]+=/i.test(tag)) problems.push(`${file}: inline event handler (blocked by CSP)`);
    }
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\ssrc=/i.test(m[1]) || /application\/ld\+json/i.test(m[1])) continue;
      const h = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
      if (!csp.includes(h)) problems.push(`${file}: inline <script> not covered by a CSP hash (${h})`);
    }
    const title = /<title>([^<]*)<\/title>/.exec(text)?.[1];
    if (!title) problems.push(`${file}: no <title>`);
    else if (titles.has(title)) problems.push(`${file}: same <title> as ${titles.get(title)}`);
    else titles.set(title, file);
    if (!/<link rel="canonical" href="https:\/\/clocknow\.net[^"]*"/.test(text))
      problems.push(`${file}: missing self-referencing canonical`);
  }
}

if (!existsSync(headersFile)) problems.push(`${headersFile}: missing (security headers not deployed)`);
else if (!/Content-Security-Policy:/.test(csp)) problems.push(`${headersFile}: no Content-Security-Policy`);

if (existsSync(src)) {
  for (const file of walk(src)) {
    if (!/\.(ts|tsx|astro|js|mjs)$/.test(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g))
      if (!m[1].startsWith('PUBLIC_') && !ALLOWED_ENV.has(m[1]))
        problems.push(`${file}: reads non-public env var ${m[1]} (only PUBLIC_* may reach the browser)`);
  }
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s)\n - ` + problems.join('\n - '));
  process.exit(1);
}
console.log('check-dist: OK');
