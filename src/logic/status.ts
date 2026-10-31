// Parsing and interpretation of GET https://api.squeekchain.com/v1/status.
// Every field is read defensively: numbers may arrive as JSON numbers or as
// decimal strings, and optional blocks may be missing.

export const STATUS_URL = 'https://api.squeekchain.com/v1/status';
export const POLL_MS = 5000;
/** builder.*.blockProgress is expressed in units where 1,000,000,000 = 100%. */
export const BLOCK_PROGRESS_UNIT = 1_000_000_000;
/** Used only when the response carries no measurement.staleAfterSeconds. */
export const DEFAULT_STALE_AFTER_S = 30;

export type CoreStatus = 'IDLE' | 'ACTIVE' | 'COUNTER_FAULT' | 'UNKNOWN';

export interface Reading {
  coreStatus: CoreStatus;
  /** Wheel speed in rpm (measurement.rpmMilli / 1000). */
  rpm: number;
  freshness: 'online' | 'stale' | 'unknown';
  /** measurement.observedAt as epoch milliseconds, or null if absent/unparseable. */
  observedAtMs: number | null;
  staleAfterSeconds: number;
  provenance: string | null;
  distanceMm: number | null;
  blockHeight: number | null;
  /** Fraction 0..1 of the next Squeek block. */
  blockProgress: number | null;
  /** Which builder block the block fields came from. */
  blockSource: 'projected' | 'anchor' | null;
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts finite numbers and numeric strings (including big integers as strings). */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Convert a raw blockProgress value (1e9 = 100%) into a 0..1 fraction. */
export function parseBlockProgress(raw: unknown): number | null {
  const n = toNumber(raw);
  if (n === null) return null;
  return Math.min(1, Math.max(0, n / BLOCK_PROGRESS_UNIT));
}

/** observedAt may be an ISO string, epoch seconds or epoch milliseconds. */
export function parseTimestamp(raw: unknown): number | null {
  if (typeof raw === 'string' && !/^\d+(\.\d+)?$/.test(raw.trim())) {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  const n = toNumber(raw);
  if (n === null || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function parseProvenance(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw || null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (isObj(raw)) {
    for (const key of ['source', 'kind', 'type', 'name', 'device', 'sensor']) {
      const v = raw[key];
      if (typeof v === 'string' && v) return v;
    }
    const first = Object.values(raw).find((v) => typeof v === 'string' && v);
    return typeof first === 'string' ? first : null;
  }
  return null;
}

function parseCoreStatus(raw: unknown): CoreStatus {
  return raw === 'IDLE' || raw === 'ACTIVE' || raw === 'COUNTER_FAULT' ? raw : 'UNKNOWN';
}

/** Parse the status payload. Throws if the response has no measurement block at all. */
export function parseStatus(body: unknown): Reading {
  if (!isObj(body) || !isObj(body.measurement)) {
    throw new Error('Unexpected status payload: missing measurement');
  }
  const m = body.measurement;
  const builder = isObj(body.builder) ? body.builder : {};
  const projected = isObj(builder.projected) ? builder.projected : null;
  const anchor = isObj(builder.anchor) ? builder.anchor : null;

  let blockHeight: number | null = null;
  let blockProgress: number | null = null;
  let blockSource: Reading['blockSource'] = null;
  if (projected && toNumber(projected.blockHeight) !== null) {
    blockHeight = toNumber(projected.blockHeight);
    blockProgress = parseBlockProgress(projected.blockProgress);
    blockSource = 'projected';
  } else if (anchor && toNumber(anchor.blockHeight) !== null) {
    blockHeight = toNumber(anchor.blockHeight);
    blockProgress = parseBlockProgress(anchor.blockProgress);
    blockSource = 'anchor';
  }

  const rpmMilli = toNumber(m.rpmMilli);
  const staleAfter = toNumber(m.staleAfterSeconds);
  const freshness = m.freshness === 'online' || m.freshness === 'stale' ? m.freshness : 'unknown';

  return {
    coreStatus: parseCoreStatus(m.coreStatus),
    rpm: rpmMilli !== null && rpmMilli > 0 ? rpmMilli / 1000 : 0,
    freshness,
    observedAtMs: parseTimestamp(m.observedAt),
    staleAfterSeconds: staleAfter !== null && staleAfter > 0 ? staleAfter : DEFAULT_STALE_AFTER_S,
    provenance: parseProvenance(m.provenance),
    distanceMm: toNumber(m.distanceMm),
    blockHeight: blockHeight !== null ? Math.floor(blockHeight) : null,
    blockProgress,
    blockSource,
  };
}

/** Stale if the API says so, or if observedAt is older than staleAfterSeconds. */
export function isStale(r: Reading, nowMs: number): boolean {
  if (r.freshness === 'stale') return true;
  if (r.observedAtMs !== null && nowMs - r.observedAtMs > r.staleAfterSeconds * 1000) return true;
  return false;
}

/** Wheel Boost: min(3, 1 + rpm/40) while the hamster is running on fresh data, else x1. */
export function wheelBoost(rpm: number, running: boolean): number {
  if (!running || !(rpm > 0)) return 1;
  return Math.min(3, 1 + rpm / 40);
}
