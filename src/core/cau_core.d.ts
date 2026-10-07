// Types for the WebAssembly game core built from cpp/ (see cpp/src/bindings.cpp).
export interface WasmStagePlan {
  courseId: string; index: number; type: string; weight: number; hpBudget: number; deadline: number; total: number;
  boss: 'midterm_paper' | 'final_exam' | null;
  waves: { type: string; hp: number }[][];
}

export interface WasmEvent { type: string; key: string; x: number; y: number; a: number; b: number; tone: number }

export interface WasmBoss { kind: string; hp: number; max: number; x: number; y: number; r: number; state: string; phase: number; flash: boolean; soggy: boolean; tx: number; ty: number }

export interface WasmArenaState {
  x: number; y: number; vx: number; vy: number; facing: number; invuln: number; dashing: boolean;
  sanity: number; sanityMax: number; clip: number; clipMax: number; reloading: boolean;
  deadline: number; deadlineMax: number; frozen: boolean; late: boolean; wallX: number;
  assistReady: boolean; shield: number; cleared: boolean; ended: boolean; elapsed: number;
  destroyed: number; total: number; maccoffee: number; nescafe: number; eightAm: boolean; firstCoffeeTaken: boolean;
  enemies: number; hasExit: boolean; exitX: number; exitY: number; exitLocked: boolean;
  attendance: boolean; attendanceX: number; attendanceY: number;
  boss: WasmBoss | null; bounds: { x: number; y: number; w: number; h: number };
}

export interface WasmStageResult {
  cleared: boolean; score: number; late: boolean; mercy: boolean; sanityLeft: number;
  attendanceMissed: boolean; destroyedFraction: number; retake: boolean; achievement?: string;
}

export interface WasmArenaInput {
  moveX: number; moveY: number; fireHeld: boolean; hasAim: boolean; aimX: number; aimY: number;
  autoAim: boolean; coffee: boolean; dash: boolean; help: boolean; reload: boolean;
}

export interface WasmCore {
  stagePlan(courseId: string): WasmStagePlan[];
  stage(courseId: string, index: number): WasmStagePlan;
  letterFor(percent: number): { letter: string; points: number };
  clearedScore(sanity: number, max: number, onTime: boolean): number;
  failedScore(fraction: number): number;
  coursePercent(courseId: string, scores: number[]): number;
  creditsFor(percent: number): number;
  gpa(points: number[]): number;
  hasMercyPass(courseId: string): boolean;
  insertTic(text: string, profId: string): { text: string; count: number };
  campusBlocked(): Int32Array;
  campusBuildings(): Int32Array;
  campusBfs(x: number, y: number): Int32Array;
  walkTiles(sx: number, sy: number, tx: number, ty: number): number;
  delete(): void;
}

export interface WasmArena {
  setSpriteSize(kind: string, w: number, h: number): void;
  step(dt: number, input: WasmArenaInput): void;
  events(): WasmEvent[];
  papers(): Float32Array;      // stride 10: active, kind, x, y, angle, scale, flash, soggy, hp, maxHp
  shots(): Float32Array;       // stride 5: active, tex, x, y, rotation
  enemyShots(): Float32Array;  // stride 5
  cups(): { kind: 'maccoffee' | 'nescafe'; sx: number; sy: number; tx: number; ty: number; t: number }[];
  state(): WasmArenaState;
  result(): WasmStageResult;
  setInvulnerable(v: boolean): void;
  setAutoSubmit(v: boolean): void;
  debugSpawn(kind: string, n: number): void;
  debugKillAll(): void;
  debugDamagePlayer(n: number): void;
  debugSetClip(n: number): void;
  debugSetSanity(v: number): void;
  debugTeleport(x: number, y: number): void;
  submit(): void;
  activeEnemies(): number;
  delete(): void;
}

export interface CauCoreModule {
  Core: new (enemies: string, courses: string, professors: string, campus: string, rooms: string) => WasmCore;
  Arena: new (core: WasmCore, cfg: Record<string, unknown>) => WasmArena;
  enemyKinds(core: WasmCore): string[];
}
