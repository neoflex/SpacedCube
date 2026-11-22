// SpacedCube entry point: wires the modules together and starts the app.
import { S, hooks, initState } from './app/state.js';
import { listen } from './app/actions.js';
import { Supa } from './app/supabase.js';
import { Sync } from './app/sync.js';
import { render, renderSync, showReloadBar } from './app/render.js';
import { listenKeys } from './app/keys.js';
import { listenCharts } from './app/charts.js';
import { listenAccount, takeRedirect } from './app/account.js';
import { listenDue } from './app/due.js';

hooks.render = render;
hooks.afterSave = (set) => Sync.schedule(set);
hooks.newerData = () => showReloadBar('Your progress was saved by a newer version of SpacedCube. Reload to update before practising.');
Sync.onStatus = renderSync;
initState();
Supa.load();
document.body.classList.toggle('no-shortcuts', !S.shortcuts);

listen();
listenKeys();
listenCharts();
listenAccount();
listenDue(() => { if (S.view === 'practice' && S.dialogId == null) render(); });

takeRedirect();
window.addEventListener('hashchange', () => { if (takeRedirect()) { render(); Sync.init(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.resume(); });
window.addEventListener('online', () => Sync.resume());

// Offline support and updates (service workers need HTTPS or localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => showReloadBar('A new version of SpacedCube is ready.'));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}

renderSync();
render();
Sync.init();
