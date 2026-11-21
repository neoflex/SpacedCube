/* OLL trainer core: cube model, case data, scrambles, scheduler. No DOM. */
const CubeCore = (() => {
  // ---------- Cube model (sticker level) ----------
  // Axes: x = R, y = U, z = F. A sticker has position p and normal n in {-1,0,1}^3.
  const FACE_N = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const faceOfN = (n) => {
    for (const k in FACE_N) { const f = FACE_N[k]; if (f[0] === n[0] && f[1] === n[1] && f[2] === n[2]) return k; }
    return null;
  };

  function solvedCube() {
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
  const MOVE_DEF = {
    R: [0, (c) => c === 1, 3], L: [0, (c) => c === -1, 1],
    U: [1, (c) => c === 1, 3], D: [1, (c) => c === -1, 1],
    F: [2, (c) => c === 1, 3], B: [2, (c) => c === -1, 1],
    M: [0, (c) => c === 0, 1], E: [1, (c) => c === 0, 1], S: [2, (c) => c === 0, 3],
    r: [0, (c) => c >= 0, 3], l: [0, (c) => c <= 0, 1],
    u: [1, (c) => c >= 0, 3], d: [1, (c) => c <= 0, 1],
    f: [2, (c) => c >= 0, 3], b: [2, (c) => c <= 0, 1],
    x: [0, () => true, 3], y: [1, () => true, 3], z: [2, () => true, 3],
  };

  function applyMove(st, mv) {
    const [axis, sel, q1] = MOVE_DEF[mv.f];
    const q = (q1 * mv.a) % 4;
    if (q === 0) return st;
    for (const s of st) {
      if (sel(s.p[axis])) { s.p = rotV(s.p, axis, q); s.n = rotV(s.n, axis, q); }
    }
    return st;
  }
  function applyMoves(st, mvs) { for (const m of mvs) applyMove(st, m); return st; }

  // ---------- Notation ----------
  const TOKEN_RE = /([RLUDFBMESrludfbxyz])(w?)(\d*)('?)/g;
  function parse(alg) {
    const s = String(alg).replace(/[’`´]/g, "'").replace(/[()\[\]{}]/g, ' ');
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
  const fmt = (mvs) => mvs.map(fmtMove).join(' ');
  const invert = (mvs) => mvs.slice().reverse().map((m) => ({ f: m.f, a: (4 - m.a) % 4 }));

  // Translate any sequence (wide moves, slices, rotations) into outer face turns
  // relative to fixed centers. Final cube rotation is dropped.
  function toFaceTurns(mvs) {
    let map = { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B' }; // held face -> physical face
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
  function simplify(mvs) {
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

  // ---------- State inspection (relative to centers) ----------
  function centers(st) {
    const c = {};
    for (const s of st) {
      const nz = s.p.filter((v) => v !== 0).length;
      if (nz === 1) c[faceOfN(s.n)] = s.c;
    }
    return c; // physical face -> colour
  }
  // F2L intact and last layer sitting on the physical U face (centers fixed, as after face turns).
  function f2lIntact(st) {
    for (const s of st) {
      if (s.p[1] === 1) continue;
      if (s.c !== faceOfN(s.n)) return false;
    }
    return true;
  }
  function llOriented(st) {
    for (const s of st) if (s.n[1] === 1 && s.c !== 'U') return false;
    return true;
  }
  function solvedUpToRotation(st) {
    const c = centers(st);
    for (const s of st) if (s.c !== c[faceOfN(s.n)]) return false;
    return true;
  }
  // 21-flag orientation pattern: top 3x3 (back row first, left to right), then side stickers.
  function topPattern(st) {
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
  const patKey = (g) => [].concat(...g.top, g.back, g.right, g.front, g.left).join('');
  function patKeys4(st) {
    const keys = [];
    const c = st.map((s) => ({ p: s.p.slice(), n: s.n.slice(), c: s.c }));
    for (let i = 0; i < 4; i++) { keys.push(patKey(topPattern(c))); applyMove(c, { f: 'U', a: 1 }); }
    return keys;
  }

  // ---------- PLL helpers ----------
  // 12 side stickers of the U layer (F, R, B, L, each read left to right as seen from that face),
  // labelled by the face whose centre matches their colour.
  function llSideKey(st) {
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
  const clone = (st) => st.map((s) => ({ p: s.p.slice(), n: s.n.slice(), c: s.c }));
  // Every way the same PLL case can look: 4 viewing angles x 4 AUFs.
  function pllKeys(st) {
    const keys = new Set();
    const c = clone(st);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) { keys.add(llSideKey(c)); applyMove(c, { f: 'U', a: 1 }); }
      applyMove(c, { f: 'y', a: 1 });
    }
    return keys;
  }
  function solvedFixed(st) { for (const s of st) if (s.c !== faceOfN(s.n)) return false; return true; }
  // Arrows for a PLL diagram: where each top-layer piece must go. Coordinates are [col,row], row 0 = back.
  function pllArrows(st) {
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
  function sideColors(st) {
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

  // ---------- Case sets ----------
  const OLL_DEF = {
    name: 'OLL', kind: 'oll', stripCols: 19, first: '27',
    label: (id) => 'OLL ' + id,
    GROUPS: [
      'Awkward Shape', 'Big Lightning Bolt', 'C Shape', 'Corners Oriented', 'Cross', 'Dot', 'Fish Shape',
      'I Shape', 'Knight Move Shape', 'P Shape', 'Small L Shape', 'Small Lightning Bolt', 'Square Shape', 'T Shape', 'W Shape',
    ],
    // Algorithms from jperm.net/algs/oll.
    RAW: [
      [29, 'Awkward Shape', "R U R' U' R U' R' F' U' F R U R'"],
      [30, 'Awkward Shape', "F R' F R2 U' R' U' R U R' F2"],
      [41, 'Awkward Shape', "R U R' U R U2 R' F R U R' U' F'"],
      [42, 'Awkward Shape', "R' U' R U' R' U2 R F R U R' U' F'"],
      [39, 'Big Lightning Bolt', "L F' L' U' L U F U' L'"],
      [40, 'Big Lightning Bolt', "R' F R U R' U' F' U R"],
      [34, 'C Shape', "R U R2 U' R' F R U R U' F'"],
      [46, 'C Shape', "R' U' R' F R F' U R"],
      [28, 'Corners Oriented', "r U R' U' r' R U R U' R'"],
      [57, 'Corners Oriented', "R U R' U' M' U R U' r'"],
      [21, 'Cross', "R U2 R' U' R U R' U' R U' R'"],
      [22, 'Cross', "R U2 R2 U' R2 U' R2 U2 R"],
      [23, 'Cross', "R2 D' R U2 R' D R U2 R"],
      [24, 'Cross', "r U R' U' r' F R F'"],
      [25, 'Cross', "F' r U R' U' r' F R"],
      [26, 'Cross', "R U2 R' U' R U' R'"],
      [27, 'Cross', "R U R' U R U2 R'"],
      [1, 'Dot', "R U2 R2 F R F' U2 R' F R F'"],
      [2, 'Dot', "r U r' U2 r U2 R' U2 R U' r'"],
      [3, 'Dot', "r' R2 U R' U r U2 r' U M'"],
      [4, 'Dot', "M U' r U2 r' U' R U' R' M'"],
      [17, 'Dot', "F R' F' R2 r' U R U' R' U' M'"],
      [18, 'Dot', "r U R' U R U2 r2 U' R U' R' U2 r"],
      [19, 'Dot', "r' R U R U R' U' M' R' F R F'"],
      [20, 'Dot', "r U R' U' M2 U R U' R' U' M'"],
      [9, 'Fish Shape', "R U R' U' R' F R2 U R' U' F'"],
      [10, 'Fish Shape', "R U R' U R' F R F' R U2 R'"],
      [35, 'Fish Shape', "R U2 R2 F R F' R U2 R'"],
      [37, 'Fish Shape', "F R' F' R U R U' R'"],
      [51, 'I Shape', "F U R U' R' U R U' R' F'"],
      [52, 'I Shape', "R U R' U R U' B U' B' R'"],
      [55, 'I Shape', "R' F R U R U' R2 F' R2 U' R' U R U R'"],
      [56, 'I Shape', "r' U' r U' R' U R U' R' U R r' U r"],
      [13, 'Knight Move Shape', "F U R U' R2 F' R U R U' R'"],
      [14, 'Knight Move Shape', "R' F R U R' F' R F U' F'"],
      [15, 'Knight Move Shape', "l' U' l L' U' L U l' U l"],
      [16, 'Knight Move Shape', "r U r' R U R' U' r U' r'"],
      [31, 'P Shape', "R' U' F U R U' R' F' R"],
      [32, 'P Shape', "L U F' U' L' U L F L'"],
      [43, 'P Shape', "F' U' L' U L F"],
      [44, 'P Shape', "F U R U' R' F'"],
      [47, 'Small L Shape', "R' U' R' F R F' R' F R F' U R"],
      [48, 'Small L Shape', "F R U R' U' R U R' U' F'"],
      [49, 'Small L Shape', "r U' r2 U r2 U r2 U' r"],
      [50, 'Small L Shape', "r' U r2 U' r2 U' r2 U r'"],
      [53, 'Small L Shape', "l' U2 L U L' U' L U L' U l"],
      [54, 'Small L Shape', "r U2 R' U' R U R' U' R U' r'"],
      [7, 'Small Lightning Bolt', "r U R' U R U2 r'"],
      [8, 'Small Lightning Bolt', "l' U' L U' L' U2 l"],
      [11, 'Small Lightning Bolt', "r U R' U R' F R F' R U2 r'"],
      [12, 'Small Lightning Bolt', "M' R' U' R U' R' U2 R U' R r'"],
      [5, 'Square Shape', "l' U2 L U L' U l"],
      [6, 'Square Shape', "r U2 R' U' R U' r'"],
      [33, 'T Shape', "R U R' U' R' F R F'"],
      [45, 'T Shape', "F R U R' U' F'"],
      [36, 'W Shape', "L' U' L U' L' U L U L F' L' F"],
      [38, 'W Shape', "R U R' U R U' R' U' R' F R F'"],
    ],
    NICK: { 21: 'H', 22: 'Pi', 23: 'Headlights', 24: 'Chameleon', 25: 'Bowtie', 26: 'Anti-Sune', 27: 'Sune' },
    INTRO_ORDER: [
      27, 26, 21, 22, 24, 25, 23, 45, 33, 44, 43, 31, 32, 5, 6, 37, 35, 10, 9, 7, 8, 11, 12, 46, 34, 38, 36,
      57, 28, 48, 47, 49, 50, 53, 54, 40, 39, 51, 52, 55, 56, 13, 14, 15, 16, 29, 30, 41, 42, 17, 18, 19, 20, 1, 2, 3, 4,
    ],
    sortIds: (ids) => ids.sort((a, b) => Number(a) - Number(b)),
  };

  const PLL_DEF = {
    name: 'PLL', kind: 'pll', stripCols: 21, first: 'T',
    label: (id) => id + ' perm',
    GROUPS: ['Edges only', 'Corners only', 'Adjacent corner swap', 'Diagonal corner swap', 'G perms'],
    RAW: [
      ['Ua', 'Edges only', "R U' R U R U R U' R' U' R2"],
      ['Ub', 'Edges only', "R2 U R U R' U' R' U' R' U R'"],
      ['H', 'Edges only', "M2 U M2 U2 M2 U M2"],
      ['Z', 'Edges only', "M' U M2 U M2 U M' U2 M2"],
      ['Aa', 'Corners only', "x L2 D2 L' U' L D2 L' U L' x'"],
      ['Ab', 'Corners only', "x' L2 D2 L U L' D2 L U' L x"],
      ['E', 'Corners only', "x' L' U L D' L' U' L D L' U' L D' L' U L D x"],
      ['T', 'Adjacent corner swap', "R U R' U' R' F R2 U' R' U' R U R' F'"],
      ['F', 'Adjacent corner swap', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
      ['Ja', 'Adjacent corner swap', "L' U' L F L' U' L U L F' L2 U L"],
      ['Jb', 'Adjacent corner swap', "R U R' F' R U R' U' R' F R2 U' R'"],
      ['Ra', 'Adjacent corner swap', "R U' R' U' R U R D R' U' R D' R' U2 R'"],
      ['Rb', 'Adjacent corner swap', "R2 F R U R U' R' F' R U2 R' U2 R"],
      ['Y', 'Diagonal corner swap', "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
      ['V', 'Diagonal corner swap', "R' U R' U' y R' F' R2 U' R' U R' F R F"],
      ['Na', 'Diagonal corner swap', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
      ['Nb', 'Diagonal corner swap', "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
      ['Ga', 'G perms', "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
      ['Gb', 'G perms', "R' U' R U D' R2 U R' U R U' R U' R2 D"],
      ['Gc', 'G perms', "R2 U' R U' R U R' U R2 U D' R U' R' D"],
      ['Gd', 'G perms', "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
    ],
    NICK: {},
    INTRO_ORDER: ['T', 'Ua', 'Ub', 'Aa', 'Ab', 'H', 'Z', 'Jb', 'Ja', 'Y', 'F', 'Ra', 'Rb', 'V', 'E', 'Na', 'Nb', 'Ga', 'Gb', 'Gc', 'Gd'],
    sortIds: (ids) => ids,
  };

  const PLL_FT_ALL = PLL_DEF.RAW.map(([, , a]) => toFaceTurns(parse(a)));

  // ---------- Scheduler constants ----------
  const MAX_LEVEL = 10;
  const INTERVALS = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => Math.max(1, Math.round(Math.pow(1.9, i))));
  // Minimum time since a case was last seen before a correct answer raises its level from L to L+1.
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const GAP_MS = [0, 0, 10 * MIN, 8 * HOUR, 1 * DAY, 2 * DAY, 4 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY];
  const bucketOf = (lvl) => (lvl <= 0 ? 0 : lvl <= 2 ? 1 : lvl <= 4 ? 2 : lvl <= 6 ? 3 : 4);
  const BUCKETS = ['New', 'Learning', 'Familiar', 'Solid', 'Mastered'];
  const successRate = (cs) => (cs.n ? cs.ok / cs.n : 0);
  function lastMissRep(cs) {
    if (cs.lastMiss >= 0) return cs.lastMiss;
    const i = cs.hist.lastIndexOf('0');
    return i < 0 ? -1 : cs.last - (cs.hist.length - 1 - i) * 3;
  }

  function makeSet(def) {
    const isPLL = def.kind === 'pll';
    const CASES = {};
    for (let [rawId, group, alg] of def.RAW) {
      const id = String(rawId);
      let moves = parse(alg);
      let ft = toFaceTurns(moves);
      if (isPLL) {
        // Add the closing U turn so the algorithm finishes with the cube solved, and the diagram's
        // arrows show the real permutation rather than one shifted by an AUF.
        let bestK = 0, bestN = Infinity;
        for (let k = 0; k < 4; k++) {
          const st = applyMoves(solvedCube(), invert(simplify(ft.concat(k ? [{ f: 'U', a: k }] : []))));
          const n = pllArrows(st).length;
          if (n < bestN) { bestN = n; bestK = k; }
        }
        if (bestK) {
          const tail = { f: 'U', a: bestK };
          const last = moves[moves.length - 1];
          if (last && last.f === 'U') { alg = alg.replace(/\s*U(2|')?\s*$/, ''); const a2 = (last.a + bestK) % 4; if (a2) alg += ' ' + fmt([{ f: 'U', a: a2 }]); }
          else alg += ' ' + fmt([tail]);
          moves = parse(alg);
          ft = toFaceTurns(moves);
        }
      }
      const st = applyMoves(solvedCube(), invert(ft));
      CASES[id] = {
        id, group, alg, nick: def.NICK[rawId] || '', moves, ft,
        pattern: topPattern(st),
        keys: isPLL ? pllKeys(st) : new Set(patKeys4(st)),
        arrows: isPLL ? pllArrows(st) : null,
        sides: isPLL ? sideColors(st) : null,
      };
    }
    const CASE_IDS = def.sortIds(def.RAW.map((r) => String(r[0])));
    const INTRO_ORDER = def.INTRO_ORDER.map(String);
    const caseKeyOf = (st) => (isPLL ? llSideKey(st) : patKey(topPattern(st)));

    // Check a user-supplied algorithm. Returns {ok, auf} (U turn needed first) or {ok:false, error}.
    function checkAlg(caseId, alg) {
      let mv;
      try { mv = parse(alg); } catch (e) { return { ok: false, error: e.message }; }
      if (!mv.length) return { ok: false, error: 'Type an algorithm first.' };
      const c = CASES[caseId];
      const ft = toFaceTurns(mv);
      for (let auf = 0; auf < 4; auf++) {
        const st = applyMoves(solvedCube(), invert(c.ft));
        if (auf) applyMove(st, { f: 'U', a: auf });
        applyMoves(st, ft);
        if (!isPLL) { if (f2lIntact(st) && llOriented(st)) return { ok: true, auf }; continue; }
        for (let post = 0; post < 4; post++) {
          if (solvedFixed(st)) return { ok: true, auf };
          applyMove(st, { f: 'U', a: 1 });
        }
      }
      return { ok: false, error: isPLL ? 'That algorithm does not solve this case (or it breaks the rest of the cube).'
        : 'That algorithm does not solve this case (or it breaks the first two layers).' };
    }

    // Diagram data for a custom algorithm: the case as seen from the angle the algorithm expects.
    // Leading y rotations (and the older "(U)" prefix) are dropped from the displayed algorithm.
    function stripLead(alg) {
      let s = String(alg).trim(), m;
      while ((m = /^(\(\s*U['2]?\s*\)|y['2]?)(\s+|$)/.exec(s))) s = s.slice(m[0].length);
      return s;
    }
    function viewFor(alg) {
      const shown = stripLead(alg);
      const ft = toFaceTurns(parse(shown));
      let st = applyMoves(solvedCube(), invert(ft));
      if (isPLL) {
        let best = null;
        for (let k = 0; k < 4; k++) {
          const s2 = applyMoves(solvedCube(), invert(simplify(ft.concat(k ? [{ f: 'U', a: k }] : []))));
          const n = pllArrows(s2).length;
          if (!best || n < best.n) best = { n, s2 };
        }
        st = best.s2;
      }
      return { alg: shown, pattern: topPattern(st), arrows: isPLL ? pllArrows(st) : null, sides: isPLL ? sideColors(st) : null };
    }

    // How to get from a start position to solved with an algorithm: the U turn needed before it
    // and (PLL) after it. Returns null if the algorithm cannot solve that position.
    function solvePath(startSeq, alg) {
      const mv = parse(alg), ft = toFaceTurns(mv);
      for (let pre = 0; pre < 4; pre++) {
        const st = applyMoves(solvedCube(), startSeq);
        if (pre) applyMove(st, { f: 'U', a: pre });
        applyMoves(st, ft);
        if (!isPLL) { if (f2lIntact(st) && llOriented(st)) return { pre, post: 0, moves: mv }; continue; }
        for (let post = 0; post < 4; post++) {
          if (solvedFixed(st)) return { pre, post, moves: mv };
          applyMove(st, { f: 'U', a: 1 });
        }
      }
      return null;
    }

    function matches(caseId, seq) {
      const st = applyMoves(solvedCube(), seq);
      return f2lIntact(st) && (!isPLL || llOriented(st)) && CASES[caseId].keys.has(caseKeyOf(st));
    }

    function makeScramble(caseId, rng, opts) {
      const c = CASES[caseId];
      const auf = () => ({ f: 'U', a: Math.floor(rng() * 4) });
      const disguise = opts && opts.randomPLL;
      if (isPLL) {
        if (disguise) {
          // Combine two other PLLs and keep only combinations that land on this case.
          let best = null, hits = 0;
          const others = PLL_FT_ALL.filter((ft, i) => String(PLL_DEF.RAW[i][0]) !== caseId);
          for (let t = 0; t < 600 && hits < 6; t++) {
            const p1 = others[Math.floor(rng() * others.length)], p2 = others[Math.floor(rng() * others.length)];
            const seq = simplify([auf()].concat(invert(p1), [auf()], invert(p2), [auf()]));
            while (seq.length && seq[0].f === 'U') seq.shift();
            if (!matches(caseId, seq)) continue;
            hits++;
            if (!best || seq.length < best.length) best = seq;
          }
          if (best) return best;
        }
        const seq = simplify(invert(c.ft).concat([auf()]));
        return matches(caseId, seq) ? seq : simplify(invert(c.ft));
      }
      const one = () => {
        let parts = [];
        if (disguise) { parts = parts.concat(invert(PLL_FT_ALL[Math.floor(rng() * PLL_FT_ALL.length)])); parts.push(auf()); }
        parts = parts.concat(invert(c.ft));
        parts.push(auf());
        const seq = simplify(parts);
        return matches(caseId, seq) ? seq : simplify(invert(c.ft));
      };
      if (!disguise) return one();
      let best = null;
      for (let i = 0; i < 8; i++) { const s = one(); if (!best || s.length < best.length) best = s; }
      return best;
    }

    function freshState() {
      const cases = {};
      for (const id of CASE_IDS) cases[id] = { active: false, level: 0, n: 0, ok: 0, last: -1, lastTs: 0, hist: '', removed: false, lastMiss: -1 };
      return {
        v: 1, rep: 0, cases, custom: {}, setupDone: false, lastCase: null, prevCase: null,
        settings: { autoIntro: true, introLevel: 3, randomPLL: true, showFirst: false, pool: 3 },
        updatedAt: 0,
      };
    }
    function normalize(s) {
      const f = freshState();
      if (!s || typeof s !== 'object') return f;
      const out = { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}) }, custom: { ...(s.custom || {}) }, cases: {} };
      for (const id of CASE_IDS) out.cases[id] = { ...f.cases[id], ...((s.cases || {})[id] || {}) };
      out.lastCase = out.lastCase == null ? null : String(out.lastCase);
      out.prevCase = out.prevCase == null ? null : String(out.prevCase);
      return out;
    }
    // How due a case is (1 = due). Levels 0-1 are learned within a session and count attempts;
    // from level 2 on, only time since the case was last seen counts.
    function dueRatio(cs, rep, now) {
      if (cs.level < 2) return Math.max(0, rep - cs.last) / INTERVALS[cs.level];
      const gap = cs.lastTs ? Math.max(0, now - cs.lastTs) : GAP_MS[cs.level];
      return gap / GAP_MS[Math.min(cs.level, MAX_LEVEL)];
    }
    function weightOf(cs, rep, now) {
      if (cs.n === 0 && cs.last < 0) return 50; // never practised: show soon
      const ratio = Math.min(Math.max(dueRatio(cs, rep, now), 0.02), 4);
      return ratio * ratio * extraFactor(cs);
    }
    // Among cases equally due: favour a weaker recent record and cases with little practice.
    // Success rate uses the last 20 results, smoothed toward 90% so one early miss does not dominate.
    function extraFactor(cs) {
      const h = cs.hist || '';
      const ok = h.split('').filter((x) => x === '1').length;
      const rate = (ok + 1.8) / (h.length + 2);
      const success = 1 + (1 - rate);                 // 60% -> 1.4x, 100% -> ~1x
      const few = 1 + 0.5 * Math.exp(-cs.n / 8);      // 4 attempts -> 1.3x, 20 -> 1.04x
      return success * few;
    }
    const activeIds = (s) => CASE_IDS.filter((id) => s.cases[id].active);
    function pickNext(s, rng, now) {
      const act = activeIds(s);
      if (!act.length) return null;
      let pool = act;
      const recent = [s.lastCase, act.length >= 5 ? s.prevCase : null].filter((x) => x != null);
      if (act.length > 1) pool = act.filter((id) => !recent.includes(id));
      if (!pool.length) pool = act;
      const w = pool.map((id) => weightOf(s.cases[id], s.rep, now));
      const tot = w.reduce((a, b) => a + b, 0);
      let r = rng() * tot;
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    function nextToIntroduce(s) {
      const cand = INTRO_ORDER.filter((id) => !s.cases[id].active);
      return cand.find((id) => !s.cases[id].removed) ?? cand[0] ?? null;
    }
    const blockers = (s) => activeIds(s).filter((id) => s.cases[id].level < s.settings.introLevel);
    // Keep a small pool of cases in learning: add one when fewer than `pool` are below the threshold.
    function shouldIntroduce(s) {
      if (!s.settings.autoIntro || nextToIntroduce(s) == null) return false;
      return blockers(s).length < Math.max(1, s.settings.pool || 1);
    }
    function introduce(s, id, level = 0) {
      const cs = s.cases[id];
      cs.active = true; cs.removed = false;
      cs.level = Math.max(cs.level, level);
      if (cs.n === 0) cs.last = -1;
      return id;
    }
    function grade(s, id, ok, now) {
      const cs = s.cases[id];
      cs.n += 1;
      // A correct answer only raises the level once enough time has passed since the case was
      // last seen, so levels reflect long-term memory rather than a case still fresh in mind.
      const gap = cs.lastTs ? now - cs.lastTs : Infinity;
      if (ok) { cs.ok += 1; if (gap >= GAP_MS[cs.level]) cs.level = Math.min(MAX_LEVEL, cs.level + 1); }
      else cs.level = Math.max(0, Math.min(cs.level - 2, Math.floor(cs.level / 2)));
      cs.hist = (cs.hist + (ok ? '1' : '0')).slice(-20);
      s.rep += 1;
      cs.last = s.rep;
      cs.lastTs = now;
      if (!ok) cs.lastMiss = s.rep;
      s.prevCase = s.lastCase;
      s.lastCase = id;
      return cs.level;
    }
    const orderIdx = Object.fromEntries(CASE_IDS.map((id, i) => [id, i]));
    function sortWeakest(s, ids) {
      return ids.slice().sort((a, b) => {
        const A = s.cases[a], B = s.cases[b];
        if (A.active !== B.active) return A.active ? -1 : 1;
        if (!A.active) return orderIdx[a] - orderIdx[b];
        return A.level - B.level || successRate(A) - successRate(B) || lastMissRep(B) - lastMissRep(A) || orderIdx[a] - orderIdx[b];
      });
    }
    function sortRecentMisses(s, ids) {
      return ids.slice().sort((a, b) => {
        const ma = lastMissRep(s.cases[a]), mb = lastMissRep(s.cases[b]);
        if ((ma >= 0) !== (mb >= 0)) return ma >= 0 ? -1 : 1;
        if (ma >= 0) return mb - ma || orderIdx[a] - orderIdx[b];
        return 0;
      });
    }
    return {
      name: def.name, kind: def.kind, stripCols: def.stripCols, first: def.first, label: def.label,
      GROUPS: def.GROUPS, CASES, CASE_IDS, INTRO_ORDER, checkAlg, makeScramble, matches, viewFor, stripLead, solvePath,
      MAX_LEVEL, INTERVALS, BUCKETS, bucketOf, lastMissRep, sortWeakest, sortRecentMisses,
      GAP_MS, dueRatio, nextLevelAt: (cs) => (cs.lastTs ? cs.lastTs + GAP_MS[cs.level] : 0),
      freshState, normalize, weightOf, extraFactor, activeIds, pickNext, nextToIntroduce, blockers, shouldIntroduce, introduce, grade,
    };
  }

  const sets = { OLL: makeSet(OLL_DEF), PLL: makeSet(PLL_DEF) };

  return {
    solvedCube, applyMove, applyMoves, parse, fmt, invert, toFaceTurns, simplify,
    f2lIntact, llOriented, solvedUpToRotation, solvedFixed, topPattern, patKey, llSideKey, pllKeys,
    PLL_FT_ALL, sets, MOVE_DEF,
  };
})();
if (typeof module !== 'undefined') module.exports = CubeCore;
