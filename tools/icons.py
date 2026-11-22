"""Draws the app icons (the header's cube mark) as PNGs with the standard library only."""
import struct, zlib

BODY, ON, OFF = (0x1b, 0x1f, 0x27), (0xf3, 0xc3, 0x00), (0xc3, 0xc8, 0xd0)
PATTERN = '010111010'  # yellow cross, as in the header mark


def _png(size, px):
    raw = b''.join(b'\0' + bytes(px[y * size * 4:(y + 1) * size * 4]) for y in range(size))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def _rrect(px, size, x0, y0, w, h, r, rgb):
    """Anti-aliased rounded rectangle (coverage from the signed distance), composited over px."""
    cx, cy, hx, hy = x0 + w / 2, y0 + h / 2, w / 2 - r, h / 2 - r
    for y in range(max(0, int(y0) - 1), min(size, int(y0 + h) + 2)):
        qy = abs(y + 0.5 - cy) - hy
        for x in range(max(0, int(x0) - 1), min(size, int(x0 + w) + 2)):
            qx = abs(x + 0.5 - cx) - hx
            sd = (max(qx, 0) ** 2 + max(qy, 0) ** 2) ** 0.5 + min(max(qx, qy), 0) - r
            a = min(max(0.5 - sd, 0), 1)
            if a <= 0:
                continue
            i = (y * size + x) * 4
            ba = px[i + 3] / 255
            oa = a + ba * (1 - a)
            for k in range(3):
                px[i + k] = round((rgb[k] * a + px[i + k] * ba * (1 - a)) / oa)
            px[i + 3] = round(oa * 255)


def icon(size, full_bleed=False, inset=0.0):
    """full_bleed: square background (maskable / Apple). inset: fraction of the size kept free around the stickers."""
    px = bytearray(size * size * 4)
    s = size / 30
    if full_bleed:
        _rrect(px, size, 0, 0, size, size, 0.001, BODY)
    else:
        _rrect(px, size, 1 * s, 1 * s, 28 * s, 28 * s, 6 * s, BODY)
    # stickers: the 3x3 grid of the 30-unit mark, scaled into the area left by the inset
    area = size * (1 - 2 * inset) if inset else 22 * s
    o = size * inset if inset else 4 * s
    cell, gap = area * 6.5 / 22, area * 1.25 / 22
    for i, c in enumerate(PATTERN):
        x, y = o + (i % 3) * (cell + gap), o + (i // 3) * (cell + gap)
        _rrect(px, size, x, y, cell, cell, cell * 1.5 / 6.5, ON if c == '1' else OFF)
    return _png(size, px)


def write_all(out):
    out.mkdir(parents=True, exist_ok=True)
    (out / 'icon-192.png').write_bytes(icon(192))
    (out / 'icon-512.png').write_bytes(icon(512))
    (out / 'icon-maskable-512.png').write_bytes(icon(512, full_bleed=True, inset=0.22))
    (out / 'apple-touch-icon.png').write_bytes(icon(180, full_bleed=True, inset=0.16))
