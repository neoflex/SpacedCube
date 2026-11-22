// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Notation: parsing, formatting, and translating any algorithm into outer face turns.

const TOKEN_RE = /([RLUDFBMESrludfbxyz])(w?)(\d*)('?)/g;
export function parse(alg) {
  const s = String(alg).replace(/[’`´]/g, "'").replace(/[()[\]{}]/g, ' ');
  const rest = s.replace(TOKEN_RE, '').trim();
  if (rest.length) throw new Error('Unrecognised notation: "' + rest.split(/\s+/)[0] + '"');
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s))) {
    let f = m[1];
    if (m[2] === 'w') {
      if (!'RLUDFB'.includes(f)) throw new Error('Unrecognised move: ' + m[0]);
      f = f.toLowerCase();
    }
    const n = m[3] ? parseInt(m[3], 10) : 1;
    const a = ((m[4] ? 4 - (n % 4) : n) % 4 + 4) % 4;
    if (a) out.push({ f, a });
  }
  return out;
}
const fmtMove = (m) => m.f + (m.a === 1 ? '' : m.a === 2 ? '2' : "'");
export const fmt = (mvs) => mvs.map(fmtMove).join(' ');
export const invert = (mvs) => mvs.slice().reverse().map((m) => ({ f: m.f, a: (4 - m.a) % 4 }));

// Translate any sequence (wide moves, slices, rotations) into outer face turns
// relative to fixed centers. Final cube rotation is dropped.
export function toFaceTurns(mvs) {
  const map = { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B' }; // held face -> physical face
  const out = [];
  const inv = (a) => (4 - a) % 4;
  const rot = (axis, a) => {
    for (let i = 0; i < a; i++) {
      const o = { ...map };
      if (axis === 'x') { map.U = o.F; map.F = o.D; map.D = o.B; map.B = o.U; }
      else if (axis === 'y') { map.F = o.R; map.L = o.F; map.B = o.L; map.R = o.B; }
      else { map.R = o.U; map.D = o.R; map.L = o.D; map.U = o.L; }
    }
  };
  for (const { f, a } of mvs) {
    if ('UDRLFB'.includes(f)) out.push({ f: map[f], a });
    else if ('xyz'.includes(f)) rot(f, a);
    else if (f === 'r') { out.push({ f: map.L, a }); rot('x', a); }
    else if (f === 'l') { out.push({ f: map.R, a }); rot('x', inv(a)); }
    else if (f === 'u') { out.push({ f: map.D, a }); rot('y', a); }
    else if (f === 'd') { out.push({ f: map.U, a }); rot('y', inv(a)); }
    else if (f === 'f') { out.push({ f: map.B, a }); rot('z', a); }
    else if (f === 'b') { out.push({ f: map.F, a }); rot('z', inv(a)); }
    else if (f === 'M') { out.push({ f: map.R, a }); out.push({ f: map.L, a: inv(a) }); rot('x', inv(a)); }
    else if (f === 'E') { out.push({ f: map.U, a }); out.push({ f: map.D, a: inv(a) }); rot('y', inv(a)); }
    else if (f === 'S') { out.push({ f: map.F, a: inv(a) }); out.push({ f: map.B, a }); rot('z', a); }
  }
  return simplify(out);
}

const AXIS = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
export function simplify(mvs) {
  const out = [];
  for (const mv of mvs) {
    if (!(mv.a % 4)) continue;
    let merged = false;
    for (let i = out.length - 1; i >= 0 && AXIS[out[i].f] === AXIS[mv.f]; i--) {
      if (out[i].f === mv.f) {
        const a = (out[i].a + mv.a) % 4;
        if (a) out[i] = { f: mv.f, a }; else out.splice(i, 1);
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ f: mv.f, a: mv.a % 4 });
  }
  return out;
}
