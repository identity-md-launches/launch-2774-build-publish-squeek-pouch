// Game loop, entities and canvas rendering for Squeek Pouch.
import {
  POUCH_CAP,
  ROUND_SECONDS,
  STORM_SECONDS,
  bank,
  catchSeed,
  cheekFill,
  hitPebble,
  newRound,
  spawnParams,
  speedFactor,
  tickClock,
  type RoundState,
} from './logic/rules';
import { drawBurrow, drawHamster, drawPebble, drawSeed, drawWheel, paletteFor, type Palette } from './draw';

export const WORLD_H = 600;
const GROUND_H = 64;
const BURROW_X = 70;
const BASE_SPEED = 380;
const HAMSTER_Y_OFFSET = 6;

type DropKind = 'seed' | 'golden' | 'pebble';
interface Drop {
  kind: DropKind;
  x: number;
  y: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export type Phase = 'title' | 'playing' | 'over';

export interface LiveInputs {
  running: boolean;
  rpm: number;
  boost: number;
}

export interface GameEvents {
  onHud(s: RoundState, boost: number): void;
  onOver(s: RoundState): void;
}

export class Game {
  phase: Phase = 'title';
  round: RoundState = newRound();
  live: LiveInputs = { running: false, rpm: 0, boost: 1 };
  reducedMotion = false;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private worldW = 400;
  private scale = 1;

  private x = 200;
  private facing: 1 | -1 = 1;
  private walk = 0;
  private hurt = 0;
  private munch = 0;
  private autoHome = false;
  private keys = new Set<string>();
  private pointerX: number | null = null;

