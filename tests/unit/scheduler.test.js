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
