// Options: practice settings, how cases are picked, keyboard shortcuts, and your data.
import * as K from '../core/index.js';
import { S, save, render, switchSet, setShortcuts, setPauseAfterGrade, backupOwner } from './state.js';
import { $, esc, THRESH, announce } from './util.js';
import { Sync } from './sync.js';
import { accountView } from './account.js';
import { newScramble } from './practice.js';
import { onAction } from './actions.js';
import { CONFIG } from './env.js';

export function syncText() {
  const ok = S.storageOK;
  return {
    local: ok ? 'Progress is saved in this browser only. Use a backup code to move it to another device.'
      : 'This browser is blocking storage, so progress lasts only while the page is open. Copy a backup code before leaving.',
    signedout: (ok ? 'Progress is saved in this browser.' : 'This browser is blocking storage, so progress lasts only while the page is open.') + ' Sign in to sync it to your other devices.',
    connecting: 'Connecting to your account to sync progress…',
    synced: 'Progress is saved in this browser and synced to your account, so it follows you to other devices where you open this page.',
    offline: 'Your account could not be reached just now. Progress is saved in this browser and syncs again when the connection returns.',
    update: 'Your account holds progress saved by a newer version of SpacedCube. Reload the page to update the app; until then nothing is synced.',
  }[Sync.status];
}

const opt = (id, setting, checked, labelText, help) => `<div class="opt"><input type="checkbox" id="${id}" data-setting="${setting}" ${checked ? 'checked' : ''} aria-describedby="${id}-help">
  <label for="${id}">${labelText}</label><p id="${id}-help">${help}</p></div>`;
const sel = (id, setting, labelText, options, help) => `<div class="opt"><span></span>
  <label for="${id}">${labelText} <select id="${id}" data-setting="${setting}" aria-describedby="${id}-help">${options}</select></label>
  <p id="${id}-help">${help}</p></div>`;

