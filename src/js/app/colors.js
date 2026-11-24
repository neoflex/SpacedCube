// Sticker colours, shared by the 2D diagrams and the 3D viewer.
// Chosen to keep yellow, orange and red clearly apart (also for common colour-vision deficiencies):
// a lemon yellow, a bright orange and a deep red, close to the colours real cubes use.
// The yellow also lives in CSS (--sticker-on, base.css) for the OLL diagrams and the logo: keep both equal.
export const FACE_HEX = {
  U: '#fff000', // yellow (top): lemon, well away from orange
  D: '#f5f5f5', // white
  F: '#2f9e4f', // green (front)
  B: '#2b67d1', // blue
  R: '#b71234', // red
  L: '#ff8000', // orange: lighter, halfway between the yellow and the red
};
export const FACE_NAMES = { F: 'green', R: 'red', B: 'blue', L: 'orange', U: 'yellow', D: 'white' };
// The same colours as numbers, for three.js.
export const FACE_INT = Object.fromEntries(Object.entries(FACE_HEX).map(([k, v]) => [k, parseInt(v.slice(1), 16)]));
