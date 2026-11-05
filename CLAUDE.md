# clocknow.net — CLAUDE.md

**clocknow.net** — the most accurate, fastest, best-designed time platform on the web: clocks, countdowns, timers, world clock, calendars, printables, public API.
Current phase: **Phase 1 — MVP** (time-core + Wasm, atomic clock + sync, timer/stopwatch, basic countdowns, city time pages).

## Stack
- **Site:** Astro 7 (static + islands) in `apps/web`, Solid for rich islands, vanilla TS Web Components for light widgets.
- **Styling:** Tailwind CSS v4; design tokens in `packages/ui/theme.css` (OKLCH, `data-theme` = light | night | oled | contrast).
- **Engine:** Rust `crates/time-core` (pure, no I/O) → `crates/time-wasm` (wasm-bindgen, runs in a Web Worker).
- **API:** Rust Axum in `apps/api`, shares `time-core`. Versioned `/v1`.
- **Monorepo:** pnpm workspaces + Turborepo + Cargo workspace.

## Folder map
```
apps/web/src/pages      routes (/time/[city], /countdown/[id], /timer, /atomic)
apps/web/src/islands    Solid components (planner, globe, countdown editor)
apps/web/src/widgets    vanilla Web Components (<tz-clock>, <count-down>)
apps/api                Axum server
crates/time-core        tz, sync filter, calendars, astronomy (all math lives here)
crates/time-wasm        JS bindings only, no logic
packages/ui             tokens, Tailwind theme, shared components
```

## Commands (the user usually runs these — see rules)
- `pnpm dev` · `pnpm build` · `pnpm test` · `pnpm lint`
- `pnpm wasm` (builds Wasm into `packages/time-wasm-pkg`)
- `cargo test -p time-core` · `cargo run -p api`

## Non-negotiable product rules
- **Essentials first:** every clock renders as plain HTML digits + sync before any theme, style or 3D loads. Essentials pages ≤ 15 KB JS.
- Heavy themes (flip, dotted, 3D, particles) are lazy, per-theme files under `apps/web/src/themes/`; never imported by Essentials pages.
- All changing numbers use `tabular-nums`; digits never sit on blur; contrast ≥ 7:1 for digits.
- Display clock = `performance.timeOrigin + performance.now() + offset`; never `setInterval` for ticking, never `Date.now()` as truth.
- Always show the accuracy state (Locked / Drifting / Offline) — never fake accuracy.
- Time-zone and calendar math goes in `time-core`, not in JS.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.

## Security rules (non-negotiable)
- **No secrets in the frontend, Wasm or git** — not even "hidden" or obfuscated. Secrets live only in Cloudflare Worker secrets or the API server env; never use `PUBLIC_*` vars for keys. Commit only `.env.example`.
- API: strict CORS allow-list (clocknow.net); clients use short-lived edge-issued HMAC tokens; paid API keys are server-to-server only.
- Sync and time responses are signed (Ed25519); the client verifies with a pinned public key.
- Wasm, fonts and theme packs are served only to our origin (hotlink protection at the edge).
- Strict CSP (no inline scripts), `frame-ancestors 'self'`, HSTS; no production source maps.
- Every page has a self-referencing canonical tag and absolute URLs.

## Code conventions
- TypeScript strict; no `any`. Rust: `clippy` clean, no `unwrap()` outside tests.
- Small files, one component per file. Name tests `*.test.ts` / Rust `#[cfg(test)]`.
- Commit style: `feat:`, `fix:`, `chore:`, `perf:`.

## How Claude should work here (token-saving rules)
1. **Don't explore.** Use this file and the paths the user gives. Ask for a path rather than searching the whole repo.
2. **Never read** `node_modules`, `target`, `dist`, `.astro`, `.turbo`, lockfiles, generated Wasm output or tzdata files.
3. **Don't run** installs, full builds, dev servers or long test suites unless asked — the user runs them and pastes the relevant error lines. Running a single targeted test (`cargo test -p time-core <name>`) is fine.
4. **Edit, don't rewrite:** change only the lines needed; never reprint whole files.
5. **Big tasks:** give a ≤ 10-line plan first and wait for approval before writing code.
6. **Follow existing patterns:** when adding a theme, component or endpoint, copy the nearest existing one instead of designing from scratch.
7. **Short replies:** code plus a one-line summary. No explanations, recaps or alternatives unless asked.
8. **Don't add dependencies** without asking; prefer the platform and existing crates.
9. **Tests define behaviour:** if a test exists for the area, make it pass; if not, write the test first for engine code.
10. Boilerplate, scaffolding, git, renames and formatting are done by the user or tools (Prettier, `cargo fmt`) — not by Claude.

## Model guide (for the user)
- **Opus:** architecture, sync/drift algorithm, Wasm/JS boundary, hard bugs, performance, security.
- **Sonnet / Haiku:** UI components, theme JSON, pages, tests from a clear spec, docs, simple refactors.

## Reference docs (read only if the task needs them)
- Architecture plan: https://claude.ai/artifact/McodPMkSqeCKk4qDpiBoVk
- Design & UI research: https://claude.ai/artifact/JTD5UwicUrAPLBTBSMt2RM
