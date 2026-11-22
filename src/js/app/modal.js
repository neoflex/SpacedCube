// Modal behaviour shared by the case dialog and the 3D viewer: the rest of the page becomes inert
// (not focusable, hidden from screen readers) and focus returns to the opener when it closes.
const BACKGROUND = ['header.top', '#app', '.skip'];
const open = new Map(); // container id -> element that had focus before

export function modalOpened(id) {
  if (!open.has(id)) open.set(id, document.activeElement);
  // Only the topmost modal stays interactive.
  for (const sel of BACKGROUND) document.querySelectorAll(sel).forEach((el) => { el.inert = true; });
  // A modal opened from another one (the viewer from the case dialog) covers it.
  for (const other of ['dlg', 'viewer']) {
    const el = document.getElementById(other);
    if (el) el.inert = other !== id && open.has(other);
  }
}

export function modalClosed(id, fallback) {
  if (!open.has(id)) return;
  const opener = open.get(id);
  open.delete(id);
  const top = [...open.keys()].pop();
  if (top) { const el = document.getElementById(top); if (el) el.inert = false; }
  else for (const sel of BACKGROUND) document.querySelectorAll(sel).forEach((el) => { el.inert = false; });
  const target = opener && opener.isConnected ? opener : fallback && fallback();
  if (target && target.focus) target.focus();
}

export const isOpen = (id) => open.has(id);
