// 3D viewer: plays an algorithm on a cube, slowly. three.js (served by the app) loads on first use.
import * as K from '../core/index.js';
import { S } from './state.js';
import { esc, prefersReducedMotion } from './util.js';
import { algFor, label } from './diagrams.js';
import { onAction } from './actions.js';
import { modalOpened, modalClosed } from './modal.js';

let threePromise = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threePromise) {
    threePromise = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/three.min.js'; sc.async = true;
      sc.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('three')));
      sc.onerror = () => { threePromise = null; rej(new Error('load')); };
      document.head.appendChild(sc);
    });
  }
  return threePromise;
}
const HEX = { U: 0xf3c300, D: 0xf4f4f4, F: 0x2f9e4f, B: 0x2b67d1, R: 0xd8392b, L: 0xf08519 };
const SPEEDS = { 0.5: 1400, 1: 800, 2: 400 };
let V = null; // open viewer
function savedSpeed() { try { const v = Number(sessionStorage.getItem('v-speed')); return SPEEDS[v] ? v : 1; } catch (e) { return 1; } }

// seq: [{f,a,tag}] moves to play; start: face-turn sequence that sets up the cube.
function openViewer({ title, sub, start, seq }) {
  closeViewer(true);
  V = { title, sub, start, seq, i: 0, playing: false, busy: false, speed: savedSpeed() };
  const box = document.getElementById('viewer');
  box.innerHTML = `<div class="overlay" data-action="v-close-bg"><div class="dialog viewer" role="dialog" aria-modal="true" aria-labelledby="v-title" aria-describedby="v-help">
    <button type="button" class="x" data-action="v-close" aria-label="Close">×</button>
    <div><h2 id="v-title" class="v-title">${esc(title)}</h2><p class="muted" style="margin:2px 0 0;font-size:13px">${esc(sub)}</p></div>
    <div class="v-stage" id="v-stage"><p class="muted v-msg">Loading the 3D cube…</p></div>
    <ol class="v-moves" id="v-moves" aria-label="Moves">${seq.map((m, k) => `<li data-k="${k}" class="${m.tag ? 'auf' : ''}" title="${m.tag ? esc(m.tag) : ''}">${esc(K.fmt([m]))}${m.tag ? `<span class="sr-only"> (${esc(m.tag)})</span>` : ''}</li>`).join('')}</ol>
    <p class="sr-only" id="v-pos" aria-live="polite"></p>
    <div class="v-ctrl">
      <button type="button" class="btn small" data-action="v-restart" aria-label="Back to start" title="Back to start">⏮</button>
      <button type="button" class="btn small" data-action="v-back" aria-label="Previous move" title="Previous move (←)">◀</button>
      <button type="button" class="btn primary v-play" data-action="v-play" id="v-play">Play <kbd>Space</kbd></button>
      <button type="button" class="btn small" data-action="v-next" aria-label="Next move" title="Next move (→)">▶</button>
      <label class="v-speed" for="v-speed">Speed <select id="v-speed" data-vspeed="1">
        ${[0.5, 1, 2].map((s) => `<option value="${s}" ${V.speed === s ? 'selected' : ''}>${s}×</option>`).join('')}</select></label>
    </div>
    <p class="muted" style="margin:0;font-size:12px" id="v-help">Drag the cube to look around. Yellow on top, green in front, like the scramble. Keys: Space plays or pauses, arrows step through the moves.</p>
  </div></div>`;
  modalOpened('viewer');
  box.querySelector('[data-action="v-play"]').focus();
  loadThree().then(() => { if (V) buildScene(); }).catch(() => {
    const st = document.getElementById('v-stage');
    if (st) st.innerHTML = '<p class="muted v-msg">The 3D viewer could not load. Check your connection and try again.</p>';
  });
}