export function optionsView() {
  const { C, state } = S;
  const s = state.settings;
  let panel = '';
  if (S.dataPanel === 'export') {
    panel = `<div class="sec"><label for="backup-out">Backup code: copy it and keep it somewhere safe.</label>
      <textarea id="backup-out" readonly>${esc(JSON.stringify(state))}</textarea>
      <div class="row"><button type="button" class="btn small" data-action="copy">Copy</button><button type="button" class="btn small" data-action="panel-close">Close</button></div></div>`;
  } else if (S.dataPanel === 'import') {
    panel = `<div class="sec"><label for="backup-in">Paste a backup code. It replaces the progress of the set it belongs to.</label>
      <textarea id="backup-in" spellcheck="false"></textarea>
      <div class="row"><button type="button" class="btn small primary" data-action="import">Restore</button><button type="button" class="btn small" data-action="panel-close">Cancel</button></div></div>`;
  } else if (S.dataPanel === 'reset') {
    panel = `<div class="confirm" role="group" aria-labelledby="reset-h"><b id="reset-h">Erase all ${C.name} progress?</b><span>Every level, attempt and custom algorithm of ${C.name} is deleted. This cannot be undone.</span>
      <div class="row"><button type="button" class="btn small danger" data-action="reset">Erase everything</button><button type="button" class="btn small" data-action="panel-close">Keep my progress</button></div></div>`;
  }
  const gapTxt = (ms) => (ms === 0 ? 'none' : ms < 3600000 ? ms / 60000 + ' min' : ms < 86400000 ? ms / 3600000 + ' h' : ms / 86400000 + ' d');
  const ladder = C.GAP_MS.slice(0, C.MAX_LEVEL).map((v, i) => `<li>L${i}→${i + 1}: ${gapTxt(v)}</li>`).join('');
  return `<h1 class="view-title sr-only" id="view-title" tabindex="-1">Options</h1><div class="options">
    <section class="card" aria-labelledby="o-practice">
      <h2 id="o-practice">Practice</h2>
      <p class="muted" style="margin:4px 0 0;font-size:13px">These settings apply to ${C.name}.</p>
      <div style="margin-top:6px">
        ${opt('o-auto', 'autoIntro', s.autoIntro, 'Add new cases automatically', 'The next case in the learning order joins the rotation whenever fewer cases than the number below are still being learned.')}
        ${sel('o-pool', 'pool', 'Cases being learned at the same time', [1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}" ${(s.pool || 1) === v ? 'selected' : ''}>${v}</option>`).join(''), 'With 1, a new case only arrives once everything in practice has reached the level below.')}
        ${sel('o-level', 'introLevel', 'A case counts as learned at', [3, 5, 7].map((v) => `<option value="${v}" ${s.introLevel === v ? 'selected' : ''}>${THRESH[v]} (level ${v})</option>`).join(''), 'Familiar needs a correct answer after a 10-minute gap, Solid one after a gap of at least a day, Mastered one after at least 4 days.')}
        ${opt('o-pll', 'randomPLL', s.randomPLL, C.kind === 'pll' ? 'Disguise scrambles' : 'Scramble the last-layer permutation too',
          C.kind === 'pll' ? 'Scrambles combine two other PLLs (about 24 moves) instead of undoing the algorithm (about 14), so you cannot recognise the case from the moves.'
            : 'Scrambles run about 18 moves instead of about 11 and do not simply undo the algorithm, so you cannot recognise the case from the moves.')}
        ${opt('o-show', 'showFirst', s.showFirst, 'Show the case before I solve', 'Reveals the diagram and algorithm with every scramble, without counting it as a miss. Leave it off to practise recognition.')}
      </div>
    </section>
    <section class="card" aria-labelledby="o-keys">
      <h2 id="o-keys">On this device</h2>
      ${opt('o-pause', 'pause', S.pauseAfterGrade, 'Pause after each grade',
        'After Got it or Missed, the result stays on screen and the next scramble waits behind a Next scramble button, in the same place. Restore your cube at your pace; tapping Got it again by habit cannot grade a scramble you have not seen.')}
      ${opt('o-shortcuts', 'shortcuts', S.shortcuts, 'Single-key shortcuts',
        'While practising: right arrow for Got it, left arrow for Missed, Space to show the algorithm, C to show the case, H for a hint, W to watch it in 3D, Ctrl+Z to undo. In Speed practice, Space starts the timer and any key stops it. Turn them off if they get in the way of speech input or other assistive tools. Every action also has a button.')}
    </section>
    <section class="card prose" aria-labelledby="o-how">
      <h2 id="o-how">How cases are picked</h2>
      <p>Each case has a level from 0 to 10. <b>Missed</b> drops it to about half its level, so a forgotten case comes back quickly.</p>
      <p><b>Got it</b> moves a case up one level only if enough time has passed since you last saw it (the ladder below). Getting a case right while it is still fresh in your mind proves little, so it is recorded but does not raise the level. Levels 0 and 1 are the exception, so you can learn a new case within one session. Reaching Mastered therefore takes correct answers after gaps of 10 minutes, 8 hours, 1, 2 and 4 days: at least a week.</p>
      <p>A case is due when that time has passed (at levels 0 and 1, after a few other attempts). The next case is drawn at random, weighted by the square of how due each case is, so due cases come up often and the others only now and then. Extra practice before a case is due still keeps it sharp, and a miss still counts.</p>
      <p>Two adjustments then favour some cases over others that are equally due. A weaker recent record (your last 20 results) raises the weight: a case you get right 60% of the time comes up about 1.4 times as often as one you always get right. A case with few attempts gets a small boost that fades after about 15 to 20 attempts. Together they can roughly double a case's chance.</p>
      <ul class="ladder" aria-label="Minimum gap before a level rises">${ladder}</ul>
      <p class="muted" style="font-size:13px">Minimum time since a case was last seen before a correct answer raises its level. Levels 0 to 2 are Learning (0 is New), 3 and 4 Familiar, 5 and 6 Solid, 7 and up Mastered.</p>
      <h3>Speed</h3>
      <p>Once every case of a set is Mastered, Speed practice opens for that set and stays open. You look at the case, start the timer, solve, and stop it, so only the solve is timed. Each case gets a <b>speed level</b>: the turns per second of your last ${K.MEDIAN_OF} timed solves (median), rounded down. Level 4 means at least 4 turns per second, so a short algorithm and a long one are judged alike. Rotations do not count as turns.</p>
      <p>Speed practice picks slower cases more often. A case that is due for its memory review comes up first and the timed solve counts as the review. Otherwise a correct timed solve leaves the memory level alone, so speed work never delays a review. A miss counts for memory as usual, and a case that falls below Mastered goes back to memory practice until it is Mastered again.</p>
      <div class="sec" style="margin-top:12px">
        <p style="margin:0">Levels earned before this rule existed may be higher than your long-term memory supports. You can cap every case at Solid (level 5) so the higher levels have to be earned again with real gaps.</p>
        ${S.recalAsk ? `<div class="confirm" role="group" aria-labelledby="recal-h"><b id="recal-h">Cap all ${C.name} cases at Solid?</b><span>Cases above level 5 go back to level 5. Attempts and history are kept.</span>
          <div class="row"><button type="button" class="btn small danger" data-action="recal-yes">Cap at Solid</button><button type="button" class="btn small" data-action="recal-no">Cancel</button></div></div>`
          : '<div class="row"><button type="button" class="btn small" data-action="recal">Recalibrate levels…</button></div>'}
        ${S.recalMsg ? `<p class="msg ok">${esc(S.recalMsg)}</p>` : ''}
      </div>
    </section>
    <section class="card" aria-labelledby="o-data">
      <h2 id="o-data">Your data</h2>
      <p class="muted" id="sync-text" style="margin:8px 0 12px">${esc(syncText())}</p>
      ${accountView()}
      <div class="row" style="margin-bottom:12px">
        <button type="button" class="btn small" data-action="panel" data-p="export">Show backup code</button>
        <button type="button" class="btn small" data-action="panel" data-p="import">Restore from backup</button>
        <button type="button" class="btn small danger" data-action="panel" data-p="reset">Reset all progress</button>
      </div>
      ${panel}
      ${S.dataMsg ? `<p class="msg ${S.dataMsg.ok ? 'ok' : 'err'}">${esc(S.dataMsg.text)}</p>` : ''}
    </section>
    ${CONFIG.staging ? stagingTools() : ''}
    <p class="muted" style="font-size:13px">${C.kind === 'pll' ? 'PLL algorithms are the widely used standard set; a closing U turn is included where the algorithm needs one.' : 'OLL algorithms and case numbers follow <a href="https://jperm.net/algs/oll">jperm.net/algs/oll</a>.'} Every case diagram and scramble on this page is computed from the algorithms by a cube simulator.</p>
  </div>`;
}

// Only in a test copy (STAGING at build time): shortcuts to states that take weeks to reach.
let stageMsg = '';
function stagingTools() {
  const { C } = S;
  return `<section class="card" aria-labelledby="o-staging">
      <h2 id="o-staging">Test tools</h2>
      <p class="muted" style="margin:8px 0 12px;font-size:13px">This is a staging copy. These tools exist only here, to try features without waiting.</p>
      <div class="row"><button type="button" class="btn small" data-action="stage-master">Make every ${C.name} case Mastered</button></div>
      ${stageMsg ? `<p class="msg ok">${esc(stageMsg)}</p>` : ''}
    </section>`;
}

// Settings take effect at once (no Save button).
export function settingChanged(el) {
  const k = el.dataset.setting;
  if (k === 'shortcuts') { setShortcuts(el.checked); announce(el.checked ? 'Keyboard shortcuts on.' : 'Keyboard shortcuts off.'); return; }
  if (k === 'pause') { setPauseAfterGrade(el.checked); announce(el.checked ? 'Pause after each grade on.' : 'Pause after each grade off.'); return; }
  S.state.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
  if (k === 'randomPLL' && S.current) S.current.scramble = newScramble(S.current.id);
  if (k === 'showFirst' && S.current && el.checked) S.current.revealed = true;
  save();
}

const focusAfter = (sel) => { const el = $(sel); if (el) el.focus(); };

onAction({
  'stage-master': () => {
    const { C, state } = S;
    const now = Date.now();
    for (const id of C.CASE_IDS) {
      const cs = state.cases[id];
      C.introduce(state, id, C.MASTERED);
      // Seen just now, so nothing is due: a fresh test state behaves like weeks of practice.
      cs.lastTs = now; cs.n = Math.max(cs.n, 1); cs.ok = Math.max(cs.ok, 1); cs.last = state.rep;
    }
    state.setupDone = true;
    C.openSpeedIfReady(state);
    S.current = null; S.undo = null; S.lastResult = null;
    stageMsg = `Every ${C.name} case is Mastered. Speed practice is open on the Practice screen.`;
    save(); render(); announce(stageMsg); focusAfter('[data-action="stage-master"]');
  },
  recal: () => { S.recalAsk = true; S.recalMsg = null; render(); focusAfter('[data-action="recal-no"]'); },
  'recal-no': () => { S.recalAsk = false; render(); focusAfter('[data-action="recal"]'); },
  'recal-yes': () => {
    const { C, state } = S;
    let n = 0;
    C.activeIds(state).forEach((cid) => { const cs = state.cases[cid]; if (cs.level > 5) { cs.level = 5; n++; } });
    S.recalAsk = false; S.recalMsg = n ? `${n} case${n > 1 ? 's' : ''} capped at Solid.` : 'No case was above Solid.';
    save(); render(); announce(S.recalMsg); focusAfter('[data-action="recal"]');
  },
  panel: (el) => {
    S.dataPanel = el.dataset.p; S.dataMsg = null; render();
    focusAfter({ export: '#backup-out', import: '#backup-in', reset: '[data-action="panel-close"]' }[S.dataPanel]);
  },
  'panel-close': () => { const p = S.dataPanel; S.dataPanel = null; S.dataMsg = null; render(); focusAfter(`[data-action="panel"][data-p="${p}"]`); },
  copy: () => {
    const ta = $('#backup-out');
    const done = () => { S.dataMsg = { ok: true, text: 'Backup code copied.' }; render(); announce(S.dataMsg.text); focusAfter('[data-action="copy"]'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, () => {
        S.dataMsg = { ok: false, text: 'Copying was blocked. The code is selected: copy it with your keyboard.' };
        render(); announce(S.dataMsg.text); $('#backup-out').select();
      });
    } else ta.select();
  },
  import: () => {
    const raw = $('#backup-in').value.trim();
    try {
      const obj = JSON.parse(raw);
      // Restore into the set the code belongs to, whichever set is open.
      const owner = backupOwner(obj);
      if (!owner) throw new Error('bad');
      if (K.isNewer(obj)) {
        S.dataMsg = { ok: false, text: 'This backup code comes from a newer version of SpacedCube. Reload the page to update the app, then restore it again.' };
        render(); announce(S.dataMsg.text); focusAfter('#backup-in');
        return;
      }
      switchSet(owner);
      S.state = S.C.normalize(obj); S.state.setupDone = true; S.current = null; S.undo = null; S.lastResult = null;
      save(); S.view = 'options'; S.dataPanel = null;
      S.dataMsg = { ok: true, text: `${S.C.name} progress restored.` };
      render(); announce(S.dataMsg.text); focusAfter('[data-action="panel"][data-p="import"]');
    } catch (err) {
      S.dataMsg = { ok: false, text: 'That is not a valid backup code. Paste the whole code, starting with {.' };
      render(); announce(S.dataMsg.text); focusAfter('#backup-in');
    }
  },
  reset: () => {
    S.state = S.C.freshState(); save(); S.current = null; S.undo = null; S.lastResult = null; S.setupSel.clear();
    S.dataPanel = null; S.dataMsg = null; S.view = 'cases';
    render(); window.scrollTo(0, 0); announce(`${S.C.name} progress erased.`);
    focusAfter('#view-title');
  },
});
