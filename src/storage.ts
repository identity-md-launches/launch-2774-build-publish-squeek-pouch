// The only thing this game stores: the local best score.
const KEY = 'squeek-pouch-best';

export function loadBest(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(KEY, String(Math.floor(score)));
  } catch {
    // Private mode or storage disabled: the best score just isn't kept.
  }
}
