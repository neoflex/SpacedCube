// Cases: first-run picker and the list of every case, grouped or sorted.
import { S, render } from './state.js';
import { esc, ICON, plural, announce } from './util.js';
import { diagram, chip, algFor, label, missAgo } from './diagrams.js';
import { setActive } from './practice.js';
import { onAction } from './actions.js';

function caseCard(id, setup, showMiss) {
  const { C, state } = S;
  const c = C.CASES[id], cs = state.cases[id];
  const on = setup ? S.setupSel.has(id) : cs.active;
  const foot = setup ? (on ? '<span class="chip"><i class="b1" aria-hidden="true"></i>Selected</span>' : '<span class="muted">Tap to select</span>')
    : `${chip(id)}${cs.n ? `<span>${cs.ok}/${cs.n}<span class="sr-only"> correct</span></span>` : ''}`;
  const name = esc(label(id));
  return `<li class="ccard ${setup && on ? 'sel' : ''} ${!setup && on ? 'on' : ''}">
    <button type="button" class="cmain" data-action="${setup ? 'setup-toggle' : 'open'}" data-id="${id}" ${setup ? `aria-pressed="${on}"` : ''}>
      ${diagram(id, 84, true)}
      <span class="cbody">
        <span class="ctop"><span class="cnum">${esc(id)}</span>${c.nick ? `<span class="cnick">${esc(c.nick)}</span>` : ''}<span class="sr-only">${name}${setup ? '' : ', open details'}</span></span>
        <code class="calg">${esc(algFor(id))}</code>
        <span class="cfoot">${foot}</span>
        ${showMiss ? `<span class="cmiss">Missed ${missAgo(cs)}</span>` : ''}
      </span>
    </button>
    ${setup ? `<button type="button" class="cinfo" data-action="open" data-id="${id}">Details<span class="sr-only"> for ${name}</span></button>` : ''}
    <button type="button" class="ctoggle" data-action="${setup ? 'setup-toggle' : 'toggle'}" data-id="${id}" aria-pressed="${on}"
      title="${on ? (setup ? 'Unselect' : 'Remove from practice') : (setup ? 'Select' : 'Add to practice')}">${on ? ICON.check : ICON.plus}<span class="sr-only">${setup ? 'Select' : 'In practice'}: ${name}</span></button>
  </li>`;
}
const grid = (ids, setup, showMiss) => `<ul class="grid" role="list">${ids.map((id) => caseCard(id, setup, showMiss)).join('')}</ul>`;

