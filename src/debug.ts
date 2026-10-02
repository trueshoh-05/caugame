import type Phaser from 'phaser';
import { Save } from './systems/Save';
import { Input } from './systems/Input';
import { Audio } from './systems/Audio';
import { HudState } from './scenes/HUD';
import { buildStage, stageTotalHp } from './systems/Stages';
import { bfs, blockedGrid } from './systems/MapBuilder';
import { balance, campus, courses } from './systems/Data';
import { getLang, setLang } from './systems/Language';
import { professorLines } from './systems/Dialog';

/** Shared debug flags. Exposed as window.__game in dev builds (or with ?debug in the URL) for tests. */
export const Debug = {
  scene: null as Phaser.Scene | null,
  invulnerable: false,
  autoAim: false,
  autoSubmit: false,
  lastGpa: 0,
  sharedImage: 0,
};

type AnyScene = Phaser.Scene & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function installDebug(game: Phaser.Game): void {
  const enabled = import.meta.env.DEV || /[?&]debug\b/.test(location.search);
  if (!enabled) return;
  const active = (): string[] => game.scene.getScenes(true).map((s) => s.scene.key);
  const arena = (): AnyScene | null => (game.scene.isActive('Arena') ? (game.scene.getScene('Arena') as AnyScene) : null);
  const campusScene = (): AnyScene | null => (game.scene.isActive('Campus') ? (game.scene.getScene('Campus') as AnyScene) : null);
  const api = {
    game, Debug, Save, Input, Audio, HudState, campus, courses, balance,
    scenes: active,
    professorLines,
    state() {
      const a = arena(), c = campusScene();
      const pl = (a ?? c)?.player as Phaser.GameObjects.Sprite | undefined;
      return {
        scenes: active(),
        player: pl ? { x: pl.x, y: pl.y } : null,
        sanity: a ? a.sanity : null,
        enemies: a ? a.activeEnemies() : 0,
        clip: a ? a.clip : null,
        deadline: a ? a.deadline : null,
        cleared: a ? a.cleared : false,
        boss: a && a.boss ? { hp: a.boss.hp, max: a.boss.maxHp, phase: a.boss.phase, state: a.boss.state } : null,
        stage: a ? { course: a.course.id, index: a.stage.index, type: a.stage.type, hpBudget: a.stage.hpBudget, total: a.total } : null,
        lang: getLang(),
        fps: game.loop.actualFps,
        hud: { ...HudState },
        save: Save.get(),
      };
    },
    setInvulnerable(v: boolean) { Debug.invulnerable = v; },
    setAutoAim(v: boolean) { Debug.autoAim = v; },
    setAutoSubmit(v: boolean) { Debug.autoSubmit = v; },
    setLang(code: string) { setLang(code); Save.update((s) => { s.lang = code; }); },
    teleport(x: number, y: number) { const s = (arena() ?? campusScene()); if (s) { s.player.setPosition(x, y); s.player.body.reset(x, y); } },
    teleportTile(tx: number, ty: number) { api.teleport(tx * 16 + 8, ty * 16 + 14); },
    spawn(kind: string, n: number) { arena()?.debugSpawn(kind, n); },
    killAll() { arena()?.debugKillAll(); },
    submit() { arena()?.submit(); },
    damagePlayer(n: number) { const a = arena(); if (a) { const inv = Debug.invulnerable; Debug.invulnerable = false; a.player.invuln = 0; a.damagePlayer(n); Debug.invulnerable = inv; } },
    enterArena(courseId: string) { campusScene()?.enterArena(courseId); },
    acceptCourse(courseId: string) { Save.update((s) => { if (!s.accepted.includes(courseId)) s.accepted.push(courseId); }); campusScene()?.refreshObjective(); },
    stagePlan(courseId: string) {
      const c = courses.courses.find((x) => x.id === courseId)!;
      return c.components.map((_, i) => { const s = buildStage(courseId, i); return { type: s.type, weight: s.weight, hpBudget: s.hpBudget, total: stageTotalHp(s), deadline: s.deadline, waves: s.waves.map((w) => w.map((x) => x.type)), boss: s.boss }; });
    },
    reachability() {
      const d = bfs(campus.playerStart);
      const blocked = blockedGrid();
      let walk = 0, reached = 0;
      for (let y = 0; y < campus.size[1]; y++) for (let x = 0; x < campus.size[0]; x++) if (!blocked[y][x]) { walk++; if (d[y * campus.size[0] + x] >= 0) reached++; }
      return { walk, reached };
    },
    /** Collision grid as the game actually built it (1 = blocked). */
    collisionRows() {
      const c = campusScene();
      if (!c) return null;
      const layer = c.map.layer as Phaser.Tilemaps.TilemapLayer;
      const rows: string[] = [];
      for (let y = 0; y < campus.size[1]; y++) { let r = ''; for (let x = 0; x < campus.size[0]; x++) r += layer.getTileAt(x, y)?.index === 1 ? '1' : '0'; rows.push(r); }
      return rows;
    },
    press(a: string) { Input.press(a as never); },
    move(x: number, y: number) { Input.scripted = (x || y) ? { x, y } : null; },
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
