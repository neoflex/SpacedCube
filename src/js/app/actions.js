import { target } from './util.js';

// Click handling: elements carry data-action="name"; each module registers the actions it handles.
/** @type {Record<string, (el: HTMLElement, e: MouseEvent) => void>} */
const actions = {};

export function onAction(map) {
  for (const k of Object.keys(map)) {
    if (actions[k]) throw new Error('Action registered twice: ' + k);
    actions[k] = map[k];
  }
}

export function listen() {
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement | null} */ (target(e)?.closest('[data-action]'));
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
}
