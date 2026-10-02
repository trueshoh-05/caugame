import Phaser from 'phaser';
import { abgr } from './palette';
import type { Room } from '../systems/Data';

const T = 16;
const FLOORS: Record<string, { a: string; b: string; line: string; wall: string; trim: string }> = {
  lab:     { a: 'N', b: 'g', line: 'n', wall: 'G', trim: 'b' },
  hall:    { a: 'u', b: 'U', line: 'z', wall: 's', trim: 'U' },
  physics: { a: 'G', b: 'g', line: 'N', wall: 'G', trim: 'p' },
  exam:    { a: 'g', b: 'G', line: 'N', wall: 'G', trim: 'n' },
};

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Paint an arena's floor and walls into a texture (once per room). Dark Mode darkens it. */
export function paintRoom(scene: Phaser.Scene, room: Room, dark: boolean): string {
  const key = `room_${room.id}${dark ? '_dark' : ''}`;
  if (scene.textures.exists(key)) return key;
  const [tw, th] = room.size;
  const pw = tw * T, ph = th * T;
  const buf = new Uint32Array(pw * ph);
  const f = FLOORS[room.floor] ?? FLOORS.lab;
  const put = (x: number, y: number, c: string) => { buf[y * pw + x] = abgr(c); };
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), i = x % T, j = y % T;
    let c: string;
    if (room.floor === 'hall') c = (j % 8 === 0) ? f.line : ((Math.floor((x + (Math.floor(y / 8) % 2) * 24) / 48)) % 2 ? f.a : f.b);
    else if (room.floor === 'physics') c = ((tx + ty) % 2 ? f.a : f.b);
    else c = (i === 0 || j === 0) ? f.line : (tx + ty) % 2 ? f.a : f.b;
    if (hash(x, y) < 0.008) c = f.line;
    if (dark) c = c === f.line ? 'k' : (tx + ty) % 2 ? 'K' : 'n';
    put(x, y, c);
  }
  // Walls: two-tile facade at the top, one-tile walls on the sides and bottom.
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const top = y < 2 * T, side = x < T || x >= pw - T, bottom = y >= ph - T;
    if (!(top || side || bottom)) continue;
    let c = dark ? 'K' : f.wall;
    if (top && y > 2 * T - 4) c = f.trim;
    if (top && y < 4) c = 'k';
    if (side || bottom) c = dark ? 'k' : 'n';
    if ((side || bottom) && (x === T - 1 || x === pw - T || y === ph - T)) c = 'k';
    put(x, y, c);
  }
  // Whiteboard / windows on the top wall.
  const board = (x0: number, w: number, c: string, fr: string) => {
    for (let y = 6; y < 26; y++) for (let x = x0; x < x0 + w; x++) put(x, y, (y === 6 || y === 25 || x === x0 || x === x0 + w - 1) ? fr : c);
  };
  if (room.floor === 'hall') board(pw / 2 - 80, 160, 'w', 'g');
  else if (room.floor === 'exam') { board(pw / 2 - 30, 60, 'w', 'k'); }
  else for (let k = 0; k < 4; k++) board(40 + k * 110, 60, dark ? 'b' : 'B', 'k');
  const tex = scene.textures.createCanvas(key, pw, ph)!;
  tex.getContext().putImageData(new ImageData(new Uint8ClampedArray(buf.buffer as ArrayBuffer), pw, ph), 0, 0);
  tex.refresh();
  return key;
}

/** Desk with laptops/monitors on top, sized in tiles. */
export function deskTexture(scene: Phaser.Scene, w: number, h: number, floor: string): string {
  const key = `desk_${w}x${h}_${floor}`;
  if (scene.textures.exists(key)) return key;
  const pw = w * T, ph = h * T + 6;
  const tex = scene.textures.createCanvas(key, pw, ph)!;
  const ctx = tex.getContext();
  const top = floor === 'physics' ? '#c0cbdc' : floor === 'exam' ? '#b86f50' : '#733e39';
  ctx.fillStyle = '#181425'; ctx.fillRect(0, 2, pw, ph - 2);
  ctx.fillStyle = top; ctx.fillRect(1, 2, pw - 2, h * T - 3);
  ctx.fillStyle = '#3e2731'; ctx.fillRect(1, h * T - 1, pw - 2, 5);
  ctx.fillStyle = '#181425'; ctx.fillRect(2, ph - 2, 2, 2); ctx.fillRect(pw - 4, ph - 2, 2, 2);
  for (let x = 4; x + 10 <= pw - 2; x += 16) {
    if (floor === 'physics') { ctx.fillStyle = '#e43b44'; ctx.fillRect(x + 2, 4, 4, 6); ctx.fillStyle = '#0099db'; ctx.fillRect(x + 7, 6, 3, 4); }
    else if (floor === 'exam') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, 5, 7, 6); }
    else { ctx.fillStyle = '#262b44'; ctx.fillRect(x, 0, 10, 8); ctx.fillStyle = '#2ce8f5'; ctx.fillRect(x + 1, 1, 8, 5); ctx.fillStyle = '#8b9bb4'; ctx.fillRect(x + 4, 8, 2, 2); }
  }
  tex.refresh();
  return key;
}
