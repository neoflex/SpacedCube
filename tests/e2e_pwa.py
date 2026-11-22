"""PWA + Supabase sync check against a local mock of the Supabase auth and REST endpoints.

Serves dist/pwa on localhost (service workers need https or localhost), with config.js pointing at the
same server. Checks: manifest and service worker, sign-in by email code, pull of a newer remote state,
push after an attempt, offline reload from the cache, sign-out. Prints "pwa: ok" or the failures.
"""
import asyncio, base64, json, os, pathlib, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
from helpers import ROOT as REPO, BROWSER, CSP_INIT, launch, wait_until, csp_violations

ROOT = None  # the test's own build, set in main()
UID = '11111111-2222-3333-4444-555555555555'
db = {}       # (user_id, set) -> row
log = []      # (method, path)
captcha_used = set()
deleted = []
# Stand-in for Cloudflare Turnstile: issues a fresh token shortly after render and on every reset.
FAKE_TURNSTILE = '''window.turnstile = { n: 0, cbs: {},
  render(el, o) { const id = 'w' + (++this.n); this.cbs[id] = o; el.textContent = 'check'; setTimeout(() => o.callback('tok-' + id + '-' + Date.now()), 30); return id; },
  reset(id) { const o = this.cbs[id]; if (o) setTimeout(() => o.callback('tok-' + id + '-' + Date.now() + Math.random()), 30); },
  remove(id) { delete this.cbs[id]; } };'''


def jwt(sub, email):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
    return b({'alg': 'none'}) + '.' + b({'sub': sub, 'email': email, 'exp': int(time.time()) + 3600}) + '.x'


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'null')

    def authed(self):
        return self.headers.get('Authorization', '').startswith('Bearer ') and self.headers.get('apikey') == 'anon-key'

    def do_GET(self):
        if self.path.startswith('/rest/v1/progress'):
            log.append(('GET', self.path))
            if not self.authed(): return self.send_json(401, {'message': 'no'})
            s = self.path.split('set=eq.')[1].split('&')[0]
            row = db.get((UID, s))
            return self.send_json(200, [{'state': row['state']}] if row else [])
        super().do_GET()

    def do_POST(self):
        log.append(('POST', self.path))
        b = self.body()
        if self.path.startswith('/auth/v1/otp'):
            if b.get('create_user') is not True: return self.send_json(400, {'msg': 'create_user must be true'})
            tok = (b.get('gotrue_meta_security') or {}).get('captcha_token')
            if not tok or tok in captcha_used: return self.send_json(400, {'msg': 'captcha protection: request disallowed (invalid-input-response)'})
            captcha_used.add(tok)
            if b['email'] == 'blocked@example.com': return self.send_json(422, {'msg': 'Signups not allowed for otp'})
            return self.send_json(200, {})
        if self.path == '/auth/v1/verify':
            if b.get('token') != '123456': return self.send_json(403, {'msg': 'Token has expired or is invalid'})
            return self.send_json(200, {'access_token': jwt(UID, b['email']), 'refresh_token': 'r1', 'expires_in': 3600, 'user': {'id': UID, 'email': b['email']}})
        if self.path == '/auth/v1/logout':
            self.send_response(204); self.end_headers(); return
        if self.path == '/rest/v1/rpc/delete_my_account':
            if not self.authed(): return self.send_json(401, {'message': 'no'})
            for k in [k for k in db if k[0] == UID]: del db[k]
            deleted.append(UID)
            self.send_response(204); self.end_headers(); return
        if self.path.startswith('/rest/v1/progress'):
            if not self.authed(): return self.send_json(401, {'message': 'no'})
            assert 'resolution=merge-duplicates' in self.headers.get('Prefer', '')
            db[(b['user_id'], b['set'])] = b
            self.send_response(201); self.end_headers(); return
        self.send_json(404, {})


