(() => {
  const K = CubeCore;
  const KEYS = { OLL: 'oll-trainer-v1', PLL: 'pll-trainer-v1' };
  const SET_KEY = 'll-trainer-set';
  let SET = 'OLL';
  try { const v = localStorage.getItem(SET_KEY); if (v && K.sets[v]) SET = v; } catch (e) { /* storage blocked */ }
  let C = K.sets[SET];
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rng = Math.random;

  // ---------- Persistence ----------
  let storageOK = true;
  function loadLocal(name) {
    try { const raw = localStorage.getItem(KEYS[name]); return raw ? JSON.parse(raw) : null; }
    catch (e) { storageOK = false; return null; }
  }
  function saveLocalFor(name, st) {
    try { localStorage.setItem(KEYS[name], JSON.stringify(st)); storageOK = true; }
    catch (e) { storageOK = false; }
  }
  const saveLocal = () => saveLocalFor(SET, state);

  // Each set (OLL, PLL) keeps its own progress and practice context.
  const ctx = {};
  for (const n of Object.keys(K.sets)) {
    const st = K.sets[n].normalize(loadLocal(n));
    ctx[n] = { state: st, current: null, lastResult: null, undo: null, view: st.setupDone ? 'practice' : 'cases' };
  }
  let state = ctx[SET].state;
  let view = ctx[SET].view;
  let current = null;      // { id, scramble, revealed, isNew }
  let lastResult = null;   // { id, ok, level }
  let undo = null;         // { state, current }
  const setupSel = new Set();
  let filter = 'all';
  let sortBy = 'group';     // 'group' | 'weak' | 'misses'
  let dialogId = null;
  let algMsg = null;       // { ok, text }
  let algDraft = null;
  let dataPanel = null;    // 'export' | 'import' | 'reset'
  let dataMsg = null;
  let recalAsk = false, recalMsg = null;

  // ---------- Daily history (for the Progress charts) ----------
  const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function snapshotToday() {
    if (!state.setupDone) return;
    const act = C.activeIds(state);
    const b = [0, 0, 0, 0, 0];
    act.forEach((id) => b[C.bucketOf(state.cases[id].level)]++);
    const daily = state.daily || (state.daily = {});
    const k = dayKey();
    const d = daily[k] || (daily[k] = { n: 0, ok: 0 });
    d.b = b; d.act = act.length;
  }

  const DAILY_KEEP = 730; // days of chart history kept in the state (keeps each synced row small)
  function trimDaily() {
    const keys = Object.keys(state.daily || {});
    if (keys.length <= DAILY_KEEP) return;
    keys.sort().slice(0, keys.length - DAILY_KEEP).forEach((k) => delete state.daily[k]);
  }
  function save() {
    snapshotToday();
    trimDaily();
    state.updatedAt = Date.now();
    saveLocal();
    Sync.schedule(SET);
  }

  function switchSet(name) {
    if (name === SET || !K.sets[name]) return;
    Object.assign(ctx[SET], { state, current, lastResult, undo, view });
    SET = name; C = K.sets[name];
    ({ state, current, lastResult, undo, view } = ctx[name]);
    setupSel.clear(); filter = 'all'; sortBy = 'group'; dialogId = null; dataPanel = null; dataMsg = null;
    try { localStorage.setItem(SET_KEY, name); } catch (e) { /* storage blocked */ }
    render(); window.scrollTo(0, 0);
  }

  // ---------- Sync (optional) ----------
  // Backends: the Claude artifact database (on claude.ai), else Supabase (if configured), else none.
  // Whatever the backend, local storage is written first and the newest updatedAt wins.
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);
  const getState = (n) => (n === SET ? state : ctx[n].state);
  const CONFIG = (typeof window !== 'undefined' && window.CUBE_TRAINER_CONFIG) || {};

  // Claude artifact runtime: one document per set under the viewer's own id.
  function claudeBackend() {
    const refs = {};
    return {
      name: 'claude', account: 'your Claude account',
      async connect() {
        const [user, db] = await Promise.all([withTimeout(window.claude.use('user'), 12000), withTimeout(window.claude.use('db'), 12000)]);
        if (!user || !db) return false;
        const uid = await withTimeout(user.id(), 10000);
        if (!uid) return false;
        for (const n of Object.keys(K.sets)) refs[n] = db.doc('data/users/' + uid + '/' + n.toLowerCase() + '-trainer');
        return true;
      },
      async get(n) {
        const snap = await withTimeout(refs[n].get(), 10000);
        if (!snap.exists) return null;
        const d = snap.data() || {};
        try { return JSON.parse(d.state); } catch (e) { return null; }
      },
      async put(n, st) {
        await withTimeout(refs[n].set({ v: 1, updatedAt: st.updatedAt || Date.now(), state: JSON.stringify(st) }), 10000);
      },
      transient: (e) => { const c = e && e.code; return c === 'unavailable' || c === 'resource_exhausted' || c === 'timeout'; },
    };
  }

  // Supabase over plain fetch (auth + PostgREST), so nothing extra has to load and the page works offline.
  const AUTH_KEY = 'll-trainer-auth';
  const Supa = {
    url: String(CONFIG.supabaseUrl || '').replace(/\/+$/, ''),
    key: String(CONFIG.supabaseAnonKey || ''),
    session: null,
    configured() { return !!(this.url && this.key); },
    load() { try { this.session = JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { this.session = null; } },
    store(s) {
      this.session = s;
      try { if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ }
    },
    fromTokens(t) {
      let user = t.user || null;
      if (!user) { try { const p = JSON.parse(atob(t.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); user = { id: p.sub, email: p.email }; } catch (e) { user = null; } }
      return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000, user: user && { id: user.id, email: user.email } };
    },
    async req(path, opt = {}, auth = true) {
      const headers = { apikey: this.key, 'Content-Type': 'application/json', ...(opt.headers || {}) };
      if (auth) {
        if (!this.session) throw { code: 'signed_out' };
        if (Date.now() > this.session.expires_at - 60000) await this.refresh();
        headers.Authorization = 'Bearer ' + this.session.access_token;
      }
      let res;
      try { res = await withTimeout(fetch(this.url + path, { ...opt, headers }), 15000); }
      catch (e) { throw { code: e && e.code === 'timeout' ? 'timeout' : 'unavailable' }; }
      if (res.status === 401 && auth && !opt.retried) { await this.refresh(); return this.req(path, { ...opt, retried: true }, auth); }
      let body = null;
      const text = await res.text();
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
      if (!res.ok) throw { code: res.status >= 500 || res.status === 429 ? 'unavailable' : 'http', status: res.status, msg: (body && (body.msg || body.message || body.error_description || body.error)) || '' };
      return body;
    },
    async refresh() {
      const rt = this.session && this.session.refresh_token;
      if (!rt) { this.store(null); throw { code: 'signed_out' }; }
      let t;
      try { t = await this.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) }, false); }
      catch (e) { if (e.code === 'http') { this.store(null); throw { code: 'signed_out' }; } throw e; }
      this.store(this.fromTokens(t));
    },
    // A magic link lands back here with tokens (or an error) in the URL fragment.
    takeRedirect() {
      const h = location.hash || '';
      if (!/access_token=|error_description=/.test(h)) return null;
      const p = new URLSearchParams(h.slice(1));
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      if (p.get('access_token')) { this.store(this.fromTokens(Object.fromEntries(p))); return { ok: true }; }
      return { ok: false, text: 'The sign-in link did not work: ' + (p.get('error_description') || 'unknown error').replace(/\+/g, ' ') + '. Request a new one.' };
    },
    sendLink(email, captchaToken) {
      const redirect = location.origin + location.pathname;
      const body = { email, create_user: !!CONFIG.allowSignup };
      if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
      return this.req('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: JSON.stringify(body) }, false);
    },
    // Deletes the sign-in and every synced row (the table cascades). Progress in this browser stays.
    async deleteAccount() {
      await this.req('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' });
      this.store(null);
    },
    async verifyCode(email, token) {
      const t = await this.req('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email, token }) }, false);
      this.store(this.fromTokens(t));
    },
    async signOut() {
      try { if (this.session) await this.req('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* signing out locally is enough */ }
      this.store(null);
    },
  };
  Supa.load();

  // Check against automated sign-ups (Cloudflare Turnstile). Only used when config.js has a site key.
  // Nothing is loaded from Cloudflare until the user starts signing in (focuses the email field or sends).
  // Usually invisible; it asks for a click only when unsure.
  const Captcha = {
    key: String(CONFIG.turnstileSiteKey || ''),
    token: null, widget: null, loading: null, failed: false,
    load() {
      if (window.turnstile) return Promise.resolve();
      if (!this.loading) {
        this.loading = new Promise((res, rej) => {
          const sc = document.createElement('script');
          sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          sc.async = true;
          sc.onload = () => (window.turnstile ? res() : rej(new Error('captcha')));
          sc.onerror = () => { this.loading = null; rej(new Error('captcha')); };
          document.head.appendChild(sc);
        });
      }
      return this.loading;
    },
    mount() {
      const el = document.getElementById('captcha');
      if (!this.key || !el || el.dataset.mounted) return;
      el.dataset.mounted = '1';
      this.load().then(() => {
        if (!el.isConnected) return;
        if (this.widget != null) { try { window.turnstile.remove(this.widget); } catch (e) { /* already gone */ } }
        this.token = null; this.failed = false;
        this.widget = window.turnstile.render(el, {
          sitekey: this.key, appearance: 'interaction-only', action: 'sign-in',
          callback: (t) => { this.token = t; },
          'expired-callback': () => { this.token = null; },
          'error-callback': () => { this.token = null; this.failed = true; },
        });
      }).catch(() => { this.failed = true; el.textContent = 'The check against automated sign-ups could not load. Check your connection and reload the page.'; });
    },
    // Waits up to `ms` for a token (the check takes a moment after it starts).
    async wait(ms) {
      this.mount();
      for (let t = 0; t < ms && !this.token && !this.failed; t += 100) await new Promise((r) => setTimeout(r, 100));
      return this.token;
    },
    // A token works once: hand it over and start a fresh check for the next attempt.
    take() {
      const t = this.token;
      this.token = null;
      try { if (this.widget != null && window.turnstile) window.turnstile.reset(this.widget); } catch (e) { /* ignore */ }
      return t;
    },
  };

  function supabaseBackend() {
    return {
      name: 'supabase', account: 'your account',
      async connect() { return !!Supa.session; },
      async get(n) {
        const rows = await Supa.req('/rest/v1/progress?select=state&set=eq.' + encodeURIComponent(n), { method: 'GET' });
        return rows && rows[0] ? rows[0].state : null;
      },
      async put(n, st) {
        const row = { user_id: Supa.session.user.id, set: n, state: st, updated_at: new Date(st.updatedAt || Date.now()).toISOString() };
        await Supa.req('/rest/v1/progress?on_conflict=user_id,set', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
      },
      transient: (e) => { const c = e && e.code; return c === 'unavailable' || c === 'timeout'; },
    };
  }

  const Sync = {
    // status: local | signedout | connecting | synced | offline
    status: 'local', backend: null, live: false, writing: {}, again: {}, timer: {}, lastInit: 0,
    set(st) {
      this.status = st; renderSync();
      const p = document.getElementById('sync-text');
      if (p) p.textContent = syncText();
    },
    async init() {
      this.lastInit = Date.now();
      this.live = false;
      if (window.claude && typeof window.claude.use === 'function') this.backend = claudeBackend();
      else if (Supa.configured()) this.backend = supabaseBackend();
      else { this.backend = null; this.set('local'); return; }
      if (this.backend.name === 'supabase' && !Supa.session) { this.set('signedout'); return; }
      this.set('connecting');
      try {
        if (!(await this.backend.connect())) { this.set(this.backend.name === 'supabase' ? 'signedout' : 'local'); return; }
        this.live = true;
        await this.pullAll();
      } catch (e) { this.fail(e); }
    },
    fail(e) {
      if (this.backend && this.backend.transient(e)) { this.set('offline'); return; }
      this.live = false;
      if (e && e.code === 'signed_out') { this.set('signedout'); render(); return; }
      if (this.backend && this.backend.name === 'supabase') { this.set('offline'); return; }
      this.backend = null; this.set('local');
    },
    connected() { return this.live; },
    async pullAll() { for (const n of Object.keys(K.sets)) await this.pull(n); this.set('synced'); },
    async pull(n) {
      const remote = await this.backend.get(n);
      const local = getState(n);
      if (remote && typeof remote === 'object' && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
        const st = K.sets[n].normalize(remote);
        saveLocalFor(n, st);
        if (n === SET) {
          state = st;
          if (current && !state.cases[current.id].active) current = null;
          if (st.setupDone && !local.setupDone && view === 'cases') view = 'practice';
          render();
        } else {
          ctx[n].state = st; ctx[n].current = null; ctx[n].undo = null;
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
        await this.backend.put(n, getState(n));
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.resume(); });
  window.addEventListener('online', () => Sync.resume());

  // ---------- Helpers ----------
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const THRESH = { 3: 'Familiar', 5: 'Solid', 7: 'Mastered' };

  const FACE_COLORS = { F: '#2f9e4f', R: '#d8392b', B: '#2b67d1', L: '#f08519', U: 'var(--sticker-on)', D: '#f4f4f4' };
  function pllDiagram(id, size) {
    const c = view4(id);
    const cell = 24, gap = 2.5, start = 50 - (3 * cell + 2 * gap) / 2, t = 6, o = 3.2;
    const ctr = (i) => start + i * (cell + gap) + cell / 2;
    let r = `<svg class="dg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(C.label(id))} top view with arrows"><rect x="0.5" y="0.5" width="99" height="99" rx="11" fill="var(--cube-body)"/>`;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      r += `<rect x="${start + col * (cell + gap)}" y="${start + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3.5" fill="var(--sticker-on)"/>`;
    }
    const sd = c.sides;
    for (let i = 0; i < 3; i++) {
      const p = start + i * (cell + gap) + 2, len = cell - 4;
      r += `<rect x="${p}" y="${o}" width="${len}" height="${t}" rx="2" fill="${FACE_COLORS[sd.back[i]]}"/>`;
      r += `<rect x="${p}" y="${100 - o - t}" width="${len}" height="${t}" rx="2" fill="${FACE_COLORS[sd.front[i]]}"/>`;
      r += `<rect x="${o}" y="${p}" width="${t}" height="${len}" rx="2" fill="${FACE_COLORS[sd.left[i]]}"/>`;
      r += `<rect x="${100 - o - t}" y="${p}" width="${t}" height="${len}" rx="2" fill="${FACE_COLORS[sd.right[i]]}"/>`;
    }
    const head = (x, y, ux, uy) => {
      const w = 3.6, l = 6;
      return `<polygon points="${x},${y} ${x - ux * l - uy * w},${y - uy * l + ux * w} ${x - ux * l + uy * w},${y - uy * l - ux * w}" fill="#14171c"/>`;
    };
    for (const a of c.arrows) {
      let x1 = ctr(a.from[0]), y1 = ctr(a.from[1]), x2 = ctr(a.to[0]), y2 = ctr(a.to[1]);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, trim = 5;
      x1 += ux * trim; y1 += uy * trim; x2 -= ux * trim; y2 -= uy * trim;
      const sx = a.both ? x1 + ux * 5 : x1, sy = a.both ? y1 + uy * 5 : y1;
      r += `<line x1="${sx}" y1="${sy}" x2="${x2 - ux * 5}" y2="${y2 - uy * 5}" stroke="#14171c" stroke-width="2.4" stroke-linecap="round"/>`;
      r += head(x2, y2, ux, uy);
      if (a.both) r += head(x1, y1, -ux, -uy);
    }
    return r + '</svg>';
  }
  function diagram(id, size) {
    if (C.kind === 'pll') return pllDiagram(id, size);
    const g = view4(id).pattern;
    const on = 'var(--sticker-on)', off = 'var(--sticker-off)';
    const cell = 24, gap = 2.5, start = 50 - (3 * cell + 2 * gap) / 2, t = 6, o = 3.2;
    let r = `<svg class="dg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(C.label(id))} top view"><rect x="0.5" y="0.5" width="99" height="99" rx="11" fill="var(--cube-body)"/>`;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      r += `<rect x="${start + col * (cell + gap)}" y="${start + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3.5" fill="${g.top[row][col] ? on : off}"/>`;
    }
    for (let i = 0; i < 3; i++) {
      const p = start + i * (cell + gap) + 2, len = cell - 4;
      if (g.back[i]) r += `<rect x="${p}" y="${o}" width="${len}" height="${t}" rx="2" fill="${on}"/>`;
      if (g.front[i]) r += `<rect x="${p}" y="${100 - o - t}" width="${len}" height="${t}" rx="2" fill="${on}"/>`;
      if (g.left[i]) r += `<rect x="${o}" y="${p}" width="${t}" height="${len}" rx="2" fill="${on}"/>`;
      if (g.right[i]) r += `<rect x="${100 - o - t}" y="${p}" width="${t}" height="${len}" rx="2" fill="${on}"/>`;
    }
    return r + '</svg>';
  }

  function chip(id) {
    const cs = state.cases[id];
    if (!cs.active) return '<span class="chip off"><i></i>Not started</span>';
    const b = C.bucketOf(cs.level);
    return `<span class="chip" title="Level ${cs.level} of ${C.MAX_LEVEL}"><i class="b${b}"></i>${C.BUCKETS[b]}</span>`;
  }
  function missAgo(cs) {
    const k = state.rep - C.lastMissRep(cs);
    return k <= 1 ? 'last attempt' : k + ' attempts ago';
  }
  function nextLevelText(cs) {
    const at = C.nextLevelAt(cs), wait = at - Date.now();
    if (!cs.lastTs || wait <= 0) return 'Its next correct answer raises its level.';
    const h = wait / 3600000;
    const t = h < 1 ? Math.ceil(wait / 60000) + ' min' : h < 36 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days';
    return `A correct answer raises its level from ${t} from now.`;
  }
  function dueCount() {
    const now = Date.now();
    return C.activeIds(state).filter((id) => { const cs = state.cases[id]; return (cs.n === 0 && cs.last < 0) || C.dueRatio(cs, state.rep, now) >= 1; }).length;
  }
  const pct = (cs) => (cs.n ? Math.round((100 * cs.ok) / cs.n) + '%' : '');
  // What to show for a case: the user's algorithm (if any) and the case as seen from its angle.
  const viewCache = new Map();
  function view4(id) {
    const custom = state.custom[id];
    if (!custom) return C.CASES[id];
    const key = C.name + '|' + id + '|' + custom;
    if (!viewCache.has(key)) viewCache.set(key, C.viewFor(custom));
    return viewCache.get(key);
  }
  const algFor = (id) => view4(id).alg;
  const label = (id) => (C.CASES[id].nick ? `${C.label(id)} ${C.CASES[id].nick}` : C.label(id));

  // ---------- Practice flow ----------
  function newScramble(id) { return K.fmt(C.makeScramble(id, rng, { randomPLL: state.settings.randomPLL })); }

  function nextCase() {
    let isNew = false, id = null;
    if (C.shouldIntroduce(state)) {
      id = C.nextToIntroduce(state);
      C.introduce(state, id, 0);
      isNew = true;
      save();
    } else {
      id = C.pickNext(state, rng, Date.now());
    }
    current = id == null ? null : { id, scramble: newScramble(id), revealed: isNew || state.settings.showFirst, isNew, hints: 0 };
  }

  function gradeCurrent(ok) {
    if (!current) return;
    const hinted = current.hints > 0 || !!current.algSeen;
    if (hinted) ok = false;
    undo = { state: JSON.stringify(state), current: { ...current } };
    const id = current.id;
    const level = C.grade(state, id, ok, Date.now());
    snapshotToday();
    const today = state.daily[dayKey()];
    today.n += 1; if (ok) today.ok += 1;
    lastResult = { id, ok, level, hinted };
    save();
    nextCase();
    render();
  }

  // Algorithm split into displayable moves; parenthesised AUF stays one token.
  function algTokens(id) {
    return algFor(id).replace(/[()\[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  // First hint of an attempt asks for confirmation, since it turns the attempt into a miss.
  function askHint() {
    if (!current || current.revealed) return;
    current.revealAsk = false;
    if (!current.hints && !current.hintAsk && !current.algSeen) { current.hintAsk = true; render(); return; }
    giveHint();
  }
  // Seeing the algorithm turns the attempt into a miss, so the first look asks for confirmation.
  // Space also hides it again once shown.
  function askReveal() {
    if (!current) return;
    current.hintAsk = false;
    if (current.revealed) { current.revealed = false; render(); return; }
    if (current.algSeen) { current.revealed = true; render(); return; }
    current.revealAsk = true; render();
  }
  function confirmReveal() {
    if (!current) return;
    current.revealAsk = false; current.algSeen = true; current.revealed = true; render();
  }
  function giveHint() {
    if (!current || current.revealed) return;
    current.hintAsk = false;
    const n = algTokens(current.id).length;
    current.hints = Math.min(n, (current.hints || 0) + 1);
    render();
  }

  function doUndo() {
    if (!undo) return;
    state = C.normalize(JSON.parse(undo.state));
    current = undo.current;
    undo = null;
    lastResult = null;
    save();
    render();
  }

  function startFromSetup() {
    setupSel.forEach((i) => C.introduce(state, i, 1));
    state.setupDone = true; setupSel.clear(); current = null; save();
  }

  function setActive(id, on) {
    const cs = state.cases[id];
    if (on) C.introduce(state, id, 0);
    else { cs.active = false; cs.removed = true; }
    if (!on && current && current.id === id) current = null;
    save();
  }

  // ---------- Views ----------
  function render() {
    document.querySelectorAll('.tab[data-view]').forEach((t) => t.setAttribute('aria-current', t.dataset.view === view ? 'page' : 'false'));
    document.querySelectorAll('.tab[data-set]').forEach((t) => t.setAttribute('aria-current', t.dataset.set === SET ? 'page' : 'false'));
    const app = $('#app');
    if (view === 'practice') app.innerHTML = practiceView();
    else if (view === 'cases') app.innerHTML = casesView();
    else if (view === 'progress') { app.innerHTML = progressView(); fillCharts(); }
    else app.innerHTML = optionsView();
    renderDialog();
  }

  function renderSync() {
    const el = $('#sync');
    const txt = { local: storageOK ? 'Saved in this browser' : 'Not saved', signedout: storageOK ? 'Saved in this browser' : 'Not saved', connecting: 'Connecting…', synced: 'Synced', offline: 'Sync paused' }[Sync.status];
    el.dataset.s = Sync.status;
    el.innerHTML = `<span>${txt}</span>`;
    el.title = txt;
  }

  function practiceView() {
    if (!current || !state.cases[current.id].active) nextCase();
    const rail = railView();
    if (!current) {
      return `<section class="practice"><div class="card empty">
        <h2>Nothing to practise yet</h2>
        <p class="muted">Add cases from the Cases tab, or turn on automatic introduction in Options.</p>
        <button class="btn primary" data-action="view" data-view="cases">Choose cases</button>
      </div>${rail}</section>`;
    }
    const id = current.id, cs = state.cases[id], c = C.CASES[id];
    const moves = current.scramble.split(' ').map((m) => `<span>${esc(m)}</span>`).join('');
    let answer;
    if (current.revealed) {
      const custom = state.custom[id];
      answer = `<div class="case-show">${diagram(id, 128)}<div class="info">
          <div class="case-title"><b>${esc(C.label(id))}</b><span>${esc(c.nick ? c.nick + ' · ' : '')}${esc(c.group)}</span></div>
          <code class="alg">${esc(algFor(id))}</code>
          ${custom ? '<span class="alg-note">Your algorithm. Standard: ' + esc(c.alg) + '</span>' : ''}
          <div class="row">${chip(id)}<span class="muted" style="font-size:13px">${cs.n ? `${cs.ok}/${cs.n} correct` : 'First time'}</span>
          <button class="linkbtn" data-action="open" data-id="${id}" style="font-size:13px">Case details</button></div>
          <button class="btn small v-open" data-action="watch-current">Watch it in 3D <kbd>W</kbd></button>
        </div></div>`;
    } else {
      const toks = algTokens(id);
      const h = current.hints || 0;
      const shown = toks.slice(0, h).map(esc).join(' ');
      const more = h < toks.length;
      answer = `<div class="hintbox">
        ${h ? `<code class="alg">${shown}${more ? ' <span class="muted">…</span>' : ''}</code>
          <span class="alg-note">${more ? `Move ${h} of ${toks.length}.` : 'That is the whole algorithm.'} Hint used: this attempt counts as missed.</span>` : ''}
        ${current.caseShown ? `<div class="case-show case-only">${diagram(id, 112)}<div class="info">
            <div class="case-title"><b>${esc(C.label(id))}</b><span>${esc(c.nick ? c.nick + ' · ' : '')}${esc(c.group)}</span></div>
            <div class="row">${chip(id)}</div></div></div>` : ''}
        ${current.revealAsk ? `<div class="hintask"><span>Show the algorithm? This attempt will count as missed.</span>
            <span class="row" style="justify-content:center"><button class="btn small" data-action="reveal-yes">Show algorithm <kbd>Space</kbd></button>
            <button class="btn small" data-action="ask-no">Cancel <kbd>Esc</kbd></button></span></div>`
        : `<span class="row" style="justify-content:center;gap:4px 18px">
          ${current.caseShown ? '' : '<button class="reveal" data-action="show-case">Show case only <kbd>C</kbd></button>'}
          <button class="reveal" data-action="reveal">${current.caseShown ? 'Show algorithm' : 'Show case and algorithm'} <kbd>Space</kbd></button>
        </span>`}
        ${current.revealAsk ? '' : current.hintAsk ? `<div class="hintask"><span>Show the first move? This attempt will count as missed.</span>
            <span class="row" style="justify-content:center"><button class="btn small" data-action="hint-yes">Show first move <kbd>H</kbd></button>
            <button class="btn small" data-action="hint-no">Cancel <kbd>Esc</kbd></button></span></div>`
          : more ? `<button class="hintlink" data-action="hint">${h ? 'Next move' : 'Need a hint?'} <kbd>H</kbd></button>` : ''}
        </div>`;
    }
    const helped = current.hints > 0 || !!current.algSeen;
    let last = '';
    if (lastResult) {
      const L = lastResult;
      last = `<span>Last: ${esc(label(L.id))}</span><span class="${L.ok ? 'ok' : 'ko'}">${L.ok ? 'got it' : 'missed'}</span>
        ${L.hinted ? '<span>(help used)</span>' : ''}<span>now ${C.BUCKETS[C.bucketOf(L.level)]}</span>${undo ? '<button class="linkbtn" data-action="undo">Undo</button>' : ''}`;
    }
    return `<section class="practice">
      <div class="card trainer">
        <div class="row between"><span class="eyebrow">Scramble</span><span class="muted" style="font-size:13px">${dueCount() ? `${dueCount()} due now · ` : ''}Attempt ${state.rep + 1}</span></div>
        ${!dueCount() && !current.isNew ? '<div class="newflag">Nothing is due right now. Extra practice keeps you sharp, but levels only rise after a gap, so this is a good moment to stop.</div>' : ''}
        ${current.isNew ? `<div class="newflag"><b>New case: ${esc(label(id))}.</b> Learn the algorithm below, then scramble and try it.</div>` : ''}
        <p class="scramble" aria-label="Scramble: ${esc(current.scramble)}">${moves}</p>
        <p class="hint">Hold yellow on top and green in front, apply the scramble to a solved cube, then solve the ${C.kind === 'pll' ? 'permutation of the last layer. The top face is already solved' : 'orientation of the last layer'}.</p>
        <div class="answer ${current.revealed ? 'open' : ''}">${answer}</div>
        <div class="grades">
          <button class="grade miss" data-action="grade" data-ok="0">Missed <kbd>←</kbd></button>
          <button class="grade hit" data-action="grade" data-ok="1" ${helped ? 'title="Recorded as missed because you used a hint or saw the algorithm"' : ''}>${helped ? 'Solved with help' : 'Got it'} <kbd>→</kbd></button>
        </div>
        <div class="last" aria-live="polite">${last}</div>
      </div>
      ${rail}
    </section>`;
  }

  function railView() {
    const act = C.activeIds(state);
    const buckets = [0, 0, 0, 0, 0];
    act.forEach((id) => buckets[C.bucketOf(state.cases[id].level)]++);
    const strip = C.CASE_IDS.map((id) => {
      const cs = state.cases[id];
      const cls = cs.active ? 'on' : '';
      const sty = cs.active ? ` style="background:var(--m${C.bucketOf(cs.level)})"` : '';
      const st = cs.active ? C.BUCKETS[C.bucketOf(cs.level)] : 'Not started';
      return `<button class="${cls}"${sty} data-action="open" data-id="${id}" title="${esc(C.label(id))}: ${st}" aria-label="${esc(C.label(id))}, ${st}"></button>`;
    }).join('');
    const legend = C.BUCKETS.map((b, i) => `<span><i class="b${i}"></i>${b}</span>`).join('') + '<span><i class="none"></i>Not started</span>';

    const next = C.nextToIntroduce(state);
    let nextHtml;
    if (next == null) {
      nextHtml = `<p class="muted" style="margin:10px 0 0;font-size:13px">All ${C.CASE_IDS.length} cases are in your practice rotation.</p>`;
    } else {
      const bl = C.blockers(state);
      const tname = THRESH[state.settings.introLevel] || 'Familiar';
      let why;
      if (!state.settings.autoIntro) why = 'Automatic introduction is off.';
      else if (!act.length || !bl.length) why = 'Comes up on your next attempt.';
      else {
        const pool = Math.max(1, state.settings.pool || 1);
        const need = bl.length - pool + 1;
        why = `Added when fewer than ${pool} case${pool > 1 ? 's are' : ' is'} below <b>${tname}</b> (now ${bl.length}: ${bl.slice(0, 6).map((i) => C.label(i)).join(', ')}${bl.length > 6 ? '…' : ''}). ${need} more to bring up.`;
        if (bl.length < pool) why = 'Comes up on your next attempt.';
      }
      nextHtml = `<div class="nextcase">${diagram(next, 64)}<div>
        <p><b>${esc(label(next))}</b> · ${esc(C.CASES[next].group)}<br>${why}</p>
        <button class="btn small" data-action="add-next">Add it now</button></div></div>`;
    }

    const weak = act.slice().sort((a, b) => {
      const A = state.cases[a], B = state.cases[b];
      return A.level - B.level || (A.n ? A.ok / A.n : 0) - (B.n ? B.ok / B.n : 0);
    }).slice(0, 5);
    const focus = weak.length ? `<ul class="focus">${weak.map((id) => `<li><button data-action="open" data-id="${id}">${diagram(id, 34)}
        <span>${esc(label(id))}</span><span class="row" style="gap:8px"><span class="pct">${pct(state.cases[id])}</span>${chip(id)}</span></button></li>`).join('')}</ul>`
      : '<p class="muted" style="font-size:13px;margin:8px 0 0">Nothing in practice yet.</p>';

    return `<aside class="rail">
      <div class="card">
        <h2>Progress</h2>
        <div class="stats3">
          <div><b>${buckets[4]}</b><span>mastered</span></div>
          <div><b>${act.length}</b><span>in practice</span></div>
          <div><b>${C.CASE_IDS.length - act.length}</b><span>not started</span></div>
        </div>
        <div class="strip" style="grid-template-columns:repeat(${C.stripCols},1fr)" aria-label="All ${C.CASE_IDS.length} cases">${strip}</div>
        <div class="legend">${legend}</div>
      </div>
      <div class="card"><h2>Next new case</h2>${nextHtml}</div>
      <div class="card"><h2>Needs the most work</h2>${focus}</div>
    </aside>`;
  }

  // ---------- Progress charts ----------
  let range = 30;
  let chartData = null;
  const fmtDay = (k, long) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }); };
  // Axis top with four whole-number steps.
  function niceMax(v) {
    const raw = Math.max(1, v / 4), p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return Math.max(1, Math.round(m * p)) * 4;
    return 40 * p;
  }

  function buildDays() {
    const daily = state.daily || {};
    const keys = Object.keys(daily).sort();
    if (!keys.length) return [];
    const end = new Date(); end.setHours(12, 0, 0, 0);
    let start = new Date(end); start.setDate(start.getDate() - (range - 1));
    const first = new Date(keys[0] + 'T12:00:00');
    if (range === 0 || first > start) start = first;
    const out = [];
    let carry = null;
    for (const k of keys) if (k < dayKey(start.getTime()) && daily[k].b) carry = daily[k];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d.getTime());
      const e = daily[k];
      if (e && e.b) carry = e;
      out.push({ k, n: e ? e.n : 0, ok: e ? e.ok : 0, b: carry ? carry.b : [0, 0, 0, 0, 0], act: carry ? carry.act : 0 });
    }
    return out;
  }

  let W = 720;
  const PL = 36, PR = 8, PT = 10, PB = 26;
  function axes(n, H, max, fmtTick) {
    const pw = W - PL - PR, ph = H - PT - PB;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4, y = PT + ph - (ph * i) / 4;
      g += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" class="gl"/><text x="${PL - 6}" y="${y + 4}" class="tk" text-anchor="end">${fmtTick(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - PL) / 70))));
    for (let i = 0; i < n; i += step) {
      const x = PL + (pw * (i + 0.5)) / n;
      g += `<text x="${x}" y="${H - 8}" class="tk" text-anchor="middle">${fmtDay(chartData[i].k)}</text>`;
    }
    return g;
  }
  // Column with square base and rounded 4px top: path from baseline.
  function col(x, y, w, h, fill) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z" fill="${fill}"/>`;
  }

  function levelChart() {
    const n = chartData.length, H = 240, pw = W - PL - PR, ph = H - PT - PB;
    const max = niceMax(Math.max(1, ...chartData.map((d) => d.act)));
    const slot = pw / n, bw = Math.min(24, slot * 0.7);
    let marks = '';
    chartData.forEach((d, i) => {
      const x = PL + slot * i + (slot - bw) / 2;
      let base = PT + ph;
      const order = [4, 3, 2, 1, 0];
      const top = order.filter((b) => d.b[b] > 0).pop();
      for (const b of order) {
        const h = (ph * d.b[b]) / max;
        if (h <= 0) continue;
        const y = base - h;
        const gapH = Math.max(0, h - (b === top ? 0 : 2));
        marks += b === top ? col(x, y, bw, h, `var(--m${b})`) : `<rect x="${x}" y="${y + 2}" width="${bw}" height="${gapH}" fill="var(--m${b})"/>`;
        base = y;
      }
      marks += `<rect x="${PL + slot * i}" y="${PT}" width="${slot}" height="${ph}" fill="transparent" data-tip="lv" data-i="${i}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" role="img" aria-label="Cases in practice by level, per day">${axes(n, H, max, (v) => Math.round(v))}${marks}</svg>`;
  }

  function attemptsChart() {
    const n = chartData.length, H = 170, pw = W - PL - PR, ph = H - PT - PB;
    const max = niceMax(Math.max(1, ...chartData.map((d) => d.n)));
    const slot = pw / n, bw = Math.min(24, slot * 0.7);
    let marks = '';
    chartData.forEach((d, i) => {
      const x = PL + slot * i + (slot - bw) / 2, h = (ph * d.n) / max;
      marks += col(x, PT + ph - h, bw, h, 'var(--accent)');
      marks += `<rect x="${PL + slot * i}" y="${PT}" width="${slot}" height="${ph}" fill="transparent" data-tip="at" data-i="${i}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" role="img" aria-label="Attempts per day">${axes(n, H, max, (v) => Math.round(v))}${marks}</svg>`;
  }

  function successChart() {
    const n = chartData.length, H = 170, pw = W - PL - PR, ph = H - PT - PB;
    const slot = pw / n;
    const pts = chartData.map((d, i) => (d.n ? { x: PL + slot * (i + 0.5), y: PT + ph - (ph * d.ok) / d.n, i } : null));
    let path = '', area = '', run = [];
    const flush = () => {
      if (run.length > 1) {
        path += `<path d="M${run.map((p) => p.x + ',' + p.y).join('L')}" fill="none" stroke="var(--good)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        area += `<path d="M${run[0].x},${PT + ph}L${run.map((p) => p.x + ',' + p.y).join('L')}L${run[run.length - 1].x},${PT + ph}Z" fill="var(--good)" opacity=".1"/>`;
      }
      run = [];
    };
    pts.forEach((p) => { if (p) run.push(p); else flush(); });
    flush();
    let dots = '';
    pts.forEach((p) => { if (p) dots += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--good)" stroke="var(--surface)" stroke-width="2"/>`; });
    let hits = '';
    chartData.forEach((d, i) => { hits += `<rect x="${PL + slot * i}" y="${PT}" width="${slot}" height="${ph}" fill="transparent" data-tip="sr" data-i="${i}"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" role="img" aria-label="Success rate per day">${axes(n, H, 100, (v) => v + '%')}${area}${path}${dots}${hits}</svg>`;
  }

  function tipHtml(kind, i) {
    const d = chartData[i];
    const head = `<b>${esc(fmtDay(d.k, true))}</b>`;
    if (kind === 'lv') {
      const rows = [4, 3, 2, 1, 0].filter((b) => d.b[b]).map((b) => `<span><i class="sw" style="background:var(--m${b})"></i>${C.BUCKETS[b]}</span><span>${d.b[b]}</span>`).join('');
      return `${head}<div class="tg">${rows || '<span>Nothing in practice</span><span></span>'}<span>In practice</span><span>${d.act}</span></div>`;
    }
    if (kind === 'at') return `${head}<div class="tg"><span>Attempts</span><span>${d.n}</span><span>Correct</span><span>${d.ok}</span></div>`;
    return `${head}<div class="tg"><span>Success</span><span>${d.n ? Math.round((100 * d.ok) / d.n) + '%' : 'no attempts'}</span><span>Attempts</span><span>${d.n}</span></div>`;
  }

  // Charts are drawn at their real width so text stays at its true size.
  function fillCharts() {
    if (!chartData || !chartData.length) return;
    const draw = { lv: levelChart, at: attemptsChart, sr: successChart };
    document.querySelectorAll('.chartwrap[data-chart]').forEach((wrap) => {
      W = Math.max(260, Math.floor(wrap.clientWidth));
      const old = wrap.querySelector('svg'); if (old) old.remove();
      wrap.insertAdjacentHTML('afterbegin', draw[wrap.dataset.chart]());
    });
  }
  let rsTimer = null;
  window.addEventListener('resize', () => { clearTimeout(rsTimer); rsTimer = setTimeout(() => { if (view === 'progress') fillCharts(); }, 150); });

  function progressView() {
    snapshotToday();
    chartData = buildDays();
    const N = C.CASE_IDS.length;
    const daily = state.daily || {};
    const tk = dayKey();
    const today = daily[tk] || { n: 0, ok: 0 };
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
    const wk = dayKey(weekAgo.getTime());
    let wn = 0, wok = 0;
    for (const k in daily) if (k >= wk) { wn += daily[k].n; wok += daily[k].ok; }
    const mastered = C.activeIds(state).filter((id) => C.bucketOf(state.cases[id].level) === 4).length;
    const prev = Object.keys(daily).sort().filter((k) => k < wk).pop();
    const mDelta = prev && daily[prev].b ? mastered - daily[prev].b[4] : null;
    const chipR = (v, t) => `<button class="fchip" data-action="range" data-r="${v}" aria-pressed="${range === v}">${t}</button>`;
    const tiles = `<div class="tiles">
      <div class="card tile"><span>Today</span><b>${today.n}</b><small>${today.n ? Math.round((100 * today.ok) / today.n) + '% correct' : 'no attempts yet'}</small></div>
      <div class="card tile"><span>Last 7 days</span><b>${wn}</b><small>${wn ? Math.round((100 * wok) / wn) + '% correct' : 'no attempts'}</small></div>
      <div class="card tile"><span>Mastered</span><b>${mastered}<em>/${N}</em></b><small>${mDelta == null ? 'cases at level 7 or more' : (mDelta >= 0 ? '+' : '') + mDelta + ' in the last 7 days'}</small></div>
    </div>`;
    if (!chartData.length) {
      return `<section class="progress">${tiles}<div class="card empty"><h2>No history yet</h2><p class="muted">Charts start with your next practice attempt in ${C.name}. Earlier practice was not logged by day.</p></div></section>`;
    }
    const legend = [4, 3, 2, 1, 0].map((b) => `<span><i style="background:var(--m${b})"></i>${C.BUCKETS[b]}</span>`).join('');
    const rows = chartData.slice().reverse().filter((d) => d.n || d.k === tk).map((d) => `<tr><td>${esc(fmtDay(d.k, true))}</td><td>${d.n}</td><td>${d.n ? Math.round((100 * d.ok) / d.n) + '%' : '–'}</td>${[4, 3, 2, 1, 0].map((b) => `<td>${d.b[b]}</td>`).join('')}</tr>`).join('');
    return `<section class="progress">
      ${tiles}
      <div class="toolbar">${chipR(14, '14 days')}${chipR(30, '30 days')}${chipR(90, '90 days')}${chipR(0, 'All')}
        ${chartData.length < 3 ? '<span class="muted" style="font-size:13px">History starts on your first logged day and fills in as you practise.</span>' : ''}</div>
      <div class="card chartcard"><h2>Cases by level</h2><p class="sub">${C.name} cases in practice at the end of each day</p>
        <div class="legend">${legend}</div><div class="chartwrap" data-chart="lv"><div class="tip" hidden></div></div></div>
      <div class="charts2">
        <div class="card chartcard"><h2>Attempts per day</h2><p class="sub">Every graded scramble, including misses</p><div class="chartwrap" data-chart="at"><div class="tip" hidden></div></div></div>
        <div class="card chartcard"><h2>Success rate</h2><p class="sub">Share of attempts marked Got it, without help</p><div class="chartwrap" data-chart="sr"><div class="tip" hidden></div></div></div>
      </div>
      <details class="card"><summary>Show as a table</summary><div class="tablewrap"><table>
        <thead><tr><th>Day</th><th>Attempts</th><th>Success</th>${[4, 3, 2, 1, 0].map((b) => `<th>${C.BUCKETS[b]}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div></details>
    </section>`;
  }

  function casesView() {
    const setup = !state.setupDone;
    const act = C.activeIds(state).length;
    let html = '';
    if (setup) {
      html += `<div class="setup">
        <h2>Which cases do you already kind of know?</h2>
        <p>Tap each case you can already solve, even slowly. They go straight into your practice rotation. The trainer then adds the remaining cases one at a time, each once everything in practice is solid enough.</p>
        <div class="row">
          <button class="btn primary" data-action="setup-start">${setupSel.size ? `Start practising with ${setupSel.size} case${setupSel.size > 1 ? 's' : ''}` : 'Start from scratch'}</button>
          ${setupSel.size ? '<button class="btn" data-action="setup-clear">Clear selection</button>' : `<span class="muted" style="font-size:13px">With nothing selected, you start with ${esc(label(C.first))}.</span>`}
        </div>
      </div>`;
    } else {
      const f = (k, txt, n) => `<button class="fchip" data-action="filter" data-f="${k}" aria-pressed="${filter === k}">${txt} (${n})</button>`;
      const so = (k, txt) => `<option value="${k}" ${sortBy === k ? 'selected' : ''}>${txt}</option>`;
      html += `<div class="toolbar">${f('all', 'All', C.CASE_IDS.length)}${f('on', 'In practice', act)}${f('off', 'Not started', C.CASE_IDS.length - act)}
        <label class="sortby" for="sort-by">Sort <select id="sort-by" data-sort="1">${so('group', 'By group')}${so('weak', 'Weakest first')}${so('misses', 'Recent misses first')}</select></label></div>`;
      if (sortBy !== 'group') {
        let ids = C.CASE_IDS.slice();
        if (filter === 'on') ids = ids.filter((id) => state.cases[id].active);
        if (filter === 'off') ids = ids.filter((id) => !state.cases[id].active);
        if (sortBy === 'weak') {
          ids = C.sortWeakest(state, ids);
          return `<section class="cases"><div class="grid">${ids.map((id) => caseCard(id, false)).join('')}</div></section>`.replace('<div class="grid">', html + '<div class="grid">');
        }
        ids = C.sortRecentMisses(state, ids);
        const missed = ids.filter((id) => C.lastMissRep(state.cases[id]) >= 0);
        const rest = C.sortWeakest(state, ids.filter((id) => C.lastMissRep(state.cases[id]) < 0));
        html += missed.length ? `<div class="gblock"><div class="ghead"><h3>Missed recently</h3><span>most recent first</span></div>
          <div class="grid">${missed.map((id) => caseCard(id, false, true)).join('')}</div></div>`
          : '<p class="muted">No misses recorded yet.</p>';
        if (rest.length) html += `<div class="gblock"><div class="ghead"><h3>No misses</h3><span>${rest.length} case${rest.length > 1 ? 's' : ''}</span></div>
          <div class="grid">${rest.map((id) => caseCard(id, false)).join('')}</div></div>`;
        return `<section class="cases">${html}</section>`;
      }
    }
    for (const g of C.GROUPS) {
      let ids = C.CASE_IDS.filter((id) => C.CASES[id].group === g);
      if (!setup && filter === 'on') ids = ids.filter((id) => state.cases[id].active);
      if (!setup && filter === 'off') ids = ids.filter((id) => !state.cases[id].active);
      if (!ids.length) continue;
      const all = C.CASE_IDS.filter((id) => C.CASES[id].group === g);
      const allOn = setup ? all.every((id) => setupSel.has(id)) : all.every((id) => state.cases[id].active);
      html += `<div class="gblock"><div class="ghead"><h3>${esc(g)}</h3><span>${all.length} case${all.length > 1 ? 's' : ''}</span>
        <button class="btn small" data-action="group" data-group="${esc(g)}" data-on="${allOn ? 0 : 1}">${allOn ? (setup ? 'Unselect group' : 'Remove group') : (setup ? 'Select group' : 'Add group')}</button></div>
        <div class="grid">${ids.map((id) => caseCard(id, setup)).join('')}</div></div>`;
    }
    return `<section class="cases">${html}</section>`;
  }

  function caseCard(id, setup, showMiss) {
    const c = C.CASES[id], cs = state.cases[id];
    const on = setup ? setupSel.has(id) : cs.active;
    const foot = setup ? (on ? '<span class="chip"><i class="b1"></i>Selected</span>' : '<span class="muted">Tap to select</span>')
      : `${chip(id)}${cs.n ? `<span>${cs.ok}/${cs.n}</span>` : ''}`;
    return `<div class="ccard ${setup && on ? 'sel' : ''} ${!setup && on ? 'on' : ''}">
      <button class="cmain" data-action="${setup ? 'setup-toggle' : 'open'}" data-id="${id}" ${setup ? `aria-pressed="${on}"` : ''} aria-label="${esc(label(id))}">
        ${diagram(id, 84)}
        <span class="cbody">
          <span class="ctop"><span class="cnum">${id}</span>${c.nick ? `<span class="cnick">${esc(c.nick)}</span>` : ''}</span>
          <code class="calg">${esc(algFor(id))}</code>
          <span class="cfoot">${foot}</span>
          ${showMiss ? `<span class="cmiss">Missed ${missAgo(cs)}</span>` : ''}
        </span>
      </button>
      ${setup ? `<button class="cinfo" data-action="open" data-id="${id}" title="Details and custom algorithm" aria-label="Details for ${esc(C.label(id))}">Details</button>` : ''}
      <button class="ctoggle" data-action="${setup ? 'setup-toggle' : 'toggle'}" data-id="${id}" aria-pressed="${on}" title="${on ? (setup ? 'Unselect' : 'Remove from practice') : (setup ? 'Select' : 'Add to practice')}" aria-label="${on ? 'In practice' : 'Not in practice'}: ${esc(C.label(id))}">${on ? CHECK : PLUS}</button>
    </div>`;
  }

  function syncText() {
    const acct = Sync.backend ? Sync.backend.account : 'your account';
    const local = storageOK ? 'Progress is saved in this browser only. Use a backup code to move it to another device.'
      : 'This browser is blocking storage, so progress lasts only while the page is open. Copy a backup code before leaving.';
    return {
      local,
      signedout: (storageOK ? 'Progress is saved in this browser.' : 'This browser is blocking storage, so progress lasts only while the page is open.') + ' Sign in to sync it to your other devices.',
      connecting: `Connecting to ${acct} to sync progress…`,
      synced: `Progress is saved in this browser and synced to ${acct}, so it follows you to other devices where you open this page.`,
      offline: `${acct.charAt(0).toUpperCase() + acct.slice(1)} could not be reached just now. Progress is saved in this browser and syncs again when the connection returns.`,
    }[Sync.status];
  }

  // Sign-in for the Supabase backend: magic link, or the 6-digit code from the same email
  // (an installed app on a phone often cannot receive the link, so the code is the reliable path).
  let auth = { step: 'email', email: '', busy: false, msg: null, del: false };
  const PRIVACY = '<a href="privacy.html" style="color:var(--accent)">Privacy</a>';
  function accountView() {
    if (!Sync.backend || Sync.backend.name !== 'supabase') return '';
    const m = auth.msg ? `<p class="msg ${auth.msg.ok ? 'ok' : 'err'}">${esc(auth.msg.text)}</p>` : '';
    const dis = auth.busy ? 'disabled' : '';
    if (Supa.session) {
      const who = (Supa.session.user && Supa.session.user.email) || 'your account';
      const del = auth.del
        ? `<div class="confirm"><b>Delete your account?</b><span>Your sign-in and the progress stored on the sync server are deleted. Progress in this browser stays. This cannot be undone.</span>
            <div class="row"><button class="btn small danger" data-action="delete-yes" ${dis}>Delete my account</button><button class="btn small" data-action="delete-no">Keep my account</button></div></div>`
        : '';
      return `<div class="sec account"><p style="margin:0">Signed in as <b>${esc(who)}</b>.</p>
        <div class="row"><button class="btn small" data-action="sync-now">Sync now</button><button class="btn small" data-action="sign-out">Sign out</button>${auth.del ? '' : '<button class="btn small danger" data-action="delete-ask">Delete account…</button>'}</div>${del}${m}
        <p class="muted" style="margin:0;font-size:13px">${PRIVACY}</p></div>`;
    }
    if (auth.step === 'code') {
      return `<div class="sec account"><p style="margin:0">We sent a sign-in email to <b>${esc(auth.email)}</b>. Open its link on this device, or type the code from the email here.</p>
        <form class="row" data-form="code"><input id="auth-code" class="field" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code" aria-label="Code from the email">
        <button class="btn small primary" ${dis}>Sign in</button><button type="button" class="btn small" data-action="auth-back">Use another email</button></form>${m}</div>`;
    }
    const intro = CONFIG.allowSignup
      ? 'Sign in to sync progress between devices. New here? The same email creates your account.'
      : 'Sign in to sync progress between devices.';
    return `<div class="sec account"><label for="auth-email">${intro}</label>
      <form class="row" data-form="email"><input id="auth-email" class="field" type="email" autocomplete="email" required placeholder="you@example.com" value="${esc(auth.email)}">
      <button class="btn small primary" ${dis}>Send sign-in email</button></form>
      ${Captcha.key ? '<div id="captcha" class="captcha"></div>' : ''}${m}
      <p class="muted" style="margin:0;font-size:13px">We store your email and your practice progress, nothing else. ${PRIVACY}</p></div>`;
  }
  function authError(e) {
    if (e && (e.code === 'unavailable' || e.code === 'timeout')) return 'The sync server could not be reached. Check your connection and try again.';
    const t = String((e && e.msg) || '');
    if (t === 'captcha pending') return 'The check below the field is not finished yet. Wait a moment and try again.';
    if (/captcha/i.test(t)) return 'The check against automated sign-ups did not pass. Wait a moment and try again.';
    if (/signup|not allowed|not found/i.test(t)) return CONFIG.allowSignup ? 'This sync server is not accepting new accounts right now.' : 'There is no account for this email on this sync server.';
    if (/expired|invalid/i.test(t)) return 'That code is wrong or has expired. Request a new email.';
    if (e && e.status === 429) return 'Too many emails were requested. Wait a minute and try again.';
    return t ? 'Sign-in failed: ' + t : 'Sign-in failed.';
  }
  document.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'auth-email') Captcha.mount(); });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest && e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    if (auth.busy) return;
    auth.busy = true; auth.msg = null;
    try {
      if (f.dataset.form === 'email') {
        auth.email = $('#auth-email').value.trim();
        let token = null;
        if (Captcha.key) {
          await Captcha.wait(8000);
          token = Captcha.take();
          if (!token) throw { msg: Captcha.failed ? 'captcha failed' : 'captcha pending' };
        }
        await Supa.sendLink(auth.email, token);
        auth.step = 'code';
      } else {
        const code = $('#auth-code').value.replace(/\s+/g, '');
        if (!code) throw { msg: 'invalid' };
        await Supa.verifyCode(auth.email, code);
        auth = { step: 'email', email: '', busy: false, msg: { ok: true, text: 'Signed in.' }, del: false };
        await Sync.init();
      }
    } catch (err) { auth.msg = { ok: false, text: authError(err) }; }
    auth.busy = false;
    render();
    const next = $('#auth-code'); if (next && auth.step === 'code' && !auth.msg) next.focus();
  });

  function optionsView() {
    const s = state.settings;
    let panel = '';
    if (dataPanel === 'export') {
      panel = `<div class="sec"><label for="backup-out">Backup code: copy it and keep it somewhere safe.</label>
        <textarea id="backup-out" readonly>${esc(JSON.stringify(state))}</textarea>
        <div class="row"><button class="btn small" data-action="copy">Copy</button><button class="btn small" data-action="panel-close">Close</button></div></div>`;
    } else if (dataPanel === 'import') {
      panel = `<div class="sec"><label for="backup-in">Paste a backup code. It replaces the progress on this page.</label>
        <textarea id="backup-in" spellcheck="false"></textarea>
        <div class="row"><button class="btn small primary" data-action="import">Restore</button><button class="btn small" data-action="panel-close">Cancel</button></div></div>`;
    } else if (dataPanel === 'reset') {
      panel = `<div class="confirm"><b>Erase all progress?</b><span>Every level, attempt and custom algorithm is deleted. This cannot be undone.</span>
        <div class="row"><button class="btn small danger" data-action="reset">Erase everything</button><button class="btn small" data-action="panel-close">Keep my progress</button></div></div>`;
    }
    const gapTxt = (ms) => (ms === 0 ? 'none' : ms < 3600000 ? ms / 60000 + ' min' : ms < 86400000 ? ms / 3600000 + ' h' : ms / 86400000 + ' d');
    const ladder = C.GAP_MS.slice(0, C.MAX_LEVEL).map((v, i) => `<span>L${i}→${i + 1}: ${gapTxt(v)}</span>`).join('');
    return `<section class="options">
      <div class="card">
        <h2>Practice</h2>
        <p class="muted" style="margin:4px 0 0;font-size:13px">These settings apply to ${C.name}.</p>
        <div style="margin-top:6px">
          <div class="opt"><input type="checkbox" id="o-auto" data-setting="autoIntro" ${s.autoIntro ? 'checked' : ''}>
            <label for="o-auto">Add new cases automatically</label>
            <p>The next case in the learning order joins the rotation whenever fewer cases than the number below are still being learned.</p></div>
          <div class="opt"><span></span>
            <label for="o-pool">Cases being learned at the same time
              <select id="o-pool" data-setting="pool">
                ${[1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}" ${(s.pool || 1) === v ? 'selected' : ''}>${v}</option>`).join('')}
              </select></label>
            <p>With 1, a new case only arrives once everything in practice has reached the level below.</p></div>
          <div class="opt"><span></span>
            <label for="o-level">A case counts as learned at
              <select id="o-level" data-setting="introLevel">
                ${[3, 5, 7].map((v) => `<option value="${v}" ${s.introLevel === v ? 'selected' : ''}>${THRESH[v]} (level ${v})</option>`).join('')}
              </select></label>
            <p>Familiar needs a correct answer after a 10-minute gap, Solid one after a gap of at least a day, Mastered one after at least 4 days.</p></div>
          <div class="opt"><input type="checkbox" id="o-pll" data-setting="randomPLL" ${s.randomPLL ? 'checked' : ''}>
            <label for="o-pll">${C.kind === 'pll' ? 'Disguise scrambles' : 'Scramble the last-layer permutation too'}</label>
            <p>${C.kind === 'pll' ? 'Scrambles combine two other PLLs (about 24 moves) instead of undoing the algorithm (about 14), so you cannot recognise the case from the moves.'
              : 'Scrambles run about 18 moves instead of about 11 and do not simply undo the algorithm, so you cannot recognise the case from the moves.'}</p></div>
          <div class="opt"><input type="checkbox" id="o-show" data-setting="showFirst" ${s.showFirst ? 'checked' : ''}>
            <label for="o-show">Show the case before I solve</label>
            <p>Reveals the diagram and algorithm with every scramble, without counting it as a miss. Leave it off to practise recognition.</p></div>
        </div>
      </div>
      <div class="card prose">
        <h2>How cases are picked</h2>
        <p>Each case has a level from 0 to 10. <b>Missed</b> drops it to about half its level, so a forgotten case comes back quickly.</p>
        <p><b>Got it</b> moves a case up one level only if enough time has passed since you last saw it (the ladder below). Getting a case right while it is still fresh in your mind proves little, so it is recorded but does not raise the level. Levels 0 and 1 are the exception, so you can learn a new case within one session. Reaching Mastered therefore takes correct answers after gaps of 10 minutes, 8 hours, 1, 2 and 4 days: at least a week.</p>
        <p>A case is due when that time has passed (at levels 0 and 1, after a few other attempts). The next case is drawn at random, weighted by the square of how due each case is, so due cases come up often and the others only now and then. Extra practice before a case is due still keeps it sharp, and a miss still counts.</p>
        <p>Two adjustments then favour some cases over others that are equally due. A weaker recent record (your last 20 results) raises the weight: a case you get right 60% of the time comes up about 1.4 times as often as one you always get right. A case with few attempts gets a small boost that fades after about 15 to 20 attempts. Together they can roughly double a case's chance.</p>
        <div class="ladder">${ladder}</div>
        <p class="muted" style="font-size:13px">Minimum time since a case was last seen before a correct answer raises its level. Levels 0 to 2 are Learning (0 is New), 3 and 4 Familiar, 5 and 6 Solid, 7 and up Mastered.</p>
        <div class="sec" style="margin-top:12px">
          <p style="margin:0">Levels earned before this rule existed may be higher than your long-term memory supports. You can cap every case at Solid (level 5) so the higher levels have to be earned again with real gaps.</p>
          ${recalAsk ? `<div class="confirm"><b>Cap all ${C.name} cases at Solid?</b><span>Cases above level 5 go back to level 5. Attempts and history are kept.</span>
            <div class="row"><button class="btn small danger" data-action="recal-yes">Cap at Solid</button><button class="btn small" data-action="recal-no">Cancel</button></div></div>`
            : '<div class="row"><button class="btn small" data-action="recal">Recalibrate levels…</button></div>'}
          ${recalMsg ? `<p class="msg ok">${esc(recalMsg)}</p>` : ''}
        </div>
      </div>
      <div class="card">
        <h2>Your data</h2>
        <p class="muted" id="sync-text" style="margin:8px 0 12px">${esc(syncText())}</p>
        ${accountView()}
        <div class="row" style="margin-bottom:12px">
          <button class="btn small" data-action="panel" data-p="export">Show backup code</button>
          <button class="btn small" data-action="panel" data-p="import">Restore from backup</button>
          <button class="btn small danger" data-action="panel" data-p="reset">Reset all progress</button>
        </div>
        ${panel}
        ${dataMsg ? `<p class="msg ${dataMsg.ok ? 'ok' : 'err'}">${esc(dataMsg.text)}</p>` : ''}
      </div>
      <p class="muted" style="font-size:13px">${C.kind === 'pll' ? 'PLL algorithms are the widely used standard set; a closing U turn is included where the algorithm needs one.' : 'OLL algorithms and case numbers follow <a href="https://jperm.net/algs/oll" style="color:var(--accent)">jperm.net/algs/oll</a>.'} Every case diagram and scramble on this page is computed from the algorithms by a cube simulator.</p>
    </section>`;
  }

  function renderDialog() {
    const box = $('#dlg');
    if (dialogId == null) { box.innerHTML = ''; return; }
    const id = dialogId, c = C.CASES[id], cs = state.cases[id];
    const hist = cs.hist ? cs.hist.split('').map((h) => `<i class="h${h}" title="${h === '1' ? 'Got it' : 'Missed'}"></i>`).join('') : '';
    const custom = state.custom[id] || '';
    const inputVal = algDraft != null ? algDraft : custom;
    box.innerHTML = `<div class="overlay" data-action="close-bg"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <button class="x" data-action="close" aria-label="Close">×</button>
      <div class="dlg-head">${diagram(id, 132)}<div>
        <h2 id="dlg-title">${esc(C.label(id))}${c.nick ? ` <span>${esc(c.nick)}</span>` : ''}</h2>
        <p class="muted">${esc(c.group)}</p>${chip(id)}</div></div>
      <div class="sec"><h4>Algorithm</h4>
        <code class="alg">${esc(algFor(id))}</code>
        ${custom ? `<span class="alg-note">Your algorithm; the diagram shows the case from its angle. Standard: ${esc(c.alg)}</span>` : ''}
        <button class="btn small v-open" data-action="watch-case" data-id="${id}">Watch it in 3D</button>
        <label for="custom-alg" style="font-size:13px;margin-top:6px">Your own algorithm (optional, shown instead of the one above)</label>
        <div class="field"><input id="custom-alg" value="${esc(inputVal)}" placeholder="${esc(c.alg)}" spellcheck="false" autocomplete="off" autocapitalize="off">
          <button class="btn small" data-action="save-alg">Check and save</button>
          ${custom ? '<button class="btn small" data-action="clear-alg">Use the standard one</button>' : ''}</div>
        <p class="msg ${algMsg ? (algMsg.ok ? 'ok' : 'err') : ''}">${algMsg ? esc(algMsg.text) : ''}</p>
      </div>
      <div class="sec"><h4>Your record</h4>
        <div class="kv">
          <div><b>${cs.n}</b><span>attempts</span></div>
          <div><b>${cs.ok}</b><span>correct</span></div>
          <div><b>${cs.n ? pct(cs) : '–'}</b><span>success</span></div>
          <div><b>${cs.active ? cs.level : '–'}</b><span>level</span></div>
        </div>
        ${hist ? `<div class="hist"><span>Recent, oldest first:</span>${hist}</div>` : ''}
        ${cs.active && cs.level < C.MAX_LEVEL ? `<p class="muted" style="margin:0;font-size:13px">${nextLevelText(cs)}</p>` : ''}
      </div>
      <div class="actions">
        ${cs.active ? '<button class="btn small" data-action="dlg-toggle" data-on="0">Remove from practice</button>' : '<button class="btn small primary" data-action="dlg-toggle" data-on="1">Add to practice</button>'}
        ${cs.level < 5 ? '<button class="btn small" data-action="known">I know this one well</button>' : ''}
        ${cs.n || cs.level ? '<button class="btn small danger" data-action="reset-case">Reset this case</button>' : ''}
      </div>
    </div></div>`;
    const x = box.querySelector('.x');
    if (x && !box.contains(document.activeElement)) x.focus();
  }

  // ---------- 3D viewer: plays an algorithm on a cube, slowly ----------
  // The installable app serves its own copy (no third-party request); the Claude artifact can only use cdnjs.
  const THREE_URL = window.SPACEDCUBE_THREE_URL || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let threePromise = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!threePromise) {
      threePromise = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = THREE_URL; sc.async = true;
        sc.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('three')));
        sc.onerror = () => { threePromise = null; rej(new Error('load')); };
        document.head.appendChild(sc);
      });
    }
    return threePromise;
  }
  const HEX = { U: 0xf3c300, D: 0xf4f4f4, F: 0x2f9e4f, B: 0x2b67d1, R: 0xd8392b, L: 0xf08519 };
  const SPEEDS = { 0.5: 1400, 1: 800, 2: 400 };
  let V = null; // open viewer
  function savedSpeed() { try { const v = Number(sessionStorage.getItem('v-speed')); return SPEEDS[v] ? v : 1; } catch (e) { return 1; } }

  // seq: [{f,a,tag}] moves to play; start: face-turn sequence that sets up the cube.
  function openViewer({ title, sub, start, seq }) {
    closeViewer();
    V = { title, sub, start, seq, i: 0, playing: false, busy: false, speed: savedSpeed() };
    const box = document.getElementById('viewer');
    box.innerHTML = `<div class="overlay" data-action="v-close-bg"><div class="dialog viewer" role="dialog" aria-modal="true" aria-labelledby="v-title">
      <button class="x" data-action="v-close" aria-label="Close">×</button>
      <div><h2 id="v-title" class="v-title">${esc(title)}</h2><p class="muted" style="margin:2px 0 0;font-size:13px">${esc(sub)}</p></div>
      <div class="v-stage" id="v-stage"><p class="muted v-msg">Loading the 3D cube…</p></div>
      <div class="v-moves" id="v-moves">${seq.map((m, k) => `<span data-k="${k}" class="${m.tag ? 'auf' : ''}" title="${m.tag ? esc(m.tag) : ''}">${esc(K.fmt([m]))}</span>`).join('')}</div>
      <div class="v-ctrl">
        <button class="btn small" data-action="v-restart" aria-label="Back to start" title="Back to start">⏮</button>
        <button class="btn small" data-action="v-back" aria-label="Previous move" title="Previous move (←)">◀</button>
        <button class="btn primary v-play" data-action="v-play" id="v-play">Play <kbd>Space</kbd></button>
        <button class="btn small" data-action="v-next" aria-label="Next move" title="Next move (→)">▶</button>
        <label class="v-speed" for="v-speed">Speed <select id="v-speed" data-vspeed="1">
          ${[0.5, 1, 2].map((s) => `<option value="${s}" ${V.speed === s ? 'selected' : ''}>${s}×</option>`).join('')}</select></label>
      </div>
      <p class="muted" style="margin:0;font-size:12px">Drag the cube to look around. Yellow on top, green in front, like the scramble.</p>
    </div></div>`;
    loadThree().then(() => { if (V) buildScene(); }).catch(() => {
      const st = document.getElementById('v-stage');
      if (st) st.innerHTML = '<p class="muted v-msg">The 3D viewer could not load. Check your connection and try again.</p>';
    });
  }

  function buildScene() {
    const THREE = window.THREE, stage = document.getElementById('v-stage');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { stage.innerHTML = '<p class="muted v-msg">3D is not available in this browser.</p>'; return; }
    stage.innerHTML = '';
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(4.4, 5.4, 7.6); camera.lookAt(0, 0, 0);
    const root = new THREE.Group(); scene.add(root);
    root.rotation.x = 0.12; root.rotation.y = -0.2;
    const pivot = new THREE.Group(); root.add(pivot);
    const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x111317 });
    const bodies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const m = new THREE.Mesh(bodyGeo, bodyMat); m.position.set(x, y, z); m.userData.p = [x, y, z];
      root.add(m); bodies.push(m);
    }
    // Rounded sticker shape.
    const sh = new THREE.Shape(), s = 0.42, r = 0.1;
    sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r);
    sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r);
    sh.quadraticCurveTo(-s, -s, -s + r, -s);
    const stGeo = new THREE.ShapeGeometry(sh);
    const mats = {};
    for (const k in HEX) mats[k] = new THREE.MeshBasicMaterial({ color: HEX[k], side: THREE.DoubleSide });
    const Z = new THREE.Vector3(0, 0, 1);
    let cube, stickers;
    function place(mesh, st) {
      mesh.position.set(st.p[0] + st.n[0] * 0.49, st.p[1] + st.n[1] * 0.49, st.p[2] + st.n[2] * 0.49);
      mesh.quaternion.setFromUnitVectors(Z, new THREE.Vector3(st.n[0], st.n[1], st.n[2]));
    }
    function reset(toIndex) {
      if (stickers) stickers.forEach((m) => root.remove(m));
      cube = K.applyMoves(K.solvedCube(), V.start);
      for (let k = 0; k < toIndex; k++) K.applyMove(cube, V.seq[k]);
      stickers = cube.map((st) => { const m = new THREE.Mesh(stGeo, mats[st.c]); m.userData.st = st; place(m, st); root.add(m); return m; });
    }
    reset(0);
    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    // Drag to orbit.
    let drag = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx: root.rotation.x, ry: root.rotation.y }; renderer.domElement.setPointerCapture(e.pointerId); });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!drag) return;
      root.rotation.y = drag.ry + (e.clientX - drag.x) * 0.01;
      root.rotation.x = Math.max(-1.2, Math.min(1.3, drag.rx + (e.clientY - drag.y) * 0.01));
    });
    renderer.domElement.addEventListener('pointerup', () => { drag = null; });
    const AX = ['x', 'y', 'z'];
    let anim = null;
    // Animate one move (forward or inverse) then commit it to the sticker state.
    function turn(mv, dir, done) {
      const [axis, sel, q1] = K.MOVE_DEF[mv.f];
      let q = (q1 * mv.a) % 4; if (dir < 0) q = (4 - q) % 4;
      const angle = q === 1 ? Math.PI / 2 : q === 3 ? -Math.PI / 2 : Math.PI;
      const parts = stickers.filter((m) => sel(m.userData.st.p[axis])).concat(bodies.filter((b) => sel(b.userData.p[axis])));
      parts.forEach((m) => pivot.attach(m));
      const dur = SPEEDS[V.speed] * (q === 2 ? 1.4 : 1);
      anim = { t0: performance.now(), dur, axis: AX[axis], angle, parts, done: () => {
        parts.forEach((m) => root.attach(m));
        pivot.rotation.set(0, 0, 0);
        K.applyMove(cube, { f: mv.f, a: dir < 0 ? (4 - mv.a) % 4 : mv.a });
        stickers.forEach((m) => place(m, m.userData.st));
        bodies.forEach((b) => { b.position.set(...b.userData.p); b.rotation.set(0, 0, 0); });
        anim = null; done();
      } };
    }
    function frame(now) {
      if (!V || V.scene !== api) return;
      if (anim) {
        const t = Math.min(1, (now - anim.t0) / anim.dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.rotation.set(0, 0, 0); pivot.rotation[anim.axis] = anim.angle * e;
        if (t >= 1) anim.done();
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    const api = {
      step(dir, after) {
        if (anim) return;
        if (dir > 0 && V.i >= V.seq.length) return;
        if (dir < 0 && V.i <= 0) return;
        const mv = dir > 0 ? V.seq[V.i] : V.seq[V.i - 1];
        V.i += dir; markMove();
        turn(mv, dir, () => after && after());
      },
      jump(i) { anim = null; stickers.forEach((m) => root.attach(m)); pivot.rotation.set(0, 0, 0); bodies.forEach((b) => { root.attach(b); b.position.set(...b.userData.p); b.rotation.set(0, 0, 0); }); V.i = i; reset(i); markMove(); },
      resize,
      dispose() { renderer.dispose(); },
      busy: () => !!anim,
    };
    V.scene = api;
    window.addEventListener('resize', resize);
    V.unbind = () => window.removeEventListener('resize', resize);
    requestAnimationFrame(frame);
    markMove();
    setTimeout(() => vPlay(true), 500);
  }

  function markMove() {
    document.querySelectorAll('#v-moves span').forEach((el) => {
      const k = Number(el.dataset.k);
      el.classList.toggle('done', k < V.i); el.classList.toggle('now', k === V.i);
    });
    const b = document.getElementById('v-play');
    if (b) b.innerHTML = V.i >= V.seq.length ? 'Replay <kbd>Space</kbd>' : V.playing ? 'Pause <kbd>Space</kbd>' : 'Play <kbd>Space</kbd>';
  }
  function vLoop() {
    if (!V || !V.playing || !V.scene) return;
    if (V.i >= V.seq.length) { V.playing = false; markMove(); return; }
    V.scene.step(1, () => setTimeout(vLoop, SPEEDS[V.speed] * 0.35));
  }
  function vPlay(on) {
    if (!V || !V.scene) return;
    if (on && V.i >= V.seq.length) { V.scene.jump(0); setTimeout(() => vPlay(true), 400); return; }
    V.playing = on; markMove();
    if (on && !V.scene.busy()) vLoop();
  }
  function vStep(dir) { if (!V || !V.scene) return; V.playing = false; V.scene.step(dir); markMove(); }
  function closeViewer() {
    if (!V) return;
    if (V.scene) V.scene.dispose();
    if (V.unbind) V.unbind();
    V = null;
    const box = document.getElementById('viewer'); if (box) box.innerHTML = '';
  }

  const tagMoves = (n, tag) => (n ? [{ f: 'U', a: n, tag }] : []);
  // From the cube in your hands: the scramble of the current attempt.
  function watchCurrent() {
    if (!current) return;
    const id = current.id, alg = state.custom[id] || C.CASES[id].alg;
    const start = K.parse(current.scramble);
    const p = C.solvePath(start, alg);
    if (!p) return;
    openViewer({
      title: `${label(id)}: from your scramble`, sub: p.pre ? 'Grey moves are U turns to line the case up (before) or to finish (after).' : (p.post ? 'The grey move at the end lines up the top layer.' : 'Starting from the position the scramble gives.'),
      start, seq: tagMoves(p.pre, 'Line up the case').concat(p.moves, tagMoves(p.post, 'Finish: align the top layer')),
    });
  }
  // From the case as drawn in its diagram.
  function watchCase(id) {
    const shown = algFor(id);
    const ft = K.toFaceTurns(K.parse(shown));
    let start = K.invert(ft);
    const p = C.solvePath(start, shown);
    openViewer({
      title: `${label(id)}`, sub: 'Starting from the case as shown in its diagram.',
      start, seq: p ? tagMoves(p.pre, 'Line up the case').concat(p.moves, tagMoves(p.post, 'Finish: align the top layer')) : K.parse(shown),
    });
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id != null ? el.dataset.id : null;
    if ((a === 'close-bg' || a === 'v-close-bg') && e.target !== el) return;
    switch (a) {
      case 'set': switchSet(el.dataset.set); break;
      case 'view':
        view = el.dataset.view; dataPanel = null; dataMsg = null;
        if (view === 'practice' && !state.setupDone) { startFromSetup(); }
        render(); window.scrollTo(0, 0); break;
      case 'reveal': askReveal(); break;
      case 'reveal-yes': confirmReveal(); break;
      case 'ask-no': if (current) { current.revealAsk = false; render(); } break;
      case 'hint': askHint(); break;
      case 'watch-current': watchCurrent(); break;
      case 'watch-case': watchCase(id); break;
      case 'v-close': closeViewer(); break;
      case 'v-close-bg': if (e.target === el) closeViewer(); break;
      case 'v-play': vPlay(!(V && V.playing)); break;
      case 'v-next': vStep(1); break;
      case 'v-back': vStep(-1); break;
      case 'v-restart': if (V && V.scene) { V.playing = false; V.scene.jump(0); } break;
      case 'show-case': if (current) { current.caseShown = true; current.hintAsk = false; current.revealAsk = false; render(); } break;
      case 'hint-yes': giveHint(); break;
      case 'hint-no': if (current) { current.hintAsk = false; render(); } break;
      case 'grade': gradeCurrent(el.dataset.ok === '1'); break;
      case 'undo': doUndo(); break;
      case 'open': dialogId = id; algMsg = null; renderDialog(); break;
      case 'close': case 'close-bg': dialogId = null; renderDialog(); break;
      case 'toggle': setActive(id, !state.cases[id].active); render(); break;
      case 'dlg-toggle': setActive(dialogId, el.dataset.on === '1'); render(); break;
      case 'known': C.introduce(state, dialogId, 5); state.cases[dialogId].level = Math.max(state.cases[dialogId].level, 5); save(); render(); break;
      case 'reset-case': {
        const cs = state.cases[dialogId];
        Object.assign(cs, { level: 0, n: 0, ok: 0, last: -1, lastTs: 0, hist: '', lastMiss: -1 });
        save(); render(); break;
      }
      case 'add-next': {
        const n = C.nextToIntroduce(state);
        if (n != null) {
          C.introduce(state, n, 0); save();
          current = { id: n, scramble: newScramble(n), revealed: true, isNew: true, hints: 0 };
          render();
        }
        break;
      }
      case 'filter': filter = el.dataset.f; render(); break;
      case 'range': range = Number(el.dataset.r); render(); break;
      case 'group': {
        const g = el.dataset.group, on = el.dataset.on === '1';
        const ids = C.CASE_IDS.filter((i) => C.CASES[i].group === g);
        if (!state.setupDone) ids.forEach((i) => (on ? setupSel.add(i) : setupSel.delete(i)));
        else { ids.forEach((i) => { if (state.cases[i].active !== on) setActive(i, on); }); }
        render(); break;
      }
      case 'setup-toggle': setupSel.has(id) ? setupSel.delete(id) : setupSel.add(id); render(); break;
      case 'setup-clear': setupSel.clear(); render(); break;
      case 'setup-start':
        startFromSetup(); view = 'practice'; render(); window.scrollTo(0, 0); break;
      case 'save-alg': {
        const v = $('#custom-alg').value.trim();
        if (!v) { delete state.custom[dialogId]; algMsg = { ok: true, text: 'Using the standard algorithm.' }; save(); render(); break; }
        const r = C.checkAlg(dialogId, v);
        if (r.ok) {
          state.custom[dialogId] = v;
          const turned = r.auf || C.stripLead(v) !== v;
          algMsg = { ok: true, text: turned ? 'Saved. It starts from a different angle, so the diagram is turned to match.' : 'Saved. It solves this case.' };
          save(); render();
        } else { algMsg = { ok: false, text: r.error }; algDraft = v; renderDialog(); algDraft = null; }
        break;
      }
      case 'clear-alg': delete state.custom[dialogId]; algMsg = { ok: true, text: 'Back to the standard algorithm.' }; save(); render(); break;
      case 'recal': recalAsk = true; recalMsg = null; render(); break;
      case 'recal-no': recalAsk = false; render(); break;
      case 'recal-yes': {
        let n = 0;
        C.activeIds(state).forEach((cid) => { const cs = state.cases[cid]; if (cs.level > 5) { cs.level = 5; n++; } });
        recalAsk = false; recalMsg = n ? `${n} case${n > 1 ? 's' : ''} capped at Solid.` : 'No case was above Solid.';
        save(); render(); break;
      }
      case 'auth-back': auth = { step: 'email', email: auth.email, busy: false, msg: null, del: false }; render(); break;
      case 'delete-ask': auth.del = true; auth.msg = null; render(); break;
      case 'delete-no': auth.del = false; render(); break;
      case 'delete-yes':
        auth.busy = true; render();
        Supa.deleteAccount().then(() => {
          auth = { step: 'email', email: '', busy: false, msg: { ok: true, text: 'Your account is deleted. Progress stays in this browser.' }, del: false };
          Sync.init(); render();
        }, (err) => {
          auth.busy = false;
          auth.msg = { ok: false, text: err && (err.code === 'unavailable' || err.code === 'timeout') ? 'The sync server could not be reached. Nothing was deleted. Try again when you are online.' : 'The account could not be deleted. Sign out, sign in again and retry.' };
          render();
        });
        break;
      case 'reload': location.reload(); break;
      case 'sign-out':
        Supa.signOut().then(() => { auth = { step: 'email', email: '', busy: false, msg: { ok: true, text: 'Signed out. Progress stays in this browser.' }, del: false }; Sync.init(); render(); });
        break;
      case 'sync-now': auth.msg = null; Sync.init().then(render); break;
      case 'panel': dataPanel = el.dataset.p; dataMsg = null; render(); break;
      case 'panel-close': dataPanel = null; dataMsg = null; render(); break;
      case 'copy': {
        const ta = $('#backup-out');
        const done = () => { dataMsg = { ok: true, text: 'Backup code copied.' }; render(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); dataMsg = { ok: false, text: 'Copying was blocked. The code is selected: copy it with your keyboard.' }; render(); $('#backup-out').select(); });
        else { ta.select(); }
        break;
      }
      case 'import': {
        const raw = $('#backup-in').value.trim();
        try {
          const obj = JSON.parse(raw);
          if (!obj || typeof obj !== 'object' || !obj.cases || typeof obj.cases !== 'object') throw new Error('bad');
          // A backup code holds one set. Restore it into the set its case ids belong to.
          const ids = Object.keys(obj.cases);
          const owner = Object.keys(K.sets).find((n) => ids.length && ids.every((id) => K.sets[n].CASES[id]));
          if (!owner) throw new Error('bad');
          if (owner !== SET) switchSet(owner);
          state = C.normalize(obj); state.setupDone = true; current = null; undo = null; lastResult = null;
          save(); view = 'options'; dataPanel = null;
          dataMsg = { ok: true, text: `${C.name} progress restored.` };
        } catch (err) { dataMsg = { ok: false, text: 'That is not a valid backup code. Paste the whole code, starting with {.' }; }
        render(); break;
      }
      case 'reset':
        state = C.freshState(); save(); current = null; undo = null; lastResult = null; setupSel.clear();
        dataPanel = null; dataMsg = null; view = 'cases'; render(); window.scrollTo(0, 0); break;
    }
  });

  function showTip(e) {
    const t = e.target.closest && e.target.closest('[data-tip]');
    document.querySelectorAll('.chartwrap .tip').forEach((tip) => { if (!t || !tip.parentElement.contains(t)) tip.hidden = true; });
    document.querySelectorAll('.chart .hl').forEach((el) => el.remove());
    if (!t) return;
    const wrap = t.closest('.chartwrap'), tip = wrap.querySelector('.tip');
    tip.innerHTML = tipHtml(t.dataset.tip, Number(t.dataset.i));
    tip.hidden = false;
    const hl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    ['x', 'y', 'width', 'height'].forEach((a) => hl.setAttribute(a, t.getAttribute(a)));
    hl.setAttribute('class', 'hl');
    t.parentNode.insertBefore(hl, t.parentNode.firstChild.nextSibling);
    const wr = wrap.getBoundingClientRect(), tr = t.getBoundingClientRect();
    let left = tr.left - wr.left + tr.width / 2 + 12;
    if (left + tip.offsetWidth > wr.width) left = tr.left - wr.left + tr.width / 2 - tip.offsetWidth - 12;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = '8px';
  }
  document.addEventListener('mousemove', (e) => { if (view === 'progress') showTip(e); });
  document.addEventListener('click', (e) => { if (view === 'progress' && e.target.closest('[data-tip]')) showTip(e); });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.vspeed) { if (V) { V.speed = Number(el.value); try { sessionStorage.setItem('v-speed', el.value); } catch (er) { /* ignore */ } } return; }
    if (el.dataset && el.dataset.sort) { sortBy = el.value; render(); return; }
    if (!el.dataset || !el.dataset.setting) return;
    const k = el.dataset.setting;
    state.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
    if (k === 'randomPLL' && current) current.scramble = newScramble(current.id);
    if (k === 'showFirst' && current && el.checked) current.revealed = true;
    save();
  });

  document.addEventListener('keydown', (e) => {
    if (V) {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === ' ') { e.preventDefault(); vPlay(!V.playing); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); vStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); vStep(-1); }
      return;
    }
    if (dialogId != null) {
      if (e.key === 'Escape') { dialogId = null; renderDialog(); }
      return;
    }
    if (view !== 'practice' || !current) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (current.revealAsk) confirmReveal(); else askReveal(); }
    else if ((e.key === 'c' || e.key === 'C') && !current.revealed) { e.preventDefault(); current.caseShown = true; current.hintAsk = false; current.revealAsk = false; render(); }
    else if ((e.key === 'w' || e.key === 'W') && current.revealed) { e.preventDefault(); watchCurrent(); }
    else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); askHint(); }
    else if (e.key === 'Escape' && (current.hintAsk || current.revealAsk)) { current.hintAsk = false; current.revealAsk = false; render(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); gradeCurrent(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); gradeCurrent(false); }
  });

  function takeRedirect() {
    const r = Supa.configured() ? Supa.takeRedirect() : null;
    if (r) auth = { step: 'email', email: '', busy: false, msg: r.ok ? { ok: true, text: 'Signed in.' } : { ok: false, text: r.text }, del: false };
    return r;
  }
  takeRedirect();
  window.addEventListener('hashchange', () => { if (takeRedirect()) { render(); Sync.init(); } });
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (document.getElementById('update')) return;
      const bar = document.createElement('div');
      bar.id = 'update'; bar.className = 'update'; bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>A new version of SpacedCube is ready.</span><button class="btn small primary" data-action="reload">Reload</button>';
      document.body.appendChild(bar);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    });
  }

  renderSync();
  render();
  Sync.init();
})();
