// Headless browser check of the production export in dist/.
// Serves dist/ under a subpath (like an IPFS gateway), mocks the Squeekchain API
// so the run is deterministic, and checks: no console errors, title screen and
// Play button on the first screen, play controls, Block Storm on a height
// increase, the labelled offline fallback, and automatic recovery.
//
// Usage: npm run build && node tests/browser/smoke.mjs [screenshot-dir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const DIST = resolve('dist');
const SHOTS = resolve(process.argv[2] ?? join(tmpdir(), 'squeek-pouch-shots'));
const API = 'https://api.squeekchain.com/v1/status';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/ipfs/demo/')) {
    res.writeHead(404).end();
    return;
  }
  let p = url.pathname.slice('/ipfs/demo/'.length) || 'index.html';
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/ipfs/demo/`;

let height = 4242;
let apiMode = 'ok'; // 'ok' | 'fail'
const fixture = () => ({
  measurement: {
    coreStatus: 'ACTIVE',
    rpmMilli: 60000,
    freshness: 'online',
    observedAt: new Date().toISOString(),
    staleAfterSeconds: 30,
    provenance: 'test-fixture',
    distanceMm: 1234567,
  },
  builder: { projected: { blockHeight: height, blockProgress: 375000000 } },
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

async function openPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => r.url() !== API && errors.push(`requestfailed ${r.url()}`));
  await page.route(API, (route) =>
    apiMode === 'ok'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fixture()) })
      : route.abort('failed'),
  );
  await page.goto(BASE);
  return { ctx, page, errors };
}

try {
  // ---- Mobile 390 x 844 ----
  const { ctx, page, errors } = await openPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await page.waitForFunction(() => document.getElementById('st-state')?.textContent === 'Squeektoshi is running', null, { timeout: 8000 });
  check('live status shows running', true);
  check('rpm from rpmMilli', (await page.textContent('#st-rpm')) === '60 rpm', await page.textContent('#st-rpm'));
  check('boost min(3, 1 + 60/40)', (await page.textContent('#st-boost')) === 'x2.5', await page.textContent('#st-boost'));
  check('block height from builder.projected', (await page.textContent('#st-height')) === '#4242');
  check('block progress 375000000 = 37.5%', (await page.textContent('#st-pct')) === '38%', await page.textContent('#st-pct'));
  check('source line names the API', (await page.textContent('#st-source')).includes('api.squeekchain.com'));

  const meta = await page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.content,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    icon: document.querySelector('link[rel=icon]')?.getAttribute('href'),
  }));
  check('share metadata present', Boolean(meta.title && meta.desc && meta.ogTitle && meta.ogImage && meta.icon), JSON.stringify(meta));

  const first = await page.evaluate(() => {
    const play = document.getElementById('play').getBoundingClientRect();
    const h1 = document.querySelector('h1').getBoundingClientRect();
    const clip = document.getElementById('title-screen').getBoundingClientRect();
    return {
      playVisible: play.bottom <= innerHeight && play.top >= 0 && play.top >= clip.top && play.bottom <= clip.bottom,
      h1Visible: h1.top >= 0 && h1.bottom <= innerHeight,
      hScroll: document.documentElement.scrollWidth > innerWidth,
      vScroll: document.documentElement.scrollHeight > innerHeight,
      points: document.body.textContent.includes('Points only - no wallet, no tokens'),
      footer: document.querySelector('footer').textContent.includes('Built for Squeekchain - live data from api.squeekchain.com'),
      link: document.querySelector('footer a').href,
      touchAction: getComputedStyle(document.getElementById('game')).touchAction,
      canvasPx: document.getElementById('game').width,
      canvasCss: document.getElementById('game').getBoundingClientRect().width,
    };
  });
  check('title and Play button on first screen at 390', first.playVisible && first.h1Visible);
  check('no page scroll at 390x844', !first.hScroll && !first.vScroll);
  check('points-only line and footer present', first.points && first.footer && first.link === 'https://squeekchain.com/');
  check('canvas touch-action none', first.touchAction === 'none');
  check('canvas scaled by devicePixelRatio', Math.abs(first.canvasPx - first.canvasCss * 2) <= 2, `${first.canvasPx}px for ${first.canvasCss} css`);
  await page.screenshot({ path: join(SHOTS, 'mobile-title.png') });

  await page.tap('#play');
  await page.waitForTimeout(300);
  check('Play hides the title screen', await page.isHidden('#title-screen'));
  check('Burrow button enabled while playing', await page.isEnabled('#burrow'));
  check('body locked while playing', await page.evaluate(() => document.body.classList.contains('playing')));

  // Drag on the canvas, keys and burrow should all work without errors.
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.8, { steps: 8 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  await page.tap('#burrow');
  const t0 = Number(await page.textContent('#hud-time'));
  await page.waitForTimeout(1500);
  const t1 = Number(await page.textContent('#hud-time'));
  check('round timer counts down from 90', t0 <= 90 && t1 < t0, `${t0} -> ${t1}`);
  check('pouch HUD shows x/15', /^\d+\/15$/.test(await page.textContent('#hud-pouch')));

  // A real block is mined while the round runs.
  height += 1;
  await page.waitForFunction(() => document.getElementById('announcer').textContent.includes('REAL BLOCK #4243 MINED!'), null, { timeout: 8000 });
  check('height increase triggers Block Storm banner', true);
  await page.screenshot({ path: join(SHOTS, 'mobile-storm.png') });
  check('no console errors with live data (mobile)', errors.length === 0, errors.join(' | '));

  // API goes down: two failures -> labelled simulation.
  apiMode = 'fail';
  await page.waitForFunction(() => document.getElementById('st-source').textContent === 'Offline demo - SIMULATED data, not real', null, { timeout: 14000 });
  check('two failed polls switch to labelled SIMULATED demo', true);
  check('simulated block height is marked demo', (await page.textContent('#st-height')).includes('demo'));
  await page.screenshot({ path: join(SHOTS, 'mobile-offline.png') });

  apiMode = 'ok';
  await page.waitForFunction(() => document.getElementById('st-source').textContent.startsWith('Live from'), null, { timeout: 8000 });
  check('live data resumes automatically', true);
  await ctx.close();

  // ---- Stale data ----
  {
    const stale = await openPage({ width: 390, height: 844 });
    await stale.page.unroute(API);
    await stale.page.route(API, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...fixture(), measurement: { ...fixture().measurement, freshness: 'stale' } }) }),
    );
    await stale.page.reload();
    await stale.page.waitForFunction(() => document.getElementById('st-source').textContent.startsWith('Stale'), null, { timeout: 8000 });
    check('stale data labelled stale and not boosted', (await stale.page.textContent('#st-boost')) === 'x1.0');
    await stale.ctx.close();
  }

  // ---- Desktop 1440 x 900 ----
  const d = await openPage({ width: 1440, height: 900 }, { deviceScaleFactor: 1 });
  await d.page.waitForFunction(() => document.getElementById('st-state')?.textContent === 'Squeektoshi is running', null, { timeout: 8000 });
  const dl = await d.page.evaluate(() => {
    const play = document.getElementById('play').getBoundingClientRect();
    const clip = document.getElementById('title-screen').getBoundingClientRect();
    return { hScroll: document.documentElement.scrollWidth > innerWidth, playVisible: play.top >= clip.top && play.bottom <= clip.bottom };
  });
  check('desktop: no horizontal scroll, Play visible', !dl.hScroll && dl.playVisible);
  await d.page.keyboard.press('Tab');
  const focused = await d.page.evaluate(() => document.activeElement?.id);
  check('keyboard reaches Play first', focused === 'play', focused);
  await d.page.keyboard.press('Enter');
  await d.page.waitForTimeout(200);
  check('Enter on Play starts the round', await d.page.isHidden('#title-screen'));
  await d.page.keyboard.down('d');
  await d.page.waitForTimeout(300);
  await d.page.keyboard.up('d');
  await d.page.screenshot({ path: join(SHOTS, 'desktop-play.png') });
  check('no console errors (desktop)', d.errors.length === 0, d.errors.join(' | '));
  await d.ctx.close();

  // ---- 320 wide ----
  const s = await openPage({ width: 320, height: 568 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await s.page.waitForTimeout(800);
  const sl = await s.page.evaluate(() => {
    const play = document.getElementById('play').getBoundingClientRect();
    const clip = document.getElementById('title-screen').getBoundingClientRect();
    return {
      hScroll: document.documentElement.scrollWidth > innerWidth,
      // Visible inside the overlay's own scroll box, not just the viewport.
      playVisible: play.top >= clip.top && play.bottom <= clip.bottom && play.bottom <= innerHeight,
    };
  });
  check('320x568: no horizontal scroll, Play reachable', !sl.hScroll && sl.playVisible, JSON.stringify(sl));
  await s.page.screenshot({ path: join(SHOTS, 'small-title.png') });
  await s.ctx.close();
} catch (e) {
  check('smoke run completed', false, String(e));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
