// Supabase over plain fetch (auth + PostgREST): nothing extra loads and the page works offline.
import { CONFIG } from './env.js';
import { withTimeout } from './util.js';

const AUTH_KEY = 'll-trainer-auth';

export const Supa = {
  url: CONFIG.supabaseUrl,
  key: CONFIG.supabaseKey,
  session: null,
  configured() { return !!(this.url && this.key); },
  load() { try { this.session = JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { this.session = null; } },
  store(s) {
    this.session = s;
    try { if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ }
  },
  fromTokens(t) {
    let user = t.user || null;
    if (!user) {
      try { const p = JSON.parse(atob(t.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); user = { id: p.sub, email: p.email }; }
      catch (e) { user = null; }
    }
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
    try { res = await withTimeout(fetch(this.url + path, { method: opt.method, body: opt.body, headers }), 15000); }
    catch (e) { throw { code: e && e.code === 'timeout' ? 'timeout' : 'unavailable' }; }
    if (res.status === 401 && auth && !opt.retried) { await this.refresh(); return this.req(path, { ...opt, retried: true }, auth); }
    let body;
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
    const body = { email, create_user: CONFIG.allowSignup };
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
    return this.req('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: JSON.stringify(body) }, false);
  },
  async verifyCode(email, token) {
    const t = await this.req('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email, token }) }, false);
    this.store(this.fromTokens(t));
  },
  async signOut() {
    try { if (this.session) await this.req('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* signing out locally is enough */ }
    this.store(null);
  },
  // Deletes the sign-in and every synced row (the table cascades). Progress in this browser stays.
  async deleteAccount() {
    await this.req('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' });
    this.store(null);
  },
  // One row per user and set; the whole state is stored.
  async getProgress(set) {
    const rows = await this.req('/rest/v1/progress?select=state&set=eq.' + encodeURIComponent(set), { method: 'GET' });
    return rows && rows[0] ? rows[0].state : null;
  },
  async putProgress(set, st) {
    const row = { user_id: this.session.user.id, set, state: st, updated_at: new Date(st.updatedAt || Date.now()).toISOString() };
    await this.req('/rest/v1/progress?on_conflict=user_id,set', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  },
};
