// Practice: the scramble, help (case, hints, algorithm), grading, and the progress rail.
// Two modes once Speed is open for a set: Memory (levels) and Speed (timed solves, see timer.js).
import * as K from '../core/index.js';
import { S, save, snapshotToday, render } from './state.js';
import { $, esc, dayKey, pct, THRESH, ICON, announce } from './util.js';
import { diagram, chip, algFor, label } from './diagrams.js';
import { onAction } from './actions.js';
import { dueStatus } from './due.js';
import { fmtSec } from './timer.js';

const rng = Math.random;
const kbd = (k) => `<kbd aria-hidden="true">${k}</kbd>`;

export const newScramble = (id) => K.fmt(S.C.makeScramble(id, rng, { randomPLL: S.state.settings.randomPLL }));

// Speed practice: open for this set (all cases Mastered once) and chosen with the mode switch.
export const isSpeed = () => S.state.settings.mode === 'speed' && S.C.speedReady(S.state);

// A new attempt at a case. In Speed mode it carries a timer and knows whether it is also a
// memory review (the case was due).
export function makeCurrent(id, extra = {}) {
  const cur = { id, scramble: newScramble(id), revealed: false, isNew: false, hints: 0, ...extra };
  if (isSpeed() && !cur.isNew) Object.assign(cur, { speed: true, revealed: false, timer: { phase: 'ready', ms: 0 } });
  return cur;
}

export function nextCase() {
  const { C, state } = S;
  if (isSpeed()) {
    const id = C.pickSpeed(state, rng, Date.now());
    S.current = id == null ? null : makeCurrent(id);
    return;
  }
  let isNew = false, id;
  if (C.shouldIntroduce(state)) {
    id = C.nextToIntroduce(state);
    C.introduce(state, id, 0);
    isNew = true;
    save();
  } else {
    id = C.pickNext(state, rng, Date.now());
  }
  S.current = id == null ? null : makeCurrent(id, { revealed: isNew || state.settings.showFirst, isNew });
}

export function gradeCurrent(ok) {
  const { C, state, current } = S;
  if (!current) return;
  // Speed: Got it needs a time; Missed is always possible (you did not remember it).
  if (current.speed && ok && current.timer.phase !== 'done') return;
  if (current.speed && current.timer.phase === 'running') return;
  const hinted = current.hints > 0 || !!current.algSeen;
  if (hinted) ok = false;
  S.undo = { state: JSON.stringify(state), current: { ...current, timer: current.timer && { ...current.timer } } };
  const id = current.id;
  const now = Date.now();
  let level, review = true, speed = null;
  if (current.speed) {
    const turns = K.turnCount(algFor(id));
    const ms = ok ? current.timer.ms : 0;
    ({ level, review } = C.gradeSpeed(state, id, ok, ms, turns, now));
    speed = { ms, turns };
  } else {
    level = C.grade(state, id, ok, now);
  }
  const opened = C.openSpeedIfReady(state);
  if (opened) S.speedNews = true;
  snapshotToday();
  const today = state.daily[dayKey()];
  today.n += 1; if (ok) today.ok += 1;
  S.lastResult = { id, ok, level, hinted, review, speed };
  save();
  nextCase();
  // Pause: the next scramble waits behind "Next scramble", which takes the place of the grade
  // buttons. Tapping "Got it" again out of habit (after restoring the cube) then grades nothing.
  S.paused = S.pauseAfterGrade && !!S.current;
  render();
  let result = `${ok ? 'Got it' : 'Missed'}: ${label(id)}`;
  result += speed ? `. ${speedText(S.lastResult)}` : `, now ${C.BUCKETS[C.bucketOf(level)]}.`;
  if (opened) result += ` Every ${C.name} case is Mastered: Speed practice is open.`;
  if (S.paused) { announce(`${result} ${afterGrade(S.lastResult)}`); focusSoon('#next-btn'); }
  else announce(`${result} ${S.current ? 'New scramble.' : ''}`);
}

