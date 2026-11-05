# Time Platform — Design & UI Research

Nov 5, 2026 · @murad

## Verdict on "Neo-Utility Minimal"

The research gets the fundamentals right — big tabular numerals, zero clutter, one accent, contained 3D — but it describes a *look* that many sites already copy, not an identity. To be next level, the platform should feel like a **precision instrument**, not a glassy dashboard.

| Idea from the research | Verdict | Change |
| --- | --- | --- |
| Apple-style typographic hierarchy | Keep | Adopt the hierarchy, not the font (SF Pro can't be shipped on the web) |
| Tabular numerals | Keep — essential | Go further: a custom digit set and fixed digit boxes |
| Glassmorphism cards everywhere | Change | Glass only for floating layers; solid surfaces for data |
| Dark-mode first | Change | Theme-adaptive with a true "night" mode; light must be first-class (daytime office use, sunlight, print) |
| One neon accent (cyan or amber) | Change | One brand accent plus a strict semantic set for sync status |
| Three.js hero / globe | Keep, but gate it | Lazy, optional, and meaningful (real day/night data), never decoration |
| Material / WinUI rejected | Agree | Borrow only Fluent's focus states and Material's motion easing research |
| Vue/Astro | Clarify | Astro + Solid islands per the tech plan; Vue adds weight we don't need |

## Where we disagree

Five points in the research would hurt legibility, speed, licensing or trust if shipped as written.

1. **SF Pro is not allowed as a web font.** Apple licenses it only for mock-ups and apps on Apple platforms, and says not to self-host it on websites ([Inspo AI summary](https://www.inspoai.io/blogs/sf-pro-font-alternatives); [Apple forum](https://developer.apple.com/forums/thread/127350)). Use open fonts instead (see Typography).
2. **Glass everywhere costs speed and contrast.** Blur is GPU work that can drop frames during mobile scrolling; guides suggest keeping radius under \~20 px and only a few blurred elements on mobile ([OpenReplay](https://blog.openreplay.com/creating-blurred-backgrounds-css-backdrop-filter/)). Apple's own Liquid Glass drew low-contrast criticism and needed Reduce Transparency and a Tinted option ([Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/), [Gulf News](https://gulfnews.com/technology/companies/apple-yields-tinted-control-in-ios-261-beta-4-tones-down-liquid-glass-after-backlash-1.500315176)). A clock is read in sunlight, on TVs and projectors — never put the digits on blur.
3. **Dark-only is the wrong default.** Many users check time in bright offices and outdoors; follow the OS setting, and offer Night and OLED modes as explicit choices.
4. **A neon accent alone can't carry meaning.** Sync status needs distinct, color-blind-safe states (good / degraded / offline) that also use shape and text, not just hue.
5. **"Apple-like" is a commodity look.** Users won't remember another frosted card grid. Identity has to come from the digits, the motion, and the visible accuracy layer — things only a time platform can own.

## Next-level direction: "Instrument-grade"

Design the site like a reference instrument — a chronometer, a flight deck, a lab oscilloscope — where every mark on screen is functional and every number is measured. Calm, exact and quietly luxurious, in the way a fine watch dial is.

**Five principles**

1. **The digits are the brand.** A custom-tuned numeral set, perfectly spaced, is the logo people screenshot.
2. **Show the measurement.** Accuracy, offset and sync source are part of the design, styled like instrument readouts — not hidden in a tooltip.
3. **Solid data, floating glass.** Clocks and tables sit on solid surfaces; only menus, command palette and sheets use glass.
4. **Motion follows time.** Nothing moves unless time moves; animations are tied to the real second, never decorative loops.
5. **One screen, one job.** Every page opens on a single answer ("14:32:07 in Karachi") with depth one scroll or one keystroke away.

**Visual references to study:** Swiss railway clocks (clarity), Braun/Dieter Rams (restraint), Teenage Engineering (playful precision), aviation glass cockpits (status hierarchy), Linear and Vercel (web craft and speed).

## Two design tiers: Essentials and Expressive

One product, two speeds: a plain, instant clock for people who just need the time, and rich themes layered on top for people who want an experience.

&#91;embedded content: design tiers · 3 layers\]

The core never changes between themes, so accuracy, accessibility and speed are guaranteed even under the heaviest scene.

- **Essentials pages** (default for `/time/*`, stopwatch, timer, converter): Instrument-grade minimal, no effects.
- **Expressive pages** (countdown builder, fullscreen, events, home hero): themes, gradients, 3D — chosen by the user or the occasion.
- The user's choice is remembered per tool: a researcher's timer stays minimal while their birthday countdown stays festive.

## Theme engine

A theme is two independent choices — a **display style** (how digits are drawn) and a **palette + scene** (colors, background, effects) — so 8 styles × 30 palettes give 240 looks from 38 small files.

| Display style | Rendering | Weight | Best for |
| --- | --- | --- | --- |
| Minimal digital | Plain HTML text | 0 KB extra | Essentials, research, exams |
| Flip (split-flap) | CSS 3D transforms, one card per digit | \~4 KB | Countdowns, events, retro |
| Dotted / LED matrix | SVG or canvas dot grid | \~3 KB | Night, music, ambient |
| Seven-segment | SVG segments | \~2 KB | Lab, retro tech, alarms |
| Analog dial | SVG with sweep hand | \~5 KB | Classrooms, wall clocks |
| Ring progress | SVG arc around digits | \~2 KB | Timers, Pomodoro |
| Glass 3D | Three.js / WebGPU scene | \~150 KB lazy | Hero moments, celebrations |
| Kinetic type | Variable-font animation | font only | Live events, OG videos |

**Palette + scene file** (JSON, \~1 KB): color tokens, gradient stops, background (solid, gradient, image, particles, 3D), sound, confetti style, font choice, and contrast-checked text colors.

**Builder UX:** pick an occasion → preview live on the real countdown → tweak style, colors, background, message → one shareable link (`/c/abc123`) and an OG image. Every shared link opens straight into fullscreen-ready view.

## Occasion theme presets

Launch with a small, polished set tied to real search demand; seasonal presets go live on the homepage a few weeks before each date.

| Preset | Palette | Default style | Scene & extras |
| --- | --- | --- | --- |
| Pakistan Independence Day (14 Aug) | Flag green `#01411C` + white, crescent-and-star motif | Flip | Waving flag shader, green-white confetti, optional anthem chime |
| Pakistan Day (23 Mar) | Deep green + gold | Kinetic type | Minar-e-Pakistan line art |
| Eid & Ramadan | Night teal + gold | Analog / dotted | Crescent moon phase, lanterns; sehri and iftar times built in |
| New Year | Midnight black + champagne | Flip | Fireworks at zero, world-wide midnight relay |
| Birthday — Rose | Rose pink + cream | Flip | Balloons, sparkles, name and age on the card |
| Birthday — Sky | Sky blue + white | Flip | Balloons, confetti, name and age |
| Wedding | Ivory + soft gold | Kinetic serif | Floral frame, guest RSVP link |
| Exam / deadline | Neutral, high contrast | Minimal digital | No effects, distraction-free |
| Product launch | Brand colors from a URL | Seven-segment / glass 3D | Logo upload, embeddable widget |
| Diwali, Christmas, Holi | Festival palettes | Flip / dotted | Diyas, snow, colour powder |

Suggestion: name birthday presets by color (Rose, Sky, Mint, Gold), not "girls" and "boys" — the same choices stay one tap away, nobody feels boxed in, and the presets read better for adults and corporate users. Each preset is reviewed for contrast in light and dark.

## Lessons from the inspiration images

Each reference has one idea worth taking; none should be copied whole.

| Reference | Borrow | Avoid |
| --- | --- | --- |
| Collapsible sidebar (light, dark, icon-only) | Three widths with tooltips in icon mode, identical light/dark structure, theme switch at the bottom | A permanent sidebar on Essentials pages — it steals width from the clock; use it only in the logged-in app (saved clocks, countdowns, API keys) |
| Bento HR dashboard (warm cream + yellow) | Soft warm gradient, rounded bento cards, the ring "time tracker" with play/pause, large light-weight numerals (78 / 56 / 203) | Very low-contrast grey labels and dense card grids on public pages |
| Glossy calendar icon ("high impact") | Depth and gloss for **icons and app tiles** — great for the PWA icon, date widgets and OG images | Applying gloss to body UI or digits |
| Dotted digits + soundscape player | The dotted / LED digit style, ambient scene categories, circular controls — ideal for a Focus / Ambient timer mode | Curved, rotated layouts for core clocks — hard to read at a glance |

The Instagram reel link couldn't be opened from here (the site blocks automated access). A screenshot or short screen recording would let me add it.

## Performance rules for heavy themes

Heavy designs are allowed, but they must never slow down someone who only wants the time.

| Tier | JS budget | First paint | Rule |
| --- | --- | --- | --- |
| Essentials | ≤ 15 KB | < 1.0 s on 4G | No webfont beyond the digit subset, no images, no 3D |
| Styled (flip, dotted, palettes) | + ≤ 30 KB per style | < 1.5 s | Style CSS/JS loaded only for the chosen theme |
| Expressive (3D, particles, video) | + ≤ 250 KB, lazy | Clock visible first, scene fades in after | Load after the digits are live; skip on Save-Data, low battery or slow devices |

- **Digits first, always:** every theme renders a working plain clock immediately; the scene is progressive enhancement.
- **Theme packs** are separate cached files (`/themes/flip.js`, `/palettes/pk-independence.json`), so one theme never weighs down another.
- **Adaptive quality:** measure frame time for 2 s; drop particles, then blur, then 3D if under 50 fps.
- **Fullscreen mode** pauses everything off-screen and caps animation to the display refresh rate.
- **A "Lite" switch** in the footer (and `?lite=1`) forces Essentials everywhere — ideal for labs, schools and slow networks.

## Typography system

Use a free, open-licensed UI face plus a dedicated display numeral set; on Apple devices the `system-ui` stack still renders SF Pro legally.

| Role | Face | Notes |
| --- | --- | --- |
| UI text | Inter (variable, OFL) | Closest open alternative to SF Pro; enable `tnum`, `cv11`, `ss01` |
| Display clock | Custom subset of a geometric grotesk (e.g. Geist or Inter Display), digits only | Hand-tune 0–9, colon and dot; optical sizes for 400 px+ digits |
| Data / readouts | JetBrains Mono or Geist Mono | Offsets, epoch, API examples |
| Urdu / Arabic | Noto Nastaliq Urdu, IBM Plex Sans Arabic | RTL from day one; Eastern Arabic numerals as an option |

**Rules**

- `font-variant-numeric: tabular-nums` everywhere a number can change; slashed or dotted zero in data views.
- Fluid scale with `clamp()`: the hero clock fills the width it is given (up to \~38vw), labels stay 13–16 px.
- Colon blinks only if the user enables it; default is a steady colon (calmer, more readable).
- Seconds and milliseconds step down in size and weight, so hours and minutes read at a glance.
- Self-host, subset and preload one hero font file under 15 KB.

## Color & themes

A near-neutral palette in OKLCH with one signature accent; color is reserved for meaning.

**Core tokens**

| Token | Role | Light | Night |
| --- | --- | --- | --- |
| `--surface-0` | Page | warm white `oklch(98.5% 0.003 90)` | ink `oklch(14% 0.01 260)` |
| `--surface-1` | Cards, solid | `oklch(96% 0.004 90)` | `oklch(18% 0.012 260)` |
| `--ink` | Digits, text | `oklch(18% 0.01 260)` | `oklch(96% 0.005 90)` |
| `--ink-muted` | Labels | `oklch(45% 0.01 260)` | `oklch(70% 0.01 260)` |
| `--accent` | Brand "signal" | chronometer orange `oklch(68% 0.19 45)` | `oklch(74% 0.17 50)` |

Why orange instead of neon cyan: it reads as "instrument hand" (watch seconds hands, aviation), stays visible in sunlight, and separates us from the sea of cyan tech sites.

**Semantic sync states** — each pairs a hue with an icon and a word: *Locked* (green, solid dot, "±8 ms"), *Drifting* (amber, half dot, "±140 ms"), *Offline* (red, ring, "using device clock").

**Theme set:** System (default), Light, Night, OLED black (pure `#000` for fullscreen), High contrast (WCAG AAA), and user themes for shared countdowns.

## Motion: tick physics

Motion is the second most recognisable part of the brand after the digits, so it must be exact and restrained.

- **The tick lands on the true second.** Digit changes are scheduled from the corrected clock, so the change starts at :00.000 ± a few ms — the visible proof of accuracy.
- **Digit transition:** 120 ms vertical roll with a slight spring (no overshoot on hours/minutes, a tiny one on seconds), GPU-only (`transform`, `opacity`).
- **Sweep mode:** an optional analog dial with a smooth 60/120 fps sweep, or a Swiss-railway "stop-to-go" second hand as an easter-egg theme.
- **Countdown final 10 s:** digits scale up 4% per second and the accent ring closes; at zero, one clean flash, then confetti only if the user opted in.
- **Page transitions:** cross-document View Transitions; the clock keeps its position between city pages so it never "reloads".
- **Reduced motion:** cut to instant changes, no sweep, no confetti; keep everything else identical.

## Key screens

Every page follows the same hierarchy: the answer, the proof of accuracy, then related tools.

&#91;embedded content: home screen wireframe · desktop\]

Only the seconds carry the accent; world cards are solid surfaces, and glass appears only when the search palette opens.

**Other screens, same grammar**

- **World clock:** the globe on top, a horizontal 24-hour "work-hours ribbon" per city below, drag to compare.
- **Countdown:** title, giant remaining time, progress ring, share and fullscreen buttons; editor in a side sheet.
- **Atomic clock:** milliseconds visible, UTC/TAI/GPS rows, live sync graph in the main view (not hidden).
- **Mobile:** digits fill the width, accuracy pill stays under them, tools move to a bottom bar.

## Trust UI patterns

The accuracy layer is our signature component; design it as carefully as the clock itself.

- **Accuracy pill** under every clock: `● Locked · ±8 ms · Frankfurt · synced 12 s ago`. Click opens the sync panel.
- **Sync panel (sheet):** live offset graph of the last 16 samples, RTT, chosen server, tzdata version, leap-second status, and a "Copy proof" button that copies a signed JSON receipt.
- **Device-clock alert:** a calm, dismissible banner — "Your device clock is 2.4 s fast" — with a link to fix it per OS. Never alarming red unless off by more than a minute.
- **Degraded states:** when sync fails the digits stay, the pill turns *Offline* and says "showing your device clock"; we never silently fake accuracy.
- **Data provenance:** footers on city pages show the tz rule source and last change date.
- **Accent discipline:** the brand orange is never used for status, so it can't be confused with *Drifting* amber.

## Signature moments

A few memorable, shareable moments do more for the brand than decoration on every page.

- **Living globe (world clock):** a matte, low-poly Earth with the real-time day/night terminator and city lights, drawn with WebGPU and a WebGL2 fallback. Dragging the time slider moves the terminator — the 3D *explains* time zones. Static SVG fallback on low-end devices.
- **UTC orbit (atomic clock page):** a thin ring whose arc fills with each second, with small markers for each sync sample landing on it — accuracy made visible.
- **Fullscreen "stage" mode:** edge-to-edge digits, OLED black, burn-in pixel shift, auto-hide UI, phone-as-remote via QR code.
- **Live events:** New Year, Ramadan iftar and sehri, launches — the page gathers a live visitor count and a single shared moment at zero.
- **Shareable cards:** every countdown and "my clock is X ms off" result renders a beautiful OG image.
- **Sound design:** an optional, short, warm tick and a soft chime (Web Audio), never on by default.

## Accessibility & performance guardrails

Every design decision must pass these checks before it ships.

| Guardrail | Rule |
| --- | --- |
| Contrast | Digits ≥ 7:1 (AAA), body text ≥ 4.5:1 in every theme; never text on blur |
| Glass budget | Max 2 blurred layers on screen, blur ≤ 16 px, disabled on low-end devices and with `prefers-reduced-transparency` |
| Motion | `prefers-reduced-motion` honoured; no animation loops when nothing changes |
| Screen readers | Time announced on focus or on demand, not every second; countdown milestones via `aria-live="polite"` |
| Keyboard | Every feature reachable by keyboard; command palette on Ctrl/⌘+K; visible focus rings |
| Touch | Targets ≥ 44 px; one-handed fullscreen controls |
| RTL & locale | Mirrored layouts for Urdu/Arabic; locale-correct 12/24 h and numerals |
| Weight | Hero font ≤ 15 KB, page CSS ≤ 20 KB, 3D loads only on interaction |

## Starter design tokens (Tailwind v4)

Drop this into `packages/ui/theme.css`; every component reads tokens, so new themes are a few lines.

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
  --font-clock: "Clock Display", "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-surface-0: oklch(98.5% 0.003 90);
  --color-surface-1: oklch(96% 0.004 90);
  --color-ink: oklch(18% 0.01 260);
  --color-ink-muted: oklch(45% 0.01 260);
  --color-accent: oklch(68% 0.19 45);
  --color-locked: oklch(62% 0.15 150);
  --color-drifting: oklch(75% 0.15 80);
  --color-offline: oklch(58% 0.2 25);

  --radius-card: 14px;
  --ease-tick: cubic-bezier(0.2, 0.9, 0.3, 1.05);
  --duration-tick: 120ms;
}

[data-theme="night"] {
  --color-surface-0: oklch(14% 0.01 260);
  --color-surface-1: oklch(18% 0.012 260);
  --color-ink: oklch(96% 0.005 90);
  --color-ink-muted: oklch(70% 0.01 260);
  --color-accent: oklch(74% 0.17 50);
}

[data-theme="oled"] { --color-surface-0: #000; --color-surface-1: #0a0a0a; }

.clock-digits {
  font-family: var(--font-clock);
  font-variant-numeric: tabular-nums;
  font-size: clamp(3rem, 14vw, 22rem);
  letter-spacing: -0.02em;
  line-height: 1;
}

.glass {
  background: color-mix(in oklch, var(--color-surface-1) 72%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--color-surface-1); backdrop-filter: none; }
}
```

## Sources

- [SF Pro alternatives and license — Inspo AI](https://www.inspoai.io/blogs/sf-pro-font-alternatives)
- [SF fonts as web fonts — Apple Developer Forums](https://developer.apple.com/forums/thread/127350)
- [backdrop-filter performance — OpenReplay](https://blog.openreplay.com/creating-blurred-backgrounds-css-backdrop-filter/)
- [Liquid Glass accessibility — Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/)
- [Apple adds Tinted control after backlash — Gulf News](https://gulfnews.com/technology/companies/apple-yields-tinted-control-in-ios-261-beta-4-tones-down-liquid-glass-after-backlash-1.500315176)
