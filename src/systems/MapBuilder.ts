import Phaser from 'phaser';
import { abgr } from '../art/palette';
import { campus, type Building } from './Data';
import { Core } from '../core/Core';

/**
 * Turns campus.json into: a ground texture, an "above the player" texture (tree canopies,
 * archway roof), an invisible collision tilemap, a minimap texture and a building index.
 * Walls, roofs and edges are chosen from neighbouring tiles (autotiling), so the rotated
 * and zigzag buildings come out as stepped walls without any hand-placed tiles.
 */
const T = campus.tileSize;
const [W, H] = campus.size;

export const MAP_W = W;
export const MAP_H = H;

export function charAt(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= W || y >= H) return '.';
  return campus.grid[y][x];
}
export function isBuildingChar(c: string): boolean { return c === '#' || c === 'a'; }
export function isWalkableChar(c: string): boolean { return !!campus.legend[c]?.walkable; }

/** Building id for each tile (-1 = none), found by flood fill from each building's seed. */
export function buildingIndex(): Int16Array {
  if (Core.core) return Int16Array.from(Core.core.campusBuildings());  // C++ core (cpp/src/campus.cpp)
  const idx = new Int16Array(W * H).fill(-1);
  campus.buildings.forEach((b, bi) => {
    const stack: [number, number][] = [[b.seed[0], b.seed[1]]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (idx[y * W + x] !== -1 || !isBuildingChar(charAt(x, y))) continue;
      idx[y * W + x] = bi;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  });
  return idx;
}

export function blockedGrid(): boolean[][] {
  if (Core.core) {
    const b = Core.core.campusBlocked();
    return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => b[y * W + x] === 1));
  }
  const g: boolean[][] = [];
  for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(!isWalkableChar(charAt(x, y))); }
  return g;
}

function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Roof schemes per building: [roof, roof shade, ridge highlight, wall, window]
const SCHEMES: Record<string, string[]> = {
  main: ['N', 'n', 'g', 'G', 'b'], event_hall: ['P', 'p', 'f', 's', 'b'], ae: ['u', 'q', 'Q', 's', 'b'], nw: ['p', 'K', 'P', 'G', 'B'],
  ne: ['e', 'E', 'L', 'G', 'B'], annex: ['g', 'N', 'G', 'G', 'b'], annex_2: ['g', 'N', 'G', 'G', 'b'],
  east: ['b', 'K', 'B', 'G', 'c'], zigzag: ['U', 'z', 'u', 's', 'b'], south: ['Q', 'q', 'y', 's', 'b'],
};
const DEFAULT_SCHEME = ['N', 'n', 'g', 'G', 'b'];

export interface BuiltMap {
  ground: string; above: string; minimap: string;
  layer: Phaser.Tilemaps.TilemapLayer; buildings: Int16Array;
  doorTiles: { building: Building; door: Building['doors'][number] }[];
}

