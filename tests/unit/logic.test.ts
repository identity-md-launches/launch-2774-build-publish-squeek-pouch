import { describe, expect, it } from 'vitest';
import { isStale, parseBlockProgress, parseStatus, wheelBoost, type Reading } from '../../src/logic/status';
import { BlockWatcher, FeedTracker, SIMULATED_LABEL, SimWheel, formatDistance } from '../../src/logic/feed';
import {
  POUCH_CAP,
  bank,
  catchSeed,
  hitPebble,
  newRound,
  spawnParams,
  speedFactor,
  tickClock,
} from '../../src/logic/rules';

const NOW = Date.parse('2026-10-31T12:00:00Z');

function payload(over: Record<string, unknown> = {}, builder: unknown = undefined) {
  return {
    measurement: {
      coreStatus: 'ACTIVE',
      rpmMilli: 60000,
      freshness: 'online',
      observedAt: new Date(NOW - 2000).toISOString(),
      staleAfterSeconds: 30,
      provenance: 'hall-sensor',
      distanceMm: 123456,
      ...over,
    },
    builder: builder ?? {
      projected: { blockHeight: 42, blockProgress: 250000000 },
      anchor: { blockHeight: 41, blockProgress: 900000000 },
    },
  };
}

describe('wheel boost', () => {
  it('is x1 when not running', () => {
    expect(wheelBoost(80, false)).toBe(1);
    expect(wheelBoost(0, true)).toBe(1);
  });
  it('is 1 + rpm/40 while running', () => {
    expect(wheelBoost(20, true)).toBeCloseTo(1.5);
    expect(wheelBoost(40, true)).toBeCloseTo(2);
  });
  it('caps at x3', () => {
    expect(wheelBoost(80, true)).toBe(3);
    expect(wheelBoost(500, true)).toBe(3);
  });
});

describe('block progress parsing', () => {
  it('maps 1e9 to 100%', () => {
    expect(parseBlockProgress(1_000_000_000)).toBe(1);
    expect(parseBlockProgress(250_000_000)).toBe(0.25);
    expect(parseBlockProgress(0)).toBe(0);
  });
  it('accepts numeric strings and clamps', () => {
    expect(parseBlockProgress('500000000')).toBe(0.5);
    expect(parseBlockProgress(2_000_000_000)).toBe(1);
    expect(parseBlockProgress(-5)).toBe(0);
  });
  it('returns null for missing or junk values', () => {
    expect(parseBlockProgress(undefined)).toBeNull();
    expect(parseBlockProgress('abc')).toBeNull();
  });
});

describe('status parsing', () => {
  it('reads measurement and projected builder fields', () => {
    const r = parseStatus(payload());
    expect(r.coreStatus).toBe('ACTIVE');
    expect(r.rpm).toBe(60);
    expect(r.freshness).toBe('online');
    expect(r.observedAtMs).toBe(NOW - 2000);
    expect(r.staleAfterSeconds).toBe(30);
    expect(r.provenance).toBe('hall-sensor');
    expect(r.distanceMm).toBe(123456);
    expect(r.blockHeight).toBe(42);
    expect(r.blockProgress).toBe(0.25);
    expect(r.blockSource).toBe('projected');
  });
  it('falls back to builder.anchor when projected is missing', () => {
    const r = parseStatus(payload({}, { anchor: { blockHeight: '41', blockProgress: '900000000' } }));
    expect(r.blockHeight).toBe(41);
    expect(r.blockProgress).toBe(0.9);
    expect(r.blockSource).toBe('anchor');
  });
  it('accepts epoch-second timestamps', () => {
    const r = parseStatus(payload({ observedAt: (NOW - 1000) / 1000 }));
    expect(r.observedAtMs).toBe(NOW - 1000);
  });
  it('throws without a measurement block', () => {
    expect(() => parseStatus({ builder: {} })).toThrow();
    expect(() => parseStatus(null)).toThrow();
  });
});

