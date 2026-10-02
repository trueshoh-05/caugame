import Phaser from 'phaser';
import { PALETTE } from '../art/palette';
import { GRIDS } from '../art/sprites';
import { PAPER_KINDS, bubbleGrid, paperGrid } from '../art/papers';
import { courses } from './Data';

/**
 * Every sprite the game uses has an entry here. Today they are all pixel grids drawn
 * in code; to swap one for a real image, register { kind: 'file', url } under the same
 * key and the Preload scene will load it instead. Game code only ever uses the key.
 */
export type AssetSource = { kind: 'grid'; rows: string[] } | { kind: 'file'; url: string };

const registry = new Map<string, AssetSource>();
/** Optional audio files that replace synthesised effects (id -> url). Empty in version 1. */
export const soundFiles = new Map<string, string>();

export const AssetRegistry = {
  register(key: string, src: AssetSource): void { registry.set(key, src); },
  get: (key: string): AssetSource | undefined => registry.get(key),
  keys: (): string[] => [...registry.keys()],
  registerSound(id: string, url: string): void { soundFiles.set(id, url); },

  /** Queue file-backed assets on the loader (call from Preload.preload). */
  queueFiles(scene: Phaser.Scene): void {
    for (const [key, src] of registry) if (src.kind === 'file') scene.load.image(key, src.url);
  },

  /** Turn all grid-backed assets into textures (call once at boot). */
  buildTextures(scene: Phaser.Scene): void {
    for (const [key, src] of registry) {
      if (src.kind !== 'grid' || scene.textures.exists(key) || !src.rows.length) continue;
      gridTexture(scene, key, src.rows);
    }
  },
};

export function gridTexture(scene: Phaser.Scene, key: string, rows: string[]): void {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = PALETTE[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  tex.refresh();
}

// Register everything at module load.
for (const [k, rows] of Object.entries(GRIDS)) if (rows.length) AssetRegistry.register(k, { kind: 'grid', rows });
const skins = [...new Set(courses.courses.map((c) => c.skin))];
for (const skin of skins) for (const kind of PAPER_KINDS) AssetRegistry.register(`${kind}_${skin}`, { kind: 'grid', rows: paperGrid(kind, skin) });
for (const L of ['A', 'B', 'C', 'D']) AssetRegistry.register(`bubble_${L}`, { kind: 'grid', rows: bubbleGrid(L) });
