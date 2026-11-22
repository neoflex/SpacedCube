// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Reading a cube state: is it solved, which OLL pattern or PLL case does it show.
import { faceOfN, applyMove, clone } from './cube.js';

// ---------- State inspection (relative to centers) ----------
export function centers(st) {
  const c = {};
  for (const s of st) {
    const nz = s.p.filter((v) => v !== 0).length;
    if (nz === 1) c[faceOfN(s.n)] = s.c;
  }
  return c; // physical face -> colour
}
// F2L intact and last layer sitting on the physical U face (centers fixed, as after face turns).
export function f2lIntact(st) {
  for (const s of st) {
    if (s.p[1] === 1) continue;
    if (s.c !== faceOfN(s.n)) return false;
  }
  return true;
}
export function llOriented(st) {
  for (const s of st) if (s.n[1] === 1 && s.c !== 'U') return false;
  return true;
}
export function solvedUpToRotation(st) {
  const c = centers(st);
  for (const s of st) if (s.c !== c[faceOfN(s.n)]) return false;
  return true;
}
// 21-flag orientation pattern: top 3x3 (back row first, left to right), then side stickers.
export function topPattern(st) {
  const g = { top: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], back: [0, 0, 0], front: [0, 0, 0], left: [0, 0, 0], right: [0, 0, 0] };
  for (const s of st) {
    if (s.p[1] !== 1 || s.c !== 'U') continue;
    const [x, , z] = s.p;
    const f = faceOfN(s.n);
    if (f === 'U') g.top[z + 1][x + 1] = 1;
    else if (f === 'B') g.back[x + 1] = 1;
    else if (f === 'F') g.front[x + 1] = 1;
    else if (f === 'L') g.left[z + 1] = 1;
    else if (f === 'R') g.right[z + 1] = 1;
  }
  return g;
}
export const patKey = (g) => [].concat(...g.top, g.back, g.right, g.front, g.left).join('');
export function patKeys4(st) {
  const keys = [];
  const c = clone(st);
  for (let i = 0; i < 4; i++) { keys.push(patKey(topPattern(c))); applyMove(c, { f: 'U', a: 1 }); }
  return keys;
}

// ---------- PLL helpers ----------
// 12 side stickers of the U layer (F, R, B, L, each read left to right as seen from that face),
// labelled by the face whose centre matches their colour.
export function llSideKey(st) {
  const cen = centers(st);
  const col2face = {};
  for (const f in cen) col2face[cen[f]] = f;
  const faces = ['F', 'R', 'B', 'L'];
  const order = { F: (p) => p[0], R: (p) => -p[2], B: (p) => -p[0], L: (p) => p[2] };
  let key = '';
  for (const f of faces) {
    const ss = st.filter((s) => s.p[1] === 1 && faceOfN(s.n) === f).sort((a, b) => order[f](a.p) - order[f](b.p));
    for (const s of ss) key += col2face[s.c];
  }
  return key;
}
// Every way the same PLL case can look: 4 viewing angles x 4 AUFs.
export function pllKeys(st) {
  const keys = new Set();
  const c = clone(st);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) { keys.add(llSideKey(c)); applyMove(c, { f: 'U', a: 1 }); }
    applyMove(c, { f: 'y', a: 1 });
  }
  return keys;
}
export function solvedFixed(st) { for (const s of st) if (s.c !== faceOfN(s.n)) return false; return true; }
// Arrows for a PLL diagram: where each top-layer piece must go. Coordinates are [col,row], row 0 = back.
export function pllArrows(st) {
  const pieces = {};
  for (const s of st) {
    if (s.p[1] !== 1) continue;
    const k = s.p[0] + ',' + s.p[2];
    (pieces[k] = pieces[k] || { p: s.p, cols: [] }).cols.push(s.c);
  }
  const arrows = [];
  for (const k in pieces) {
    const { p, cols } = pieces[k];
    if (p[0] === 0 && p[2] === 0) continue;
    const hx = cols.includes('R') ? 1 : cols.includes('L') ? -1 : 0;
    const hz = cols.includes('F') ? 1 : cols.includes('B') ? -1 : 0;
    if (hx !== p[0] || hz !== p[2]) arrows.push({ from: [p[0] + 1, p[2] + 1], to: [hx + 1, hz + 1] });
  }
  // Merge two-way swaps into one double-headed arrow.
  const out = [];
  const used = new Set();
  arrows.forEach((a, i) => {
    if (used.has(i)) return;
    const j = arrows.findIndex((b, jj) => jj !== i && !used.has(jj) && b.from[0] === a.to[0] && b.from[1] === a.to[1] && b.to[0] === a.from[0] && b.to[1] === a.from[1]);
    if (j >= 0) { used.add(j); out.push({ ...a, both: true }); } else out.push({ ...a, both: false });
    used.add(i);
  });
  return out;
}
export function sideColors(st) {
  const g = { back: [], front: [], left: [], right: [] };
  for (const s of st) {
    if (s.p[1] !== 1 || s.n[1] !== 0) continue;
    const [x, , z] = s.p, f = faceOfN(s.n);
    if (f === 'B') g.back[x + 1] = s.c;
    else if (f === 'F') g.front[x + 1] = s.c;
    else if (f === 'L') g.left[z + 1] = s.c;
    else if (f === 'R') g.right[z + 1] = s.c;
  }
  return g;
}
