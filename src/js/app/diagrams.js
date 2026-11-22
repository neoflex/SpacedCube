// Case diagrams (SVG, computed from the algorithms) and the small labels around them.
import { S } from './state.js';
import { esc } from './util.js';

const FACE_COLORS = { F: '#2f9e4f', R: '#d8392b', B: '#2b67d1', L: '#f08519', U: 'var(--sticker-on)', D: '#f4f4f4' };
const FACE_NAMES = { F: 'green', R: 'red', B: 'blue', L: 'orange', U: 'yellow', D: 'white' };

// What to show for a case: the user's algorithm (if any) and the case as seen from its angle.
const viewCache = new Map();
export function view4(id) {
  const { C, state } = S;
  const custom = state.custom[id];
  if (!custom) return C.CASES[id];
  const key = C.name + '|' + id + '|' + custom;
  if (!viewCache.has(key)) viewCache.set(key, C.viewFor(custom));
  return viewCache.get(key);
}
export const algFor = (id) => view4(id).alg;
export const label = (id) => (S.C.CASES[id].nick ? `${S.C.label(id)} ${S.C.CASES[id].nick}` : S.C.label(id));

// Text alternative for a diagram: which stickers are yellow (OLL) or how pieces move (PLL).
function describe(id) {
  const c = view4(id);
  if (S.C.kind === 'pll') {
    const n = c.arrows.length;
    return `${S.C.label(id)}: ${n} piece${n === 1 ? '' : 's'} move. Front side colours ${c.sides.front.map((x) => FACE_NAMES[x]).join(', ')}.`;
  }
  const g = c.pattern;
  const top = g.top.flat().filter(Boolean).length;
  const sides = ['back', 'front', 'left', 'right'].reduce((a, k) => a + g[k].filter(Boolean).length, 0);
  return `${S.C.label(id)}: ${top} of 9 top stickers yellow, ${sides} yellow stickers on the sides.`;
}

const frame = (id, size, decorative) => {
  const a11y = decorative ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${esc(describe(id))}"`;
  return `<svg class="dg" viewBox="0 0 100 100" width="${size}" height="${size}" ${a11y}><rect x="0.5" y="0.5" width="99" height="99" rx="11" fill="var(--cube-body)"/>`;
};
const CELL = 24, GAP = 2.5, START = 50 - (3 * CELL + 2 * GAP) / 2, T = 6, O = 3.2;

function pllDiagram(id, size, decorative) {
  const c = view4(id);
  const ctr = (i) => START + i * (CELL + GAP) + CELL / 2;
  let r = frame(id, size, decorative);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    r += `<rect x="${START + col * (CELL + GAP)}" y="${START + row * (CELL + GAP)}" width="${CELL}" height="${CELL}" rx="3.5" fill="var(--sticker-on)"/>`;
  }
  const sd = c.sides;
  for (let i = 0; i < 3; i++) {
    const p = START + i * (CELL + GAP) + 2, len = CELL - 4;
    r += `<rect x="${p}" y="${O}" width="${len}" height="${T}" rx="2" fill="${FACE_COLORS[sd.back[i]]}"/>`;
    r += `<rect x="${p}" y="${100 - O - T}" width="${len}" height="${T}" rx="2" fill="${FACE_COLORS[sd.front[i]]}"/>`;
    r += `<rect x="${O}" y="${p}" width="${T}" height="${len}" rx="2" fill="${FACE_COLORS[sd.left[i]]}"/>`;
    r += `<rect x="${100 - O - T}" y="${p}" width="${T}" height="${len}" rx="2" fill="${FACE_COLORS[sd.right[i]]}"/>`;
  }
  const head = (x, y, ux, uy) => {
    const w = 3.6, l = 6;
    return `<polygon points="${x},${y} ${x - ux * l - uy * w},${y - uy * l + ux * w} ${x - ux * l + uy * w},${y - uy * l - ux * w}" fill="#14171c"/>`;
  };
  for (const a of c.arrows) {
    let x1 = ctr(a.from[0]), y1 = ctr(a.from[1]), x2 = ctr(a.to[0]), y2 = ctr(a.to[1]);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, trim = 5;
    x1 += ux * trim; y1 += uy * trim; x2 -= ux * trim; y2 -= uy * trim;
    const sx = a.both ? x1 + ux * 5 : x1, sy = a.both ? y1 + uy * 5 : y1;
    r += `<line x1="${sx}" y1="${sy}" x2="${x2 - ux * 5}" y2="${y2 - uy * 5}" stroke="#14171c" stroke-width="2.4" stroke-linecap="round"/>`;
    r += head(x2, y2, ux, uy);
    if (a.both) r += head(x1, y1, -ux, -uy);
  }
  return r + '</svg>';
}

// decorative: the diagram sits inside a control that already names the case.
export function diagram(id, size, decorative = false) {
  if (S.C.kind === 'pll') return pllDiagram(id, size, decorative);
  const g = view4(id).pattern;
  const on = 'var(--sticker-on)', off = 'var(--sticker-off)';
  let r = frame(id, size, decorative);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    r += `<rect x="${START + col * (CELL + GAP)}" y="${START + row * (CELL + GAP)}" width="${CELL}" height="${CELL}" rx="3.5" fill="${g.top[row][col] ? on : off}"/>`;
  }
  for (let i = 0; i < 3; i++) {
    const p = START + i * (CELL + GAP) + 2, len = CELL - 4;
    if (g.back[i]) r += `<rect x="${p}" y="${O}" width="${len}" height="${T}" rx="2" fill="${on}"/>`;
    if (g.front[i]) r += `<rect x="${p}" y="${100 - O - T}" width="${len}" height="${T}" rx="2" fill="${on}"/>`;
    if (g.left[i]) r += `<rect x="${O}" y="${p}" width="${T}" height="${len}" rx="2" fill="${on}"/>`;
    if (g.right[i]) r += `<rect x="${100 - O - T}" y="${p}" width="${T}" height="${len}" rx="2" fill="${on}"/>`;
  }
  return r + '</svg>';
}

export function chip(id) {
  const { C, state } = S;
  const cs = state.cases[id];
  if (!cs.active) return '<span class="chip off"><i aria-hidden="true"></i>Not started</span>';
  const b = C.bucketOf(cs.level);
  return `<span class="chip" title="Level ${cs.level} of ${C.MAX_LEVEL}"><i class="b${b}" aria-hidden="true"></i>${C.BUCKETS[b]}<span class="sr-only">, level ${cs.level} of ${C.MAX_LEVEL}</span></span>`;
}
export function missAgo(cs) {
  const k = S.state.rep - S.C.lastMissRep(cs);
  return k <= 1 ? 'last attempt' : k + ' attempts ago';
}
export function nextLevelText(cs) {
  const at = S.C.nextLevelAt(cs), wait = at - Date.now();
  if (!cs.lastTs || wait <= 0) return 'Its next correct answer raises its level.';
  const h = wait / 3600000;
  const t = h < 1 ? Math.ceil(wait / 60000) + ' min' : h < 36 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days';
  return `A correct answer raises its level from ${t} from now.`;
}
