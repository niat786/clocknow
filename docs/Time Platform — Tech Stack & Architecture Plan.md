# Time Platform — Tech Stack & Architecture Plan

Nov 5, 2026 · @murad

## Vision & positioning

Build the most accurate and best-designed time platform on the web: every clock is corrected against a trusted server, every page loads in under a second, and every feature is also an API.

The big incumbents (time.is, timeanddate.com, worldtimebuddy) win on SEO and breadth but lose on three fronts we can own:

- **Honest accuracy** — show the user's device offset and the measured error margin (for example "±12 ms"), not just a clock.
- **Premium, ad-light UX** — fast, calm, keyboard-first, dark-mode native, beautiful fullscreen modes.
- **Developer-first APIs** — the same engine that powers the site is a public, documented, versioned API and an npm package.

Rule of thumb for the stack: **static HTML + tiny vanilla JS by default; Rust/Wasm only where math is heavy; a framework island only where interaction is rich.**

## Stack at a glance

Astro for pages, Rust for the engine and the API, Cloudflare at the edge — one language for all time math, shared by browser and server.

| Layer | Choice | Why |
| --- | --- | --- |
| Site framework | [Astro 6](https://astro.build/blog/astro-6-beta/) (static + islands) | Zero JS by default, so 10,000 SEO pages ("time in Karachi", "days until Eid") ship as plain HTML |
| Styling | Tailwind CSS v4 + CSS variables design tokens | Fast to build, tiny CSS output, easy theming (dark, OLED, high-contrast) |
| Light widgets | Vanilla JS / TypeScript, Web Components | Simple timers, stopwatches, converters with no framework cost |
| Rich islands | Solid.js or Svelte 5 | Fine-grained reactivity re-renders only the digits that change; much lighter than React |
| 3D & visuals | Three.js (lazy-loaded), WebGL / OffscreenCanvas | 3D globe for world clock, day/night terminator, premium fullscreen scenes |
| Animation | CSS + Web Animations API; GSAP only for hero pieces | Smooth 60–120 fps digit transitions without a heavy runtime |
| Time engine | Rust → WebAssembly (wasm-bindgen, wasm-pack) in a Web Worker | Heavy tz math, drift filtering, calendar systems off the main thread |
| Native JS dates | Temporal API, with polyfill for Safari | Shipped in Chrome/Edge 144 and Firefox 139; Safari not yet stable ([W3Schools](https://www.w3schools.com/jsreF/jsref_obj_temporal.asp)) |
| Backend / API | Rust: Axum + Tokio (+ Rust on Cloudflare Workers for edge endpoints) | Microsecond responses, same crates as the Wasm core |
| Time source | Chrony stratum-1 servers on GPS/GNSS, serving NTS and Roughtime | Real accuracy needs your own disciplined servers, not the host's clock |
| Database | PostgreSQL (Neon or Supabase) | Users, saved countdowns, API keys, events |
| Cache / KV | Cloudflare KV + Redis (Upstash) | Shared countdown links, rate-limit counters |
| Hosting & CDN | Cloudflare Pages + Workers; a few VPS for the time servers | Global edge latency matters for time sync |
| Printables | Typst (Rust) on the server, or Paged.js in the browser | Pixel-perfect PDF calendars and planners |
| Monorepo | pnpm workspaces + Turborepo + Cargo workspace | One repo, shared types, cached builds |
| Quality | Vitest, Playwright, cargo test + proptest, Lighthouse CI | Accuracy and speed are tested, not hoped for |
| Observability | Sentry, Grafana + Prometheus, OpenTelemetry | Track sync error and API latency per region |

## Frontend architecture

Every page is static HTML first; JavaScript loads only for the piece that ticks, and Wasm loads only when a page needs heavy math.

**Three tiers of interactivity**

1. **Tier 0 — HTML + CSS only:** articles, holiday lists, "what day is it", SEO landing pages. Server-rendered time shown instantly, then corrected.
2. **Tier 1 — vanilla JS (under 5 KB):** a ticking clock, simple timer, stopwatch, date difference. Built as Web Components (`<tz-clock zone="Asia/Karachi">`) so they also work as embeddable widgets.
3. **Tier 2 — framework island + Wasm:** world-clock planner, meeting scheduler, atomic clock, fullscreen countdown editor, 3D globe. Hydrated with `client:visible` or `client:idle`.

**Rendering rules for smooth clocks**

- Drive every display from one `requestAnimationFrame` loop that reads a corrected time source, never `setInterval` (it drifts and throttles).
- Update only text nodes that change; use `font-variant-numeric: tabular-nums` so digits never jitter.
- Pause animation when the tab is hidden (Page Visibility API), then resync on return.
- Use the Screen Wake Lock API in fullscreen countdowns so the screen never sleeps.

**Design system**

- Tokens in CSS variables (color, radius, motion), consumed by Tailwind v4 `@theme`.
- Variable fonts with tabular figures (Inter, JetBrains Mono, or a licensed display face for big clocks).
- Themes: light, dark, OLED black, high contrast, plus user-created themes for countdowns.
- Motion respects `prefers-reduced-motion`.

**Three.js usage** — only where it earns its weight: a 3D globe with live day/night shading for the world clock, and optional premium fullscreen scenes. Lazy-load it on interaction so it never touches first paint.

## Rust + WebAssembly core

Write the time engine once in Rust as a pure library crate, then compile it three ways: Wasm for the browser, a native binary for the API, and an npm package for developers.

**What belongs in Wasm (heavy or must-be-exact)**

- Time-sync filter: offset and drift estimation from many server samples (Kalman or Marzullo-style intersection).
- Bulk time-zone conversion: meeting planner grids (e.g. 20 cities × 24 hours × 7 days), DST transition search.
- Calendar systems: Hijri (Umm al-Qura and tabular), Persian, Hebrew, Chinese lunar, ISO week, Julian Day.
- Astronomy: sunrise/sunset, moon phase, prayer times, solar terminator for the globe.
- Recurring-event expansion (RRULE) for calendars.

**What stays in plain JS** — formatting with `Intl`, simple countdown arithmetic, DOM updates. Crossing the JS↔Wasm boundary costs time, so batch calls (pass arrays, not one value per call).

**Crates to build on**

| Need | Crate |
| --- | --- |
| Dates, zones, Temporal-style API | jiff (or chrono + chrono-tz) |
| Embedded tz database | jiff-tzdb / tzdb compiled in, versioned with IANA releases |
| JS bindings | wasm-bindgen, serde-wasm-bindgen, tsify (generates TypeScript types) |
| Build | wasm-pack, wasm-opt (binaryen) with `-Oz`, LTO, `opt-level = "z"` |
| Astronomy | own implementation of NOAA / Meeus formulas, or astro-rs |
| Recurrence | rrule |

**Delivery**

- Run the Wasm module inside a dedicated Web Worker; the main thread only receives results.
- Split into small modules (`sync.wasm`, `tz.wasm`, `astro.wasm`) so a countdown page never downloads astronomy code.
- Target under 150 KB gzipped per module; stream-compile with `WebAssembly.instantiateStreaming` and cache with a service worker.
- Use SIMD where it helps bulk conversion; feature-detect and fall back.
- Publish the same core as `@yourbrand/time-core` on npm.

## Accuracy engine

A browser can realistically be held within about 5–30 ms of true UTC; the differentiator is measuring that error and showing it honestly.

**How a sync works (NTP-style over the web)**

1. Client records `t0` with `performance.now()` (monotonic, never jumps) and sends a request.
2. Server stamps receive time `t1` and send time `t2` from its disciplined clock.
3. Client records `t3` on arrival and computes offset and round-trip delay:

```latex
\theta = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}, \qquad \delta = (t_3 - t_0) - (t_2 - t_1)
```

4. Take 8–16 samples over WebSocket or WebTransport, keep the lowest-delay ones, and feed them to the Wasm filter.
5. The filter outputs offset, drift rate (ppm) and an error bound; the display clock = `performance.timeOrigin + performance.now() + offset`, slewed smoothly rather than jumping.
6. Resync every few minutes and on tab focus or network change.

**Correctness checklist**

- Serve time from your own Chrony servers synced to GPS or stratum-1 sources with NTS; expose their status publicly.
- Bundle the IANA tz database in Wasm and ship updates within 24 hours of each IANA release.
- Keep the full historical leap-second table (last one 2016; continuous UTC from 20 May 2027) and show TAI, UTC and GPS time on the atomic clock page.
- Detect a wrong device clock and tell the user by how much ("Your clock is 2.4 s fast").
- Test DST edges, the year 2038, and historical zone changes with property tests against reference data.

**Display honesty** — always show the current error margin, the server used, and last sync time. This is the feature the giants don't emphasise.

## Backend & public API

One Rust API (Axum) behind Cloudflare, sharing the `time-core` crate with the browser, versioned as `/v1` from day one.

**Endpoints (v1)**

| Endpoint | Returns |
| --- | --- |
| `GET /v1/now?tz=Asia/Karachi` | Current time, offset, DST flag, server error bound |
| `WS /v1/sync` | Low-latency sync samples (t1, t2) for clients and SDKs |
| `GET /v1/convert` | A time converted between zones (batch up to 100) |
| `GET /v1/zones` / `/v1/zones/{id}` | Zone metadata, upcoming DST transitions, tzdata version |
| `GET /v1/countdown/{id}` | A shared countdown's config (public read) |
| `GET /v1/holidays?country=PK&year=2027` | Public holidays |
| `GET /v1/sun?lat=..&lon=..&date=..` | Sunrise, sunset, golden hour, moon phase |
| `GET /v1/calendar/convert` | Gregorian ↔ Hijri / Persian / Hebrew / Lunar |
| `POST /v1/print` | A printable calendar or planner as PDF |

**API product**

- OpenAPI 3.1 spec generated from Rust types (utoipa); docs on Scalar or Redoc; SDKs for JS, Python, Go generated from the spec.
- API keys with tiers (free, pro, business); rate limiting at the edge with Workers + KV; usage dashboard.
- Responses cached at the edge where safe (zones, holidays); `now` and `sync` never cached.
- Status page and published accuracy and latency numbers per region.

**Accounts** — passkeys first, email magic link as fallback (Better Auth or Lucia-style session auth), so you never store passwords.

## Security & anti-cloning

Anything shipped to the browser can be copied, so secrets never go there; instead the value lives on our servers and a copied frontend becomes a dead shell that shows "Offline".

| Layer | Measure |
| --- | --- |
| Secrets | Only in Cloudflare Worker secrets (`wrangler secret put`) or the API server env; never in frontend code, Wasm, `PUBLIC_*` vars or git. CI scans `dist/` and the repo for key patterns and fails the build. |
| API access | Strict CORS allow-list (`clocknow.net`, `www`, staging); short-lived HMAC session tokens issued by the edge worker and bound to origin + IP range; paid API keys only server-to-server. |
| Signed time | Sync and `/v1/now` replies are signed (Ed25519); the client verifies with a pinned public key, so spoofed or proxied replies are rejected. |
| Asset hotlinking | Wasm, fonts and theme packs served only when `Origin`/`Referer` is ours (Cloudflare rule); others get 403. |
| Edge protection | Rate limits per IP and per key, Cloudflare bot management, Turnstile challenge only for suspicious traffic. |
| Headers | Strict CSP (no inline scripts, `connect-src` our hosts only), `frame-ancestors 'self'`, HSTS preload, COOP/CORP, `Referrer-Policy: strict-origin`. |
| Build | Minified, no production source maps, Subresource Integrity on scripts. |
| SEO | Self-referencing canonical tags and absolute URLs on every page so search engines credit the original. |
| Legal | Trademark "clocknow", copyright notice and terms of use, documented DMCA takedown process. |

What this does **not** do: stop someone copying HTML and CSS by hand. It makes the copy useless — no accurate time, no data, no APIs — and easy to take down.

## Data & infrastructure

Serve almost everything from the Cloudflare edge; keep only the API, database and time servers at the origin.

&#91;embedded content: system architecture · 4 layers\]

Requests flow down only on a cache miss or a sync; the time servers are the single source of truth for every timestamp.

- **Hosting:** Cloudflare Pages for the site, Workers for edge API logic; Fly.io or Hetzner VPS in 3+ regions (EU, US, Asia) for Axum and Chrony.
- **Data:** PostgreSQL (Neon or Supabase) with SQLx migrations; Redis (Upstash) for counters; KV for read-heavy shared countdowns.
- **CI/CD:** GitHub Actions running cargo test, clippy, wasm-pack build, Vitest, Playwright and Lighthouse CI on every PR; preview deploys per branch.
- **Observability:** OpenTelemetry traces to Grafana, Sentry for front-end errors, and a custom metric for measured client sync error per region.

## Feature modules

Each module is a self-contained package with its own page, widget, and API endpoint, so it can ship independently.

| Module | Tech tier | Premium touch |
| --- | --- | --- |
| Atomic clock | Tier 2 + Wasm sync | Live error margin, UTC/TAI/GPS, device-offset alert, ms display |
| World clock | Tier 2 + Three.js globe | Day/night terminator, drag-to-compare, work-hours overlap bars |
| Meeting planner | Tier 2 + Wasm bulk tz | Best-slot suggestion across 10+ cities, shareable link, .ics export |
| Countdowns | Tier 1 (view), Tier 2 (editor) | Custom themes, fonts, backgrounds, embeddable, OG image per countdown |
| Fullscreen mode | Tier 1 + Wake Lock | OLED mode, burn-in pixel shift, TV/kiosk URL, presenter remote via phone |
| Timers & stopwatch | Tier 1 | Lap splits, interval/Pomodoro presets, audio cues via Web Audio |
| Calendars | Tier 2 + Wasm calendars | Multi-calendar view (Gregorian + Hijri side by side), holidays, ISO weeks |
| Printables | Server (Typst) | Year, month, planner templates; A4/Letter; custom branding; vector PDF |
| Converters | Tier 0/1 | Time zone, Unix epoch, date difference, business-day calculator |
| Sun & moon | Wasm astro | Sunrise, golden hour, moon phase, prayer times |

## Monorepo folder structure

One repository holds a pnpm workspace for JS and a Cargo workspace for Rust; Turborepo caches both builds.

```
time-platform/
├── apps/
│   ├── web/                 # Astro site (pages, layouts, islands)
│   │   ├── src/pages/       # /time/[city], /countdown/[id], /calendar/[year]
│   │   ├── src/islands/     # Solid components (planner, globe, editor)
│   │   └── src/widgets/     # vanilla Web Components (<tz-clock>, <count-down>)
│   ├── api/                 # Rust Axum server (Cargo)
│   ├── edge/                # Cloudflare Workers (rate limit, cache)
│   └── docs/                # API docs site (Starlight)
├── crates/
│   ├── time-core/           # pure Rust: tz, sync filter, calendars, astro
│   ├── time-wasm/           # wasm-bindgen wrapper → npm package
│   └── print/               # Typst-based PDF generation
├── packages/
│   ├── ui/                  # design tokens, Tailwind preset, shared components
│   ├── sdk-js/              # generated API client
│   └── config/              # eslint, tsconfig, prettier
├── infra/                   # Chrony configs, Docker, Terraform
├── Cargo.toml               # Rust workspace
├── pnpm-workspace.yaml
└── turbo.json
```

## Performance, SEO, accessibility & PWA budgets

Set hard budgets and fail the build when a page breaks them.

| Metric | Budget |
| --- | --- |
| LCP (4G mobile) | < 1.2 s |
| INP | < 100 ms |
| CLS | 0 (clock digits reserve their width) |
| JS on a Tier 0/1 page | < 15 KB gzipped |
| Wasm per module | < 150 KB gzipped, loaded only when needed |
| API p95 latency | < 50 ms at the edge, < 100 ms origin |
| Displayed time error | < 30 ms typical, shown on screen |
| Lighthouse | 100 / 100 / 100 / 100 |

**SEO** — programmatic static pages per city, country, holiday and "days until" date; JSON-LD (Event, Place); hreflang for Urdu, Arabic, Hindi and more; dynamic OG images per countdown.

**Accessibility** — WCAG 2.2 AA; `aria-live="polite"` announcing time only on demand (not every second); full keyboard control; high-contrast and large-digit modes.

**PWA** — installable, works offline with the bundled tzdata, background notifications for timers and countdowns.

## Suggestions to make it amazing

Win on trust, delight and reach — features the incumbents either lack or bury under ads.

**Trust**

- Public accuracy dashboard: live sync error per region, tzdata version, server health.
- "Is my clock right?" one-click test with a shareable result card.
- Open-source the `time-core` crate — developers become your marketing.

**Delight**

- Command palette (Ctrl+K): type "3pm Karachi in New York" or "timer 25m" in plain words.
- Synced multi-device countdowns: start on a laptop, control from a phone (WebSocket rooms), perfect for events and classrooms.
- Live-event mode: New Year, Ramadan iftar/sehri, launches, exams — with crowd counters and confetti at zero.
- Ambient fullscreen scenes (Three.js) and a "stream overlay" mode for OBS/Twitch.
- Smart meeting planner that respects each person's work hours and local holidays.

**Reach**

- Embeddable widgets and a WordPress plugin; free tier with a small backlink.
- Native-feeling PWA + home-screen widgets; Chrome extension new-tab world clock.
- Strong regional depth: Urdu/Arabic RTL UI, Hijri calendar, prayer times, PKT-first defaults for South Asia — an underserved market.
- AI assistant endpoint: natural-language date questions answered by the deterministic engine (the AI parses, Rust computes).

**Business model** — ad-light free site, Pro (custom-branded countdowns, no ads, printables), and paid API tiers.

## Enterprise trust program

Big companies don't buy "accurate" — they buy **provable, auditable, cryptographically verifiable** time. Build these six pillars and the project becomes procurement-ready.

1. **Traceability to UTC.** Discipline your servers from GPS/GNSS receivers plus a backup link to a national lab realisation of UTC (NIST, NPL, PTB). Publish a traceability statement. Regulated firms must be able to demonstrate traceability to UTC, document the design and review it at least yearly under MiFID II RTS 25 ([source](https://emissions-euets.com/time-stamping-and-business-clocks-synchronisation)), and public internet NTP alone is not considered formally traceable ([Timebeat](https://timebeat.app/blog/mifid-ii-finra-clock-sync)) — that gap is your enterprise product.
2. **Authenticated time.** Run NTS (RFC 8915), which uses TLS and AEAD to secure NTP client-server mode ([RFC 8915](https://www.ietf.org/rfc/rfc8915.html)), and a Roughtime server. Roughtime was approved as an Experimental RFC in March 2026 and lets clients produce cryptographic proof that a server lied ([IETF announcement](https://www.pwg.org/archives/ipp/2026/022045.html)). Few web-clock sites offer either.
3. **Signed timestamps (RFC 3161 TSA).** A timestamp authority signs a hash of the data plus the time, and anyone holding the authority's certificate can verify it ([eMudhra](https://emudhra.com/en/blog/time-stamping-services-signed-documents)). Offer it as a paid API; later, pursue eIDAS qualified status through a partner QTSP for EU legal weight.
4. **Evidence, not claims.** Keep a signed, append-only log of every server's offset to UTC, retained for years, so a customer can prove accuracy at any past moment — the clause regulators care about most.
5. **Security & compliance.** SOC 2 Type II, then ISO 27001; pen tests; a published security.txt and bug bounty; data residency options (EU, US, APAC).
6. **Reliability contract.** 99.99% SLA on paid tiers, multi-region anycast, public status page, incident post-mortems, and a 24-month API deprecation policy.

Current policy note: the 28th CGPM adopted continuous UTC from 20 May 2027, ending leap seconds ([Euronews](https://www.euronews.com/next/2026/10/16/global-timekeeping-rules-change-leap-second-scrapped-from-2027)). Ship a clear "no more leap seconds" explainer and make the engine handle the historical table correctly — an easy authority win.

## Accuracy targets by tier

Promise each audience only what physics allows, and publish the measured number. The web tier's bar to beat: time.is says its display is normally within 0.02–0.10 s ([time.is](https://time.is/ta/about/sound)).

| Tier | Delivery | Target error | Who buys it |
| --- | --- | --- | --- |
| Web clock | WebTransport/WebSocket sync + Wasm filter | ±5–20 ms typical, always shown | Everyone (free) |
| Time API (`/v1/now`) | HTTPS with server-side stamps and RTT | ±1–10 ms reported per response | Apps, SaaS |
| Sync SDK | Native NTS client in Rust (Linux, Windows, macOS, mobile) | \~1 ms over internet | Enterprises, IoT |
| Origin reference | GPS-disciplined Chrony stratum-1 | Microseconds to UTC | Your own backbone |
| Dedicated / cloud-local | NTS + PTP inside customer cloud | Low tens of µs | Finance, telecom |

The web limit is real: half the round-trip time is the firm bound on asymmetric paths ([NTP Pool discussion](https://community.ntppool.org/t/is-time-is-really-atomic-accurate/3769)). Beat it with many low-delay samples, edge servers near users, WebTransport datagrams (Baseline since Safari 26.4 in March 2026, [Utsubo](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)) and honest error bars. For cloud customers, AWS already offers GPS-disciplined clocks with microsecond-range accuracy on supported EC2 instances ([AWS](https://aws.amazon.com/blogs/compute/its-about-time-microsecond-accurate-clocks-on-amazon-ec2-instances/)) — integrate and monitor it rather than compete with it.

## Premium API tiers & pricing

Undercut the incumbent on developer experience, not just price: monthly billing, a free tier, and accuracy guarantees nobody else contracts for. Timeanddate's APIs are paid-only yearly subscriptions sold as credit packages (100k–1M requests), with a Basic holiday package around $99 ([timeanddate FAQ, archived](https://webcf.waybackmachine.org/web/20211210172400/https://dev.timeanddate.com/faq)).

| Tier | Price (proposed, USD) | Requests | Includes | SLA |
| --- | --- | --- | --- | --- |
| Free | $0 | 10k / month | `now`, `convert`, `zones`, attribution required | Best effort |
| Developer | $19 / month | 500k / month | + holidays, sun/moon, calendars, webhooks for DST changes | 99.9% |
| Business | $149 / month | 5M / month | + sync SDK, batch, printables API, usage analytics, team keys | 99.95% |
| Enterprise | from $1,500 / month | Custom | + RFC 3161 signed timestamps, NTS endpoints, traceability reports, audit log export, dedicated region, SSO/SCIM | 99.99% + credits |

**What makes it premium**

- Every response carries `error_bound_ms`, `tzdata_version`, `server_id` and a signature header option.
- DST and tz-change **webhooks**: notify customers days before a country changes its rules.
- Deterministic results: the same Rust core as the open-source crate, so customers can verify offline.
- Usage-based overage instead of hard cut-offs; annual discount 20%.
- Monthly accuracy report PDF for compliance teams (generated by the printables engine).

## World-class speed techniques

Target a correct, ticking clock on screen within 300 ms on a mid-range phone; these are the levers that get you there.

**Network**

- HTTP/3 + 0-RTT at the edge; Early Hints (103) for the font and the tiny clock script.
- Server-render the current time into HTML at the edge, so the first paint is already right to the second; the client only corrects milliseconds.
- Sync over WebTransport datagrams with WebSocket fallback; a 1-RTT sync burst on load, then gentle background polling.
- Speculation Rules API to prerender likely next pages (city → city, countdown → fullscreen) for instant navigation.

**Rendering**

- Inline critical CSS (< 8 KB); subset and self-host the clock font with only digits and punctuation for the hero (< 15 KB).
- Reserve digit boxes with `tabular-nums` and fixed `ch` widths: CLS stays at zero.
- Cross-document View Transitions for app-like page changes with no SPA cost.
- WebGPU (Baseline since January 2026) for the globe and scenes, WebGL2 fallback ([Utsubo](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)).

**Compute**

- Wasm in a worker, compiled with `opt-level="z"`, LTO and `wasm-opt -Oz`; precompute zone tables at build time.
- `scheduler.yield()` and `requestIdleCallback` keep INP far below the 200 ms "good" line.
- Service worker caches shell, Wasm and tzdata: repeat visits render offline in under 100 ms.

**Proof** — publish a live performance page (real-user p75 LCP, INP, CLS from the web-vitals library, plus sync error by country). Performance you can see is part of the trust story.

## SEO plan to outrank the giants

Programmatic pages still win — but only if each one is genuinely useful. Google's 2026 enforcement of its scaled content abuse policy hit thin templated pages, while pages with real data or utility kept ranking ([MadX](https://www.madx.digital/learn/programmatic-seo-ai-overviews)).

**Page system (quality gates, not volume)**

- Launch with the top \~2,000 cities and \~200 countries, not 7 million locations; expand only where Search Console shows demand.
- Every city page carries unique live data: corrected time, DST history and next change, sunrise/sunset, prayer times, local holidays, work-hours overlap with major hubs, and a live tool — never just a template with a name swapped.
- Hubs: countries → regions → cities; "time difference A vs B" pages only for pairs people actually search.
- Evergreen authority guides: leap second end in 2027, how DST works, how our accuracy is measured.

**Technical SEO**

- Core Web Vitals "good" thresholds remain LCP 2.5 s, INP 200 ms, CLS 0.1 at p75 ([rgb.ir summary of Google docs](https://rgb.ir/en/blog/core-web-vitals-thresholds-2026/)); our budgets are far stricter.
- JSON-LD: `WebApplication`, `Place`, `Event` (countdowns), `Dataset` (API data), `FAQPage` where real.
- hreflang for 20+ languages with human-reviewed translations; RTL layouts for Urdu and Arabic.
- Dynamic OG images per page; XML sitemaps split by type with accurate `lastmod`.
- `llms.txt` and clean, citable facts so AI answers quote you as the source.

**Authority & links** — embeddable widgets with attribution, a free public API, open-source `time-core`, press-friendly data stories ("The world's clocks: how wrong are they?" from your own measurements).

## Competitive benchmark

The incumbents are strong on breadth and brand; none sells verifiable, contract-backed accuracy — that is the gap to own.

| Site | Strength | Gap we exploit |
| --- | --- | --- |
| [time.is](https://time.is/en-gb/about/knowledge/) | 7 million locations; display normally within 0.02–0.10 s; tracks IANA tzdata (2026c) with own patches | No signed or authenticated time, no SLA, no traceability evidence |
| [timeanddate.com](https://webcf.waybackmachine.org/web/20211210172400/https://dev.timeanddate.com/faq) | Huge content depth, holidays and astronomy APIs | APIs paid-only on yearly credit packages; no free tier for developers |
| Plain web clocks (e.g. Time.ms) | Show RTT-based accuracy estimate ([Time.ms](https://time-ms.pages.dev/accuracy/)) | No enterprise layer, no API product |

**Positioning line:** *"The only web clock you can audit."* Every number on screen is measured, signed and published.

## Roadmap

Launch the accuracy story first; it is the reason people switch, and everything else builds on `time-core`.

&#91;embedded content: roadmap · 4 phases, 3 gates\]

No phase starts until the gate before it is met, so speed and accuracy never slip as features grow.

## Sources

- [Temporal browser support — W3Schools](https://www.w3schools.com/jsreF/jsref_obj_temporal.asp)
- [Astro 6 announcement — astro.build](https://astro.build/blog/astro-6-beta/)

* [RFC 8915 Network Time Security](https://www.ietf.org/rfc/rfc8915.html)
* [Roughtime approved as Experimental RFC](https://www.pwg.org/archives/ipp/2026/022045.html)
* [MiFID II RTS 25 clock requirements](https://emissions-euets.com/time-stamping-and-business-clocks-synchronisation)
* [MiFID II and FINRA traceability — Timebeat](https://timebeat.app/blog/mifid-ii-finra-clock-sync)
* [Leap seconds end May 2027 — Euronews](https://www.euronews.com/next/2026/10/16/global-timekeeping-rules-change-leap-second-scrapped-from-2027)
* [RFC 3161 and eIDAS timestamps — eMudhra](https://emudhra.com/en/blog/time-stamping-services-signed-documents)
* [Microsecond clocks on EC2 — AWS](https://aws.amazon.com/blogs/compute/its-about-time-microsecond-accurate-clocks-on-amazon-ec2-instances/)
* [Frontier Web APIs 2026 — Utsubo](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)
* [Programmatic SEO and scaled content — MadX](https://www.madx.digital/learn/programmatic-seo-ai-overviews)
* [Core Web Vitals thresholds 2026](https://rgb.ir/en/blog/core-web-vitals-thresholds-2026/)
* [About time.is](https://time.is/en-gb/about/knowledge/) · [time.is precision](https://time.is/ta/about/sound)
* [Is time.is atomic accurate? — NTP Pool forum](https://community.ntppool.org/t/is-time-is-really-atomic-accurate/3769)
* [timeanddate API FAQ (archived)](https://webcf.waybackmachine.org/web/20211210172400/https://dev.timeanddate.com/faq)
* [Time.ms accuracy method](https://time-ms.pages.dev/accuracy/)
