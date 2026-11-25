// Confetti over the whole screen when a case moves up a level: a canvas that ignores the pointer,
// hidden from assistive technology (the level up is announced in words), gone after about 2 s.
// Nothing when the system asks for reduced motion or the device setting is off.
import { S } from './state.js';
import { prefersReducedMotion } from './util.js';
import { FACE_HEX } from './colors.js';

const COLORS = Object.values(FACE_HEX);
let running = null;

/** @param {number} [amount] 1 for a level up, more for a new stage (Familiar, Solid, Mastered) */
export function confetti(amount = 1) {
  if (!S.celebrate || prefersReducedMotion() || typeof document === 'undefined') return;
  if (running) running.remove();
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  running = cv;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  if (!g) { cv.remove(); running = null; return; }
  g.scale(dpr, dpr);
  // Two bursts from the lower corners, aimed up and inwards.
  const n = Math.round(90 * amount);
  const bits = Array.from({ length: n }, (_, i) => {
    const left = i % 2 === 0, a = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const v = (0.9 + Math.random() * 0.7) * Math.max(H, 500) / 38;
    return {
      x: left ? W * 0.05 : W * 0.95, y: H * 0.95, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[i % COLORS.length],
    };
  });
  const t0 = performance.now(), LIFE = 2200;
  const frame = (t) => {
    if (running !== cv) return;
    const age = t - t0;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, Math.max(0, (LIFE - age) / 500));
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.99; b.vy *= 0.99;
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 1.7)) + 1);
      g.restore();
    }
    if (age < LIFE) requestAnimationFrame(frame);
    else { cv.remove(); if (running === cv) running = null; }
  };
  requestAnimationFrame(frame);
}
