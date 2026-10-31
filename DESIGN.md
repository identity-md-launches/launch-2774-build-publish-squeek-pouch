# DESIGN.md - Squeek Pouch

The design system as built. The source of truth is the CSS custom properties in `src/style.css`, the markup in `index.html` and the canvas drawing code in `src/draw.ts` / `src/game.ts`. Rendered behaviour was confirmed in headless Chromium at 320×568, 390×844 and 1440×900 (see `artifacts/validation.md`).

## Overview

A cozy night-time arcade game. One column holds the live status panel, the HUD, the game canvas, the controls and a footer, all fitted into the viewport (`.app` uses `height: 100dvh`). The canvas is the hero. Text is short and playful. Purple night tones carry the chrome, and a single warm orange marks the main action and the game's title. The canvas scene shifts from a night palette to a warm lit palette when the real hamster is running.

## Colors

CSS roles in `src/style.css` (`:root`):

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#1b1430` | Page and stage background (the brief's night purple) |
| `--surface` | `#261c44` | Status panel |
| `--surface-2` | `#34275c` | Progress-bar track, secondary (Burrow) button |
| `--accent` | `#ffb43b` | The one filled action (Play / Play again), title, progress fill, "Points only" line, footer link |
| `--accent-press` | `#f29e17` | Hover state of the primary button |
| `--on-accent` | `#1b1430` | Text on the accent fill |
| `--text` | `#fff3dc` | Cream body text |
| `--text-muted` | `#d2c6e6` | Labels, source line, footer, hint, best score |
| `--run` | `#7fe08e` | Status dot: running |
| `--rest` | `#9d93c2` | Status dot: resting / connecting; empty heart outline |
| `--stale` | `#ffcf70` | Status dot: stale; hollow ring and source text in the SIMULATED demo |
| `--fault` | `#ff8a7a` | Status dot: counter fault; full hearts |
| `--focus` | `#fff3dc` | 3px focus outline |

Overlays: `.overlay` is `rgba(27,20,48,0.55)` over the canvas, and `.card` is `rgba(27,20,48,0.92)`.

Canvas palettes (`src/draw.ts`, `NIGHT` → `WARM`, interpolated by `paletteFor(warmth)`):

- Sky top `#1b1430` → `#3d1f45`, sky bottom `#2e2152` → `#d9773f`
- Ground `#3a2a5c` → `#a8683c`, ground shade `#2a1e45` → `#7c4a2a`
- Wheel `#7a68ad` → `#ffd08f` (drawn at 42% opacity), burrow mound `#4a3566` → `#6e4026`

Sprite inks: fur `#e9a25a`, cream `#fbe6c6`, cheek pouch `#f7c995`, outline `#4a2a1c`, sunflower seed `#3d3446` with `#e9e1d2` stripes, golden seed `#ffc93b` with "SQK" in `#7a3f05`, pebble `#9b93a8` outlined `#2a2433`.

State is never shown by colour alone: every dot has a text label beside it, and the simulated state also changes the dot's shape to a hollow ring.

## Typography

- Family: **Nunito** variable (latin subset, self-hosted at `src/assets/fonts/nunito-latin-wght-normal.woff2`, `font-display: swap`). The fallback stack is `ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif` (`--font`).
- Weights: 500 (body), 700 (key cap, footer link), 800 (headings, labels, values, buttons). Canvas text uses 700-900.
- Scale (five sizes):

| Token | Size | Used for |
| --- | --- | --- |
| `--fs-sm` | 13px (0.8125rem) | Source line, HUD labels, key cap, footer; card copy on short screens |
| `--fs-base` | 15px (0.9375rem) | Body, status rows, rules |
| `--fs-md` | 18px (1.125rem) | HUD values, buttons |
| `--fs-lg` | 24px (1.5rem) | "Round over", final score; the title on short screens |
| `--fs-xl` | 34px (2.125rem) | "Squeek Pouch" title |

- Line height is 1.45 for body and 1.1 for headings. Changing numbers (rpm, %, block, HUD) use `font-variant-numeric: tabular-nums` (`.num`). Headings use `text-wrap: balance` and card copy uses `text-wrap: pretty`. There is no letter-spacing and no uppercase transforms.

