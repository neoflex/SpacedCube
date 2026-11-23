// Every case and scramble checked in the cube simulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/js/core/index.js';

const P = K.sets.PLL, O = K.sets.OLL;
let seed = 3;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('every PLL is a PLL: F2L and top face intact, and its algorithm solves it', () => {
  for (const id of P.CASE_IDS) {
    const c = P.CASES[id];
    const st = K.applyMoves(K.solvedCube(), c.ft);
    assert.ok(K.f2lIntact(st) && K.llOriented(st), `${id} is not a PLL`);
    const back = K.applyMoves(K.solvedCube(), K.invert(c.ft));
    K.applyMoves(back, c.moves);
    assert.ok(K.solvedUpToRotation(back), `${id}: face-turn translation does not match the algorithm`);
  }
});

test('no two PLLs share a recognition key', () => {
  for (const a of P.CASE_IDS) for (const b of P.CASE_IDS) {
    if (a !== b) assert.ok(![...P.CASES[a].keys].some((k) => P.CASES[b].keys.has(k)), `${a} and ${b} overlap`);
  }
});

test('mirrored PLL algorithms land on their mirror case', () => {
  const mirror = (alg) => K.parse(alg).map((m) => {
    const sw = { R: 'L', L: 'R', r: 'l', l: 'r' };
    if (sw[m.f]) return { f: sw[m.f], a: (4 - m.a) % 4 };
    if (m.f === 'M' || m.f === 'x') return m;
    return { f: m.f, a: (4 - m.a) % 4 };
  });
  const pairs = { Aa: 'Ab', Ja: 'Jb', Ra: 'Rb', Na: 'Nb', Ua: 'Ub', Ga: 'Gc', Gb: 'Gd', T: 'T', F: 'F', Y: 'Y', V: 'V', E: 'E', H: 'H', Z: 'Z' };
  for (const [a, b] of Object.entries(pairs)) {
    const st = K.applyMoves(K.solvedCube(), K.invert(K.toFaceTurns(mirror(P.CASES[a].alg))));
    assert.ok(P.CASES[b].keys.has(K.llSideKey(st)), `mirror of ${a} is not ${b}`);
  }
});

test('disguised PLL scrambles land on their case and do not simply undo the algorithm', () => {
  for (const id of P.CASE_IDS) for (let i = 0; i < 20; i++) {
    const s = P.makeScramble(id, rng, { randomPLL: true });
    assert.ok(P.matches(id, s), `${id}: scramble ${K.fmt(s)} does not land on the case`);
    assert.notEqual(K.fmt(s), K.fmt(K.simplify(K.invert(P.CASES[id].ft))), `${id}: scramble is the plain inverse`);
  }
});

test('OLL scrambles land on their case, plain and disguised', () => {
  for (const id of O.CASE_IDS) for (let i = 0; i < 10; i++) {
    const s = O.makeScramble(id, rng, { randomPLL: i % 2 === 0 });
    assert.ok(O.matches(id, s), `OLL ${id}: scramble ${K.fmt(s)} does not land on the case`);
  }
});

test('custom algorithms are checked against the case', () => {
  assert.deepEqual(P.checkAlg('T', P.CASES.T.alg), { ok: true, auf: 0 });
  assert.equal(P.checkAlg('T', "R U R' F' R U R' U' R' F R2 U' R'").ok, false, 'a Jb does not solve a T');
  assert.equal(P.checkAlg('Ua', "M2 U M U2 M' U M2").ok, true, 'an alternative Ua algorithm');
  assert.equal(O.checkAlg('27', "R U R' U R U2 R'").ok, true, 'Sune solves OLL 27');
  assert.equal(O.checkAlg('27', "R U R'").ok, false);
  assert.equal(O.checkAlg('27', 'Q').ok, false, 'unknown notation is refused');
});
