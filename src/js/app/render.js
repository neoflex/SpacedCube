// Drawing the current view. Every change re-renders the view from S; focus stays on the
// equivalent control so keyboard and screen-reader users keep their place.
import { S } from './state.js';
import { $$ } from './util.js';
import { Sync } from './sync.js';
import { practiceView, startFromSetup } from './practice.js';
import { casesView } from './cases.js';
import { progressView } from './progress.js';
import { fillCharts } from './charts.js';
import { optionsView, syncText } from './options.js';
import { renderDialog } from './dialog.js';
import { onAction } from './actions.js';
import { switchSet } from './state.js';
import { renderDue } from './due.js';

const VIEW_NAMES = { practice: 'Practice', cases: 'Cases', progress: 'Progress', options: 'Options' };
const KEY_ATTRS = ['action', 'id', 'f', 'r', 'p', 'on', 'group', 'ok', 'view'];

// A selector that finds "the same" control after a re-render.
function focusKey(el) {
  if (!el || el === document.body || !document.getElementById('app').contains(el)) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  if (!el.dataset || !el.dataset.action) return null;
  return KEY_ATTRS.filter((k) => el.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
}

export function render() {
  $$('.tab[data-view]').forEach((t) => {
    if (t.dataset.view === S.view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  $$('.tab[data-set]').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.set === S.set)));
  document.title = `${VIEW_NAMES[S.view]} · ${S.C.name} · SpacedCube`;
  const app = document.getElementById('app');
  const key = focusKey(document.activeElement);
  if (S.view === 'practice') app.innerHTML = practiceView();
  else if (S.view === 'cases') app.innerHTML = casesView();
  else if (S.view === 'progress') { app.innerHTML = progressView(); fillCharts(); }
  else app.innerHTML = optionsView();
  if (key && S.dialogId == null) {
    const again = /** @type {HTMLElement | null} */ (app.querySelector(key));
    if (again) again.focus({ preventScroll: true });
  }
  renderDialog();
  renderDue();
}

// The small status in the header; only touched when it changes, so screen readers are not spammed.
const SYNC_LABEL = { local: 'Saved in this browser', signedout: 'Saved in this browser', connecting: 'Connecting…', synced: 'Synced', offline: 'Sync paused', update: 'Update needed' };
export function renderSync() {
  const el = document.getElementById('sync');
  const txt = S.storageOK || Sync.status === 'synced' ? SYNC_LABEL[Sync.status] : 'Not saved';
  if (el.dataset.s === Sync.status && el.textContent === txt) return;
  el.dataset.s = Sync.status;
  el.innerHTML = `<span>${txt}</span>`;
  el.title = txt;
  el.setAttribute('aria-label', `Sync status: ${txt}`);
  const p = document.getElementById('sync-text');
  if (p) p.textContent = syncText();
}

// Moving to another view (or set) puts focus on its heading, like a page load would.
export function showView(view) {
  S.view = view; S.dataPanel = null; S.dataMsg = null;
  if (view === 'practice' && !S.state.setupDone) startFromSetup();
  render();
  window.scrollTo(0, 0);
  const h = document.getElementById('view-title');
  if (h) h.focus({ preventScroll: true });
}

// A bar at the bottom of the page asking to reload (new version installed, or newer data seen).
export function showReloadBar(text) {
  let bar = document.getElementById('update');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'update'; bar.className = 'update'; bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>${text}</span><button type="button" class="btn small primary" data-action="reload">Reload</button>`;
}

onAction({
  view: (el) => showView(el.dataset.view),
  set: (el) => { if (switchSet(el.dataset.set)) showView(S.view); },
  'setup-start': () => showView('practice'),
  reload: () => location.reload(),
});
