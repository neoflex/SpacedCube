// Application state: the open set (OLL or PLL), its progress, and what is on screen.
// Every module reads and writes it through `S`; persistence goes through save().
import * as K from '../core/index.js';
import { dayKey } from './util.js';

const KEYS = { OLL: 'oll-trainer-v1', PLL: 'pll-trainer-v1' };
const SET_KEY = 'll-trainer-set';
const SHORTCUTS_KEY = 'spacedcube-shortcuts';
const PAUSE_KEY = 'spacedcube-pause';
const DAILY_KEEP = 730; // days of chart history kept in the state (keeps each synced row small)

export const S = {
  set: 'PLL',            // PLL first: 21 cases, and recognising them trains the eye for OLL
  C: null,              // the open case set (K.sets[S.set])
  state: null,          // its saved progress
  view: 'practice',     // practice | cases | progress | options
  current: null,        // { id, scramble, revealed, isNew, hints, ... }
  lastResult: null,     // { id, ok, level, hinted }
  undo: null,           // { state, current }
  setupSel: new Set(),
  filter: 'all',
  sortBy: 'group',      // group | weak | misses
  range: 30,            // days shown in the Progress charts (0 = all)
  dialogId: null,
  algMsg: null,
  algDraft: null,
  dataPanel: null,      // export | import | reset
  dataMsg: null,
  recalAsk: false,
  recalMsg: null,
  storageOK: true,
  shortcuts: true,
  pauseAfterGrade: true, // device setting: wait for "Next scramble" after each grade
  paused: false,         // a grade was just given; the next scramble waits
};

// Hooks set by main.js, so modules need not import each other in a circle.
/** @type {{ render: () => void, afterSave: (set: string) => void, newerData: (set: string) => void }} */
export const hooks = { render: () => {}, afterSave: () => {}, newerData: () => {} };

// Sets whose saved progress was written by a newer version of the app. This version keeps
// working in memory but never writes them, so nothing newer is lost; the user is asked to reload.
export const locked = new Set();
export function lockSet(name) {
  if (locked.has(name)) return;
  locked.add(name);
  hooks.newerData(name);
}
export const render = () => hooks.render();

// ---------- Local storage ----------
export function loadLocal(name) {
  try { const raw = localStorage.getItem(KEYS[name]); return raw ? JSON.parse(raw) : null; }
  catch (e) { S.storageOK = false; return null; }
}
export function saveLocalFor(name, st) {
  if (locked.has(name)) return;
  try { localStorage.setItem(KEYS[name], JSON.stringify(st)); S.storageOK = true; }
  catch (e) { S.storageOK = false; }
}

// Each set keeps its own progress and practice context; the open one lives in S.
export const ctx = {};
export function initState() {
  try { const v = localStorage.getItem(SET_KEY); if (v && K.sets[v]) S.set = v; } catch (e) { /* storage blocked */ }
  try { S.shortcuts = localStorage.getItem(SHORTCUTS_KEY) !== 'off'; } catch (e) { /* storage blocked */ }
  try { S.pauseAfterGrade = localStorage.getItem(PAUSE_KEY) !== 'off'; } catch (e) { /* storage blocked */ }
  for (const n of Object.keys(K.sets)) {
    let st;
    try { st = K.sets[n].normalize(loadLocal(n)); }
    catch (e) {
      if (!(e instanceof K.NewerStateError)) throw e;
      st = K.sets[n].freshState();
      lockSet(n);
    }
    ctx[n] = { state: st, current: null, lastResult: null, undo: null, view: st.setupDone ? 'practice' : 'cases' };
  }
  S.C = K.sets[S.set];
  S.state = ctx[S.set].state;
  S.view = ctx[S.set].view;
}
export const getState = (n) => (n === S.set ? S.state : ctx[n].state);
export function setState(n, st) {
  if (n === S.set) S.state = st; else ctx[n].state = st;
}

export function setPauseAfterGrade(on) {
  S.pauseAfterGrade = on;
  if (!on) S.paused = false;
  try { localStorage.setItem(PAUSE_KEY, on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
}

export function setShortcuts(on) {
  S.shortcuts = on;
  try { localStorage.setItem(SHORTCUTS_KEY, on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
  document.body.classList.toggle('no-shortcuts', !on);
}

// ---------- Daily log (for the Progress charts) ----------
export function snapshotToday() {
  const { state, C } = S;
  if (!state.setupDone) return;
  const act = C.activeIds(state);
  const b = [0, 0, 0, 0, 0];
  act.forEach((id) => b[C.bucketOf(state.cases[id].level)]++);
  const daily = state.daily || (state.daily = {});
  const d = daily[dayKey()] || (daily[dayKey()] = { n: 0, ok: 0 });
  d.b = b; d.act = act.length;
}
function trimDaily() {
  const keys = Object.keys(S.state.daily || {});
  if (keys.length <= DAILY_KEEP) return;
  keys.sort().slice(0, keys.length - DAILY_KEEP).forEach((k) => delete S.state.daily[k]);
}

// Every change: local storage first, then (if signed in) the sync server a moment later.
export function save() {
  snapshotToday();
  trimDaily();
  S.state.updatedAt = Date.now();
  saveLocalFor(S.set, S.state);
  if (!locked.has(S.set)) hooks.afterSave(S.set);
}

// A backup code holds one set's state. Which set? The one all its case ids belong to (null if none).
export function backupOwner(obj) {
  if (!obj || typeof obj !== 'object' || !obj.cases || typeof obj.cases !== 'object') return null;
  const ids = Object.keys(obj.cases);
  if (!ids.length) return null;
  return Object.keys(K.sets).find((n) => ids.every((id) => K.sets[n].CASES[id])) || null;
}

export function switchSet(name) {
  if (name === S.set || !K.sets[name]) return false;
  Object.assign(ctx[S.set], { state: S.state, current: S.current, lastResult: S.lastResult, undo: S.undo, view: S.view });
  S.set = name; S.C = K.sets[name];
  ({ state: S.state, current: S.current, lastResult: S.lastResult, undo: S.undo, view: S.view } = ctx[name]);
  S.paused = false;
  S.setupSel.clear(); S.filter = 'all'; S.sortBy = 'group'; S.dialogId = null; S.dataPanel = null; S.dataMsg = null;
  try { localStorage.setItem(SET_KEY, name); } catch (e) { /* storage blocked */ }
  return true;
}
