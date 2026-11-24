// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Scheduler constants shared by every case set. See README, Scheduling.

export const MAX_LEVEL = 10;
export const INTERVALS = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => Math.max(1, Math.round(Math.pow(1.9, i))));
// Minimum time since a case was last seen before a correct answer raises its level from L to L+1.
export const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const GAP_MS = [0, 0, 10 * MIN, 8 * HOUR, 1 * DAY, 2 * DAY, 4 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY];
export const bucketOf = (lvl) => (lvl <= 0 ? 0 : lvl <= 2 ? 1 : lvl <= 4 ? 2 : lvl <= 6 ? 3 : 4);
export const BUCKETS = ['New', 'Learning', 'Familiar', 'Solid', 'Mastered'];
export const MASTERED = 7; // first level of the Mastered bucket
export const successRate = (cs) => (cs.n ? cs.ok / cs.n : 0);
export function lastMissRep(cs) {
  if (cs.lastMiss >= 0) return cs.lastMiss;
  const i = cs.hist.lastIndexOf('0');
  return i < 0 ? -1 : cs.last - (cs.hist.length - 1 - i) * 3;
}
