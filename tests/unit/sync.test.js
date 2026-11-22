import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sets, SCHEMA_VERSION } from '../../src/js/core/index.js';
import { S, initState, locked, hooks } from '../../src/js/app/state.js';
import { Supa } from '../../src/js/app/supabase.js';
import { Sync } from '../../src/js/app/sync.js';

// A fake server: one row per set.
let rows, puts;
beforeEach(() => {
  localStorage.clear(); locked.clear();
  rows = {}; puts = [];
  Supa.url = 'http://example.test'; Supa.key = 'k';
  Supa.session = { user: { id: 'u1' } };
  Supa.getProgress = async (set) => rows[set] || null;
  Supa.putProgress = async (set, st) => { puts.push(set); rows[set] = JSON.parse(JSON.stringify(st)); };
  hooks.render = () => {};
  initState();
});
const withProgress = (set, rep, updatedAt) => { const s = sets[set].freshState(); s.rep = rep; s.updatedAt = updatedAt; s.setupDone = true; return s; };

test('a newer copy on the server replaces the local one', async () => {
  rows.OLL = withProgress('OLL', 40, Date.now() + 1000);
  await Sync.init();
  assert.equal(S.state.rep, 40);
  assert.equal(JSON.parse(localStorage.getItem('oll-trainer-v1')).rep, 40, 'written locally too');
  assert.equal(Sync.status, 'synced');
  assert.deepEqual(puts, []);
});

test('a newer local copy is uploaded', async () => {
  S.state.rep = 5; S.state.updatedAt = Date.now();
  rows.OLL = withProgress('OLL', 1, Date.now() - 60000);
  await Sync.init();
  assert.deepEqual(puts, ['OLL']);
  assert.equal(rows.OLL.rep, 5);
});

test('nothing on the server: local progress is uploaded, untouched sets are not', async () => {
  S.state.updatedAt = Date.now();
  await Sync.init();
  assert.deepEqual(puts, ['OLL']);
});

test('server data from a newer app is neither read nor overwritten', async () => {
  S.state.rep = 5; S.state.updatedAt = Date.now() + 5000;
  rows.OLL = { ...withProgress('OLL', 70, 1), v: SCHEMA_VERSION + 1 };
  await Sync.init();
  assert.ok(locked.has('OLL'));
  assert.equal(Sync.status, 'update');
  assert.equal(rows.OLL.rep, 70);
  assert.equal(S.state.rep, 5);
  await Sync.push('OLL');
  assert.deepEqual(puts, []);
});

test('an unreachable server pauses sync without losing local progress', async () => {
  Supa.getProgress = async () => { throw { code: 'unavailable' }; };
  S.state.rep = 3;
  await Sync.init();
  assert.equal(Sync.status, 'offline');
  assert.equal(S.state.rep, 3);
});

test('an expired session signs out', async () => {
  Supa.getProgress = async () => { throw { code: 'signed_out' }; };
  await Sync.init();
  assert.equal(Sync.status, 'signedout');
  assert.equal(Sync.live, false);
});

test('without a session nothing is sent', async () => {
  Supa.session = null;
  await Sync.init();
  assert.equal(Sync.status, 'signedout');
  assert.deepEqual(puts, []);
});
