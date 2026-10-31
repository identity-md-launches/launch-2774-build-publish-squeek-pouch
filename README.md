# Squeek Pouch

A cozy single-page arcade game for **Squeekchain**, the hamster-powered proof-of-work toychain on Ethereum Sepolia (chainId 11155111). You play a hamster catching seeds in its cheek pouches. The real hamster Squeektoshi's wheel and real Squeek blocks change the game while you play.

Static site only: HTML, CSS and TypeScript built with Vite. No backend, wallet, tokens, wagering, analytics or accounts. **Points only - no wallet, no tokens.** The only thing stored is your local best score (`localStorage` key `squeek-pouch-best`).

The production export is committed in `dist/` with relative asset URLs (`base: './'`), so it works from an IPFS gateway subpath or an ENS name. The publisher pins `dist/` to IPFS as-is.

## Gameplay

- **Move:** drag or touch on the field (mobile), or use the arrow keys or A/D (desktop).
- **Catch:** a sunflower seed adds +1 to the pouch, a golden **SQK** seed adds +5.
- **Pouch:** holds 15. The cheeks swell as it fills, and you slow down by up to 55% when it is full (`speed = 1 - 0.55 * pouch/15`). A full pouch can't take more seeds, and any overflow past 15 is lost.
- **Pebbles:** each hit costs 1 of your 3 lives and spills every unbanked seed. You then get about a second of blinking invulnerability.
- **Bank:** run to the burrow at the left edge, or press **Burrow** / Space to auto-run home. The pouch is added to your score there. Only banked seeds count.
- **Round:** 90 seconds. Fall speed, spawn rate and pebble rate ramp up over the round. The game ends when time is up or you reach 0 lives. You then see your final banked score, your local best and a **Play again** button.

## Squeekchain live data

Source: `GET https://api.squeekchain.com/v1/status` (public, CORS). The browser polls it every 5 seconds (`src/main.ts`, `POLL_MS` in `src/logic/status.ts`). No other endpoint is used.

| Field | How it is used |
| --- | --- |
| `measurement.coreStatus` | `ACTIVE` = Squeektoshi is running (warm, lit scene; boost; faster spawns). `IDLE` = resting (night palette, x1). `COUNTER_FAULT` = shown as "Wheel counter fault", treated as resting. |
| `measurement.rpmMilli` | rpm = `rpmMilli / 1000`. Shown in the status panel. Drives the background wheel's rotation (rev/min converted to rad/s) and the Wheel Boost. |
| `measurement.freshness` | `"stale"` makes the reading count as idle and labels it stale. |
| `measurement.observedAt` | ISO string, epoch seconds or epoch ms. If it is older than `staleAfterSeconds`, the reading is stale. This is re-checked 4 times a second, between polls too. |
| `measurement.staleAfterSeconds` | The staleness window. Defaults to 30 s only if the field is missing. |
| `measurement.provenance` | Shown in brackets on the data-source line, e.g. "Live from api.squeekchain.com (…)". |
| `measurement.distanceMm` | Shown on the data-source line as "wheel ran 1.2 km" (or metres under 1 km). |
| `builder.projected.blockHeight` | Squeek block height in the status panel. An increase during a round triggers a **Block Storm**. |
| `builder.projected.blockProgress` | Progress to the next block, in units where 1,000,000,000 = 100%. Shown as a % and a progress bar. |
| `builder.anchor.*` | Fallback for both block fields when `builder.projected` is missing. |

Numbers are accepted as JSON numbers or numeric strings (`src/logic/status.ts`).

**Wheel Boost.** While Squeektoshi is `ACTIVE` and the data is fresh, every bank deposit is multiplied by `min(3, 1 + rpm/40)` and rounded to whole seeds. Idle, stale or faulted data gives x1. While `ACTIVE`, seeds also spawn 25% faster and fall 15% faster.

**Block Storm.** The first height seen only sets a baseline. When `blockHeight` rises above the highest height seen while a round is in progress, a 6-second storm starts. Seeds come in quickly and are mostly golden (85%), with 5% pebbles, under the banner **"REAL BLOCK #<height> MINED!"**. The same height never triggers twice. Lower heights never trigger. Switching between real and simulated data resets the baseline, so the switch itself never fires a storm (`BlockWatcher` in `src/logic/feed.ts`).

