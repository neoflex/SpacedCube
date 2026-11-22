// SpacedCube entry point: wires the modules together and starts the app.
import { S, hooks, initState } from './app/state.js';
import { listen } from './app/actions.js';
import { Supa } from './app/supabase.js';
import { Sync } from './app/sync.js';
import { render, renderSync } from './app/render.js';
import { listenKeys } from './app/keys.js';
import { listenCharts } from './app/charts.js';
import { listenAccount, takeRedirect } from './app/account.js';

initState();
Supa.load();
hooks.render = render;
hooks.afterSave = (set) => Sync.schedule(set);
Sync.onStatus = renderSync;
document.body.classList.toggle('no-shortcuts', !S.shortcuts);

listen();
listenKeys();
listenCharts();
listenAccount();

takeRedirect();
window.addEventListener('hashchange', () => { if (takeRedirect()) { render(); Sync.init(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.resume(); });
window.addEventListener('online', () => Sync.resume());

// Offline support and updates (service workers need HTTPS or localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (document.getElementById('update')) return;
      const bar = document.createElement('div');
      bar.id = 'update'; bar.className = 'update'; bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>A new version of SpacedCube is ready.</span><button type="button" class="btn small primary" data-action="reload">Reload</button>';
      document.body.appendChild(bar);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}

renderSync();
render();
Sync.init();