function buildScene() {
  const THREE = window.THREE, stage = document.getElementById('v-stage');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { stage.innerHTML = '<p class="muted v-msg">3D is not available in this browser.</p>'; return; }
  stage.innerHTML = '';
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(4.4, 5.4, 7.6); camera.lookAt(0, 0, 0);
  const root = new THREE.Group(); scene.add(root);
  root.rotation.x = 0.12; root.rotation.y = -0.2;
  const pivot = new THREE.Group(); root.add(pivot);
  const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x111317 });
  const bodies = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const m = new THREE.Mesh(bodyGeo, bodyMat); m.position.set(x, y, z); m.userData.p = [x, y, z];
    root.add(m); bodies.push(m);
  }
  // Rounded sticker shape.
  const sh = new THREE.Shape(), s = 0.42, r = 0.1;
  sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r);
  sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r);
  sh.quadraticCurveTo(-s, -s, -s + r, -s);
  const stGeo = new THREE.ShapeGeometry(sh);
  const mats = {};
  for (const k in HEX) mats[k] = new THREE.MeshBasicMaterial({ color: HEX[k], side: THREE.DoubleSide });
  const Z = new THREE.Vector3(0, 0, 1);
  let cube, stickers;
  function place(mesh, st) {
    mesh.position.set(st.p[0] + st.n[0] * 0.49, st.p[1] + st.n[1] * 0.49, st.p[2] + st.n[2] * 0.49);
    mesh.quaternion.setFromUnitVectors(Z, new THREE.Vector3(st.n[0], st.n[1], st.n[2]));
  }
  function reset(toIndex) {
    if (stickers) stickers.forEach((m) => root.remove(m));
    cube = K.applyMoves(K.solvedCube(), V.start);
    for (let k = 0; k < toIndex; k++) K.applyMove(cube, V.seq[k]);
    stickers = cube.map((st) => { const m = new THREE.Mesh(stGeo, mats[st.c]); m.userData.st = st; place(m, st); root.add(m); return m; });
  }
  reset(0);
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  // Drag to orbit.
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx: root.rotation.x, ry: root.rotation.y }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    root.rotation.y = drag.ry + (e.clientX - drag.x) * 0.01;
    root.rotation.x = Math.max(-1.2, Math.min(1.3, drag.rx + (e.clientY - drag.y) * 0.01));
  });
  renderer.domElement.addEventListener('pointerup', () => { drag = null; });
  const AX = ['x', 'y', 'z'];
  let anim = null;
  // Animate one move (forward or inverse) then commit it to the sticker state.
  function turn(mv, dir, done) {
    const [axis, sel, q1] = K.MOVE_DEF[mv.f];
    let q = (q1 * mv.a) % 4; if (dir < 0) q = (4 - q) % 4;
    const angle = q === 1 ? Math.PI / 2 : q === 3 ? -Math.PI / 2 : Math.PI;
    const parts = stickers.filter((m) => sel(m.userData.st.p[axis])).concat(bodies.filter((b) => sel(b.userData.p[axis])));
    parts.forEach((m) => pivot.attach(m));
    const dur = SPEEDS[V.speed] * (q === 2 ? 1.4 : 1);
    anim = { t0: performance.now(), dur, axis: AX[axis], angle, parts, done: () => {
      parts.forEach((m) => root.attach(m));
      pivot.rotation.set(0, 0, 0);
      K.applyMove(cube, { f: mv.f, a: dir < 0 ? (4 - mv.a) % 4 : mv.a });
      stickers.forEach((m) => place(m, m.userData.st));
      bodies.forEach((b) => { b.position.set(...b.userData.p); b.rotation.set(0, 0, 0); });
      anim = null; done();
    } };
  }
  function frame(now) {
    if (!V || V.scene !== api) return;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pivot.rotation.set(0, 0, 0); pivot.rotation[anim.axis] = anim.angle * e;
      if (t >= 1) anim.done();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  const api = {
    step(dir, after) {
      if (anim) return;
      if (dir > 0 && V.i >= V.seq.length) return;
      if (dir < 0 && V.i <= 0) return;
      const mv = dir > 0 ? V.seq[V.i] : V.seq[V.i - 1];
      V.i += dir; markMove();
      turn(mv, dir, () => after && after());
    },
    jump(i) { anim = null; stickers.forEach((m) => root.attach(m)); pivot.rotation.set(0, 0, 0); bodies.forEach((b) => { root.attach(b); b.position.set(...b.userData.p); b.rotation.set(0, 0, 0); }); V.i = i; reset(i); markMove(); },
    resize,
    dispose() { renderer.dispose(); },
    busy: () => !!anim,
  };
  V.scene = api;
  window.addEventListener('resize', resize);
  V.unbind = () => window.removeEventListener('resize', resize);
  requestAnimationFrame(frame);
  markMove();
  // Starts playing on its own, unless the system asks for reduced motion.
  if (!prefersReducedMotion()) setTimeout(() => vPlay(true), 500);
}