export function casesView() {
  const { C, state } = S;
  const setup = !state.setupDone;
  const act = C.activeIds(state).length;
  let html = `<h1 class="view-title sr-only" id="view-title" tabindex="-1">${setup ? 'Choose your cases' : `${C.name} cases`}</h1>`;
  if (setup) {
    const n = S.setupSel.size;
    html += `<div class="setup">
      <h2>Which cases do you already kind of know?</h2>
      <p>Tap each case you can already solve, even slowly. They go straight into your practice rotation. The trainer then adds the remaining cases one at a time, each once everything in practice is solid enough.</p>
      <div class="row">
        <button type="button" class="btn primary" data-action="setup-start">${n ? `Start practising with ${plural(n, 'case')}` : 'Start from scratch'}</button>
        ${n ? '<button type="button" class="btn" data-action="setup-clear">Clear selection</button>' : `<span class="muted" style="font-size:13px">With nothing selected, you start with ${esc(label(C.first))}.</span>`}
      </div>
    </div>`;
  } else {
    const f = (k, txt, count) => `<button type="button" class="fchip" data-action="filter" data-f="${k}" aria-pressed="${S.filter === k}">${txt} (${count})</button>`;
    const so = (k, txt) => `<option value="${k}" ${S.sortBy === k ? 'selected' : ''}>${txt}</option>`;
    html += `<div class="toolbar"><div class="row" role="group" aria-label="Show">${f('all', 'All', C.CASE_IDS.length)}${f('on', 'In practice', act)}${f('off', 'Not started', C.CASE_IDS.length - act)}</div>
      <label class="sortby" for="sort-by">Sort <select id="sort-by" data-sort="1">${so('group', 'By group')}${so('weak', 'Weakest first')}${so('misses', 'Recent misses first')}</select></label></div>`;
    if (S.sortBy !== 'group') {
      let ids = C.CASE_IDS.slice();
      if (S.filter === 'on') ids = ids.filter((id) => state.cases[id].active);
      if (S.filter === 'off') ids = ids.filter((id) => !state.cases[id].active);
      if (S.sortBy === 'weak') return `<section class="cases">${html}${grid(C.sortWeakest(state, ids), false)}</section>`;
      ids = C.sortRecentMisses(state, ids);
      const missed = ids.filter((id) => C.lastMissRep(state.cases[id]) >= 0);
      const rest = C.sortWeakest(state, ids.filter((id) => C.lastMissRep(state.cases[id]) < 0));
      html += missed.length ? `<section class="gblock" aria-labelledby="g-missed"><div class="ghead"><h2 id="g-missed">Missed recently</h2><span>most recent first</span></div>${grid(missed, false, true)}</section>`
        : '<p class="muted">No misses recorded yet.</p>';
      if (rest.length) html += `<section class="gblock" aria-labelledby="g-rest"><div class="ghead"><h2 id="g-rest">No misses</h2><span>${plural(rest.length, 'case')}</span></div>${grid(rest, false)}</section>`;
      return `<section class="cases">${html}</section>`;
    }
  }
  C.GROUPS.forEach((g, gi) => {
    let ids = C.CASE_IDS.filter((id) => C.CASES[id].group === g);
    if (!setup && S.filter === 'on') ids = ids.filter((id) => state.cases[id].active);
    if (!setup && S.filter === 'off') ids = ids.filter((id) => !state.cases[id].active);
    if (!ids.length) return;
    const all = C.CASE_IDS.filter((id) => C.CASES[id].group === g);
    const allOn = setup ? all.every((id) => S.setupSel.has(id)) : all.every((id) => state.cases[id].active);
    const verb = allOn ? (setup ? 'Unselect group' : 'Remove group') : (setup ? 'Select group' : 'Add group');
    html += `<section class="gblock" aria-labelledby="g-${gi}"><div class="ghead"><h2 id="g-${gi}">${esc(g)}</h2><span>${plural(all.length, 'case')}</span>
      <button type="button" class="btn small" data-action="group" data-group="${esc(g)}" data-on="${allOn ? 0 : 1}">${verb}<span class="sr-only">: ${esc(g)}</span></button></div>
      ${grid(ids, setup)}</section>`;
  });
  return `<section class="cases">${html}</section>`;
}

onAction({
  filter: (el) => { S.filter = el.dataset.f; render(); },
  group: (el) => {
    const { C, state } = S;
    const g = el.dataset.group, on = el.dataset.on === '1';
    const ids = C.CASE_IDS.filter((i) => C.CASES[i].group === g);
    if (!state.setupDone) ids.forEach((i) => (on ? S.setupSel.add(i) : S.setupSel.delete(i)));
    else ids.forEach((i) => { if (state.cases[i].active !== on) setActive(i, on); });
    render();
    announce(`${g}: ${on ? (state.setupDone ? 'added to practice' : 'selected') : (state.setupDone ? 'removed from practice' : 'unselected')}.`);
  },
  toggle: (el) => {
    const id = el.dataset.id, on = !S.state.cases[id].active;
    setActive(id, on); render();
    announce(`${label(id)} ${on ? 'added to' : 'removed from'} practice.`);
  },
  'setup-toggle': (el) => {
    const id = el.dataset.id;
    if (S.setupSel.has(id)) S.setupSel.delete(id); else S.setupSel.add(id);
    render();
  },
  'setup-clear': () => { S.setupSel.clear(); render(); },
});