describe('block height increase detection', () => {
  it('does not trigger on first load', () => {
    const w = new BlockWatcher();
    expect(w.observe(100, true)).toBe(false);
  });
  it('triggers once per new height during a round', () => {
    const w = new BlockWatcher();
    w.observe(100, true);
    expect(w.observe(101, true)).toBe(true);
    expect(w.observe(101, true)).toBe(false);
    expect(w.observe(101, true)).toBe(false);
    expect(w.observe(102, true)).toBe(true);
  });
  it('does not trigger outside a round but still advances', () => {
    const w = new BlockWatcher();
    w.observe(100, false);
    expect(w.observe(101, false)).toBe(false);
    expect(w.observe(101, true)).toBe(false);
  });
  it('ignores lower heights and nulls', () => {
    const w = new BlockWatcher();
    w.observe(100, true);
    expect(w.observe(99, true)).toBe(false);
    expect(w.observe(100, true)).toBe(false);
    expect(w.observe(null, true)).toBe(false);
  });
  it('treats the first height after reset as a baseline', () => {
    const w = new BlockWatcher();
    w.observe(100, true);
    w.reset();
    expect(w.observe(5000, true)).toBe(false);
    expect(w.observe(5001, true)).toBe(true);
  });
});

describe('stale / offline fallback', () => {
  const sim = new SimWheel(NOW);
  const fresh = (): Reading => parseStatus(payload());

  it('is connecting before any response', () => {
    const t = new FeedTracker();
    expect(t.view(NOW, sim).mode).toBe('connecting');
    expect(t.view(NOW, sim).real).toBe(false);
  });
  it('is live and boosted when ACTIVE and fresh', () => {
    const t = new FeedTracker();
    t.onSuccess(fresh());
    const v = t.view(NOW, sim);
    expect(v.mode).toBe('live');
    expect(v.real).toBe(true);
    expect(v.running).toBe(true);
    expect(v.boost).toBeCloseTo(2.5);
    expect(v.sourceLabel).toContain('Live from api.squeekchain.com');
    expect(v.sourceLabel).toContain('(hall-sensor)');
    expect(v.sourceLabel).toContain('wheel ran 123 m');
  });
  it('formats distanceMm', () => {
    expect(formatDistance(null)).toBe('');
    expect(formatDistance(0)).toBe('');
    expect(formatDistance(123456)).toBe(' - wheel ran 123 m');
    expect(formatDistance(1_234_567)).toBe(' - wheel ran 1.2 km');
  });
  it('idle is x1', () => {
    const t = new FeedTracker();
    t.onSuccess(parseStatus(payload({ coreStatus: 'IDLE', rpmMilli: 0 })));
    const v = t.view(NOW, sim);
    expect(v.running).toBe(false);
    expect(v.boost).toBe(1);
    expect(v.stateLabel).toMatch(/resting/);
  });
  it('freshness "stale" counts as idle and is labelled stale', () => {
    const t = new FeedTracker();
    t.onSuccess(parseStatus(payload({ freshness: 'stale' })));
    const v = t.view(NOW, sim);
    expect(v.mode).toBe('stale');
    expect(v.running).toBe(false);
    expect(v.boost).toBe(1);
    expect(v.rpm).toBe(0);
    expect(v.stateLabel).toMatch(/stale/i);
    expect(v.sourceLabel).toMatch(/^Stale/);
  });
  it('data older than staleAfterSeconds counts as stale', () => {
    const r = parseStatus(payload({ observedAt: new Date(NOW - 31_000).toISOString(), staleAfterSeconds: 30 }));
    expect(isStale(r, NOW)).toBe(true);
    const t = new FeedTracker();
    t.onSuccess(r);
    expect(t.view(NOW, sim).mode).toBe('stale');
    expect(t.view(NOW, sim).boost).toBe(1);
  });
  it('one failure keeps the last real reading', () => {
    const t = new FeedTracker();
    t.onSuccess(fresh());
    t.onFailure();
    expect(t.view(NOW, sim).mode).toBe('live');
  });
  it('two failures in a row switch to the labelled simulation', () => {
    const t = new FeedTracker();
    t.onFailure();
    expect(t.view(NOW, sim).mode).toBe('connecting');
    t.onFailure();
    const v = t.view(NOW, sim);
    expect(v.mode).toBe('simulated');
    expect(v.real).toBe(false);
    expect(v.sourceLabel).toBe(SIMULATED_LABEL);
    expect(v.sourceLabel).toBe('Offline demo - SIMULATED data, not real');
    expect(v.stateLabel).toMatch(/^Demo/);
  });
  it('recovers to live data automatically', () => {
    const t = new FeedTracker();
    t.onFailure();
    t.onFailure();
    t.onSuccess(fresh());
    const v = t.view(NOW, sim);
    expect(v.mode).toBe('live');
    expect(v.real).toBe(true);
    expect(t.failures).toBe(0);
  });
  it('a success between failures resets the counter', () => {
    const t = new FeedTracker();
    t.onFailure();
    t.onSuccess(fresh());
    t.onFailure();
    expect(t.view(NOW, sim).mode).toBe('live');
  });
});

