// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Cube model at sticker level and move application.

// Axes: x = R, y = U, z = F. A sticker has position p and normal n in {-1,0,1}^3.
export const FACE_N = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
export const faceOfN = (n) => {
  for (const k in FACE_N) { const f = FACE_N[k]; if (f[0] === n[0] && f[1] === n[1] && f[2] === n[2]) return k; }
  return null;
};

export function solvedCube() {
  const st = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const p = [x, y, z];
    for (let ax = 0; ax < 3; ax++) {
      if (p[ax] !== 0) {
        const n = [0, 0, 0]; n[ax] = p[ax];
        st.push({ p: p.slice(), n, c: faceOfN(n) });
      }
    }
  }
  return st;
}

// Counter-clockwise quarter turn about +axis, q times.
function rotV(v, axis, q) {
  let [x, y, z] = v;
  for (let i = 0; i < q; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

// [axis, layer selector, CCW quarter turns for one clockwise move]
export const MOVE_DEF = {
  R: [0, (c) => c === 1, 3], L: [0, (c) => c === -1, 1],
  U: [1, (c) => c === 1, 3], D: [1, (c) => c === -1, 1],
  F: [2, (c) => c === 1, 3], B: [2, (c) => c === -1, 1],
  M: [0, (c) => c === 0, 1], E: [1, (c) => c === 0, 1], S: [2, (c) => c === 0, 3],
  r: [0, (c) => c >= 0, 3], l: [0, (c) => c <= 0, 1],
  u: [1, (c) => c >= 0, 3], d: [1, (c) => c <= 0, 1],
  f: [2, (c) => c >= 0, 3], b: [2, (c) => c <= 0, 1],
  x: [0, () => true, 3], y: [1, () => true, 3], z: [2, () => true, 3],
};

export function applyMove(st, mv) {
  const [axis, sel, q1] = MOVE_DEF[mv.f];
  const q = (q1 * mv.a) % 4;
  if (q === 0) return st;
  for (const s of st) {
    if (sel(s.p[axis])) { s.p = rotV(s.p, axis, q); s.n = rotV(s.n, axis, q); }
  }
  return st;
}
export function applyMoves(st, mvs) { for (const m of mvs) applyMove(st, m); return st; }

export const clone = (st) => st.map((s) => ({ p: s.p.slice(), n: s.n.slice(), c: s.c }));