**Visuals.** The big background wheel turns at the live rpm, capped at 240 rpm for drawing, or 20 rpm with reduced motion. The scene eases into a warm, lit palette while the hamster runs and back to the night palette when it rests.

**Status panel.** It shows a coloured dot with the running/resting/stale/fault/demo state, the rpm, the Squeek block height, the % of the next block with a progress bar, the current Wheel Boost, and a line naming the data source.

### Fallback behaviour

- One failed poll keeps the last real reading, still checked for staleness.
- **Two failed polls in a row** switch to a simulated wheel. The source line then reads **"Offline demo - SIMULATED data, not real"** in amber, the dot becomes a hollow ring, the state reads "Demo wheel running/resting", and the block height is suffixed "demo". Demo blocks bring a storm with the banner "DEMO BLOCK #n (simulated)", never "REAL BLOCK". Simulated data is never presented as real.
- The next successful poll switches back to live data automatically.
- Stale data (`freshness: "stale"`, or `observedAt` older than `staleAfterSeconds`) counts as idle (x1, wheel stopped, night palette) and is labelled "Data stale - counted as resting" / "Stale from api.squeekchain.com".

> Limitation: from the build machine, `api.squeekchain.com` answered with a Cloudflare challenge page (HTTP 403), not JSON. So the field names above follow the brief and could not be checked against a live response. The parser is defensive: missing fields fall back as described, and a missing `measurement` block counts as a failed poll.

## Run locally

Requires Node 20+ (tested on Node 24).

```sh
npm install          # install dependencies (package-lock.json is committed)
npm run dev          # dev server with hot reload
npm run build        # typecheck (tsc --noEmit) + production build into dist/
npm run preview      # serve the built dist/ locally
npm test             # unit tests (Vitest)
npm run test:browser # headless Chromium check of dist/ (needs `npx playwright install chromium` once)
```

Rebuild after any source change and commit `dist/` together with the source. The publisher serves the committed export and does not rebuild.

## Project layout

```
index.html              page shell, share metadata, title/game-over overlays
public/                 favicon.svg, og.png (copied to dist/)
src/main.ts             DOM wiring, polling, status panel, HUD
src/game.ts             game loop, input, collisions, canvas rendering
src/draw.ts             hamster, wheel, burrow, seeds and pebbles drawn in code
src/logic/status.ts     API parsing, staleness, boost formula
src/logic/feed.ts       live/stale/simulated state machine, block watcher, simulated wheel
src/logic/rules.ts      pouch, banking, pebbles, clock, difficulty
src/storage.ts          local best score
src/assets/fonts/       Nunito variable font, latin subset (SIL OFL 1.1, via @fontsource-variable/nunito)
tests/unit/             Vitest unit tests
tests/browser/smoke.mjs headless browser check
dist/                   committed production export
```

## Verification (worker run, 2026-10-31)

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed, no errors |
| `npm test` | 1 file, **36/36 tests passed**: boost formula, block-progress parsing, block-height detection (no trigger on first load, no duplicate for the same height, no trigger after a reset/source switch), stale/offline switching and labels, recovery, pouch cap, slowdown, banking, pebbles, clock, spawn tuning |
| `npm run build` | passed. `dist/index.html` 4.7 kB, JS 23.3 kB (8.6 kB gzip), CSS ~6 kB, font 39 kB |
| `npm run test:browser` | **28/28 checks passed** in headless Chromium (Playwright 1.64.1) against `dist/` served under a subpath, with the API mocked by a fixture |
| design probe `taste.mjs` | **16/16 checks passed** at 320, 390 and 1440 wide |

The browser check covers: no console errors or failed local requests (mobile and desktop), status values derived from the fixture (rpm, x2.5 boost, block #, 38%), share metadata, title and Play button on the first screen at 390×844 and 320×568, no page scroll, `touch-action: none` and devicePixelRatio scaling on the canvas, Play/drag/arrow keys/Space/Burrow, the timer counting down, a block-height increase producing the "REAL BLOCK #4243 MINED!" storm, two failed polls switching to the SIMULATED label, automatic recovery, stale data labelled and unboosted, and keyboard Tab/Enter to start.

Not verified: a real response from the live API (Cloudflare blocked this machine), physical iPhone Safari (only emulated touch in Chromium was used), a screen-reader session, and a full 90-second round or game over by lives in the browser (the end-of-round rules are unit tested). See `artifacts/validation.md` for the design review.
