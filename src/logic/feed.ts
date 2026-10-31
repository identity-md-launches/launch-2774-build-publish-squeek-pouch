// Feed state machine: live / stale / offline-simulated, plus block-height watching.
import { isStale, wheelBoost, type Reading } from './status';

export type FeedMode = 'connecting' | 'live' | 'stale' | 'simulated';

/** After this many consecutive failed polls the feed switches to the simulated wheel. */
export const FAILURES_BEFORE_SIMULATION = 2;

export interface FeedView {
  mode: FeedMode;
  /** True only when the numbers come from the real API. */
  real: boolean;
  /** Hamster counts as running: ACTIVE and fresh (or the simulated wheel is spinning). */
  running: boolean;
  rpm: number;
  boost: number;
  blockHeight: number | null;
  blockProgress: number | null;
  distanceMm: number | null;
  provenance: string | null;
  coreStatus: Reading['coreStatus'] | null;
  /** Short state label shown next to the coloured dot. */
  stateLabel: string;
  /** Line naming the data source. Simulated data is always labelled as such. */
  sourceLabel: string;
}

export const SIMULATED_LABEL = 'Offline demo - SIMULATED data, not real';

export class FeedTracker {
  failures = 0;
  last: Reading | null = null;
  simulated = false;

  onSuccess(r: Reading): void {
    this.failures = 0;
    this.last = r;
    this.simulated = false;
  }

  onFailure(): void {
    this.failures += 1;
    if (this.failures >= FAILURES_BEFORE_SIMULATION) this.simulated = true;
  }

  mode(nowMs: number): FeedMode {
    if (this.simulated) return 'simulated';
    if (!this.last) return 'connecting';
    return isStale(this.last, nowMs) ? 'stale' : 'live';
  }

  view(nowMs: number, sim: SimWheel): FeedView {
    const mode = this.mode(nowMs);
    if (mode === 'simulated') {
      const s = sim.sample(nowMs);
      return {
        mode,
        real: false,
        running: s.running,
        rpm: s.rpm,
        boost: wheelBoost(s.rpm, s.running),
        blockHeight: s.blockHeight,
        blockProgress: s.blockProgress,
        distanceMm: null,
        provenance: null,
        coreStatus: null,
        stateLabel: s.running ? 'Demo wheel running' : 'Demo wheel resting',
        sourceLabel: SIMULATED_LABEL,
      };
    }
    const r = this.last;
    if (!r) {
      return {
        mode,
        real: false,
        running: false,
        rpm: 0,
        boost: 1,
        blockHeight: null,
        blockProgress: null,
        distanceMm: null,
        provenance: null,
        coreStatus: null,
        stateLabel: 'Connecting to the wheel',
        sourceLabel: 'Fetching api.squeekchain.com',
      };
    }
    const fresh = mode === 'live';
    const running = fresh && r.coreStatus === 'ACTIVE';
    let stateLabel: string;
    if (!fresh) stateLabel = 'Data stale - counted as resting';
    else if (r.coreStatus === 'ACTIVE') stateLabel = 'Squeektoshi is running';
    else if (r.coreStatus === 'COUNTER_FAULT') stateLabel = 'Wheel counter fault';
    else stateLabel = 'Squeektoshi is resting';
    const via = (r.provenance ? ` (${r.provenance})` : '') + formatDistance(r.distanceMm);
    return {
      mode,
      real: true,
      running,
      // A stale reading is shown but never animates the wheel or boosts deposits.
      rpm: running ? r.rpm : 0,
      boost: wheelBoost(r.rpm, running),
      blockHeight: r.blockHeight,
      blockProgress: r.blockProgress,
      distanceMm: r.distanceMm,
      provenance: r.provenance,
      coreStatus: r.coreStatus,
      stateLabel,
      sourceLabel: fresh
        ? `Live from api.squeekchain.com${via}`
        : `Stale from api.squeekchain.com${via}`,
    };
  }
}

/** measurement.distanceMm as a short "wheel ran" note, or '' when absent. */
export function formatDistance(mm: number | null): string {
  if (mm === null || !(mm > 0)) return '';
  const m = mm / 1000;
  return m >= 1000 ? ` - wheel ran ${(m / 1000).toFixed(1)} km` : ` - wheel ran ${Math.round(m)} m`;
}

/**
 * Detects a newly mined block. The first height seen only sets the baseline,
 * the same height never triggers twice, and a lower height (reorg or source
 * switch) never triggers. Call reset() when switching data sources.
 */
export class BlockWatcher {
  private highest: number | null = null;

  observe(height: number | null, roundActive: boolean): boolean {
    if (height === null || !Number.isFinite(height)) return false;
    if (this.highest === null) {
      this.highest = height;
      return false;
    }
    if (height > this.highest) {
      this.highest = height;
      return roundActive;
    }
    return false;
  }

  reset(): void {
    this.highest = null;
  }

  get baseline(): number | null {
    return this.highest;
  }
}

/** Simulated wheel used only in the clearly-labelled offline demo. */
export class SimWheel {
  constructor(
    private readonly startMs: number,
    private readonly startHeight = 1000,
  ) {}

  sample(nowMs: number): { running: boolean; rpm: number; blockHeight: number; blockProgress: number } {
    const t = Math.max(0, (nowMs - this.startMs) / 1000);
    // 40 s cycle: 24 s running, 16 s resting.
    const phase = t % 40;
    const running = phase < 24;
    const rpm = running ? 45 + 30 * Math.sin(t / 3) : 0;
    const blockSeconds = 45;
    const blockHeight = this.startHeight + Math.floor(t / blockSeconds);
    const blockProgress = (t % blockSeconds) / blockSeconds;
    return { running, rpm: Math.max(0, rpm), blockHeight, blockProgress };
  }
}
