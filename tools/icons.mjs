// Draws the app icons (the header's cube mark) as PNGs, with Node's standard library only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BODY = [0x1b, 0x1f, 0x27], ON = [0xf3, 0xc3, 0x00], OFF = [0xc3, 0xc8, 0xd0];
const PATTERN = '010111010'; // yellow cross, as in the header mark

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Anti-aliased rounded rectangle (coverage from the signed distance), composited over px.
function rrect(px, size, x0, y0, w, h, r, rgb) {
  const cx = x0 + w / 2, cy = y0 + h / 2, hx = w / 2 - r, hy = h / 2 - r;
  for (let y = Math.max(0, Math.floor(y0) - 1); y < Math.min(size, Math.floor(y0 + h) + 2); y++) {
    const qy = Math.abs(y + 0.5 - cy) - hy;
    for (let x = Math.max(0, Math.floor(x0) - 1); x < Math.min(size, Math.floor(x0 + w) + 2); x++) {
      const qx = Math.abs(x + 0.5 - cx) - hx;
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const a = Math.min(Math.max(0.5 - sd, 0), 1);
      if (a <= 0) continue;
      const i = (y * size + x) * 4, ba = px[i + 3] / 255, oa = a + ba * (1 - a);
      for (let k = 0; k < 3; k++) px[i + k] = Math.round((rgb[k] * a + px[i + k] * ba * (1 - a)) / oa);
      px[i + 3] = Math.round(oa * 255);
    }
  }
}

// fullBleed: square background (maskable / Apple). inset: fraction of the size kept free around the stickers.
export function icon(size, fullBleed = false, inset = 0) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 30;
  if (fullBleed) rrect(px, size, 0, 0, size, size, 0.001, BODY);
  else rrect(px, size, 1 * s, 1 * s, 28 * s, 28 * s, 6 * s, BODY);
  const area = inset ? size * (1 - 2 * inset) : 22 * s;
  const o = inset ? size * inset : 4 * s;
  const cell = (area * 6.5) / 22, gap = (area * 1.25) / 22;
  [...PATTERN].forEach((c, i) => {
    const x = o + (i % 3) * (cell + gap), y = o + Math.floor(i / 3) * (cell + gap);
    rrect(px, size, x, y, cell, cell, (cell * 1.5) / 6.5, c === '1' ? ON : OFF);
  });
  return png(size, px);
}

export function writeAll(out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon-192.png'), icon(192));
  writeFileSync(join(out, 'icon-512.png'), icon(512));
  writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, true, 0.22));
  writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, true, 0.16));
}
