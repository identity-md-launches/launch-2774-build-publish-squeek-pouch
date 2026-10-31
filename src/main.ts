import './style.css';
import { Game } from './game';
import { BlockWatcher, FeedTracker, SimWheel, type FeedView } from './logic/feed';
import { POLL_MS, STATUS_URL, parseStatus } from './logic/status';
import { START_LIVES, POUCH_CAP, type RoundState } from './logic/rules';
import { loadBest, saveBest } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const stage = $('stage');
const titleScreen = $('title-screen');
const overScreen = $('over-screen');
const playBtn = $<HTMLButtonElement>('play');
const againBtn = $<HTMLButtonElement>('again');
const burrowBtn = $<HTMLButtonElement>('burrow');
const announcer = $('announcer');

const st = {
  dot: $('st-dot'),
  state: $('st-state'),
  rpm: $('st-rpm'),
  height: $('st-height'),
  bar: $('st-bar'),
  barFill: $('st-bar-fill'),
  pct: $('st-pct'),
  boost: $('st-boost'),
  source: $('st-source'),
};
const hud = {
  score: $('hud-score'),
  pouch: $('hud-pouch'),
  lives: $('hud-lives'),
  time: $('hud-time'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let best = loadBest();

const game = new Game(canvas, {
  onHud: renderHud,
  onOver(r: RoundState) {
    if (r.score > best) {
      best = r.score;
      saveBest(best);
    }
    $('over-reason').textContent = r.overReason === 'lives' ? 'Out of lives!' : "Time's up!";
    $('over-score').textContent = String(r.score);
    $('over-best').textContent = `Best: ${best}`;
    overScreen.hidden = false;
    burrowBtn.disabled = true;
    document.body.classList.remove('playing');
    announcer.textContent = `Round over. ${r.score} seeds banked. Best ${best}.`;
    againBtn.focus();
  },
});
game.reducedMotion = reducedMotion.matches;
reducedMotion.addEventListener('change', () => (game.reducedMotion = reducedMotion.matches));

function heart(full: boolean): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="${full ? '#ff8a7a' : 'none'}" stroke="${full ? '#ff8a7a' : '#9d93c2'}" stroke-width="2"/></svg>`;
}

let lastLives = -1;
function renderHud(r: RoundState): void {
  hud.score.textContent = String(r.score);
  hud.pouch.textContent = `${r.pouch}/${POUCH_CAP}`;
  hud.time.textContent = String(Math.ceil(r.timeLeft));
  if (r.lives !== lastLives) {
    lastLives = r.lives;
    let html = '';
    for (let i = 0; i < START_LIVES; i++) html += heart(i < r.lives);
    hud.lives.innerHTML = html;
    hud.lives.setAttribute('aria-label', `${r.lives} ${r.lives === 1 ? 'life' : 'lives'}`);
  }
}
renderHud(game.round);

function renderBest(): void {
  const el = $('best-title');
  el.hidden = best <= 0;
  el.textContent = `Your best: ${best}`;
}
renderBest();

function startRound(e: MouseEvent): void {
  titleScreen.hidden = true;
  overScreen.hidden = true;
  burrowBtn.disabled = false;
  document.body.classList.add('playing');
  watcher.reset();
  watcher.observe(view.blockHeight, false);
  game.start();
  // Keyboard activation (detail 0) keeps focus on a control; pointer users get no ring.
  if (e.detail === 0) burrowBtn.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur();
}
playBtn.addEventListener('click', startRound);
againBtn.addEventListener('click', startRound);
burrowBtn.addEventListener('click', () => game.goHome());

// Canvas sizing with devicePixelRatio scaling.
const ro = new ResizeObserver(() => {
  const rect = stage.getBoundingClientRect();
  game.resize(rect.width, rect.height);
});
ro.observe(stage);

// ---- Live Squeekchain feed ----
const tracker = new FeedTracker();
const watcher = new BlockWatcher();
let sim: SimWheel | null = null;
let view: FeedView = tracker.view(Date.now(), new SimWheel(Date.now()));
let lastReal = true;

function refreshView(): void {
  const now = Date.now();
  if (tracker.simulated && !sim) sim = new SimWheel(now, tracker.last?.blockHeight ?? 1000);
  if (!tracker.simulated) sim = null;
  view = tracker.view(now, sim ?? new SimWheel(now));

  // Switching between real and simulated data must never fire a storm.
  if (view.real !== lastReal) {
    watcher.reset();
    lastReal = view.real;
  }
  if (watcher.observe(view.blockHeight, game.phase === 'playing')) {
    const text = view.real ? `REAL BLOCK #${view.blockHeight} MINED!` : `DEMO BLOCK #${view.blockHeight} (simulated)`;
    game.triggerStorm(text);
    announcer.textContent = `${text} Block Storm: golden seeds for 6 seconds.`;
  }

  game.live = { running: view.running, rpm: view.rpm, boost: view.boost };
  renderStatus(view);
}

function renderStatus(v: FeedView): void {
  let dot = 'resting';
  if (v.mode === 'simulated') dot = 'simulated';
  else if (v.mode === 'stale') dot = 'stale';
  else if (v.coreStatus === 'COUNTER_FAULT') dot = 'fault';
  else if (v.running) dot = 'running';
  st.dot.dataset.state = dot;
  st.state.textContent = v.stateLabel;
  st.rpm.textContent = `${v.rpm.toFixed(v.rpm > 0 && v.rpm < 10 ? 1 : 0)} rpm`;
  const demo = v.real ? '' : v.blockHeight !== null ? ' demo' : '';
  st.height.textContent = v.blockHeight !== null ? `#${v.blockHeight}${demo}` : '#…';
  const pct = v.blockProgress !== null ? v.blockProgress * 100 : 0;
  st.barFill.style.width = `${pct.toFixed(1)}%`;
  st.bar.setAttribute('aria-valuenow', pct.toFixed(0));
  st.pct.textContent = v.blockProgress !== null ? `${pct.toFixed(pct < 10 ? 1 : 0)}%` : '-';
  st.boost.textContent = `x${v.boost.toFixed(1)}`;
  st.source.textContent = v.sourceLabel;
  st.source.dataset.sim = String(v.mode === 'simulated');
}

let inFlight = false;
async function poll(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch(STATUS_URL, { cache: 'no-store', signal: AbortSignal.timeout(4500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tracker.onSuccess(parseStatus(await res.json()));
  } catch {
    tracker.onFailure();
  } finally {
    inFlight = false;
    refreshView();
  }
}
void poll();
setInterval(() => void poll(), POLL_MS);

// ---- Main loop ----
let statusTimer = 0;
function loop(t: number): void {
  // Re-evaluate staleness and the simulated wheel between polls.
  if (t - statusTimer > 250) {
    statusTimer = t;
    refreshView();
  }
  game.frame(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
