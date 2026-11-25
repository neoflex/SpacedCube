// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// A case set (OLL or PLL) built from its definition: derived case data, scrambles, checks and scheduling.
import { solvedCube, applyMove, applyMoves } from './cube.js';
import { parse, fmt, invert, toFaceTurns, simplify } from './notation.js';
import { f2lIntact, llOriented, solvedFixed, topPattern, patKey, patKeys4, llSideKey, pllKeys, pllArrows, sideColors } from './inspect.js';
import { MAX_LEVEL, MASTERED, INTERVALS, GAP_MS, bucketOf, BUCKETS, successRate, lastMissRep } from './scheduler.js';
import { speedOf, addTime } from './speed.js';
import { PLL_DEF } from './cases-pll.js';
import { SCHEMA_VERSION, migrate } from './schema.js';

// Face turns of every PLL, used to disguise scrambles.
export const PLL_FT_ALL = PLL_DEF.RAW.map(([, , a]) => toFaceTurns(parse(a)));

export function makeSet(def) {
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
    for (const id of CASE_IDS) cases[id] = { active: false, level: 0, n: 0, ok: 0, last: -1, lastTs: 0, hist: '', removed: false, lastMiss: -1, times: [] };
    return {
      v: SCHEMA_VERSION, rep: 0, cases, custom: {}, setupDone: false, lastCase: null, prevCase: null, speedOpen: false,
      settings: { autoIntro: true, introLevel: 5, randomPLL: true, showFirst: false, pool: 3, mode: 'memory' },
      updatedAt: 0,
    };
  }
  // Any saved state (old, partial, from a backup code) to a complete current one.
  // Throws NewerStateError for a state written by a newer version of the app.
  function normalize(raw) {
    const f = freshState();
    if (!raw || typeof raw !== 'object') return f;
    const s = migrate(raw);
    const out = { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}) }, custom: { ...(s.custom || {}) }, cases: {} };
    for (const id of CASE_IDS) {
      const cs = out.cases[id] = { ...f.cases[id], ...((s.cases || {})[id] || {}) };
      cs.times = Array.isArray(cs.times) ? cs.times.filter((t) => Array.isArray(t) && t[0] > 0 && t[1] > 0) : [];
    }
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
  // Cases to practise now: never tried, or due by their gap (levels 0-1: by attempts).
  const isDue = (s, id, now) => { const cs = s.cases[id]; return (cs.n === 0 && cs.last < 0) || dueRatio(cs, s.rep, now) >= 1; };
  const dueIds = (s, now) => activeIds(s).filter((id) => isDue(s, id, now));
  // When the next case that is not due yet becomes due (only time-based levels count), or null.
  function nextDueAt(s, now) {
    let t = Infinity;
    for (const id of activeIds(s)) {
      const cs = s.cases[id];
      if (cs.level < 2 || !cs.lastTs || isDue(s, id, now)) continue;
      t = Math.min(t, cs.lastTs + GAP_MS[Math.min(cs.level, MAX_LEVEL)]);
    }
    return t === Infinity ? null : t;
  }
  function pickNext(s, rng, now) {
    const act = activeIds(s);
    if (!act.length) return null;
    let pool = act;
    const recent = [s.lastCase, act.length >= 5 ? s.prevCase : null].filter((x) => x != null);
    if (act.length > 1) pool = act.filter((id) => !recent.includes(id));
    if (!pool.length) pool = act;
    // While anything is due, only due cases come up: a case that is not due yet would restart its
    // gap without moving up. With 45 cases and one due, the weights alone picked it 8% of the time.
    const due = pool.filter((id) => isDue(s, id, now));
    if (due.length) pool = due;
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
  // ---------- Speed practice ----------
  // Opens for a set once every case is Mastered, and stays open. Only Mastered cases are timed;
  // a case that drops below goes back to memory practice until it is Mastered again.
  const isMastered = (s, id) => s.cases[id].active && s.cases[id].level >= MASTERED;
  const masteredCount = (s) => CASE_IDS.filter((id) => isMastered(s, id)).length;
  const speedReady = (s) => !!s.speedOpen || masteredCount(s) === CASE_IDS.length;
  // Call after every grade: true when Speed has just opened.
  function openSpeedIfReady(s) {
    if (s.speedOpen || masteredCount(s) < CASE_IDS.length) return false;
    s.speedOpen = true;
    return true;
  }
  const speedIds = (s) => CASE_IDS.filter((id) => isMastered(s, id));
  // Memory reviews first: a due case comes up as a timed solve and counts for both. Otherwise a
  // Mastered case, slower ones more often (weight 1/tps^2; untimed cases as if at 2 turns per second).
  function pickSpeed(s, rng, now) {
    const recent = [s.lastCase, s.prevCase].filter((x) => x != null);
    const fresh = (ids) => (ids.length > 1 ? ids.filter((id) => !recent.includes(id)) : ids);
    const due = fresh(dueIds(s, now));
    if (due.length) return weighted(due, (id) => weightOf(s.cases[id], s.rep, now), rng);
    let pool = fresh(speedIds(s));
    if (!pool.length) pool = speedIds(s);
    if (!pool.length) return pickNext(s, rng, now);
    return weighted(pool, (id) => { const sp = speedOf(s.cases[id]); const tps = sp ? Math.max(0.5, sp.tps) : 2; return 1 / (tps * tps); }, rng);
  }
  function weighted(ids, wOf, rng) {
    const w = ids.map(wOf);
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  // A Speed attempt. The memory level only changes when the case was due (a review) or missed;
  // a correct solve of a case that is not due leaves it alone, so speed work does not delay the
  // next memory review. A correct solve without help adds its time (ms > 0).
  function gradeSpeed(s, id, ok, ms, turns, now) {
    const review = !ok || isDue(s, id, now);
    let level = s.cases[id].level;
    if (review) level = grade(s, id, ok, now);
    else { s.prevCase = s.lastCase; s.lastCase = id; }
    if (ok && ms > 0 && turns > 0) addTime(s.cases[id], ms, turns);
    return { level, review };
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
    freshState, normalize, weightOf, extraFactor, activeIds, dueIds, isDue,
    MASTERED, isMastered, masteredCount, speedReady, openSpeedIfReady, speedIds, pickSpeed, gradeSpeed, nextDueAt, pickNext, nextToIntroduce, blockers, shouldIntroduce, introduce, grade,
  };
}
