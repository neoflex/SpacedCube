// Installable app and sync, against a local mock of the Supabase auth and REST endpoints.
// The app is built as a deployment would be (this mock as the sync server, a Turnstile key, privacy
// details), so the generated config.js, Content Security Policy and privacy page are what is tested.
// Checks: manifest and service worker, no third-party request before sign-in, sign-in by email code,
// pull of newer progress, upload after an attempt, offline reload (with the 3D viewer), sign-out,
// magic-link redirect, account deletion, and a backup code restored into its own set.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSP_INIT, ROOT, cspViolations, until } from './helpers.mjs';
import { startServer } from './server.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
// Stand-in for Cloudflare Turnstile, defined before the page loads (intercepting the cross-site
// script is not reliable in every engine). It issues a fresh token shortly after rendering and
// after every reset. The app still only renders it once sign-in starts, which the test checks.
const FAKE_TURNSTILE = `window.turnstile = { n: 0, cbs: {},
  render(el, o) { const id = 'w' + (++this.n); this.cbs[id] = o; el.textContent = 'check'; setTimeout(() => o.callback('tok-' + id + '-' + Date.now()), 30); return id; },
  reset(id) { const o = this.cbs[id]; if (o) setTimeout(() => o.callback('tok-' + id + '-' + Date.now() + Math.random()), 30); },
  remove(id) { delete this.cbs[id]; } };`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => `${b64({ alg: 'none' })}.${b64({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;

// ---------- The mock sync server ----------
const db = new Map(); // `${user}|${set}` -> row
const captchaUsed = new Set();
const deleted = [];
const send = (res, code, obj) => { res.writeHead(code, obj === undefined ? {} : { 'Content-Type': 'application/json' }).end(obj === undefined ? '' : JSON.stringify(obj)); return true; };
const authed = (req) => (req.headers.authorization || '').startsWith('Bearer ') && req.headers.apikey === 'anon-key';

async function supabase(req, res, body) {
  const path = req.url;
  if (!path.startsWith('/auth/') && !path.startsWith('/rest/')) return false;
  const b = body ? JSON.parse(body) : null;
  if (req.method === 'GET' && path.startsWith('/rest/v1/progress')) {
    if (!authed(req)) return send(res, 401, { message: 'no' });
    const set = new URL(path, 'http://x').searchParams.get('set').replace('eq.', '');
    const row = db.get(`${UID}|${set}`);
    return send(res, 200, row ? [{ state: row.state }] : []);
  }
  if (path.startsWith('/auth/v1/otp')) {
    if (b.create_user !== true) return send(res, 400, { msg: 'create_user must be true' });
    const tok = b.gotrue_meta_security && b.gotrue_meta_security.captcha_token;
    if (!tok || captchaUsed.has(tok)) return send(res, 400, { msg: 'captcha protection: request disallowed (invalid-input-response)' });
    captchaUsed.add(tok);
    if (b.email === 'blocked@example.com') return send(res, 422, { msg: 'Signups not allowed for otp' });
    return send(res, 200, {});
  }
  if (path === '/auth/v1/verify') {
    if (b.token !== '123456') return send(res, 403, { msg: 'Token has expired or is invalid' });
    return send(res, 200, { access_token: jwt(UID, b.email), refresh_token: 'r1', expires_in: 3600, user: { id: UID, email: b.email } });
  }
  if (path === '/auth/v1/logout') return send(res, 204);
  if (path === '/rest/v1/rpc/delete_my_account') {
    if (!authed(req)) return send(res, 401, { message: 'no' });
    for (const k of [...db.keys()]) if (k.startsWith(UID)) db.delete(k);
    deleted.push(UID);
    return send(res, 204);
  }
  if (req.method === 'POST' && path.startsWith('/rest/v1/progress')) {
    if (!authed(req)) return send(res, 401, { message: 'no' });
    if (!(req.headers.prefer || '').includes('resolution=merge-duplicates')) return send(res, 400, { message: 'upsert expected' });
    db.set(`${b.user_id}|${b.set}`, b);
    return send(res, 201);
  }
  return send(res, 404, {});
}

let server, dist;
test.beforeAll(async () => {
  dist = join(mkdtempSync(join(tmpdir(), 'spacedcube-pwa-')), 'dist');
  server = await startServer(() => dist, supabase);
  execFileSync(process.execPath, [join(ROOT, 'build.mjs'), '--out', dist], {
    stdio: 'ignore',
    env: { ...process.env, SUPABASE_URL: server.url.replace(/\/$/, ''), SUPABASE_PUBLISHABLE_KEY: 'anon-key', ALLOW_SIGNUP: 'true',
      TURNSTILE_SITE_KEY: 'test-site-key', PRIVACY_CONTACT_EMAIL: 'privacy@example.com', REPOSITORY_URL: 'https://github.com/example/spacedcube' },
  });
});
test.afterAll(async () => { await server.close(); });

test('installable app, offline, and sync with the mock server', async ({ browser, browserName }) => {
  const soft = expect.soft;
  const url = server.url;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(FAKE_TURNSTILE);
  await ctx.addInitScript(CSP_INIT);
  const page = await ctx.newPage();
  const errors = [], hosts = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  ctx.on('request', (r) => hosts.push(new URL(r.url()).hostname));
  const local = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

  await page.goto(url);
  soft(await page.locator('link[rel=manifest]').count(), 'manifest link').toBe(1);
  soft(await page.getAttribute('.foot a >> nth=0', 'href'), 'footer: source code').toBe('https://github.com/example/spacedcube');
  soft(await page.getAttribute('.foot a >> nth=1', 'href'), 'footer: issues').toBe('https://github.com/example/spacedcube/issues');
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
  soft(manifest.icons.map((i) => i.sizes), 'manifest icons').toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  soft(csp, 'CSP allows the sync server').toContain(`connect-src 'self' ${url.replace(/\/$/, '')}`);
  soft(csp, 'CSP allows Turnstile').toContain("script-src 'self' https://challenges.cloudflare.com");
  soft(await page.textContent('#sync'), 'signed-out status').toBe('Saved in this browser');
  await page.evaluate('document.fonts.ready');
  soft(await page.evaluate("[...document.fonts].some(f => f.family === 'IBM Plex Sans' && f.status === 'loaded') && [...document.fonts].some(f => f.family.includes('Archivo') && f.status === 'loaded')"), 'self-hosted fonts loaded').toBe(true);

  // Newer OLL progress on the server, as if saved from another device.
  const remote = await page.evaluate(async () => {
    const { sets } = await import('./js/core/index.js');
    const s = sets.OLL.freshState(); s.setupDone = true;
    Object.assign(s.cases['27'], { active: true, level: 4, n: 9 });
    s.updatedAt = Date.now() - 1000;
    return s;
  });
  db.set(`${UID}|OLL`, { user_id: UID, set: 'OLL', state: remote });

  // Sign in with a code. Closed sign-ups and a wrong code show plain messages.
  await page.click('#tab-options');
  soft(await page.textContent('.account label'), 'sign-up wording').toContain('New here?');
  soft(hosts.filter((h) => h !== 'localhost'), 'no third-party request before sign-in starts').toEqual([]);
  await page.focus('#auth-email');
  await until(page, "document.querySelector('#captcha') && document.querySelector('#captcha').textContent === 'check'");
  await page.waitForTimeout(100);
  await page.fill('#auth-email', 'blocked@example.com'); await page.click('[data-form=email] button');
  await page.locator('.account .msg.err').waitFor();
  soft(await page.textContent('.account .msg.err'), 'closed sign-ups message').toContain('not accepting new accounts');
  await page.waitForTimeout(100);
  await page.fill('#auth-email', 'me@example.com'); await page.click('[data-form=email] button');
  await page.locator('#auth-code').waitFor();
  await page.fill('#auth-code', '000000'); await page.click('[data-form=code] button.primary');
  await page.locator('.account .msg.err').waitFor();
  soft(await page.textContent('.account .msg.err'), 'wrong code message').toContain('wrong or has expired');
  await page.fill('#auth-code', '123 456'); await page.click('[data-form=code] button.primary');
  await page.locator('text=Signed in as').waitFor();
  await until(page, "document.querySelector('#sync').dataset.s === 'synced'");
  let st = await local('oll-trainer-v1');
  soft(st && st.cases['27'].level === 4 && st.setupDone, 'newer progress pulled into local storage').toBe(true);

  // An attempt is uploaded about 1.5 s later.
  const before = db.get(`${UID}|OLL`).state.updatedAt;
  await page.click('.tab[data-set="OLL"]');
  await page.click('#tab-practice');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => db.get(`${UID}|OLL`).state.updatedAt, { message: 'attempt uploaded', timeout: 6000 }).toBeGreaterThan(before);
  soft(db.get(`${UID}|OLL`).state.rep, 'uploaded state has the attempt').toBeGreaterThanOrEqual(1);

  // Offline: the page reloads from the service worker's cache, the 3D viewer works, sync pauses.
  // Not in Firefox: Playwright's offline switch there fails navigations before the service worker
  // can answer them (a limitation of the test driver, not of Firefox).
  if (browserName !== 'firefox') {
    await ctx.setOffline(true);
    await page.reload();
    await page.locator('#tab-practice').waitFor();
    soft(await page.locator('.practice').count(), 'offline reload shows practice').toBe(1);
    if (await page.locator('#next-btn').count()) await page.click('#next-btn');
    if (!(await page.locator('[data-action=watch-current]').count())) { await page.click('[data-action=reveal]'); await page.click('[data-action=reveal-yes]'); }
    await page.click('[data-action=watch-current]');
    await until(page, '!!window.THREE', 10000);
    await page.keyboard.press('Escape');
    await until(page, "['offline','synced'].includes(document.querySelector('#sync').dataset.s)");
    await ctx.setOffline(false);
  }

  // Signing out keeps local progress.
  await page.reload();
  await page.click('#tab-options');
  await page.click('[data-action=sign-out]');
  await page.locator('#auth-email').waitFor();
  st = await local('oll-trainer-v1');
  soft(st.cases['27'].level, 'local progress kept after sign-out').toBe(4);
  soft(await page.evaluate("localStorage.getItem('ll-trainer-auth')"), 'session removed').toBeNull();

  // Magic link: tokens in the fragment sign the page in and are removed from the address.
  await page.goto(`${url}#access_token=${jwt(UID, 'me@example.com')}&refresh_token=r2&expires_in=3600&token_type=bearer&type=magiclink`);
  await until(page, "document.querySelector('#sync').dataset.s === 'synced'");
  soft(page.url(), 'fragment cleared').not.toContain('access_token');

  // Deleting the account removes the server rows; local progress stays.
  await page.click('#tab-options');
  await page.click('[data-action=delete-ask]');
  await page.click('[data-action=delete-yes]');
  await page.locator('text=Your account is deleted').waitFor();
  soft(deleted, 'account deleted on the server').toEqual([UID]);
  soft([...db.keys()].filter((k) => k.startsWith(UID)), 'no rows left').toEqual([]);
  soft((await local('oll-trainer-v1')).cases['27'].level, 'local progress kept after delete').toBe(4);
  soft(await page.locator('.account a[href="privacy.html"]').count(), 'privacy link in the account section').toBe(1);
  soft(await page.locator('.foot a[href="privacy.html"]').count(), 'privacy link in the footer').toBe(1);
  const privacy = await (await page.request.get(url + 'privacy.html')).text();
  for (const s of ['Delete account', 'privacy@example.com', 'Turnstile']) soft(privacy, 'privacy page filled in').toContain(s);

  // A backup code of the other set restores into that set.
  const pll = await page.evaluate(async () => {
    const { sets } = await import('./js/core/index.js');
    const s = sets.PLL.freshState(); s.setupDone = true; Object.assign(s.cases.T, { active: true, level: 2 });
    return JSON.stringify(s);
  });
  await page.click('.tab[data-set="OLL"]'); await page.click('#tab-options');
  await page.click('[data-action="panel"][data-p="import"]'); await page.fill('#backup-in', pll); await page.click('[data-action=import]');
  soft(await page.locator('.msg.ok', { hasText: 'PLL progress restored' }).count(), 'PLL backup restored from the OLL tab').toBe(1);
  soft(await page.getAttribute('.tab[data-set="PLL"]', 'aria-pressed'), 'switched to PLL').toBe('true');
  soft((await local('oll-trainer-v1')).cases['27'].level, 'OLL untouched by the PLL import').toBe(4);

  soft(await cspViolations(page), 'CSP violations').toEqual([]);
  soft(errors, 'page errors').toEqual([]);
  soft([...new Set(hosts)].filter((h) => !['localhost', 'challenges.cloudflare.com'].includes(h)), 'unexpected hosts').toEqual([]);
  await ctx.close();
});
