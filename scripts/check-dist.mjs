#!/usr/bin/env node
// Fails the build if the built site could leak a secret or break our strict CSP.
// Usage: node scripts/check-dist.mjs [dist-dir] [src-dir]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, extname, join, posix, relative } from 'node:path';

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

const SITE = 'https://clocknow.net';
const JS_BUDGET = 15 * 1024; // gzip bytes of statically imported JS on Essentials pages
const ESSENTIALS = /^\/(time\/[^/]+|atomic|timer|stopwatch|countdown)?$/;
const pages = new Set();
const noindex = new Set();
const links = new Map();
const budgetCache = new Map();
const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (t) => t.replace(/&(amp|lt|gt|quot|#39);/g, (m) => entities[m]);
const routeOf = (file) => {
  const rel = relative(dist, file).split('\\').join('/');
  if (rel === '404.html') return null;
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
};

function scriptClosureBytes(srcs) {
  const seen = new Set();
  const queue = srcs.map((s) => posix.normalize(s));
  let bytes = 0;
  while (queue.length) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = join(dist, url);
    if (!existsSync(file)) continue;
    const code = readFileSync(file);
    bytes += gzipSync(code).length;
    for (const m of code.toString('utf8').matchAll(/(?:from|import)\s*["'](\.[^"']+\.js)["']/g))
      queue.push(posix.normalize(posix.join(posix.dirname(url), m[1])));
  }
  return bytes;
}

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

    const route = routeOf(file);
    if (route === null) continue; // 404 page: only the checks above apply
    pages.add(route);
    if (/<meta name="robots" content="noindex/.test(text)) noindex.add(route);
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(text)?.[1];
    if (canonical && canonical !== SITE + route) problems.push(`${file}: canonical ${canonical} is not ${SITE + route}`);
    const h1s = (text.match(/<h1[\s>]/g) ?? []).length;
    if (h1s !== 1) problems.push(`${file}: ${h1s} <h1> elements (need exactly one)`);
    const desc = /<meta name="description" content="([^"]*)"/.exec(text)?.[1];
    if (desc === undefined) problems.push(`${file}: no meta description`);
    else if (decode(desc).length < 50 || decode(desc).length > 160)
      problems.push(`${file}: meta description is ${decode(desc).length} characters (want 50-160)`);
    for (const prop of ['og:title', 'og:description', 'og:url', 'og:image'])
      if (!text.includes(`property="${prop}"`)) problems.push(`${file}: missing ${prop}`);
    for (const m of text.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const ld = JSON.parse(m[1]);
        if (ld['@context'] !== 'https://schema.org' || !Array.isArray(ld['@graph'])) problems.push(`${file}: JSON-LD is not a schema.org @graph`);
      } catch (e) {
        problems.push(`${file}: JSON-LD does not parse (${e.message})`);
      }
    }
    for (const m of text.matchAll(/<a\s[^>]*?href="(\/[^"#?]*)/g)) {
      if (m[1].startsWith('//')) continue;
      if (!links.has(m[1])) links.set(m[1], file);
    }
    if (ESSENTIALS.test(route)) {
      const srcs = [...text.matchAll(/<script\b[^>]*\ssrc="(\/[^"]+)"/g)].map((m) => m[1]);
      const key = srcs.join('|');
      if (!budgetCache.has(key)) budgetCache.set(key, scriptClosureBytes(srcs));
      const bytes = budgetCache.get(key);
      if (bytes > JS_BUDGET) problems.push(`${file}: ${(bytes / 1024).toFixed(1)} KB gzip of JavaScript (Essentials pages must stay under ${JS_BUDGET / 1024} KB)`);
    }
  }
}

// Internal links must resolve to a built page or file.
const broken = [];
for (const [href, from] of links) {
  const route = href.length > 1 && href.endsWith('/') ? href.slice(0, -1) : href;
  if (!pages.has(route) && !existsSync(join(dist, href)) && !(href === '/404')) broken.push(`${href} (from ${relative(dist, from)})`);
}
if (broken.length) problems.push(`${broken.length} broken internal link(s): ${broken.slice(0, 10).join(', ')}${broken.length > 10 ? ', …' : ''}`);

// The sitemap lists exactly the pages that exist, with the same URLs as the canonical tags.
const sitemapFiles = readdirSync(dist).filter((n) => /^sitemap-\d+\.xml$/.test(n));
if (!sitemapFiles.length) problems.push('no sitemap-N.xml found');
const inSitemap = new Set();
for (const n of sitemapFiles)
  for (const m of readFileSync(join(dist, n), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1];
    if (!loc.startsWith(SITE)) { problems.push(`${n}: ${loc} is not on ${SITE}`); continue; }
    const route = loc.slice(SITE.length) || '/';
    if (route !== '/' && route.endsWith('/')) problems.push(`${n}: ${loc} has a trailing slash (canonical URLs do not)`);
    if (!pages.has(route)) problems.push(`${n}: ${loc} is not a built page`);
    if (noindex.has(route)) problems.push(`${n}: ${loc} is marked noindex but listed in the sitemap`);
    inSitemap.add(route);
  }
const missing = [...pages].filter((r) => !inSitemap.has(r) && !noindex.has(r));
if (missing.length) problems.push(`${missing.length} page(s) missing from the sitemap, e.g. ${missing.slice(0, 5).join(', ')}`);

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