// What a Speed attempt gave: the time and turns per second, the case's speed level, and the
// memory level when the attempt was also a review.
export function speedText(L) {
  const { C, state } = S;
  const cs = state.cases[L.id];
  const parts = [];
  if (L.speed.ms) {
    parts.push(`${fmtSec(L.speed.ms)} s, ${tpsText((L.speed.turns * 1000) / L.speed.ms)}.`);
    const sp = K.speedOf(cs);
    const left = K.RATED_AFTER - cs.times.length;
    parts.push(sp ? `Speed ${sp.level}: ${tpsText(sp.tps)} over your last ${Math.min(cs.times.length, K.MEDIAN_OF)} solves.`
      : `${left} more timed solve${left === 1 ? '' : 's'} for a speed level.`);
  } else parts.push(L.hinted ? 'Help used, so the time is not counted.' : 'The time is not counted.');
  if (L.review) parts.push(`Memory: now ${C.BUCKETS[C.bucketOf(L.level)]}.`);
  return parts.join(' ');
}
export const tpsText = (tps) => `${tps.toFixed(1)} turns per second`;

// Leaves the pause after a grade and shows the next scramble.
export function nextScramble() {
  if (!S.paused) return;
  S.paused = false;
  render();
  focusSoon('#scramble-text');
}