## Layout

- Spacing tokens: `--sp-1` 4px, `--sp-2` 8px, `--sp-3` 12px, `--sp-4` 16px, `--sp-5` 24px.
- `.app` is a flex column, max 760px wide and centred, `height: 100dvh` (min 520px), with safe-area insets as padding. `.game` and `.stage` flex to fill the remaining height, so the canvas takes whatever the other rows leave.
- The canvas is backed by `cssSize × devicePixelRatio` (capped at 3). The world is 600 units tall, and its width follows the stage's aspect ratio, so the field is wider on desktop and taller on phones.
- While a round runs, `body.playing` sets `overflow: hidden` and `overscroll-behavior: none`. The canvas has `touch-action: none`.

### Responsive behaviour

- **< 720px wide:** the status panel stacks three rows (state + rpm; block + bar + % + boost; source line). The HUD has four columns.
- **≥ 720px wide:** the status panel becomes a two-column grid with more padding and the source line spans both columns. Gaps grow to 12px.
- **≤ 740px tall:** the title card becomes a flex column. The Play button moves directly under the title (`order: -1`), card copy drops to `--fs-sm` and the title to `--fs-lg`, so Play stays visible without scrolling on 320×568. The overlay still scrolls (`overflow-y: auto`) as a last resort.
- **Reduced motion:** the status-dot pulse, the bar transition and the button transitions are off. The canvas wheel turns at most 20 rpm, stars stop twinkling, the hamster stops bobbing and there are fewer particles.

## Elevation & Depth

Flat. Surfaces are separated by tone (`--bg` → `--surface` → `--surface-2`) and by the translucent overlay over the canvas. There are no shadows or borders on surfaces. The only `box-shadow` is the inset ring of the simulated-data dot.

## Shapes

`--radius` 16px (status panel), `--radius-lg` 22px (stage, title/round-over card), pill `999px` (buttons, progress bar), 6px (key cap), a 12px circle (status dot). Canvas shapes are round and outlined with 2-2.5px dark-brown strokes for a hand-drawn feel.

## Components

- **Status panel** (`section.status`): dot `#st-dot[data-state=running|resting|stale|fault|simulated|connecting]`, state label `#st-state`, `#st-rpm`, `#st-height`, progress bar `#st-bar` (`role="progressbar"`, 0-100) with `#st-bar-fill`, `#st-pct`, `#st-boost`, source line `#st-source[data-sim]` (amber and bold when simulated).
- **HUD** (`.hud`): Banked, Pouch `x/15`, Lives (three SVG hearts, `role="img"` with an `aria-label` like "2 lives"), Time.
- **Stage** (`.stage`): the canvas plus overlays `#title-screen` and `#over-screen` (`.overlay > .card`).
- **Buttons** (`.btn`): pill, 52px tall (48px on short screens), 800 weight, press scale 0.97, 3px cream `:focus-visible` outline. `.btn.primary` (accent fill) is the one filled action per view: Play / Play again. `.btn.burrow` is the secondary surface button with a `.key` cap reading "Space". It is disabled outside a round.
- **Canvas sprites** (`src/draw.ts`): `drawHamster` (cheek pouch radius `7 + 12 × fill`), `drawWheel`, `drawBurrow` (with a "Bank" sign and a glowing rim while the pouch has seeds), `drawSeed` (sunflower or golden "SQK"), `drawPebble`. Canvas-only UI in `src/game.ts`: floating "+n x1.8" deposit text and the Block Storm banner, whose headline font shrinks to fit the banner width.
- **Announcer** (`#announcer`, visually hidden, `aria-live="polite"`): Block Storm and round-over messages.

## Do's and Don'ts

- Do keep one filled orange action per view, and keep Play on the first screen at every size.
- Do label simulated data "Offline demo - SIMULATED data, not real" and never mark a demo block as "REAL".
- Do add new sizes only from the five-step scale and new colours as role tokens in `:root`.
- Don't add uppercase eyebrow labels, letter-spacing, borders plus shadows, or a sixth font size.
- Don't let the title card's prose grow past about 60 words on the first screen at 390 wide.
- Don't store anything beyond `squeek-pouch-best` in `localStorage`.
