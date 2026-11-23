import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sets, SCHEMA_VERSION } from '../../src/js/core/index.js';
import { S, initState, save, backupOwner, locked, hooks, switchSet } from '../../src/js/app/state.js';

beforeEach(() => { localStorage.clear(); locked.clear(); localStorage.setItem('ll-trainer-set', 'OLL'); });

test('a new user starts on PLL', () => {
  localStorage.clear();
  initState();
  assert.equal(S.set, 'PLL');
});

test('backupOwner finds the set a backup code belongs to', () => {
  assert.equal(backupOwner(sets.OLL.freshState()), 'OLL');
  assert.equal(backupOwner(sets.PLL.freshState()), 'PLL');
  assert.equal(backupOwner({ cases: { 27: {}, T: {} } }), null);
  assert.equal(backupOwner({ cases: {} }), null);
  assert.equal(backupOwner({ nope: 1 }), null);
  assert.equal(backupOwner(null), null);
});

test('save writes local storage, stamps updatedAt and keeps two years of daily history', () => {
  initState();
  S.state.setupDone = true;
  S.state.daily = {};
  for (let i = 0; i < 800; i++) {
    const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    S.state.daily[d] = { n: 1, ok: 1 };
  }
  const before = Date.now();
  save();
  const stored = JSON.parse(localStorage.getItem('oll-trainer-v1'));
  assert.ok(stored.updatedAt >= before);
  assert.equal(Object.keys(stored.daily).length, 730);
  assert.ok(!stored.daily['2020-01-01'], 'oldest days dropped');
});

test('save tells sync which set changed', () => {
  initState();
  const seen = [];
  hooks.afterSave = (set) => seen.push(set);
  save();
  switchSet('PLL');
  save();
  assert.deepEqual(seen, ['OLL', 'PLL']);
  hooks.afterSave = () => {};
  switchSet('OLL');
});

test('progress saved by a newer app is never overwritten', () => {
  const newer = JSON.stringify({ v: SCHEMA_VERSION + 1, cases: {}, rep: 99 });
  localStorage.setItem('oll-trainer-v1', newer);
  let warned = 0;
  hooks.newerData = () => { warned++; };
  initState();
  assert.ok(locked.has('OLL'));
  assert.equal(warned, 1);
  assert.equal(S.state.rep, 0, 'works on a fresh state in memory');
  save();
  assert.equal(localStorage.getItem('oll-trainer-v1'), newer);
  hooks.newerData = () => {};
});