  private drops: Drop[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private spawnTimer = 0.6;
  private stormLeft = 0;
  private bannerText = '';
  private bannerLeft = 0;

  private wheelAngle = 0;
  private warmth = 0;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];
  private last = 0;
  private hudTimer = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    for (let i = 0; i < 60; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.6, tw: Math.random() * 6 });
    }
    this.bindInput();
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.scale = this.cssH / WORLD_H;
    this.worldW = this.cssW / this.scale;
    this.x = Math.min(Math.max(this.x, this.minX), this.maxX);
  }

  private get minX(): number {
    return 34;
  }
  private get maxX(): number {
    return this.worldW - 34;
  }
  private get groundY(): number {
    return WORLD_H - GROUND_H;
  }

  start(): void {
    this.round = newRound();
    this.phase = 'playing';
    this.drops = [];
    this.particles = [];
    this.texts = [];
    this.spawnTimer = 0.8;
    this.stormLeft = 0;
    this.bannerLeft = 0;
    this.autoHome = false;
    this.hurt = 0;
    this.x = Math.max(this.worldW * 0.5, BURROW_X + 60);
    this.events.onHud(this.round, this.live.boost);
  }

  /** Burrow button / Space: run home and bank. */
  goHome(): void {
    if (this.phase !== 'playing') return;
    this.autoHome = true;
  }

  /** A real (or clearly labelled demo) block was mined during the round. */
  triggerStorm(text: string): void {
    if (this.phase !== 'playing') return;
    this.stormLeft = STORM_SECONDS;
    this.bannerText = text;
    this.bannerLeft = STORM_SECONDS;
  }

  get storming(): boolean {
    return this.stormLeft > 0;
  }

  frame(t: number): void {
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    this.update(dt, t / 1000);
    this.render(t / 1000);
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'playing') return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'A' || k === 'd' || k === 'D') {
        this.keys.add(k.toLowerCase());
        this.autoHome = false;
        e.preventDefault();
      } else if (k === ' ' || k === 'Spacebar') {
        this.goHome();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    const toWorld = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * this.worldW;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'playing') return;
      this.canvas.setPointerCapture(e.pointerId);
      this.pointerX = toWorld(e.clientX);
      this.autoHome = false;
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.pointerX === null) return;
      this.pointerX = toWorld(e.clientX);
      e.preventDefault();
    });
    const end = () => {
      this.pointerX = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('lostpointercapture', end);
  }

  private update(dt: number, time: number): void {
    // Background wheel spins at the real rpm (rev/min -> rad/s).
    const visRpm = Math.min(this.live.rpm, this.reducedMotion ? 20 : 240);
    this.wheelAngle += ((visRpm * Math.PI * 2) / 60) * dt;
    const targetWarm = this.live.running ? 1 : 0;
    this.warmth += (targetWarm - this.warmth) * Math.min(1, dt * 1.2);

    this.updateParticles(dt);
    if (this.phase !== 'playing') {
      this.walk += dt * 2;
      return;
    }

    const r = this.round;
    tickClock(r, dt);
    this.stormLeft = Math.max(0, this.stormLeft - dt);
    this.bannerLeft = Math.max(0, this.bannerLeft - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.munch = Math.max(0, this.munch - dt);

    // Movement.
    const speed = BASE_SPEED * speedFactor(r.pouch);
    let dir = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) dir -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) dir += 1;
    let dx = 0;
    if (dir !== 0) {
      dx = dir * speed * dt;
    } else if (this.pointerX !== null) {
      const diff = this.pointerX - this.x;
      dx = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    } else if (this.autoHome) {
      dx = -speed * dt;
    }
    if (Math.abs(dx) > 0.01) {
      this.facing = dx > 0 ? 1 : -1;
      this.walk += Math.abs(dx) * 0.08;
    }
    this.x = Math.min(this.maxX, Math.max(this.minX, this.x + dx));

    // Banking at the burrow.
    if (this.x <= BURROW_X) {
      this.autoHome = false;
      if (r.pouch > 0) {
        const boost = this.live.boost;
        const { deposit } = bank(r, boost);
        const label = boost > 1.005 ? `+${deposit}  x${boost.toFixed(1)}` : `+${deposit}`;
        this.texts.push({ x: BURROW_X + 10, y: this.groundY - 90, text: label, life: 1.4, color: '#ffb43b' });
        this.burst(BURROW_X - 20, this.groundY - 20, '#ffd27a', 14);
      }
    }

    // Spawning.
    const progress = 1 - r.timeLeft / ROUND_SECONDS;
    const sp = spawnParams(progress, this.live.running, this.storming);
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += sp.interval * (0.75 + Math.random() * 0.5);
      const roll = Math.random();
      let kind: DropKind;
      if (roll < sp.pebbleChance) kind = 'pebble';
      else if (Math.random() < sp.goldenChance) kind = 'golden';
      else kind = 'seed';
      this.drops.push({
        kind,
        x: 40 + Math.random() * (this.worldW - 80),
        y: -20,
        vy: sp.fallSpeed * (0.85 + Math.random() * 0.3),
        r: kind === 'pebble' ? 15 : kind === 'golden' ? 15 : 12,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 4,
      });
    }

    // Falling and collisions.
    const headX = this.x + this.facing * 14;
    const headY = this.groundY - 44 - HAMSTER_Y_OFFSET;
    const bodyY = this.groundY - 26;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      let remove = false;
      if (d.kind === 'pebble') {
        const ddx = d.x - this.x;
        const ddy = d.y - bodyY;
        if (Math.abs(ddx) < 30 + d.r * 0.6 && Math.abs(ddy) < 34 + d.r * 0.5 && this.hurt <= 0) {
          const { spilled } = hitPebble(r);
          this.hurt = 1.1;
          this.autoHome = false;
          this.burst(this.x, this.groundY - 30, '#e6c79c', 10 + spilled * 2);
          this.texts.push({
            x: this.x,
            y: this.groundY - 100,
            text: spilled > 0 ? `Ouch! -${spilled} seeds` : 'Ouch!',
            life: 1.2,
            color: '#ff8a7a',
          });
          remove = true;
        }
      } else {
        const ddx = d.x - headX;
        const ddy = d.y - headY;
        if (ddx * ddx + ddy * ddy < (36 + d.r) * (36 + d.r)) {
          const res = catchSeed(r, d.kind);
          if (res.caught) {
            this.munch = 0.25;
            if (d.kind === 'golden') this.burst(d.x, d.y, '#ffd84a', 8);
            this.texts.push({
              x: d.x,
              y: d.y - 10,
              text: r.pouch >= POUCH_CAP ? 'Pouch full!' : `+${res.added}`,
              life: 0.8,
              color: d.kind === 'golden' ? '#ffd84a' : '#fff3dc',
            });
            remove = true;
          }
        }
      }
      if (!remove && d.y > this.groundY + 10) {
        if (d.kind === 'pebble') this.burst(d.x, this.groundY, '#8a7f9e', 4);
        remove = true;
      }
      if (remove) this.drops.splice(i, 1);
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0 || r.over) {
      this.hudTimer = 0.1;
      this.events.onHud(r, this.live.boost);
    }
    if (r.over) {
      this.phase = 'over';
      this.drops = [];
      this.stormLeft = 0;
      this.bannerLeft = 0;
      this.events.onOver(r);
    }
    void time;
  }

  private burst(x: number, y: number, color: string, n: number): void {
    const count = this.reducedMotion ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.7 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y = Math.min(this.groundY + 4, p.y + p.vy * dt);
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 40 * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  private render(time: number): void {
    const ctx = this.ctx;
    const W = this.worldW;
    const H = WORLD_H;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    const pal: Palette = paletteFor(this.warmth);

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars fade out as the scene warms up.
    const starAlpha = 1 - this.warmth;
    if (starAlpha > 0.02) {
      ctx.fillStyle = '#fff3dc';
      for (const s of this.stars) {
        const tw = this.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(time * 1.5 + s.tw);
        ctx.globalAlpha = starAlpha * tw * 0.8;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Lamp glow when the hamster is running.
    if (this.warmth > 0.02) {
      const g = ctx.createRadialGradient(W * 0.62, H * 0.38, 10, W * 0.62, H * 0.38, H * 0.55);
      g.addColorStop(0, `rgba(255,190,90,${0.35 * this.warmth})`);
      g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    const wheelR = Math.min(W * 0.38, H * 0.3);
    drawWheel(ctx, Math.max(wheelR + 20, W * 0.62), H * 0.4, wheelR, this.wheelAngle, pal);

    // Ground.
    ctx.fillStyle = pal.ground;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY + 8);
    for (let x = 0; x <= W + 40; x += 40) {
      ctx.quadraticCurveTo(x + 20, this.groundY - 4, x + 40, this.groundY + 8);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.groundDark;
    ctx.fillRect(0, this.groundY + 30, W, H - this.groundY - 30);

    drawBurrow(ctx, 0, this.groundY, pal, this.phase === 'playing' && this.round.pouch > 0, time);

    // Drops.
    for (const d of this.drops) {
      if (d.kind === 'pebble') drawPebble(ctx, d.x, d.y, d.r, d.rot);
      else drawSeed(ctx, d.x, d.y, d.r, d.rot, d.kind === 'golden', time);
    }

    // Hamster (blinks while invulnerable after a hit).
    const visible = this.hurt <= 0 || Math.floor(this.hurt * 10) % 2 === 0;
    if (visible) {
      const fill = this.phase === 'playing' ? cheekFill(this.round.pouch) : 0.15;
      const bob = this.reducedMotion ? 0 : Math.sin(this.walk) * 2;
      drawHamster(ctx, this.x, this.groundY - HAMSTER_Y_OFFSET + bob, this.facing, fill, this.walk, this.munch > 0, this.hurt > 0);
    }

    // Particles.
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating texts.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 2));
      ctx.font = '800 22px "Nunito", ui-rounded, system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(27,20,48,0.85)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // Block Storm banner.
    if (this.bannerLeft > 0) {
      const a = Math.min(1, this.bannerLeft * 2, (STORM_SECONDS - this.bannerLeft) * 4);
      ctx.globalAlpha = a;
      const bw = Math.min(W - 24, 460);
      const bx = (W - bw) / 2;
      ctx.fillStyle = 'rgba(27,20,48,0.88)';
      roundRect(ctx, bx, 70, bw, 74, 18);
      ctx.fill();
      ctx.fillStyle = '#ffb43b';
      ctx.font = '800 26px "Nunito", ui-rounded, system-ui, sans-serif';
      const fit = Math.min(26, Math.floor((26 * (bw - 32)) / ctx.measureText(this.bannerText).width));
      ctx.font = `800 ${fit}px "Nunito", ui-rounded, system-ui, sans-serif`;
      ctx.fillText(this.bannerText, W / 2, 98);
      ctx.fillStyle = '#fff3dc';
      ctx.font = '700 16px "Nunito", ui-rounded, system-ui, sans-serif';
      ctx.fillText(`Block Storm! ${Math.ceil(this.stormLeft)}s of golden seeds`, W / 2, 126);
      ctx.globalAlpha = 1;
    }
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
