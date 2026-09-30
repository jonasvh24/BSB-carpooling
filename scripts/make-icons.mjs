// Generates the PWA icons without any image dependency: a teal rounded square
// with a white ring. Good enough for a pilot; replace with real artwork later.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size / 2, ring = size * 0.30, ringW = size * 0.08, corner = size * 0.18;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // rounded-square mask
      const dx = Math.max(corner - x, 0, x - (size - 1 - corner));
      const dy = Math.max(corner - y, 0, y - (size - 1 - corner));
      const inside = dx * dx + dy * dy <= corner * corner;
      const d = Math.hypot(x - r, y - r);
      const onRing = Math.abs(d - ring) <= ringW / 2;
      if (!inside) { raw[i + 3] = 0; continue; }
      if (onRing) { raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; }
      else { raw[i] = 0x0b; raw[i + 1] = 0x6e; raw[i + 2] = 0x63; }
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s));
console.log("icons written");
