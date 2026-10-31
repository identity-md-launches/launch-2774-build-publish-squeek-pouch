// Hand-drawn style sprites, all drawn in code.

export interface Palette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundDark: string;
  wheel: string;
  burrow: string;
}

const NIGHT = { skyTop: '#1b1430', skyBottom: '#2e2152', ground: '#3a2a5c', groundDark: '#2a1e45', wheel: '#7a68ad', burrow: '#4a3566' };
const WARM = { skyTop: '#3d1f45', skyBottom: '#d9773f', ground: '#a8683c', groundDark: '#7c4a2a', wheel: '#ffd08f', burrow: '#6e4026' };

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}

/** warmth 0 = night palette (resting), 1 = warm lit palette (running). */
export function paletteFor(warmth: number): Palette {
  const t = Math.min(1, Math.max(0, warmth));
  const out = {} as Palette;
  for (const k of Object.keys(NIGHT) as (keyof Palette)[]) out[k] = mix(NIGHT[k], WARM[k], t);
  return out;
}

const INK = '#4a2a1c';

export function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, pal: Palette): void {
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = pal.wheel;
  ctx.lineCap = 'round';
  // Stand.
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - r * 0.55, cy + r * 1.25);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.55, cy + r * 1.25);
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  // Rims.
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  // Rungs.
  ctx.lineWidth = 3;
  const rungs = 28;
  for (let i = 0; i < rungs; i++) {
    const a = (i / rungs) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  // Spokes.
  ctx.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.stroke();
  }
  ctx.fillStyle = pal.wheel;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBurrow(ctx: CanvasRenderingContext2D, x: number, groundY: number, pal: Palette, glow: boolean, time: number): void {
  ctx.save();
  // Mound.
  ctx.fillStyle = pal.burrow;
  ctx.beginPath();
  ctx.moveTo(x - 10, groundY + 14);
  ctx.quadraticCurveTo(x + 40, groundY - 88, x + 110, groundY + 14);
  ctx.closePath();
  ctx.fill();
  // Hole.
  ctx.fillStyle = '#120c22';
  ctx.beginPath();
  ctx.ellipse(x + 46, groundY - 4, 26, 24, 0, Math.PI, 0);
  ctx.lineTo(x + 72, groundY + 10);
  ctx.lineTo(x + 20, groundY + 10);
  ctx.closePath();
  ctx.fill();
  if (glow) {
    const a = 0.45 + 0.25 * Math.sin(time * 5);
    ctx.strokeStyle = `rgba(255,180,59,${a})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x + 46, groundY - 4, 31, 29, 0, Math.PI, 0);
    ctx.stroke();
  }
  // Sign.
  ctx.fillStyle = '#c98b52';
  ctx.fillRect(x + 84, groundY - 58, 5, 50);
  ctx.fillStyle = '#ffe2b0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 66, groundY - 76);
  ctx.lineTo(x + 112, groundY - 76);
  ctx.lineTo(x + 120, groundY - 65);
  ctx.lineTo(x + 112, groundY - 54);
  ctx.lineTo(x + 66, groundY - 54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '800 14px "Nunito", ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Bank', x + 91, groundY - 64);
  ctx.restore();
}

export function drawHamster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: 1 | -1,
  fill: number,
  walk: number,
  munching: boolean,
  hurt: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';

  const fur = '#e9a25a';
  const cream = '#fbe6c6';
  const headX = 16;
  const headY = -44;
  const cheekR = 7 + 12 * fill;

  // Tail.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(-30, -22, 6, 4, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Feet.
  const step = Math.sin(walk) * 4;
  ctx.fillStyle = '#f4b6a6';
  for (const [fx, off] of [
    [-14, step],
    [12, -step],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(fx + off, -3, 8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Far cheek, peeking behind the head.
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.arc(headX - 16, headY + 10 + cheekR * 0.25, cheekR * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Body.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -24, 31, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.ellipse(6, -18, 18, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears.
  for (const ex of [headX - 11, headX + 7]) {
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(ex, headY - 15, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4a3a0';
    ctx.beginPath();
    ctx.arc(ex, headY - 15, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(headX, headY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.ellipse(headX + 8, headY + 7, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Near cheek pouch: puffs out over the jaw as the pouch fills.
  const cheekY = headY + 10 + cheekR * 0.25;
  ctx.fillStyle = '#f7c995';
  ctx.beginPath();
  ctx.arc(headX - 1, cheekY, cheekR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headX - 1, cheekY, cheekR, -0.12 * Math.PI, 1.12 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = `rgba(240,128,128,${0.3 + 0.35 * fill})`;
  ctx.beginPath();
  ctx.ellipse(headX + 2, cheekY - cheekR * 0.25, 3 + cheekR * 0.35, 2 + cheekR * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye.
  if (hurt) {
    ctx.beginPath();
    ctx.moveTo(headX + 4, headY - 9);
    ctx.lineTo(headX + 11, headY - 2);
    ctx.moveTo(headX + 11, headY - 9);
    ctx.lineTo(headX + 4, headY - 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1b1430';
    ctx.beginPath();
    ctx.arc(headX + 8, headY - 5, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX + 9.3, headY - 6.4, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose, mouth, whiskers.
  ctx.fillStyle = '#e8737a';
  ctx.beginPath();
  ctx.arc(headX + 19, headY + 1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (munching) {
    ctx.arc(headX + 15, headY + 7, 2.6, 0, Math.PI * 2);
  } else {
    ctx.moveTo(headX + 12, headY + 6);
    ctx.quadraticCurveTo(headX + 15, headY + 9, headX + 18, headY + 6);
  }
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(headX + 20, headY + 3);
  ctx.lineTo(headX + 32, headY);
  ctx.moveTo(headX + 20, headY + 5);
  ctx.lineTo(headX + 32, headY + 7);
  ctx.stroke();

  // Arms.
  ctx.lineWidth = 2.5;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(20, -12, 5, 6.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawSeed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, golden: boolean, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (golden) {
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.2);
    glow.addColorStop(0, 'rgba(255,216,74,0.55)');
    glow.addColorStop(1, 'rgba(255,216,74,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.rotate(rot * 0.3 + Math.sin(time * 3 + x) * 0.2);
  // Teardrop.
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.25);
  ctx.bezierCurveTo(r * 0.95, -r * 0.6, r * 0.85, r, 0, r);
  ctx.bezierCurveTo(-r * 0.85, r, -r * 0.95, -r * 0.6, 0, -r * 1.25);
  ctx.closePath();
  ctx.fillStyle = golden ? '#ffc93b' : '#3d3446';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = golden ? '#9a5b10' : '#17121f';
  ctx.stroke();
  if (golden) {
    ctx.fillStyle = '#7a3f05';
    ctx.font = `900 ${Math.round(r * 0.62)}px "Nunito", ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SQK', 0, r * 0.05);
  } else {
    ctx.strokeStyle = '#e9e1d2';
    ctx.lineWidth = 1.6;
    for (const sx of [-r * 0.35, 0, r * 0.35]) {
      ctx.beginPath();
      ctx.moveTo(sx * 0.6, -r * 0.85);
      ctx.quadraticCurveTo(sx, 0, sx * 0.8, r * 0.75);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawPebble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  const pts = 9;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (0.82 + 0.18 * Math.sin(i * 2.7 + 1));
    const px = Math.cos(a) * rr * 1.1;
    const py = Math.sin(a) * rr * 0.9;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#9b93a8';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#2a2433';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.3, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
