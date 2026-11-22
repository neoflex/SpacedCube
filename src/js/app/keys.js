// Keyboard: dialogs and the 3D viewer first, then the single-key practice shortcuts
// (which can be turned off in Options, as WCAG 2.1.4 asks).
import { S } from './state.js';
import { viewerKey } from './viewer3d.js';
import { closeDialog } from './dialog.js';
import { askReveal, confirmReveal, askHint, showCaseOnly, cancelAsk, gradeCurrent, doUndo } from './practice.js';
import { watchCurrent } from './viewer3d.js';
import { settingChanged } from './options.js';
import { viewerSpeed } from './viewer3d.js';
import { render } from './state.js';

export function listenKeys() {
  document.addEventListener('keydown', (e) => {
    if (viewerKey(e)) return;
    if (S.dialogId != null) {
      if (e.key === 'Escape') closeDialog();
      return;
    }
    const c = S.current;
    if (S.view !== 'practice' || !c) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (e.key === 'Escape' && (c.hintAsk || c.revealAsk)) { cancelAsk(); return; }
    if (!S.shortcuts || e.metaKey || e.ctrlKey || e.altKey) return;
    // Space and arrows keep their usual meaning on buttons and links.
    const onControl = t.closest && t.closest('button, a, summary');
    if (e.key === ' ' && !onControl) { e.preventDefault(); if (c.revealAsk) confirmReveal(); else askReveal(); }
    else if ((e.key === 'c' || e.key === 'C') && !c.revealed) { e.preventDefault(); showCaseOnly(); }
    else if ((e.key === 'w' || e.key === 'W') && c.revealed) { e.preventDefault(); watchCurrent(); }
    else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); askHint(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); gradeCurrent(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); gradeCurrent(false); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset) return;
    if (el.dataset.vspeed) { viewerSpeed(el); return; }
    if (el.dataset.sort) { S.sortBy = el.value; render(); return; }
    if (el.dataset.setting) settingChanged(el);
  });
}