// Algorithm split into displayable moves; parenthesised AUF stays one token.
const algTokens = (id) => algFor(id).replace(/[()[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);

// The first hint of an attempt asks for confirmation, since it turns the attempt into a miss.
export function askHint() {
  const c = S.current;
  if (!c || c.revealed) return;
  c.revealAsk = false;
  if (!c.hints && !c.hintAsk && !c.algSeen) { c.hintAsk = true; render(); focusSoon('[data-action="hint-yes"]'); return; }
  giveHint();
}
// Seeing the algorithm turns the attempt into a miss, so the first look asks for confirmation.
// Space also hides it again once shown.
export function askReveal() {
  const c = S.current;
  if (!c) return;
  c.hintAsk = false;
  if (c.revealed) { c.revealed = false; render(); return; }
  if (c.algSeen) { c.revealed = true; render(); return; }
  c.revealAsk = true; render(); focusSoon('[data-action="reveal-yes"]');
}
export function confirmReveal() {
  const c = S.current;
  if (!c) return;
  c.revealAsk = false; c.algSeen = true; c.revealed = true; render();
  focusSoon('.answer .alg', true);
}
function giveHint() {
  const c = S.current;
  if (!c || c.revealed) return;
  c.hintAsk = false;
  c.hints = Math.min(algTokens(c.id).length, (c.hints || 0) + 1);
  render();
  announce(`Hint: ${algTokens(c.id).slice(0, c.hints).join(' ')}`);
}
export function showCaseOnly() {
  const c = S.current;
  if (!c || c.revealed) return;
  c.caseShown = true; c.hintAsk = false; c.revealAsk = false; render();
}
export function cancelAsk() {
  const c = S.current;
  if (!c) return;
  c.hintAsk = false; c.revealAsk = false; render();
  focusSoon('[data-action="reveal"]');
}
// After a re-render, move focus to the new control (keyboard and screen-reader users keep their place).
function focusSoon(sel, makeFocusable) {
  const el = $(sel);
  if (!el) return;
  if (makeFocusable) el.setAttribute('tabindex', '-1');
  el.focus();
}

export function doUndo() {
  if (!S.undo) return;
  S.state = S.C.normalize(JSON.parse(S.undo.state));
  S.current = S.undo.current;
  S.undo = null;
  S.lastResult = null;
  S.paused = false;
  save();
  render();
  announce('Last grade undone.');
}

export function startFromSetup() {
  const { C, state } = S;
  S.setupSel.forEach((i) => C.introduce(state, i, 1));
  state.setupDone = true; S.setupSel.clear(); S.current = null; save();
}

// One attempt at a case of the user's choice (from its details). A normal attempt: graded and
// scheduled like any other (the level still only rises after its gap); it just skips recognition.
// A case not in practice joins it.
export function practiseNow(id) {
  const { C, state } = S;
  if (!state.cases[id].active) { C.introduce(state, id, 0); save(); }
  S.current = makeCurrent(id, { picked: true });
  S.paused = false;
  S.view = 'practice';
  render();
  window.scrollTo(0, 0);
  focusSoon('#scramble-text');
  announce(`Practising ${label(id)}. New scramble.`);
}

export function setActive(id, on) {
  const { C, state } = S;
  const cs = state.cases[id];
  if (on) C.introduce(state, id, 0);
  else { cs.active = false; cs.removed = true; }
  if (!on && S.current && S.current.id === id) S.current = null;
  save();
}

function caseTitle(id) {
  const c = S.C.CASES[id];
  return `<div class="case-title"><b>${esc(S.C.label(id))}</b><span>${esc(c.nick ? c.nick + ' · ' : '')}${esc(c.group)}</span></div>`;
}

// Help for the current attempt: what has been shown so far, then the help chips.
function answerView() {
  const { C, state, current } = S;
  const id = current.id, cs = state.cases[id], c = C.CASES[id];
  if (current.revealed) {
    const custom = state.custom[id];
    return `<div class="answer open"><div class="case-show">${diagram(id, 128)}<div class="info">
        ${caseTitle(id)}
        <code class="alg" aria-label="Algorithm: ${esc(algFor(id))}">${esc(algFor(id))}</code>
        ${custom ? '<span class="alg-note">Your algorithm. Standard: ' + esc(c.alg) + '</span>' : ''}
        <div class="row">${chip(id)}<span class="muted" style="font-size:13px">${cs.n ? `${cs.ok}/${cs.n} correct` : 'First time'}</span>
        <button type="button" class="linkbtn" data-action="open" data-id="${id}" style="font-size:13px">Case details</button></div>
        <button type="button" class="btn small v-open" data-action="watch-current">Watch it in 3D ${kbd('W')}</button>
      </div></div></div>
      ${current.algSeen ? '' : `<div class="helpchips" role="group" aria-label="Help"><button type="button" class="hchip" data-action="reveal">${ICON.eye}Hide the algorithm ${kbd('Space')}</button></div>`}`;
  }
  const toks = algTokens(id);
  const h = current.hints || 0;
  const more = h < toks.length;
  const shown = [];
  if (h) {
    shown.push(`<code class="alg">${toks.slice(0, h).map(esc).join(' ')}${more ? ' <span class="muted" aria-hidden="true">…</span>' : ''}</code>
      <span class="alg-note">${more ? `Move ${h} of ${toks.length}.` : 'That is the whole algorithm.'}</span>`);
  }
  if (current.caseShown) shown.push(`<div class="case-show case-only">${diagram(id, 112)}<div class="info">${caseTitle(id)}<div class="row">${chip(id)}</div></div></div>`);
  const ask = (text, yes, yesLabel, key) => `<div class="hintask" role="group" aria-label="${esc(text)}"><span>${text}</span>
      <span class="row" style="justify-content:center"><button type="button" class="btn small" data-action="${yes}">${yesLabel} ${kbd(key)}</button>
      <button type="button" class="btn small" data-action="ask-no">Cancel ${kbd('Esc')}</button></span></div>`;
  if (current.revealAsk) shown.push(ask('Show the algorithm? This attempt will count as missed.', 'reveal-yes', 'Show algorithm', 'Space'));
  if (current.hintAsk) shown.push(ask('Show the first move? This attempt will count as missed.', 'hint-yes', 'Show first move', 'H'));
  const costly = '<span class="costdot" aria-hidden="true"></span><span class="sr-only"> (counts as missed)</span>';
  const chips = current.revealAsk || current.hintAsk ? '' : `<div class="helpchips" role="group" aria-label="Help">
      ${current.caseShown ? '' : `<button type="button" class="hchip" data-action="show-case">${ICON.eye}Case ${kbd('C')}</button>`}
      ${more ? `<button type="button" class="hchip" data-action="hint">${ICON.bulb}${h ? 'Next move' : 'Hint'}${current.hints || current.algSeen ? '' : costly} ${kbd('H')}</button>` : ''}
      <button type="button" class="hchip" data-action="reveal">${ICON.list}Algorithm${current.hints || current.algSeen ? '' : costly} ${kbd('Space')}</button>
    </div>`;
  return `${shown.length ? `<div class="answer">${shown.join('')}</div>` : ''}${chips}`;
}

// What to do with the cube before the next scramble. Scrambles start from a solved cube, so a PLL
// that was solved (on your own or with help) leaves it solved; after OLL the last layer is still
// permuted, and after a miss the cube may be anywhere.
function afterGrade(L) {
  return S.C.name === 'PLL' && (L.ok || L.hinted) ? 'Go on when you are ready.' : 'Restore your cube, then go on.';
}

// After a grade (pause on): the result, and the next scramble behind one button.
function pausedView() {
  const { C } = S;
  const L = S.lastResult;
  // The case's diagram, so you can check it is the one you just solved.
  return `<div class="pausebox" role="group" aria-labelledby="pause-h">
      ${diagram(L.id, 72)}
      <div class="pause-text">
        <p class="pause-result ${L.ok ? 'ok' : 'ko'}" id="pause-h">${L.ok ? ICON.ok : ICON.x}${L.ok ? 'Got it' : 'Missed'}: ${esc(label(L.id))}</p>
        <p class="muted">${L.speed ? esc(speedText(L)) : `Now ${C.BUCKETS[C.bucketOf(L.level)]}${L.hinted ? ' (help used)' : ''}.`} ${afterGrade(L)}</p>
        <div class="pause-links"><button type="button" class="btn small" data-action="open" data-id="${esc(L.id)}">${ICON.eye}Case details</button>${S.undo ? '<button type="button" class="linkbtn" data-action="undo">Undo this grade</button>' : ''}</div>
      </div>
    </div>`;
}

export function practiceView() {
  const { C, state } = S;
  if (!S.current || !state.cases[S.current.id].active) nextCase();
  const current = S.current;
  const rail = railView();
  const title = '<h1 class="view-title sr-only" id="view-title" tabindex="-1">Practice</h1>';
  if (!current) {
    return `${title}<div class="practice"><section class="card empty" aria-labelledby="empty-h">
      <h2 id="empty-h">Nothing to practise yet</h2>
      <p class="muted">Add cases from the Cases tab, or turn on automatic introduction in Options.</p>
      <button type="button" class="btn primary" data-action="view" data-view="cases">Choose cases</button>
    </section>${rail}</div>`;
  }
  const id = current.id;
  const moves = current.scramble.split(' ').map((m) => `<span>${esc(m)}</span>`).join(' ');
  const helped = current.hints > 0 || !!current.algSeen;
  const status = dueStatus(), due = status.due;
  let last = '';
  if (S.lastResult) {
    const L = S.lastResult;
    last = `<span>Last: ${esc(label(L.id))}</span><span class="${L.ok ? 'ok' : 'ko'}">${L.ok ? 'got it' : 'missed'}</span>
      ${L.hinted ? '<span>(help used)</span>' : ''}${L.speed ? `<span>${L.speed.ms ? fmtSec(L.speed.ms) + ' s' : 'not timed'}</span>` : `<span>now ${C.BUCKETS[C.bucketOf(L.level)]}</span>`}${S.undo ? '<button type="button" class="linkbtn" data-action="undo">Undo</button>' : ''}`;
  }
  const solveText = current.speed
    ? 'look at the case. Start the timer when your hands are ready and stop it when the last layer is done: only the solve is timed'
    : `solve the ${C.kind === 'pll' ? 'permutation of the last layer. The top face is already solved' : 'orientation of the last layer'}`;
  const helpedNote = `Recorded as missed: you used a hint or saw the algorithm${current.speed ? ', so the time is not counted' : ''}.`;
  return `${title}<div class="practice">
    <section class="card trainer" aria-labelledby="scramble-h">
      <div class="row between trainer-head"><h2 class="eyebrow" id="scramble-h">${current.speed ? 'Speed' : 'Scramble'}</h2>
        ${modeSwitch()}<span class="duepill ${due ? 'on' : ''}" data-due="${due}">${status.text}</span></div>
      ${S.speedNews && !current.speed ? `<div class="newflag">${ICON.star}<p><b>Speed practice is open.</b> Every ${C.name} case is Mastered. Choose Speed above to time your solves and get faster.</p></div>` : ''}
      ${!due && !current.isNew && !current.picked && !current.speed ? `<div class="newflag">${ICON.clock}<p><b>Nothing is due right now.</b>${status.wait ? ` The next case comes due <span class="due-wait">${status.wait}</span>.` : ''} Extra practice keeps you sharp, but levels only rise after a gap, so this is a good moment to stop.</p></div>` : ''}
      ${current.isNew ? `<div class="newflag">${ICON.star}<p><b>New case: ${esc(label(id))}.</b> Learn the algorithm below, then scramble and try it.</p></div>` : ''}
      ${current.picked ? `<div class="newflag">${ICON.target}<p>You picked <b>${esc(label(id))}</b> from its details. After this attempt, practice goes back to the usual order.</p></div>` : ''}
      ${S.paused ? pausedView() : `<p class="scramble" id="scramble-text" tabindex="-1"><span class="sr-only">Scramble: </span>${moves}</p>
      <p class="hint">Hold yellow on top and green in front, apply the scramble to a solved cube, then ${solveText}.</p>
      ${answerView()}`}
      <div class="thumbbar">
        ${S.paused ? `<button type="button" class="nextbtn" id="next-btn" data-action="next">Next scramble ${ICON.next} ${kbd('→')}</button>`
          : current.speed && current.timer.phase !== 'done' ? timerBar() : `${current.speed ? timeResult() : ''}<div class="grades" role="group" aria-label="How did it go?">
          <button type="button" class="grade miss" data-action="grade" data-ok="0">${ICON.x}Missed ${kbd('←')}</button>
          <button type="button" class="grade hit" data-action="grade" data-ok="1" aria-describedby="grade-note">${ICON.ok}${helped ? 'Solved with help' : 'Got it'} ${kbd('→')}</button>
        </div>
        <p class="gradenote" id="grade-note">${helped ? helpedNote : current.revealed ? '' : '<span class="costdot" aria-hidden="true"></span>Hint and Algorithm count the attempt as missed.'}</p>`}
        <div class="thumbfoot">${!S.paused && last ? `<div class="last">${last}</div>` : ''}${current.speed ? '' : `<span class="attempt">Attempt ${state.rep + 1}</span>`}</div>
      </div>
    </section>
    ${rail}
  </div>${current.speed && current.timer.phase === 'running' ? timerScreen() : ''}`;
}

// Memory or Speed, once Speed is open for this set.
function modeSwitch() {
  if (!S.C.speedReady(S.state)) return '';
  const on = isSpeed();
  const b = (mode, text, pressed) => `<button type="button" class="fchip" data-action="mode" data-p="${mode}" aria-pressed="${pressed}">${text}</button>`;
  return `<div class="modesw" role="group" aria-label="Practice mode">${b('memory', 'Memory', !on)}${b('speed', 'Speed', on)}</div>`;
}

// Speed, before the solve: one large Start button. Missed stays possible (you do not remember it).
function timerBar() {
  return `<button type="button" class="nextbtn startbtn" id="timer-start" data-action="timer-start">${ICON.clock}Start the timer ${kbd('Space')}</button>
    <p class="gradenote"><button type="button" class="linkbtn" data-action="grade" data-ok="0">I do not remember it (Missed)</button></p>`;
}

// While timing: the whole screen is the stop button. The clock is visual only; the result is announced.
function timerScreen() {
  return `<button type="button" class="timer-run" id="timer-stop" data-action="timer-stop">
    <span class="sr-only">Stop the timer</span><span class="timer-clock" id="timer-clock" aria-hidden="true">0.00</span>
    <span class="timer-tip" aria-hidden="true">${S.shortcuts ? 'Tap anywhere or press any key to stop' : 'Tap anywhere or press Enter to stop'}</span></button>`;
}

// Speed, after the solve: the time and its turns per second, then the grade buttons.
function timeResult() {
  const t = S.current.timer;
  const turns = K.turnCount(algFor(S.current.id));
  return `<div class="timeres"><p class="timeres-time"><b>${fmtSec(t.ms)} s</b><span>${tpsText((turns * 1000) / t.ms)}</span></p>
    <button type="button" class="linkbtn" data-action="retime">False start: time it again</button></div>`;
}

function railView() {
  const { C, state } = S;
  const act = C.activeIds(state);
  const buckets = [0, 0, 0, 0, 0];
  act.forEach((id) => buckets[C.bucketOf(state.cases[id].level)]++);
  const strip = C.CASE_IDS.map((id) => {
    const cs = state.cases[id];
    const st = cs.active ? C.BUCKETS[C.bucketOf(cs.level)] : 'Not started';
    const sty = cs.active ? ` style="background:var(--m${C.bucketOf(cs.level)})"` : '';
    return `<button type="button" class="${cs.active ? 'on' : ''}"${sty} data-action="open" data-id="${id}" title="${esc(C.label(id))}: ${st}" aria-label="${esc(C.label(id))}, ${st}"></button>`;
  }).join('');
  const legend = C.BUCKETS.map((b, i) => `<span><i class="b${i}" aria-hidden="true"></i>${b}</span>`).join('') + '<span><i class="none" aria-hidden="true"></i>Not started</span>';

  const next = C.nextToIntroduce(state);
  let nextHtml;
  if (next == null) {
    nextHtml = `<p class="muted" style="margin:10px 0 0;font-size:13px">All ${C.CASE_IDS.length} cases are in your practice rotation.</p>`;
  } else {
    const bl = C.blockers(state);
    const tname = THRESH[state.settings.introLevel] || 'Solid';
    let why;
    if (!state.settings.autoIntro) why = 'Automatic introduction is off.';
    else if (!act.length || !bl.length) why = 'Comes up on your next attempt.';
    else {
      const pool = Math.max(1, state.settings.pool || 1);
      const need = bl.length - pool + 1;
      why = `Added when fewer than ${pool} case${pool > 1 ? 's are' : ' is'} below <b>${tname}</b> (now ${bl.length}: ${bl.slice(0, 6).map((i) => C.label(i)).join(', ')}${bl.length > 6 ? '…' : ''}). ${need} more to bring up.`;
      if (bl.length < pool) why = 'Comes up on your next attempt.';
    }
    nextHtml = `<div class="nextcase">${diagram(next, 64)}<div>
      <p><b>${esc(label(next))}</b> · ${esc(C.CASES[next].group)}<br>${why}</p>
      <button type="button" class="btn small" data-action="add-next">Add it now</button></div></div>`;
  }

  const weak = act.slice().sort((a, b) => {
    const A = state.cases[a], B = state.cases[b];
    return A.level - B.level || (A.n ? A.ok / A.n : 0) - (B.n ? B.ok / B.n : 0);
  }).slice(0, 5);
  const focus = weak.length ? `<ul class="focus">${weak.map((id) => `<li><button type="button" data-action="open" data-id="${id}">${diagram(id, 34, true)}
      <span>${esc(label(id))}</span><span class="row" style="gap:8px"><span class="pct">${pct(state.cases[id])}</span>${chip(id)}</span></button></li>`).join('')}</ul>`
    : '<p class="muted" style="font-size:13px;margin:8px 0 0">Nothing in practice yet.</p>';

  return `<aside class="rail" aria-label="Your progress">
    <section class="card" aria-labelledby="rail-progress">
      <h2 id="rail-progress">Progress</h2>
      <div class="stats3">
        <div><b>${buckets[4]}</b><span>mastered</span></div>
        <div><b>${act.length}</b><span>in practice</span></div>
        <div><b>${C.CASE_IDS.length - act.length}</b><span>not started</span></div>
      </div>
      <div class="strip" role="group" aria-label="All ${C.CASE_IDS.length} cases">${strip}</div>
      <div class="legend" aria-hidden="true">${legend}</div>
    </section>
    <section class="card" aria-labelledby="rail-next"><h2 id="rail-next">Next new case</h2>${nextHtml}</section>
    ${speedRail()}
    <section class="card" aria-labelledby="rail-weak"><h2 id="rail-weak">Needs the most work</h2>${focus}</section>
  </aside>`;
}

// Speed in the rail: how far from opening, or the slowest cases with their turns per second.
function speedRail() {
  const { C, state } = S;
  const N = C.CASE_IDS.length;
  const head = '<h2 id="rail-speed">Your speed</h2>';
  if (!C.speedReady(state)) {
    const m = C.masteredCount(state);
    return `<section class="card" aria-labelledby="rail-speed">${head}
      <p class="muted" style="margin:8px 0 0;font-size:13px">Timed practice to get faster opens once all ${N} ${C.name} cases are Mastered. Now ${m} of ${N}.</p></section>`;
  }
  const rated = C.speedIds(state).map((id) => ({ id, sp: K.speedOf(state.cases[id]) })).filter((r) => r.sp);
  if (!rated.length) {
    return `<section class="card" aria-labelledby="rail-speed">${head}
      <p class="muted" style="margin:8px 0 0;font-size:13px">No speed levels yet. A case gets one after ${K.RATED_AFTER} timed solves.</p></section>`;
  }
  const typical = K.median(rated.map((r) => r.sp.tps));
  const slow = rated.sort((a, b) => a.sp.tps - b.sp.tps).slice(0, 5);
  return `<section class="card" aria-labelledby="rail-speed">${head}
    <p class="muted" style="margin:8px 0 0;font-size:13px">${rated.length} of ${N} cases rated. Typical: ${tpsText(typical)}.</p>
    <h3 class="rail-sub">Slowest</h3>
    <ul class="focus">${slow.map(({ id, sp }) => `<li><button type="button" data-action="open" data-id="${id}">${diagram(id, 34, true)}
      <span>${esc(label(id))}</span><span class="pct">${sp.tps.toFixed(1)}<span aria-hidden="true">/s</span><span class="sr-only"> turns per second</span></span></button></li>`).join('')}</ul>
  </section>`;
}

onAction({
  reveal: () => askReveal(),
  'reveal-yes': () => confirmReveal(),
  'ask-no': () => cancelAsk(),
  hint: () => askHint(),
  'hint-yes': () => giveHint(),
  next: () => nextScramble(),
  'show-case': () => showCaseOnly(),
  grade: (el) => gradeCurrent(el.dataset.ok === '1'),
  mode: (el) => {
    const mode = el.dataset.p;
    if (S.state.settings.mode === mode) return;
    S.state.settings.mode = mode;
    S.speedNews = false; S.current = null; S.paused = false; S.lastResult = null; S.undo = null;
    save(); render();
    announce(mode === 'speed' ? 'Speed practice. Look at the case, then start the timer.' : 'Memory practice.');
  },
  undo: () => doUndo(),
  'add-next': () => {
    const { C, state } = S;
    const n = C.nextToIntroduce(state);
    if (n == null) return;
    C.introduce(state, n, 0); save();
    S.current = makeCurrent(n, { revealed: true, isNew: true });
    render();
    announce(`${label(n)} added. Its algorithm is shown.`);
  },
});
