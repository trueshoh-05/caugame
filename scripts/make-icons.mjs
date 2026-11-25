// Draws the app icons (home-screen / install icons) from the game's own pixel-art student
// (src/art/sprites.ts, player_0) on the game's background colour. No external art.
// Usage: node scripts/make-icons.mjs   -> public/icon-180.png, icon-192.png, icon-512.png
import fs from 'node:fs';
import zlib from 'node:zlib';

const palSrc = fs.readFileSync('src/art/palette.ts', 'utf8');
const PALETTE = Object.fromEntries([...palSrc.matchAll(/(\w): '#([0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
const spriteSrc = fs.readFileSync('src/art/sprites.ts', 'utf8');
const block = spriteSrc.slice(spriteSrc.indexOf('player_0: ['), spriteSrc.indexOf('],', spriteSrc.indexOf('player_0: [')));
const grid = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);

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
  const bg = [0x18, 0x14, 0x25], ring = [0xfe, 0xae, 0x34];
  const rows = [];
  const scale = Math.floor((size * 0.7) / grid.length);
  const ox = Math.floor((size - 16 * scale) / 2), oy = Math.floor((size - grid.length * scale) / 2);
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let c = bg;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (edge < Math.max(2, size / 40)) c = ring;
      const gx = Math.floor((x - ox) / scale), gy = Math.floor((y - oy) / scale);
      if (gy >= 0 && gy < grid.length && gx >= 0 && gx < 16) {
        const ch = grid[gy][gx];
        if (PALETTE[ch]) c = [0, 2, 4].map((i) => parseInt(PALETTE[ch].slice(i, i + 2), 16));
      }
      row.set(c, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
fs.mkdirSync('public', { recursive: true });
for (const s of [180, 192, 512]) fs.writeFileSync(`public/icon-${s}.png`, png(s));
console.log('icons written');
