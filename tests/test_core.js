const K = require('../src/core.js');
const P = K.sets.PLL, O = K.sets.OLL;
let fail = 0;
const mirror = (alg) => K.parse(alg).map(m => {
  const sw = { R: 'L', L: 'R', r: 'l', l: 'r' };
  if (sw[m.f]) return { f: sw[m.f], a: (4 - m.a) % 4 };
  if (m.f === 'M' || m.f === 'x') return m;
  return { f: m.f, a: (4 - m.a) % 4 };
});
for (const id of P.CASE_IDS) {
  const c = P.CASES[id];
  const st = K.applyMoves(K.solvedCube(), c.ft);
  if (!K.f2lIntact(st) || !K.llOriented(st)) { console.log('not a PLL', id); fail++; }
  const st2 = K.applyMoves(K.solvedCube(), K.invert(c.ft)); K.applyMoves(st2, c.moves);
  if (!K.solvedUpToRotation(st2)) { console.log('translation', id); fail++; }
  for (const id2 of P.CASE_IDS) if (id2 !== id && [...c.keys].some(k => P.CASES[id2].keys.has(k))) { console.log('overlap', id, id2); fail++; }
  const corners = c.arrows.filter(a => a.from[0] !== 1 && a.from[1] !== 1).length;
  const edges = c.arrows.filter(a => a.from[0] === 1 || a.from[1] === 1).length;
  console.log(id.padEnd(3), 'arrows', c.arrows.map(a => `${a.from}${a.both ? '<>' : '>'}${a.to}`).join(' '), '| corner-arrows', corners, 'edge-arrows', edges);
}
const pairs = { Aa: 'Ab', Ja: 'Jb', Ra: 'Rb', Na: 'Nb', Ua: 'Ub', Ga: 'Gc', Gb: 'Gd', T: 'T', F: 'F', Y: 'Y', V: 'V', E: 'E', H: 'H', Z: 'Z' };
for (const [a, b] of Object.entries(pairs)) {
  const st = K.applyMoves(K.solvedCube(), K.invert(K.toFaceTurns(mirror(P.CASES[a].alg))));
  const key = K.llSideKey(st);
  const ok = P.CASES[b].keys.has(key);
  if (!ok) { console.log('mirror mismatch', a, b); fail++; }
}
let seed = 3; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const lens = {}, t0 = Date.now(); let bad = 0, plain = 0;
for (const id of P.CASE_IDS) for (let i = 0; i < 20; i++) {
  const s = P.makeScramble(id, rng, { randomPLL: true });
  if (!P.matches(id, s)) bad++;
  if (K.fmt(s) === K.fmt(K.simplify(K.invert(P.CASES[id].ft))) || s.length < 12) plain++;
  (lens[id] ||= []).push(s.length);
}
console.log('PLL disguised: bad', bad, 'fell back/plain', plain, 'ms per scramble', ((Date.now() - t0) / 420).toFixed(1));
console.log(Object.entries(lens).map(([k, v]) => k + ':' + Math.round(v.reduce((a, b) => a + b) / v.length)).join(' '));
for (const id of ['T', 'H', 'Ua']) console.log(id, K.fmt(P.makeScramble(id, rng, { randomPLL: true })), '| plain:', K.fmt(P.makeScramble(id, rng, {})));
console.log('checkAlg T', P.checkAlg('T', P.CASES.T.alg), 'T with y2 Jb?', P.checkAlg('T', "R U R' F' R U R' U' R' F R2 U' R'").ok, 'Ua alt', P.checkAlg('Ua', "M2 U M U2 M' U M2"));
let ob = 0; for (const id of O.CASE_IDS) for (let i = 0; i < 10; i++) { const s = O.makeScramble(id, rng, { randomPLL: i % 2 === 0 }); if (!O.matches(id, s)) ob++; }
console.log('OLL scramble failures', ob, 'fail', fail);
