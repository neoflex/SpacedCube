import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, isNewer, SCHEMA_VERSION, NewerStateError, sets } from '../../src/js/core/index.js';

test('a state without a version is read as version 1 and upgraded', () => {
  const s = migrate({ rep: 3 });
  assert.equal(s.v, SCHEMA_VERSION);
  assert.equal(s.rep, 3);
});

test('migrate does not change its input', () => {
  const raw = { rep: 1 };
  migrate(raw);
  assert.deepEqual(raw, { rep: 1 });
});

test('a state from a newer app is refused, not silently downgraded', () => {
  const newer = { v: SCHEMA_VERSION + 1, cases: {} };
  assert.ok(isNewer(newer));
  assert.throws(() => migrate(newer), NewerStateError);
  assert.throws(() => sets.OLL.normalize(newer), NewerStateError);
});

test('normalize fills a partial state and keeps known values', () => {
  const s = sets.PLL.normalize({ cases: { T: { active: true, level: 4 } }, settings: { pool: 5 } });
  assert.equal(s.v, SCHEMA_VERSION);
  assert.equal(s.cases.T.level, 4);
  assert.equal(s.cases.Ua.level, 0);
  assert.equal(s.settings.pool, 5);
  assert.equal(s.settings.autoIntro, true);
});

test('a case counts as learned at Solid by default; a saved choice is kept', () => {
  assert.equal(sets.OLL.freshState().settings.introLevel, 5);
  assert.equal(sets.OLL.normalize({ cases: {}, settings: { introLevel: 3 } }).settings.introLevel, 3);
});
