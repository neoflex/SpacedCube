import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sets, turnCount, speedOf, addTime, median, migrate, TIMES_KEPT, RATED_AFTER } from '../../src/js/core/index.js';

const C = sets.PLL;
const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1);

// Every PLL case Mastered, last seen at T0 (nothing due until T0 + 7 days).
function allMastered() {
  const s = C.freshState();
  s.setupDone = true;
  for (const id of C.CASE_IDS) { C.introduce(s, id, C.MASTERED); s.cases[id].lastTs = T0; s.cases[id].n = 5; }
  return s;
}
// Deterministic random numbers for the picking tests.
function seeded(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

test('turns: face, wide and slice moves count one each, half turns too; rotations do not', () => {
  assert.equal(turnCount("R U R' U'"), 4);
  assert.equal(turnCount('M2 U M2 U2 M2 U M2'), 7);
  assert.equal(turnCount("x L2 D2 L' U' L D2 L' U L' x'"), 9);
  assert.equal(turnCount("r U R' U' r' F R F'"), 8);
});

test('a case gets a speed level after 3 timed solves: the median turns per second, rounded down', () => {
  const cs = { times: [] };
  addTime(cs, 2000, 10);
  addTime(cs, 2500, 10);
  assert.equal(speedOf(cs), null);
  addTime(cs, 1000, 10);                         // 5, 4 and 10 turns per second: median 5
  assert.equal(RATED_AFTER, 3);
  assert.deepEqual(speedOf(cs), { tps: 5, level: 5, ms: 2000 });
  addTime(cs, 3000, 9);                          // 5, 4, 10, 3: median 4.5
  assert.equal(speedOf(cs).level, 4);
});

test('only the last 5 solves count, and the last 12 are kept', () => {
  const cs = { times: [] };
  for (let i = 0; i < 20; i++) addTime(cs, i < 15 ? 5000 : 1000, 10); // 15 slow solves, then 5 fast ones
  assert.equal(cs.times.length, TIMES_KEPT);
  assert.equal(speedOf(cs).tps, 10);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('version 1 states are upgraded: every case gets an empty time list, Speed starts closed', () => {
  const v1 = { rep: 40, cases: { T: { active: true, level: 8, n: 30, ok: 28 } }, settings: { pool: 2 } };
  const s = migrate(v1);
  assert.equal(s.v, 2);
  assert.deepEqual(s.cases.T.times, []);
  assert.equal(s.cases.T.level, 8);
  assert.equal(s.speedOpen, false);
  const n = C.normalize(v1);
  assert.equal(n.cases.T.level, 8);
  assert.deepEqual(n.cases.Ua.times, []);
  assert.equal(n.settings.mode, 'memory');
  assert.equal(n.settings.pool, 2);
});

test('normalize drops malformed times', () => {
  const s = C.normalize({ v: 2, cases: { T: { times: [[1500, 14], 'x', [0, 14], [1200]] } } });
  assert.deepEqual(s.cases.T.times, [[1500, 14]]);
});

test('Speed opens once every case is Mastered and stays open', () => {
  const s = allMastered();
  s.cases.H.level = 6;
  assert.equal(C.speedReady(s), false);
  assert.equal(C.openSpeedIfReady(s), false);
  s.cases.H.level = 7;
  assert.equal(C.openSpeedIfReady(s), true);
  assert.equal(C.openSpeedIfReady(s), false, 'only reported once');
  C.grade(s, 'H', false, T0 + DAY);              // forgotten: drops below Mastered
  assert.equal(C.speedReady(s), true);
  assert.ok(!C.speedIds(s).includes('H'), 'a case below Mastered is not timed');
});

test('a correct timed solve of a case that is not due leaves its memory level and gap alone', () => {
  const s = allMastered();
  const before = { ...s.cases.T };
  const r = C.gradeSpeed(s, 'T', true, 1800, 14, T0 + DAY);
  assert.equal(r.review, false);
  assert.equal(s.cases.T.level, before.level);
  assert.equal(s.cases.T.lastTs, before.lastTs, 'the next memory review is not pushed back');
  assert.equal(s.cases.T.n, before.n);
  assert.deepEqual(s.cases.T.times, [[1800, 14]]);
  assert.equal(s.lastCase, 'T');
});

test('a timed solve of a due case counts as its memory review', () => {
  const s = allMastered();
  const r = C.gradeSpeed(s, 'T', true, 1800, 14, T0 + 8 * DAY);
  assert.equal(r.review, true);
  assert.equal(s.cases.T.level, 8);
  assert.equal(s.cases.T.lastTs, T0 + 8 * DAY);
  assert.equal(s.cases.T.times.length, 1);
});

test('a miss in Speed counts for memory and records no time', () => {
  const s = allMastered();
  const r = C.gradeSpeed(s, 'T', false, 0, 14, T0 + DAY);
  assert.equal(r.review, true);
  assert.ok(s.cases.T.level < 7);
  assert.deepEqual(s.cases.T.times, []);
});

test('Speed picks due cases first, otherwise slower cases more often', () => {
  const s = allMastered();
  s.cases.Ua.lastTs = T0 - 30 * DAY;             // due for its memory review
  assert.equal(C.pickSpeed(s, seeded(1), T0 + DAY), 'Ua');
  s.cases.Ua.lastTs = T0;
  for (const id of C.CASE_IDS) for (let i = 0; i < 5; i++) addTime(s.cases[id], id === 'Na' ? 6000 : 1500, 20);
  const rng = seeded(7), counts = {};
  for (let i = 0; i < 2000; i++) { const id = C.pickSpeed(s, rng, T0 + DAY); counts[id] = (counts[id] || 0) + 1; }
  // Na runs at 3.3 turns per second, the others at 13.3: about 16 times as likely.
  assert.ok(counts.Na > 5 * (counts.T || 0), `Na ${counts.Na}, T ${counts.T}`);
  assert.equal(Object.keys(counts).length, C.CASE_IDS.length, 'every Mastered case still comes up');
});

test('Speed does not repeat the case just timed', () => {
  const s = allMastered();
  s.lastCase = 'T'; s.prevCase = 'H';
  const rng = seeded(3);
  for (let i = 0; i < 200; i++) assert.ok(!['T', 'H'].includes(C.pickSpeed(s, rng, T0 + DAY)));
});
