import enemiesJson from '../data/enemies.json';
import coursesJson from '../data/courses.json';
import professorsJson from '../data/professors.json';
import campusJson from '../data/campus.json';
import { rooms } from '../systems/Data';
import type { CauCoreModule, WasmCore } from './cau_core';

/**
 * The C++ game core (cpp/), compiled to WebAssembly. It owns the game rules and the arena
 * fight; Phaser draws what it reports. If it can't load, or the URL has ?core=ts, the game
 * falls back to the original TypeScript logic.
 */
export const Core = {
  module: null as CauCoreModule | null,
  core: null as WasmCore | null,
  error: '' as string,
  get active(): boolean { return !!this.core; },
};

export async function initCore(): Promise<void> {
  if (/[?&]core=ts\b/.test(location.search)) { Core.error = 'disabled by ?core=ts'; return; }
  try {
    const { default: createCauCore } = await import('./generated/cau_core.mjs');
    const m = await createCauCore();
    const roomList = JSON.stringify(Object.values(rooms));
    Core.module = m;
    Core.core = new m.Core(JSON.stringify(enemiesJson), JSON.stringify(coursesJson), JSON.stringify(professorsJson), JSON.stringify(campusJson), roomList);
  } catch (e) {
    Core.error = String(e);
    Core.module = null;
    Core.core = null;
    console.warn('C++ core unavailable, using the TypeScript fallback:', e);
  }
}
