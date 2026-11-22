"""Shared helpers for the browser tests.

BROWSER=chromium|firefox|webkit picks the engine (default chromium). CHROME=/path/to/chrome makes
Chromium use that binary instead of Playwright's own.
"""
import asyncio, os, pathlib, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).resolve().parent.parent
BROWSER = os.environ.get('BROWSER', 'chromium')

# Records Content Security Policy violations; tests fail if any happen.
CSP_INIT = "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));"


async def launch(p):
    kind = getattr(p, BROWSER)
    if BROWSER == 'chromium':
        return await kind.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    return await kind.launch()


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def serve(directory):
    """Serves a directory on localhost; returns (server, base url)."""
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(directory)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'


async def wait_until(pg, expr, timeout=15):
    """Polls a JS expression until it is truthy. (page.wait_for_function evaluates its predicate
    with eval inside the page, which the app's CSP rightly forbids.)"""
    for _ in range(int(timeout * 20)):
        try:
            if await pg.evaluate(expr):
                return
        except Exception:
            pass
        await asyncio.sleep(0.05)
    raise TimeoutError('timed out waiting for: ' + expr)


async def csp_violations(pg):
    try:
        return await pg.evaluate('window.__csp || []')
    except Exception:
        return []
