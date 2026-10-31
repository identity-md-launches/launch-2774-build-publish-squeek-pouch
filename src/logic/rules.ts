// Pure game rules: pouch, banking, pebbles, difficulty.

export const POUCH_CAP = 15;
export const START_LIVES = 3;
export const ROUND_SECONDS = 90;
export const STORM_SECONDS = 6;
/** Movement speed drops by up to this fraction when the pouch is full. */
export const MAX_SLOWDOWN = 0.55;

export type SeedKind = 'seed' | 'golden';
export const SEED_VALUE: Record<SeedKind, number> = { seed: 1, golden: 5 };

export interface RoundState {
  score: number;
  pouch: number;
  lives: number;
  timeLeft: number;
  over: boolean;
  overReason: 'time' | 'lives' | null;
}

export function newRound(): RoundState {
  return { score: 0, pouch: 0, lives: START_LIVES, timeLeft: ROUND_SECONDS, over: false, overReason: null };
}

/** Catch a seed. A full pouch cannot take more; overflow past the cap is lost. */
export function catchSeed(s: RoundState, kind: SeedKind): { caught: boolean; added: number } {
  if (s.over || s.pouch >= POUCH_CAP) return { caught: false, added: 0 };
  const before = s.pouch;
  s.pouch = Math.min(POUCH_CAP, s.pouch + SEED_VALUE[kind]);
  return { caught: true, added: s.pouch - before };
}

/** A pebble costs one life and spills every unbanked seed. */
export function hitPebble(s: RoundState): { spilled: number } {
  if (s.over) return { spilled: 0 };
  const spilled = s.pouch;
  s.pouch = 0;
  s.lives = Math.max(0, s.lives - 1);
  if (s.lives === 0) {
    s.over = true;
    s.overReason = 'lives';
  }
  return { spilled };
}

/** Bank the pouch into the score, multiplied by the wheel boost. */
export function bank(s: RoundState, boost: number): { deposit: number; base: number } {
  if (s.over || s.pouch <= 0) return { deposit: 0, base: 0 };
  const base = s.pouch;
  const deposit = Math.round(base * Math.max(1, boost));
  s.score += deposit;
  s.pouch = 0;
  return { deposit, base };
}

export function tickClock(s: RoundState, dt: number): void {
  if (s.over) return;
  s.timeLeft = Math.max(0, s.timeLeft - dt);
  if (s.timeLeft === 0) {
    s.over = true;
    s.overReason = 'time';
  }
}

/** 1 with an empty pouch, down to 0.45 with a full one. */
export function speedFactor(pouch: number): number {
  const fill = Math.min(1, Math.max(0, pouch / POUCH_CAP));
  return 1 - MAX_SLOWDOWN * fill;
}

/** 0 for an empty pouch, 1 for a full one: drives the cheek size. */
export function cheekFill(pouch: number): number {
  return Math.min(1, Math.max(0, pouch / POUCH_CAP));
}

export interface SpawnParams {
  /** Seconds between spawns. */
  interval: number;
  /** World units per second. */
  fallSpeed: number;
  pebbleChance: number;
  goldenChance: number;
}

/**
 * Difficulty for a moment in the round. progress runs 0..1 over the round.
 * ACTIVE wheel: spawns ~25% faster and falls ~15% faster. A storm rains gold.
 */
export function spawnParams(progress: number, running: boolean, storm: boolean): SpawnParams {
  const p = Math.min(1, Math.max(0, progress));
  let interval = 0.95 - 0.4 * p;
  let fallSpeed = 150 + 130 * p;
  let pebbleChance = 0.16 + 0.24 * p;
  let goldenChance = 0.07;
  if (running) {
    interval /= 1.25;
    fallSpeed *= 1.15;
  }
  if (storm) {
    interval = 0.16;
    fallSpeed *= 1.35;
    pebbleChance = 0.05;
    goldenChance = 0.85;
  }
  return { interval, fallSpeed, pebbleChance, goldenChance };
}