describe('pouch, banking and pebbles', () => {
  it('sunflower +1, golden +5', () => {
    const s = newRound();
    catchSeed(s, 'seed');
    catchSeed(s, 'golden');
    expect(s.pouch).toBe(6);
  });
  it('caps the pouch at 15 and refuses more', () => {
    const s = newRound();
    for (let i = 0; i < 3; i++) catchSeed(s, 'golden');
    expect(s.pouch).toBe(15);
    expect(catchSeed(s, 'seed').caught).toBe(false);
    s.pouch = 13;
    expect(catchSeed(s, 'golden').added).toBe(2);
    expect(s.pouch).toBe(POUCH_CAP);
  });
  it('slows down by up to 55% when full', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(15)).toBeCloseTo(0.45);
    expect(speedFactor(7.5)).toBeCloseTo(0.725);
    expect(speedFactor(99)).toBeCloseTo(0.45);
  });
  it('banking moves the pouch to the score with the boost', () => {
    const s = newRound();
    s.pouch = 10;
    expect(bank(s, 1).deposit).toBe(10);
    expect(s.score).toBe(10);
    expect(s.pouch).toBe(0);
    s.pouch = 10;
    expect(bank(s, 2.5).deposit).toBe(25);
    expect(s.score).toBe(35);
  });
  it('banking an empty pouch does nothing', () => {
    const s = newRound();
    expect(bank(s, 3).deposit).toBe(0);
    expect(s.score).toBe(0);
  });
  it('a pebble costs a life and spills the unbanked pouch, not the score', () => {
    const s = newRound();
    s.score = 20;
    s.pouch = 9;
    expect(hitPebble(s).spilled).toBe(9);
    expect(s.pouch).toBe(0);
    expect(s.lives).toBe(2);
    expect(s.score).toBe(20);
  });
  it('game over at 0 lives', () => {
    const s = newRound();
    hitPebble(s);
    hitPebble(s);
    expect(s.over).toBe(false);
    hitPebble(s);
    expect(s.over).toBe(true);
    expect(s.overReason).toBe('lives');
  });
  it('game over when the 90 s clock runs out', () => {
    const s = newRound();
    tickClock(s, 89.9);
    expect(s.over).toBe(false);
    tickClock(s, 0.2);
    expect(s.over).toBe(true);
    expect(s.overReason).toBe('time');
  });
});

describe('spawn tuning', () => {
  it('ramps difficulty over the round', () => {
    const a = spawnParams(0, false, false);
    const b = spawnParams(1, false, false);
    expect(b.fallSpeed).toBeGreaterThan(a.fallSpeed);
    expect(b.pebbleChance).toBeGreaterThan(a.pebbleChance);
    expect(b.interval).toBeLessThan(a.interval);
  });
  it('ACTIVE wheel spawns ~25% faster and falls ~15% faster', () => {
    const idle = spawnParams(0.5, false, false);
    const run = spawnParams(0.5, true, false);
    expect(idle.interval / run.interval).toBeCloseTo(1.25);
    expect(run.fallSpeed / idle.fallSpeed).toBeCloseTo(1.15);
  });
  it('a Block Storm is mostly golden with few pebbles', () => {
    const s = spawnParams(0.5, false, true);
    expect(s.goldenChance).toBeGreaterThan(0.8);
    expect(s.pebbleChance).toBeLessThan(0.1);
  });
});
