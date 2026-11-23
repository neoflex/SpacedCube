// Shared helpers for the browser tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIST = fileURLToPath(new URL('../../dist', import.meta.url));
export const AXE = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');

// Records Content Security Policy violations; every test fails if any happen.
export const CSP_INIT = "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));";
export const cspViolations = (page) => page.evaluate('window.__csp || []').catch(() => []);

// Polls a JS expression until it is truthy. (page.waitForFunction evaluates its predicate with
// eval inside the page, which the app's CSP rightly forbids.)
export async function until(page, expr, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await page.evaluate(expr)) return; } catch { /* page navigating */ }
    await page.waitForTimeout(50);
  }
  throw new Error('timed out waiting for: ' + expr);
}

// id, data-action or tag of the focused element.
export const focused = (page) => page.evaluate('(() => { const a = document.activeElement; return a ? (a.id || a.dataset.action || a.tagName) : null; })()');
