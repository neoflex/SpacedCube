// Sync with the Supabase project, if one is configured and the user is signed in.
// Local storage is always written first; on load, on return to the tab and when back online,
// the copy with the newest updatedAt wins (whole state, per set).
import * as K from '../core/index.js';
import { S, ctx, getState, saveLocalFor, render } from './state.js';
import { Supa } from './supabase.js';

const transient = (e) => { const c = e && e.code; return c === 'unavailable' || c === 'timeout'; };

export const Sync = {
  // local (no server) | signedout | connecting | synced | offline
  status: 'local', live: false, writing: {}, again: {}, timer: {}, lastInit: 0,
  onStatus: () => {},
  set(st) {
    this.status = st;
    this.onStatus(st);
  },
  async init() {
    this.lastInit = Date.now();
    this.live = false;
    if (!Supa.configured()) { this.set('local'); return; }
    if (!Supa.session) { this.set('signedout'); return; }
    this.set('connecting');
    this.live = true;
    try { await this.pullAll(); } catch (e) { this.fail(e); }
  },
  fail(e) {
    if (transient(e)) { this.set('offline'); return; }
    this.live = false;
    if (e && e.code === 'signed_out') { this.set('signedout'); render(); return; }
    this.set('offline');
  },
  async pullAll() { for (const n of Object.keys(K.sets)) await this.pull(n); this.set('synced'); },
  async pull(n) {
    const remote = await Supa.getProgress(n);
    const local = getState(n);
    if (remote && typeof remote === 'object' && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      const st = K.sets[n].normalize(remote);
      saveLocalFor(n, st);
      if (n === S.set) {
        S.state = st;
        if (S.current && !st.cases[S.current.id].active) S.current = null;
        if (st.setupDone && !local.setupDone && S.view === 'cases') S.view = 'practice';
        render();
      } else {
        Object.assign(ctx[n], { state: st, current: null, undo: null });
        if (st.setupDone) ctx[n].view = 'practice';
      }
    } else if ((local.updatedAt || 0) > (remote ? remote.updatedAt || 0 : 0)) {
      await this.push(n);
    }
  },
  schedule(n) {
    if (!this.live) return;
    clearTimeout(this.timer[n]);
    this.timer[n] = setTimeout(() => this.push(n), 1500);
  },
  async push(n) {
    if (!this.live) return;
    if (this.writing[n]) { this.again[n] = true; return; }
    this.writing[n] = true;
    try {
      await Supa.putProgress(n, getState(n));
      this.set('synced');
    } catch (e) {
      this.fail(e);
    } finally {
      this.writing[n] = false;
      if (this.again[n]) { this.again[n] = false; this.push(n); }
    }
  },
  resume() {
    if (this.live) this.pullAll().catch((e) => this.fail(e));
    else if (Date.now() - this.lastInit > 60000 || this.status === 'offline') this.init();
  },
};
