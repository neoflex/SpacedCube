// Speed practice timer. You look at the case first (recognition is not timed), then start the
// timer with a tap on Start (or Space) and stop it with a tap anywhere or any key.
// Its state lives in the current attempt: S.current.timer = { phase: ready | running | done, ms }.
import { S, render } from './state.js';
import { $, target, announce } from './util.js';
import { onAction } from './actions.js';

export const fmtSec = (ms) => (ms / 1000).toFixed(2);
const clock = () => performance.now();
const MIN_MS = 250; // a stop this soon after the start is the same tap, not a solve
let raf = 0, t0 = 0;

const timer = () => (S.current && S.current.timer) || null;
export const timerPhase = () => (timer() ? timer().phase : null);

export function startTimer() {
  const t = timer();
  if (!t || t.phase !== 'ready' || S.paused || S.dialogId != null) return;
  t.phase = 'running'; t.ms = 0; t0 = clock();
  render();
  const stop = $('#timer-stop');
  if (stop) stop.focus({ preventScroll: true });
  tick();
}

function tick() {
  cancelAnimationFrame(raf);
  const t = timer();
  if (!t || t.phase !== 'running') return;
  const el = document.getElementById('timer-clock');
  if (el) el.textContent = fmtSec(clock() - t0);
  raf = requestAnimationFrame(tick);
}

export function stopTimer() {
  const t = timer();
  if (!t || t.phase !== 'running') return;
  const ms = clock() - t0;
  if (ms < MIN_MS) return;
  cancelAnimationFrame(raf);
  t.phase = 'done'; t.ms = Math.round(ms);
  render();
  const ok = $('[data-action="grade"][data-ok="1"]');
  if (ok) ok.focus({ preventScroll: true });
  announce(`${fmtSec(t.ms)} seconds. Got it or Missed?`);
}

// A false start: back to Start with the same scramble, nothing recorded.
export function retime() {
  const t = timer();
  if (!t || t.phase !== 'done') return;
  t.phase = 'ready'; t.ms = 0;
  render();
  const start = $('#timer-start');
  if (start) start.focus({ preventScroll: true });
}

// Start and stop react on pointerdown, so the time does not include lifting the finger.
// Keyboard users press Enter or Space on the focused button (a click), or use the shortcuts.
export function listenTimer() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = target(e);
    if (!el) return;
    if (el.closest('#timer-start')) { e.preventDefault(); startTimer(); }
    else if (el.closest('#timer-stop')) { e.preventDefault(); stopTimer(); }
  });
}

// Clicks: only those from the keyboard (detail 0). A pointer already acted on pointerdown, and its
// click lands on whatever is under the finger after the re-render (the stop screen).
onAction({
  'timer-start': (el, e) => { if (!e.detail) startTimer(); },
  'timer-stop': (el, e) => { if (!e.detail) stopTimer(); },
  retime: () => retime(),
});
