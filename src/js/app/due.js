// How many cases are due, shown wherever it helps: a count on each set button in the header,
// the tab title, and the installed app's icon badge (where the system supports it).
// Due counts change with time alone, so they refresh every minute and when the app comes back.
import * as K from '../core/index.js';
import { S, getState } from './state.js';
import { $, $$ } from './util.js';

const TITLE_RE = /^\(\d+\) /;

export function dueCount(set, now = Date.now()) {
  const st = getState(set);
  return st.setupDone ? K.sets[set].dueIds(st, now).length : 0;
}

// "in 25 min", "in 3 h", "in 2 days"
export function inTime(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}

export function renderDue() {
  const now = Date.now();
  let total = 0;
  for (const btn of $$('.tab[data-set]')) {
    const n = dueCount(btn.dataset.set, now);
    total += n;
    let badge = btn.querySelector('.due-count');
    if (!n) { if (badge) badge.remove(); continue; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'due-count'; btn.appendChild(badge); }
    badge.innerHTML = `${n}<span class="sr-only"> due</span>`;
  }
  const title = document.title.replace(TITLE_RE, '');
  document.title = total ? `(${total}) ${title}` : title;
  // Badging API: installed app icon (Chrome and Edge; Safari on iOS once notifications are allowed).
  const nav = /** @type {any} */ (navigator);
  if (nav.setAppBadge) (total ? nav.setAppBadge(total) : nav.clearAppBadge()).catch(() => {});
}

// The practice screen's status line: how many are due, or when the next one is.
export function dueStatus() {
  const now = Date.now();
  const due = dueCount(S.set, now);
  if (due) return { due, text: `${due} due now`, wait: '' };
  const next = S.C.nextDueAt(S.state, now);
  const wait = next ? inTime(next - now) : '';
  return { due: 0, text: wait ? `Next due ${wait}` : 'Nothing due', wait };
}

// Brings the practice screen in line with the clock: compared with what is on screen, not with the
// last check, so a case that came due since the screen was drawn always shows up.
export function refreshPractice(rerenderPractice) {
  const pill = $('.duepill');
  if (!pill) return;
  const st = dueStatus();
  if (st.due !== Number(pill.dataset.due)) { rerenderPractice(); return; }
  // Same count: only the "next due" wording moves on with time.
  pill.textContent = st.text;
  const wait = $('.due-wait');
  if (wait) wait.textContent = st.wait;
}

export function listenDue(rerenderPractice) {
  const tick = () => {
    renderDue();
    if (S.view === 'practice' && S.dialogId == null) refreshPractice(rerenderPractice);
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
}