function markMove() {
  document.querySelectorAll('#v-moves li').forEach((el) => {
    const k = Number(el.dataset.k);
    el.classList.toggle('done', k < V.i); el.classList.toggle('now', k === V.i);
  });
  const b = document.getElementById('v-play');
  if (b) b.innerHTML = (V.i >= V.seq.length ? 'Replay' : V.playing ? 'Pause' : 'Play') + ' <kbd aria-hidden="true">Space</kbd>';
  const pos = document.getElementById('v-pos');
  if (pos && !V.playing) pos.textContent = V.i >= V.seq.length ? 'End of the algorithm.' : `Move ${V.i + 1} of ${V.seq.length}: ${K.fmt([V.seq[V.i]])}`;
}
function vLoop() {
  if (!V || !V.playing || !V.scene) return;
  if (V.i >= V.seq.length) { V.playing = false; markMove(); return; }
  V.scene.step(1, () => setTimeout(vLoop, SPEEDS[V.speed] * 0.35));
}
function vPlay(on) {
  if (!V || !V.scene) return;
  if (on && V.i >= V.seq.length) { V.scene.jump(0); setTimeout(() => vPlay(true), 400); return; }
  V.playing = on; markMove();
  if (on && !V.scene.busy()) vLoop();
}
function vStep(dir) { if (!V || !V.scene) return; V.playing = false; V.scene.step(dir); markMove(); }
export function closeViewer(replacing) {
  if (!V) return;
  if (V.scene) V.scene.dispose();
  if (V.unbind) V.unbind();
  V = null;
  const box = document.getElementById('viewer'); if (box) box.innerHTML = '';
  if (!replacing) modalClosed('viewer', () => document.getElementById('view-title'));
}

const tagMoves = (n, tag) => (n ? [{ f: 'U', a: n, tag }] : []);
// From the cube in your hands: the scramble of the current attempt.
export function watchCurrent() {
  const { C, state, current } = S;
  if (!current) return;
  const id = current.id, alg = state.custom[id] || C.CASES[id].alg;
  const start = K.parse(current.scramble);
  const p = C.solvePath(start, alg);
  if (!p) return;
  openViewer({
    title: `${label(id)}: from your scramble`, sub: p.pre ? 'Grey moves are U turns to line the case up (before) or to finish (after).' : (p.post ? 'The grey move at the end lines up the top layer.' : 'Starting from the position the scramble gives.'),
    start, seq: tagMoves(p.pre, 'Line up the case').concat(p.moves, tagMoves(p.post, 'Finish: align the top layer')),
  });
}
// From the case as drawn in its diagram.
function watchCase(id) {
  const { C } = S;
  const shown = algFor(id);
  const ft = K.toFaceTurns(K.parse(shown));
  let start = K.invert(ft);
  const p = C.solvePath(start, shown);
  openViewer({
    title: `${label(id)}`, sub: 'Starting from the case as shown in its diagram.',
    start, seq: p ? tagMoves(p.pre, 'Line up the case').concat(p.moves, tagMoves(p.post, 'Finish: align the top layer')) : K.parse(shown),
  });
}


export const viewerOpen = () => !!V;

// Keys while the viewer is open. Returns true when the key was used.
export function viewerKey(e) {
  if (!V) return false;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === ' ' && !(e.target.closest && e.target.closest('button, select'))) { e.preventDefault(); vPlay(!V.playing); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); vStep(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); vStep(-1); }
  return true;
}

export function viewerSpeed(el) {
  if (!V) return;
  V.speed = Number(el.value);
  try { sessionStorage.setItem('v-speed', el.value); } catch (er) { /* ignore */ }
}

onAction({
  'watch-current': () => watchCurrent(),
  'watch-case': (el) => watchCase(el.dataset.id),
  'v-close': () => closeViewer(),
  'v-close-bg': (el, e) => { if (e.target === el) closeViewer(); },
  'v-play': () => vPlay(!(V && V.playing)),
  'v-next': () => vStep(1),
  'v-back': () => vStep(-1),
  'v-restart': () => { if (V && V.scene) { V.playing = false; V.scene.jump(0); } },
});
