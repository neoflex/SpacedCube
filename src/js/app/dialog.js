// Case dialog: algorithm, custom algorithm, record, add/remove/reset.
import { S, save, render } from './state.js';
import { esc, pct, announce } from './util.js';
import { diagram, chip, algFor, label, nextLevelText } from './diagrams.js';
import { setActive } from './practice.js';
import { onAction } from './actions.js';
import { modalOpened, modalClosed } from './modal.js';

export function renderDialog() {
  const { C, state } = S;
  const box = document.getElementById('dlg');
  if (S.dialogId == null) { box.innerHTML = ''; return; }
  const id = S.dialogId, c = C.CASES[id], cs = state.cases[id];
  const hist = cs.hist ? cs.hist.split('').map((h) => `<i class="h${h}" title="${h === '1' ? 'Got it' : 'Missed'}"></i>`).join('') : '';
  const histText = cs.hist ? cs.hist.split('').map((h) => (h === '1' ? 'got it' : 'missed')).join(', ') : '';
  const custom = state.custom[id] || '';
  const inputVal = S.algDraft != null ? S.algDraft : custom;
  const msg = S.algMsg;
  const wasInside = box.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = wasInside && (wasInside.id || wasInside.dataset.action);
  box.innerHTML = `<div class="overlay" data-action="close-bg"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <button type="button" class="x" data-action="close" aria-label="Close">×</button>
    <div class="dlg-head">${diagram(id, 132)}<div>
      <h2 id="dlg-title">${esc(C.label(id))}${c.nick ? ` <span>${esc(c.nick)}</span>` : ''}</h2>
      <p class="muted">${esc(c.group)}</p>${chip(id)}</div></div>
    <section class="sec" aria-labelledby="dlg-alg"><h3 id="dlg-alg">Algorithm</h3>
      <code class="alg">${esc(algFor(id))}</code>
      ${custom ? `<span class="alg-note">Your algorithm; the diagram shows the case from its angle. Standard: ${esc(c.alg)}</span>` : ''}
      <button type="button" class="btn small v-open" data-action="watch-case" data-id="${id}">Watch it in 3D</button>
      <label for="custom-alg" style="font-size:13px;margin-top:6px">Your own algorithm (optional, shown instead of the one above)</label>
      <div class="field"><input id="custom-alg" value="${esc(inputVal)}" placeholder="${esc(c.alg)}" spellcheck="false" autocomplete="off" autocapitalize="off"
          aria-describedby="custom-alg-msg" ${msg && !msg.ok ? 'aria-invalid="true"' : ''}>
        <button type="button" class="btn small" data-action="save-alg">Check and save</button>
        ${custom ? '<button type="button" class="btn small" data-action="clear-alg">Use the standard one</button>' : ''}</div>
      <p class="msg ${msg ? (msg.ok ? 'ok' : 'err') : ''}" id="custom-alg-msg">${msg ? esc(msg.text) : ''}</p>
    </section>
    <section class="sec" aria-labelledby="dlg-rec"><h3 id="dlg-rec">Your record</h3>
      <ul class="kv" role="list">
        <li><b>${cs.n}</b><span>attempts</span></li>
        <li><b>${cs.ok}</b><span>correct</span></li>
        <li><b>${cs.n ? pct(cs) : '–'}</b><span>success</span></li>
        <li><b>${cs.active ? cs.level : '–'}</b><span>level</span></li>
      </ul>
      ${hist ? `<div class="hist"><span>Recent, oldest first:</span><span aria-hidden="true">${hist}</span><span class="sr-only">${histText}</span></div>` : ''}
      ${cs.active && cs.level < C.MAX_LEVEL ? `<p class="muted" style="margin:0;font-size:13px">${nextLevelText(cs)}</p>` : ''}
    </section>
    <div class="actions">
      ${cs.active ? '<button type="button" class="btn small" data-action="dlg-toggle" data-on="0">Remove from practice</button>' : '<button type="button" class="btn small primary" data-action="dlg-toggle" data-on="1">Add to practice</button>'}
      ${cs.level < 5 ? '<button type="button" class="btn small" data-action="known">I know this one well</button>' : ''}
      ${cs.n || cs.level ? '<button type="button" class="btn small danger" data-action="reset-case">Reset this case</button>' : ''}
    </div>
  </div></div>`;
  modalOpened('dlg');
  // Keep focus where it was (the same control after a re-render), else start on the close button.
  const again = focusKey && (document.getElementById(focusKey) || box.querySelector(`[data-action="${focusKey}"]`));
  (again || box.querySelector('.x')).focus();
}

export function closeDialog() {
  if (S.dialogId == null) return;
  S.dialogId = null;
  renderDialog();
  modalClosed('dlg', () => document.getElementById('view-title'));
}

onAction({
  open: (el) => { S.dialogId = el.dataset.id; S.algMsg = null; renderDialog(); },
  close: () => closeDialog(),
  'close-bg': (el, e) => { if (e.target === el) closeDialog(); },
  'dlg-toggle': (el) => {
    const on = el.dataset.on === '1';
    setActive(S.dialogId, on); render();
    announce(`${label(S.dialogId)} ${on ? 'added to' : 'removed from'} practice.`);
  },
  known: () => {
    const { C, state } = S;
    C.introduce(state, S.dialogId, 5);
    state.cases[S.dialogId].level = Math.max(state.cases[S.dialogId].level, 5);
    save(); render();
    announce(`${label(S.dialogId)} set to Solid.`);
  },
  'reset-case': () => {
    Object.assign(S.state.cases[S.dialogId], { level: 0, n: 0, ok: 0, last: -1, lastTs: 0, hist: '', lastMiss: -1 });
    save(); render();
    announce(`${label(S.dialogId)} reset.`);
  },
  'save-alg': () => {
    const { C, state } = S;
    const v = document.getElementById('custom-alg').value.trim();
    if (!v) { delete state.custom[S.dialogId]; S.algMsg = { ok: true, text: 'Using the standard algorithm.' }; save(); render(); return; }
    const r = C.checkAlg(S.dialogId, v);
    if (r.ok) {
      state.custom[S.dialogId] = v;
      const turned = r.auf || C.stripLead(v) !== v;
      S.algMsg = { ok: true, text: turned ? 'Saved. It starts from a different angle, so the diagram is turned to match.' : 'Saved. It solves this case.' };
      save(); render();
    } else {
      S.algMsg = { ok: false, text: r.error }; S.algDraft = v; renderDialog(); S.algDraft = null;
      document.getElementById('custom-alg').focus();
    }
    announce(S.algMsg.text);
  },
  'clear-alg': () => {
    delete S.state.custom[S.dialogId];
    S.algMsg = { ok: true, text: 'Back to the standard algorithm.' };
    save(); render(); announce(S.algMsg.text);
  },
});
