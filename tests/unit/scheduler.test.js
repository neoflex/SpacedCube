import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sets } from '../../src/js/core/index.js';

const C = sets.OLL;
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const fresh = () => { const s = C.freshState(); s.setupDone = true; return s; };

test('a correct answer raises the level only after the gap for that level', () => {
  const s = fresh();
  C.introduce(s, '27', 2);
  const t0 = Date.UTC(2026, 0, 1);
  C.grade(s, '27', true, t0);                       // never seen before: gap is infinite
  assert.equal(s.cases['27'].level, 3);
  C.grade(s, '27', true, t0 + 5 * MIN);             // level 3 needs 8 h
  assert.equal(s.cases['27'].level, 3);
  C.grade(s, '27', true, t0 + 5 * MIN + 8 * HOUR);
  assert.equal(s.cases['27'].level, 4);
  C.grade(s, '27', true, t0 + 5 * MIN + 8 * HOUR + 1 * DAY);
  assert.equal(s.cases['27'].level, 5);
});

test('a miss drops the level to about half', () => {
  const s = fresh();
  C.introduce(s, '27', 8);
  C.grade(s, '27', false, Date.now());
  assert.equal(s.cases['27'].level, 4);
  C.grade(s, '27', false, Date.now());
  assert.equal(s.cases['27'].level, 2);
  C.grade(s, '27', false, Date.now());
  assert.equal(s.cases['27'].level, 0);
});

test('history keeps the last 20 results', () => {
  const s = fresh();
  C.introduce(s, '27');
  for (let i = 0; i < 25; i++) C.grade(s, '27', i % 2 === 0, Date.now());
  assert.equal(s.cases['27'].hist.length, 20);
  assert.equal(s.cases['27'].n, 25);
});

test('new cases join while fewer than `pool` cases are below the learned level', () => {
  const s = fresh();
  s.settings.pool = 2;
  assert.ok(C.shouldIntroduce(s));
  C.introduce(s, C.nextToIntroduce(s));
  assert.ok(C.shouldIntroduce(s));
  C.introduce(s, C.nextToIntroduce(s));
  assert.ok(!C.shouldIntroduce(s));
  s.settings.autoIntro = false;
  s.settings.pool = 6;
  assert.ok(!C.shouldIntroduce(s));
});

test('a removed case is introduced again only after the others', () => {
  const s = fresh();
  const first = C.nextToIntroduce(s);
  s.cases[first].removed = true;
  assert.notEqual(C.nextToIntroduce(s), first);
});

test('the last case is never picked twice in a row', () => {
  const s = fresh();
  for (const id of ['1', '2', '3']) C.introduce(s, id, 3);
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let last = null;
  for (let i = 0; i < 200; i++) {
    const id = C.pickNext(s, rng, Date.now());
    assert.notEqual(id, last);
    C.grade(s, id, true, Date.now());
    last = id;
  }
});

test('with no case in practice there is nothing to pick', () => {
  assert.equal(C.pickNext(fresh(), Math.random, Date.now()), null);
});

test('due cases: never tried, or past their gap; nextDueAt is the earliest upcoming one', () => {
  const s = fresh();
  const now = Date.UTC(2026, 5, 1, 12);
  C.introduce(s, '1', 0);                                 // never tried: due
  C.introduce(s, '2', 4); Object.assign(s.cases['2'], { n: 5, last: 1, lastTs: now - 2 * DAY });   // gap 1 day passed: due
  C.introduce(s, '3', 5); Object.assign(s.cases['3'], { n: 5, last: 1, lastTs: now - 1 * DAY });   // gap 2 days: due in 1 day
  C.introduce(s, '4', 3); Object.assign(s.cases['4'], { n: 5, last: 1, lastTs: now - 2 * HOUR });  // gap 8 h: due in 6 h
  assert.deepEqual(C.dueIds(s, now).sort(), ['1', '2']);
  assert.equal(C.nextDueAt(s, now), now + 6 * HOUR);
});

test('nextDueAt is null when nothing time-based is waiting', () => {
  const s = fresh();
  assert.equal(C.nextDueAt(s, Date.now()), null);
  C.introduce(s, '1', 0);
  assert.equal(C.nextDueAt(s, Date.now()), null);
});

test('while a case is due, only due cases come up; then extra practice is weighted', () => {
  const s = fresh();
  const now = Date.UTC(2026, 0, 10);
  const ids = C.INTRO_ORDER.slice(0, 45);
  // 45 cases at level 5 (2-day gap), seen 1 h to 40 h ago: none due. Then one is past its gap.
  ids.forEach((id, i) => { C.introduce(s, id, 5); Object.assign(s.cases[id], { n: 10, ok: 10, hist: '1111111111', last: 0, lastTs: now - (1 + i % 40) * HOUR }); });
  s.rep = 100;
  const due = ids[7];
  s.cases[due].lastTs = now - 3 * DAY;
  assert.deepEqual(C.dueIds(s, now), [due]);
  for (let i = 0; i < 200; i++) assert.equal(C.pickNext(s, Math.random, now), due);
  // Once done, nothing is due: extra practice draws from all cases, closest to due most often.
  C.grade(s, due, true, now);
  assert.equal(s.cases[due].level, 6);
  const counts = {};
  for (let i = 0; i < 4000; i++) { const id = C.pickNext(s, Math.random, now); counts[id] = (counts[id] || 0) + 1; }
  assert.ok(Object.keys(counts).length > 20, 'many cases come up');
  assert.ok((counts[ids[39]] || 0) > (counts[ids[0]] || 0), 'seen 40 h ago comes up more than seen 1 h ago');
});

test('a due case just shown is not repeated: the others come up meanwhile', () => {
  const s = fresh();
  const now = Date.UTC(2026, 0, 10);
  ['27', '26', '21'].forEach((id) => { C.introduce(s, id, 5); Object.assign(s.cases[id], { n: 5, ok: 5, last: 0, lastTs: now - HOUR }); });
  s.cases['27'].lastTs = now - 3 * DAY;
  s.lastCase = '27';
  for (let i = 0; i < 50; i++) assert.notEqual(C.pickNext(s, Math.random, now), '27');
});