async def main():
    global ROOT
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    url = f'http://localhost:{srv.server_address[1]}/'
    # Build the app as a deployment would, with this mock as its sync server and a Turnstile key,
    # so the generated config.js and Content Security Policy are what gets tested.
    ROOT = pathlib.Path(tempfile.mkdtemp(prefix='spacedcube-pwa-')) / 'dist'
    env = {**os.environ, 'SUPABASE_URL': url.rstrip('/'), 'SUPABASE_PUBLISHABLE_KEY': 'anon-key', 'ALLOW_SIGNUP': 'true',
           'TURNSTILE_SITE_KEY': 'test-site-key', 'PRIVACY_CONTACT_EMAIL': 'privacy@example.com'}
    subprocess.run([sys.executable, str(REPO / 'build.py'), '--out', str(ROOT)], env=env, check=True, stdout=subprocess.DEVNULL)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    fails, errs = [], []
    def check(cond, what):
        if not cond: fails.append(what)

    # A newer OLL state on the server, as if saved from another device.
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        await ctx.route('https://challenges.cloudflare.com/**', lambda r: r.fulfill(content_type='text/javascript', body=FAKE_TURNSTILE))
        await ctx.add_init_script(CSP_INIT)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        hosts = []   # every host the page or its service worker asks for
        ctx.on('request', lambda r: hosts.append(r.url.split('/')[2]))
        await pg.goto(url)
        check(await pg.locator('link[rel=manifest]').count() == 1, 'manifest link')
        manifest = json.loads((ROOT / 'manifest.webmanifest').read_text())
        check({i['sizes'] for i in manifest['icons']} >= {'192x192', '512x512'}, 'manifest icons')
        await pg.evaluate('navigator.serviceWorker.ready.then(() => true)')
        csp = await pg.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content')
        check(f"connect-src 'self' {url.rstrip('/')}" in csp and 'script-src \'self\' https://challenges.cloudflare.com' in csp, f'CSP built from the settings: {csp}')
        check(await pg.text_content('#sync') == 'Saved in this browser', 'signed-out status')
        await pg.evaluate('document.fonts.ready')
        check(await pg.evaluate("[...document.fonts].some(f => f.family === 'IBM Plex Sans' && f.status === 'loaded') && [...document.fonts].some(f => f.family.includes('Archivo') && f.status === 'loaded')"), 'self-hosted fonts loaded')

        # Remote state: OLL set up, case 27 active at level 4, newer than anything local.
        remote = await pg.evaluate("""async () => { const { sets } = await import('./js/core/index.js'); const s = sets.OLL.freshState(); s.setupDone = true;
            s.cases['27'].active = true; s.cases['27'].level = 4; s.cases['27'].n = 9; s.updatedAt = Date.now() - 1000; return s; }""")
        db[(UID, 'OLL')] = {'user_id': UID, 'set': 'OLL', 'state': remote}

        # Sign in with a code. A wrong email and a wrong code show plain messages.
        await pg.click('#tab-options')
        check('New here?' in (await pg.text_content('.account label')), 'sign-up wording')
        other = sorted({h for h in hosts if not h.startswith('localhost')})
        check(not other, f'no third-party request before sign-in starts (got {other})')
        await pg.focus('#auth-email')
        await wait_until(pg, "document.querySelector('#captcha') && document.querySelector('#captcha').textContent === 'check'")
        await pg.wait_for_timeout(100)
        await pg.fill('#auth-email', 'blocked@example.com'); await pg.click('[data-form=email] button')
        await pg.wait_for_selector('.account .msg.err')
        check('not accepting new accounts' in (await pg.text_content('.account .msg.err')), 'closed sign-ups message')
        await pg.wait_for_timeout(100)
        await pg.fill('#auth-email', 'me@example.com'); await pg.click('[data-form=email] button')
        await pg.wait_for_selector('#auth-code')
        await pg.fill('#auth-code', '000000'); await pg.click('[data-form=code] button.primary')
        await pg.wait_for_selector('.account .msg.err')
        check('wrong or has expired' in (await pg.text_content('.account .msg.err')), 'bad code message')
        await pg.fill('#auth-code', '123 456'); await pg.click('[data-form=code] button.primary')
        await pg.wait_for_selector('text=Signed in as')
        await wait_until(pg, "document.querySelector('#sync').dataset.s === 'synced'")
        st = await pg.evaluate("JSON.parse(localStorage.getItem('oll-trainer-v1'))")
        check(st and st['cases']['27']['level'] == 4 and st['setupDone'], 'remote state pulled into local storage')

        # An attempt is pushed about 1.5 s later.
        before = db[(UID, 'OLL')]['state']['updatedAt']
        await pg.click('#tab-practice')
        await pg.keyboard.press('ArrowRight')
        for _ in range(40):
            if db[(UID, 'OLL')]['state']['updatedAt'] > before: break
            await asyncio.sleep(0.1)
        check(db[(UID, 'OLL')]['state']['updatedAt'] > before, 'attempt pushed')
        check(db[(UID, 'OLL')]['state']['rep'] >= 1, 'pushed state has the attempt')

        # Offline: the page reloads from the service worker cache, local progress intact, sync paused.
        await ctx.set_offline(True)
        await pg.reload()
        await pg.wait_for_selector('#tab-practice')
        check(await pg.locator('.practice').count() == 1, 'offline reload shows practice')
        # The 3D replay works offline: three.js comes from the app's own cache.
        if not await pg.locator('[data-action=watch-current]').count():
            await pg.click('[data-action=reveal]'); await pg.click('[data-action=reveal-yes]')
        await pg.click('[data-action=watch-current]')
        await wait_until(pg, '!!window.THREE', timeout=10)
        await pg.keyboard.press('Escape')
        await wait_until(pg, "['offline','synced'].includes(document.querySelector('#sync').dataset.s)")
        await ctx.set_offline(False)

        # Sign out keeps local progress.
        await pg.reload()
        await pg.click('#tab-options')
        await pg.click('[data-action=sign-out]')
        await pg.wait_for_selector('#auth-email')
        st = await pg.evaluate("JSON.parse(localStorage.getItem('oll-trainer-v1'))")
        check(st['cases']['27']['level'] == 4, 'local progress kept after sign-out')
        check(await pg.evaluate("localStorage.getItem('ll-trainer-auth')") is None, 'session removed')

        # Magic-link redirect: tokens in the fragment sign the page in and are removed from the URL.
        await pg.goto(url + '#access_token=' + jwt(UID, 'me@example.com') + '&refresh_token=r2&expires_in=3600&token_type=bearer&type=magiclink')
        await wait_until(pg, "document.querySelector('#sync').dataset.s === 'synced'")
        check('access_token' not in pg.url, 'fragment cleared')

        # Delete account: server rows go, local progress stays.
        await pg.click('#tab-options')
        await pg.click('[data-action=delete-ask]')
        await pg.click('[data-action=delete-yes]')
        await pg.wait_for_selector('text=Your account is deleted')
        check(deleted == [UID] and not any(k[0] == UID for k in db), 'account deleted on the server')
        st = await pg.evaluate("JSON.parse(localStorage.getItem('oll-trainer-v1'))")
        check(st['cases']['27']['level'] == 4, 'local progress kept after delete')
        check(await pg.locator('a[href="privacy.html"]').count() == 1, 'privacy link')
        r = await pg.request.get(url + 'privacy.html')
        txt = await r.text()
        check(r.ok and 'Delete account' in txt and 'privacy@example.com' in txt and 'Turnstile' in txt, 'privacy page filled in from the settings')


        # Backup code of the other set restores into that set.
        pll = await pg.evaluate("""async () => { const { sets } = await import('./js/core/index.js'); const s = sets.PLL.freshState(); s.setupDone = true; s.cases.T.active = true; s.cases.T.level = 2; return JSON.stringify(s); }""")
        await pg.click('.tab[data-set="OLL"]'); await pg.click('#tab-options')
        await pg.click('[data-action="panel"][data-p="import"]'); await pg.fill('#backup-in', pll); await pg.click('[data-action=import]')
        check(await pg.locator('.msg.ok', has_text='PLL progress restored').count() == 1, 'PLL backup restored from the OLL tab')
        check(await pg.get_attribute('.tab[data-set="PLL"]', 'aria-pressed') == 'true', 'switched to PLL')
        st = await pg.evaluate("JSON.parse(localStorage.getItem('oll-trainer-v1'))")
        check(st['cases']['27']['level'] == 4, 'OLL untouched by PLL import')
        errs.extend('CSP: ' + v for v in await csp_violations(pg))
        await b.close()
    srv.shutdown()
    other = sorted({h for h in hosts if not h.startswith('localhost')} - {'challenges.cloudflare.com'})
    if other: fails.append(f'unexpected hosts {other}')
    print(f'[{BROWSER}]', end=' ')
    print('pwa: ok' if not fails and not errs else f'pwa: FAIL {fails} errors: {errs}')

asyncio.run(main())
