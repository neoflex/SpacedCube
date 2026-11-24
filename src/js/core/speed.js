// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Speed practice: execution times per case and the speed level they give. See README, Speed.
import { parse } from './notation.js';

export const TIMES_KEPT = 12;   // timed solves kept per case
export const MEDIAN_OF = 5;     // the speed level uses the median of the last 5
export const RATED_AFTER = 3;   // timed solves before a case has a speed level
export const MAX_SPEED = 10;

// Turns in an algorithm as written: every face, wide or slice move counts one, a half turn too;
// cube rotations (x, y, z) do not.
export const turnCount = (alg) => parse(alg).filter((m) => !'xyz'.includes(m.f)).length;

export function median(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Speed of a case from its saved times ([ms, turns] pairs, oldest first).
 * The speed level is the median turns per second of the last solves, rounded down:
 * level 4 means at least 4 turns per second. null until RATED_AFTER solves are timed.
 */
export function speedOf(cs) {
  const times = cs.times || [];
  if (times.length < RATED_AFTER) return null;
  const last = times.slice(-MEDIAN_OF);
  const tps = median(last.map(([ms, n]) => (n * 1000) / ms));
  return { tps, level: Math.min(MAX_SPEED, Math.floor(tps)), ms: median(last.map(([ms]) => ms)) };
}

export const bestMs = (cs) => ((cs.times || []).length ? Math.min(...cs.times.map(([ms]) => ms)) : 0);

/** Adds a timed solve; keeps the last TIMES_KEPT. */
export function addTime(cs, ms, turns) {
  cs.times = (cs.times || []).concat([[Math.round(ms), turns]]).slice(-TIMES_KEPT);
}