export function buildCampus(scene: Phaser.Scene, keyPrefix = 'campus'): BuiltMap {
  const bIdx = buildingIndex();
  const doorAt = new Map<number, { open: boolean }>();
  const doorTiles: BuiltMap['doorTiles'] = [];
  for (const b of campus.buildings) for (const d of b.doors) {
    doorAt.set(d.at[1] * W + d.at[0], { open: !!d.leadsTo });
    doorTiles.push({ building: b, door: d });
  }

  const pw = W * T, ph = H * T;
  const groundKey = keyPrefix + '_ground', aboveKey = keyPrefix + '_above', miniKey = keyPrefix + '_mini';
  if (!scene.textures.exists(groundKey)) paint();
  function paint(): void {
  const g = new Uint32Array(pw * ph);
  const a = new Uint32Array(pw * ph);
  const put = (buf: Uint32Array, x: number, y: number, c: string, alpha = 255) => {
    if (x >= 0 && y >= 0 && x < pw && y < ph) buf[y * pw + x] = abgr(c, alpha);
  };
  const fill = (buf: Uint32Array, ox: number, oy: number, x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(buf, ox + x + i, oy + y + j, c);
  };
  const isB = (x: number, y: number) => isBuildingChar(charAt(x, y));

  const roof = (buf: Uint32Array, tx: number, ty: number, sc: string[]) => {
    const ox = tx * T, oy = ty * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const n = hash(ox + i, oy + j, 3);
      put(buf, ox + i, oy + j, (j % 8 === 0) ? sc[1] : n < 0.04 ? sc[1] : sc[0]);
    }
    if (!isB(tx, ty - 1)) fill(buf, ox, oy, 0, 0, T, 2, sc[2]);
    if (!isB(tx - 1, ty)) fill(buf, ox, oy, 0, 0, 2, T, sc[2]);
    if (!isB(tx + 1, ty)) fill(buf, ox, oy, T - 2, 0, 2, T, sc[1]);
    if (!isB(tx + 1, ty) && !isB(tx, ty - 1)) put(buf, ox + T - 1, oy, 'k');
  };
  const wall = (buf: Uint32Array, tx: number, ty: number, sc: string[]) => {
    const ox = tx * T, oy = ty * T;
    fill(buf, ox, oy, 0, 0, T, 4, sc[1]);          // eave
    fill(buf, ox, oy, 0, 4, T, 11, sc[3]);         // facade
    fill(buf, ox, oy, 0, 15, T, 1, 'k');           // base shadow
    if ((tx + ty) % 2 === 0) { fill(buf, ox, oy, 4, 6, 8, 6, sc[4]); fill(buf, ox, oy, 5, 7, 3, 2, 'c'); }
    else { fill(buf, ox, oy, 2, 6, 5, 6, sc[4]); fill(buf, ox, oy, 9, 6, 5, 6, sc[4]); }
    if (!isB(tx - 1, ty)) fill(buf, ox, oy, 0, 4, 1, 11, 'g');
    if (!isB(tx + 1, ty)) fill(buf, ox, oy, T - 1, 4, 1, 11, 'N');
  };
  const door = (tx: number, ty: number, open: boolean) => {
    const ox = tx * T, oy = ty * T;
    fill(g, ox, oy, 2, 1, 12, 15, 'k');
    fill(g, ox, oy, 3, 2, 10, 14, open ? 'U' : 'n');
    fill(g, ox, oy, 4, 3, 8, 5, open ? 'Y' : 'N');
    put(g, ox + 10, oy + 10, 'y'); put(g, ox + 10, oy + 11, 'y');
    fill(g, ox, oy, 5, 0, 6, 1, open ? 'l' : 'R');
    fill(g, ox, oy, 0, 15, T, 1, 'g');
  };

  const flat = (tx: number, ty: number, c: string) => {
    const ox = tx * T, oy = ty * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const X = ox + i, Y = oy + j, n = hash(X, Y);
      let col = 'g';
      switch (c) {
        case 'p': col = (i === 0 || j === 0 || i === 8) ? 'g' : n < 0.05 ? 'g' : 'G'; break;
        case 'a': col = (i === 0 || j === 0) ? 'n' : n < 0.05 ? 'n' : 'N'; break;
        case 'd': col = n < 0.12 ? 'K' : 'n'; break;
        case 'P': col = (i === 0 && j > 1 && j < 15) ? 'w' : n < 0.1 ? 'K' : 'N'; break;
        case '=': col = ((i % 4 === 1) && (j % 4 !== 0)) ? 'y' : (i === 0 || j === 0) ? 'y' : 'Y'; break;
        case 'r': col = n < 0.08 ? 'R' : n > 0.95 ? 'z' : 'r'; break;
        case 's': col = (j % 4 === 3) ? 'S' : (j % 4 === 0) ? 'w' : 's'; break;
        case 'g': case 't': col = n < 0.07 ? 'l' : n > 0.97 ? 'e' : 'L'; break;
        case 'w': col = n < 0.07 ? 'l' : 'L'; break;
        case 'f': col = (Math.floor(X / 32) % 2 === 0) ? (n < 0.05 ? 'L' : 'l') : (n < 0.05 ? 'l' : 'L'); break;
        case 'c': col = n < 0.05 ? 'q' : 'Q'; break;
        default: col = 'N';
      }
      put(g, X, Y, col);
    }
    if (c === 'w') {
      const h = charAt(tx - 1, ty) === 'w' || charAt(tx + 1, ty) === 'w';
      const v = charAt(tx, ty - 1) === 'w' || charAt(tx, ty + 1) === 'w';
      if (h || !v) { fill(g, ox, oy, 0, 6, T, 4, 'B'); fill(g, ox, oy, 0, 6, T, 1, 'b'); }
      if (v) { fill(g, ox, oy, 6, 0, 4, T, 'B'); fill(g, ox, oy, 6, 0, 1, T, 'b'); }
    }
    if (c === 'f' || c === 'c') {
      if (charAt(tx, ty - 1) !== c) fill(g, ox, oy, 0, 0, T, 1, 'w');
      if (charAt(tx, ty + 1) !== c) fill(g, ox, oy, 0, T - 1, T, 1, 'w');
      if (charAt(tx - 1, ty) !== c) fill(g, ox, oy, 0, 0, 1, T, 'w');
      if (charAt(tx + 1, ty) !== c) fill(g, ox, oy, T - 1, 0, 1, T, 'w');
    }
    if (c === 'P' && hash(tx, ty, 9) < 0.45) {
      // a parked car, drawn flat on the asphalt (decoration only)
      const cc = ['R', 'B', 'w', 'k', 'y', 'g'][Math.floor(hash(tx, ty, 10) * 6)];
      fill(g, ox, oy, 3, 2, 10, 12, cc); fill(g, ox, oy, 4, 4, 8, 3, 'c'); fill(g, ox, oy, 4, 10, 8, 2, 'n');
      fill(g, ox, oy, 2, 3, 1, 2, 'k'); fill(g, ox, oy, 13, 3, 1, 2, 'k'); fill(g, ox, oy, 2, 11, 1, 2, 'k'); fill(g, ox, oy, 13, 11, 1, 2, 'k');
    }
    if (c === 't') {
      fill(g, ox, oy, 7, 9, 2, 6, 'U');
      fill(g, ox, oy, 4, 14, 8, 2, 'e');
      for (let j = -9; j < 11; j++) for (let i = -9; i < 10; i++) {
        const d = Math.hypot(i + 0.5, j + 3);
        if (d > 7.5) continue;
        const n = hash(ox + i, oy + j, 5);
        const col = d > 6.5 ? 'e' : (i < -1 && j < -3 && n < 0.6) ? 'l' : n < 0.15 ? 'e' : 'L';
        put(a, ox + 8 + i, oy + 8 + j, col);
      }
    }
  };

  const outside = (tx: number, ty: number) => {
    let edge = false;
    for (let j = -1; j <= 1 && !edge; j++) for (let i = -1; i <= 1; i++) {
      const c = charAt(tx + i, ty + j);
      if (c !== '.' && isWalkableChar(c)) { edge = true; break; }
    }
    const ox = tx * T, oy = ty * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const n = hash(ox + i, oy + j, 1);
      if (edge) put(g, ox + i, oy + j, n < 0.25 ? 'E' : n < 0.5 ? 'L' : 'e');      // hedge
      else put(g, ox + i, oy + j, n < 0.1 ? 'K' : 'n');                              // street
    }
    if (edge) { fill(g, ox, oy, 0, 14, T, 2, 'E'); }
    else if (ty % 6 === 0) for (let i = 0; i < T; i += 2) if ((tx * T + i) % 8 < 4) put(g, ox + i, oy + 8, 'g');
  };

  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const c = charAt(tx, ty);
    const bi = bIdx[ty * W + tx];
    const sc = bi >= 0 ? (SCHEMES[campus.buildings[bi].id] ?? DEFAULT_SCHEME) : DEFAULT_SCHEME;
    const d = doorAt.get(ty * W + tx);
    if (c === '.') outside(tx, ty);
    else if (c === '#') {
      if (d) door(tx, ty, d.open);
      else if (!isB(tx, ty + 1)) wall(g, tx, ty, sc);
      else roof(g, tx, ty, sc);
    } else if (c === 'a') {
      flat(tx, ty, 'a');
      if (!isB(tx, ty + 1)) {
        // archway mouth: draw the arch on the roof layer, open below
        roof(a, tx, ty, sc);
        for (let i = 0; i < T; i++) for (let j = 8; j < T; j++) a[(ty * T + j) * pw + tx * T + i] = 0;
        fill(a, tx * T, ty * T, 0, 7, T, 1, sc[1]);
      } else roof(a, tx, ty, sc);
    } else flat(tx, ty, c);
  }

  // Gates: posts and a sign bar on the roof layer.
  for (const gt of campus.gates) {
    const ox = gt.at[0] * T, oy = gt.at[1] * T;
    fill(g, ox, oy, -4, 0, 3, T, 'k'); fill(g, ox, oy, T + 1, 0, 3, T, 'k');
    fill(a, ox, oy, -4, -6, T + 8, 4, 'r'); fill(a, ox, oy, -3, -5, T + 6, 2, 'R');
  }

  const toCanvas = (key: string, buf: Uint32Array) => {
    const tex = scene.textures.createCanvas(key, pw, ph)!;
    const img = new ImageData(new Uint8ClampedArray(buf.buffer as ArrayBuffer), pw, ph);
    tex.getContext().putImageData(img, 0, 0);
    tex.refresh();
  };
  toCanvas(groundKey, g);
  toCanvas(aboveKey, a);

  // Minimap: one pixel per tile.
  const mini = scene.textures.createCanvas(miniKey, W, H)!;
  const mctx = mini.getContext();
  const MINI: Record<string, string> = {
    '.': '#262b44', '#': '#c0cbdc', a: '#8b9bb4', p: '#5a6988', d: '#3a4466', P: '#3a4466', '=': '#feae34',
    r: '#a22633', s: '#e4a672', g: '#3e8948', t: '#265c42', w: '#0099db', f: '#63c74d', c: '#d77643',
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { mctx.fillStyle = MINI[charAt(x, y)] ?? '#000'; mctx.fillRect(x, y, 1, 1); }
  for (const [i] of doorAt) { const d = doorAt.get(i)!; mctx.fillStyle = d.open ? '#63c74d' : '#e43b44'; mctx.fillRect(i % W, Math.floor(i / W), 1, 1); }
  mini.refresh();
  }

  // Collision: an invisible tilemap; 1 = blocked.
  const data = blockedGrid().map((row) => row.map((b) => (b ? 1 : 0)));
  if (!scene.textures.exists('blank_tile')) scene.textures.createCanvas('blank_tile', T * 2, T)!.refresh();
  const map = scene.make.tilemap({ data, tileWidth: T, tileHeight: T });
  const tileset = map.addTilesetImage('blank_tile', 'blank_tile', T, T, 0, 0)!;
  const layer = map.createLayer(0, tileset, 0, 0)!;
  layer.setCollision(1);
  layer.setVisible(false);

  return { ground: groundKey, above: aboveKey, minimap: miniKey, layer, buildings: bIdx, doorTiles };
}

/** Breadth-first search over walkable tiles. Returns distance (in tiles) to every tile, -1 if unreachable. */
export function bfs(from: [number, number]): Int32Array {
  if (Core.core) return Core.core.campusBfs(from[0], from[1]);
  const dist = new Int32Array(W * H).fill(-1);
  const q: number[] = [from[1] * W + from[0]];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (dist[ni] !== -1 || !isWalkableChar(charAt(nx, ny))) continue;
      dist[ni] = dist[i] + 1; q.push(ni);
    }
  }
  return dist;
}
