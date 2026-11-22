// Small helpers shared by the views.

/** @param {string} sel @param {ParentNode} [el] @returns {HTMLElement & HTMLInputElement} the first match (the views query their own controls) */
export const $ = (sel, el = document) => /** @type {any} */ (el.querySelector(sel));
/** All matches, as HTML elements. @param {string} sel @param {ParentNode} [el] @returns {HTMLElement[]} */
export const $$ = (sel, el = document) => /** @type {HTMLElement[]} */ ([...el.querySelectorAll(sel)]);
/** An event's target as an element (null for text nodes and the like). @param {Event} e @returns {HTMLElement | null} */
export const target = (e) => (e.target instanceof Element ? /** @type {HTMLElement} */ (e.target) : null);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const pct = (cs) => (cs.n ? Math.round((100 * cs.ok) / cs.n) + '%' : '');
export const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);

// Local calendar day, used as the key of the daily log.
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export const fmtDay = (k, long) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
};

export const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
export const THRESH = { 3: 'Familiar', 5: 'Solid', 7: 'Mastered' };

// Screen-reader announcement through the page's single polite live region.
let clearTimer = null;
export function announce(text) {
  const el = document.getElementById('announcer');
  if (!el || !text) return;
  el.textContent = '';
  clearTimeout(clearTimer);
  // A short delay makes repeated identical messages be read again.
  setTimeout(() => { el.textContent = text; }, 50);
  clearTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

export const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
