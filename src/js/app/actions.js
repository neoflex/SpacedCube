// Click handling: elements carry data-action="name"; each module registers the actions it handles.
const actions = {};

export function onAction(map) {
  for (const k of Object.keys(map)) {
    if (actions[k]) throw new Error('Action registered twice: ' + k);
    actions[k] = map[k];
  }
}

export function listen() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
}
