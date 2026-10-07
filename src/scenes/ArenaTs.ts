import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Paper } from '../entities/Paper';
import { balance, getCourse, getProfessor, rooms, type Course, type Professor, type Room } from '../systems/Data';
import { buildStage, hpOf, stageTotalHp, type Spawn, type Stage } from '../systems/Stages';
import { clearedScore, coursePercent, failedScore, hasMercyPass } from '../systems/Grades';
import { oneLine } from '../systems/Dialog';
import { Save } from '../systems/Save';
import { t } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { Debug } from '../debug';
import { paintRoom, deskTexture } from '../art/rooms';
import { COLORS, floatText, setupCamera, txt } from '../ui';
import { HudState } from './HUD';
import type { StageResult } from './Results';

const B = balance;
const A = B.arena;
const SEMI = B.ammo.semicolon;
const TS = 16;

interface Shot { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; dmg: number; active: boolean }
interface Cup { img: Phaser.GameObjects.Image; sx: number; sy: number; tx: number; ty: number; t: number; kind: 'maccoffee' | 'nescafe' }
interface Pickup { img: Phaser.GameObjects.Image; type: string }
interface Rect { x: number; y: number; w: number; h: number }

interface BossState {
  kind: 'midterm_paper' | 'final_exam';
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  hp: number; maxHp: number;
  x: number; y: number; r: number;
  state: string; timer: number;
  tx: number; ty: number; sx: number; sy: number;
  angle: number; fireTimer: number; summonTimer: number; phase: number;
  flash: number; soggy: number; soggyMult: number;
}

import type { ArenaData } from './Arena';

/** TypeScript arena, kept as the fallback when the C++ core is unavailable (or with ?core=ts). */
export class ArenaTsScene extends Phaser.Scene {
  course!: Course;
  prof!: Professor;
  room!: Room;
  stage!: Stage;
  skin = 'code';
  player!: Player;
  papers: Paper[] = [];
  shots: Shot[] = [];
  enemyShots: Shot[] = [];
  cups: Cup[] = [];
  pickups: Pickup[] = [];
  desks: Rect[] = [];
  boss: BossState | null = null;
  stains: Phaser.GameObjects.Image[] = [];
  stainIdx = 0;
  shredder!: Phaser.GameObjects.Particles.ParticleEmitter;
  wall!: Phaser.GameObjects.Graphics;
  wallLabel!: Phaser.GameObjects.Text;
  exit: { img: Phaser.GameObjects.Container; x: number; y: number; lockedUntil: number } | null = null;
  bounds = { x: 16, y: 32, w: 448, h: 222 };

  sanity = 100;
  sanityMax = 100;
  clip = 30;
  clipMax = 30;
  reload = 0;
  reloadTime = 1;
  fireCd = 0;
  splashMult = 1;
  deadline = 0;
  frozen = 0;
  wallX = 0;
  wallTick = 0;
  isometry = 0;
  assistUsed = false;
  shield = 0;
  eightAm = false;
  waveIdx = -1;
  queue: Spawn[] = [];
  spawnCd = 0;
  wavePause = 0;
  destroyed = 0;
  total = 1;
  cleared = false;
  ended = false;
  late = false;
  barkCd = 10;
  attendance: { img: Phaser.GameObjects.Image; t: number; vx: number; vy: number } | null = null;
  attendanceAt = -1;
  attendanceMissed = false;
  teammates: Phaser.GameObjects.Image[] = [];
  emptyShown = 0;
  elapsed = 0;
  kills = 0;

  constructor() { super('Arena'); }

  init(d: ArenaData): void {
    this.course = getCourse(d.courseId);
    this.prof = getProfessor(this.course.professor);
    this.room = rooms[this.course.arena];
    this.stage = buildStage(d.courseId, d.stageIndex);
    this.skin = this.course.skin;
  }

  create(): void {
    setupCamera(this);
    Input.clear();
    // Reset all per-stage state (scene instances are reused between stages).
    this.papers = []; this.shots = []; this.enemyShots = []; this.cups = []; this.pickups = []; this.desks = [];
    this.boss = null; this.stains = []; this.stainIdx = 0; this.exit = null; this.attendance = null; this.teammates = [];
    this.waveIdx = -1; this.queue = []; this.spawnCd = 0; this.wavePause = 0.8; this.destroyed = 0; this.cleared = false;
    this.ended = false; this.late = false; this.assistUsed = false; this.isometry = 0; this.frozen = 0; this.wallTick = 0;
    this.barkCd = 8; this.attendanceMissed = false; this.emptyShown = 0; this.elapsed = 0; this.kills = 0; this.shield = 0;

    const save = Save.get();
    const up = (id: string) => save.upgrades.includes(id);
    const mod = (id: string) => B.upgrades.find((u) => u.id === id)!.modifier as { multiply?: number; set?: number };
    this.clipMax = up('more_ram') ? mod('more_ram').set ?? SEMI.clip : SEMI.clip;
    this.reloadTime = SEMI.reloadSeconds * (up('ssd') ? mod('ssd').multiply ?? 1 : 1);
    this.splashMult = up('bigger_mug') ? mod('bigger_mug').multiply ?? 1 : 1;
    this.clip = this.clipMax;
    this.reload = 0;
    this.sanityMax = B.player.sanity;
    this.sanity = this.sanityMax;
    this.deadline = this.stage.deadline;
    this.total = stageTotalHp(this.stage);
    this.eightAm = !save.firstCoffee;

    const [rw, rh] = this.room.size;
    this.bounds = { x: TS, y: TS * 2, w: rw * TS - TS * 2, h: rh * TS - TS * 3 };
    this.add.image(0, 0, paintRoom(this, this.room, up('dark_mode'))).setOrigin(0, 0).setDepth(-100);
    this.physics.world.setBounds(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h);

    for (const [x, y, w, h] of this.room.desks) {
      const r = { x: x * TS, y: y * TS, w: w * TS, h: h * TS };
      this.desks.push(r);
      this.add.image(r.x, r.y - 2, deskTexture(this, w, h, this.room.floor)).setOrigin(0, 0).setDepth(r.y + r.h);
      const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(z, true);
      this.deskZones.push(z);
    }

    this.player = new Player(this, this.room.playerStart[0] * TS + 8, this.room.playerStart[1] * TS + 8);
    this.player.setCollideWorldBounds(true);
    for (const z of this.deskZones) this.physics.add.collider(this.player, z);

    // Pools.
    for (let i = 0; i < 140; i++) this.papers.push(new Paper(this));
    for (let i = 0; i < 80; i++) this.shots.push({ img: this.add.image(-50, -50, 'semicolon').setVisible(false).setDepth(9000), vx: 0, vy: 0, life: 0, dmg: 0, active: false });
    for (let i = 0; i < 260; i++) this.enemyShots.push({ img: this.add.image(-50, -50, 'staple').setVisible(false).setDepth(9001), vx: 0, vy: 0, life: 0, dmg: 0, active: false });
    for (let i = 0; i < A.maxStains; i++) this.stains.push(this.add.image(-50, -50, 'stain').setVisible(false).setDepth(-50).setAlpha(0.6));
    this.shredder = this.add.particles(0, 0, 'shred', {
      speed: { min: 30, max: 110 }, angle: { min: 0, max: 360 }, lifespan: 500, scale: { start: 1, end: 0.4 },
      alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 120, emitting: false,
    }).setDepth(9500);

    this.wall = this.add.graphics().setDepth(9800);
    this.wallLabel = txt(this, 0, 0, B.hazards.deadline_wall.label, { size: 10, bold: true, color: '#ffffff' }).setDepth(9801).setOrigin(1, 0.5).setVisible(false);
    this.wallX = this.bounds.x - 20;

    for (const p of this.room.pickups) {
      if (p.type === 'feynman_lectures' && this.course.shieldPickup !== 'feynman_lectures') continue;
      this.addPickup(p.type, p.at[0] * TS + 8, p.at[1] * TS + 8);
    }
    if (save.lunch) {
      this.addPickup('canteen_food', this.player.x + 24, this.player.y - 8);
      Save.update((s) => { s.lunch = false; });
    }

    if (A.attendanceChance > Math.random()) this.attendanceAt = this.stage.deadline * (0.3 + Math.random() * 0.3);
    else this.attendanceAt = -1;

    if (this.stage.boss) this.spawnBoss(this.stage.boss);

    this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    HudState.mode = 'arena';
    HudState.title = `${this.course.id}.cpp`;
    const prog = save.progress[this.course.id] ?? [];
    const sofar = coursePercent(this.course.id, prog);
    HudState.grade = `${t('questCard.components.' + this.stage.type)} ${this.stage.weight}% · ${this.stage.index + 1}/${this.course.components.length}\n${t('ui.grade')}: ${sofar}%`;
    HudState.deadlineMax = this.stage.deadline;
    HudState.bossMax = 0; HudState.bossHp = 0;
    HudState.assistName = this.prof.assist.name;
    HudState.interact = '';
    const track = this.stage.boss === 'final_exam' ? 'final' : this.stage.boss ? 'midterm' : 'stage';
    Audio.music(track);
    this.time.delayedCall(200, () => {
      this.hud('toast', `${t(`questCard.components.${this.stage.type}`)} · ${this.stage.weight}%`, COLORS.accent);
      if (this.eightAm) this.time.delayedCall(1600, () => this.hud('toast', t('ui.eightAm'), COLORS.cyan));
    });
    Debug.scene = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.deskZones = []; });
  }

  deskZones: Phaser.GameObjects.Zone[] = [];

  private hud(ev: string, ...args: unknown[]): void { this.scene.get('HUD')?.events.emit(ev, ...args); }

  private addPickup(type: string, x: number, y: number): void {
    const key: Record<string, string> = { maccoffee: 'sachet_maccoffee', nescafe: 'sachet_nescafe', canteen_food: 'food', deadline_extension: 'extension', feynman_lectures: 'feynman' };
    const img = this.add.image(x, y, key[type] ?? 'food').setDepth(y);
    this.tweens.add({ targets: img, y: y - 3, yoyo: true, repeat: -1, duration: 500 });
    this.pickups.push({ img, type });
  }

  // ---------- spawning ----------

  private spawnPaper(kind: string, x?: number, y?: number, hpOverride?: number, primary = true): Paper | null {
    const p = this.papers.find((q) => !q.active);
    if (!p) return null;
    if (x === undefined || y === undefined) {
      const s = this.room.spawns[Math.floor(Math.random() * this.room.spawns.length)];
      x = s[0] * TS + 8 + Phaser.Math.Between(-10, 10);
      y = s[1] * TS + 8 + Phaser.Math.Between(-6, 6);
    }
    p.spawn(kind, this.skin, x, y, hpOverride);
    (p as Paper & { primary: boolean }).primary = primary;
    if (kind === 'group_project' && !this.teammates.length) this.spawnTeammates(B.enemies.group_project.idleTeammates ?? 3);
    return p;
  }

  private spawnTeammates(n: number): void {
    for (let i = 0; i < n; i++) {
      const x = this.player.x - 30 + i * 30, y = this.bounds.y + this.bounds.h - 12;
      const img = this.add.image(x, y, 'student').setOrigin(0.5, 1).setDepth(y).setTint([0xffffff, 0xb0e0ff, 0xffd0d0][i % 3]);
      const dots = txt(this, x, y - 26, '...', { size: 7, color: '#ffffff', origin: [0.5, 1] }).setDepth(9999);
      this.tweens.add({ targets: dots, alpha: 0.2, yoyo: true, repeat: -1, duration: 700 + i * 100 });
      this.teammates.push(img);
    }
    this.hud('toast', t('ui.teammatesNote'), COLORS.dim);
  }

  private nextWave(): void {
    this.waveIdx++;
    if (this.waveIdx >= this.stage.waves.length) { this.onCleared(); return; }
    this.queue = [...this.stage.waves[this.waveIdx]].sort(() => Math.random() - 0.5);
    this.spawnCd = 0;
    Audio.play('ding');
    this.hud('toast', t('ui.wave', { n: this.waveIdx + 1, total: this.stage.waves.length }), COLORS.accent);
  }

  private spawnBoss(kind: 'midterm_paper' | 'final_exam'): void {
    const x = this.bounds.x + this.bounds.w / 2, y = this.bounds.y + 46;
    const img = this.add.image(x, y, `${kind}_${this.skin}`).setDepth(y + 30);
    const shadow = this.add.image(x, y + 30, 'shadow').setScale(3, 2).setAlpha(0.35).setDepth(-40);
    this.boss = {
      kind, img, shadow, hp: this.stage.hpBudget, maxHp: this.stage.hpBudget, x, y, r: kind === 'final_exam' ? 26 : 19,
      state: 'idle', timer: 1.6, tx: x, ty: y, sx: x, sy: y, angle: 0, fireTimer: 0, summonTimer: B.bosses.final_exam.timing.summonEvery,
      phase: 1, flash: 0, soggy: 0, soggyMult: 1,
    };
    img.setScale(0.3);
    this.tweens.add({ targets: img, scale: 1, duration: 600, ease: 'Back.easeOut' });
    Audio.play('boss');
    HudState.bossName = `${t(`enemies.${kind}`)} — ${t('ui.boss')}`;
  }

  // ---------- combat ----------

  private aimPoint(): { x: number; y: number } | null {
    if (!Input.touchMode && !Debug.autoAim) return { x: Input.aim.x, y: Input.aim.y };
    // Touch: aim at the nearest paper.
    let best: { x: number; y: number } | null = null, bd = A.autoAimRange;
    for (const p of this.papers) {
      if (!p.active || p.spawnT > 0) continue;
      const d = Math.hypot(p.x - this.player.cx, p.y - this.player.cy);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y }; }
    }
    if (this.boss && this.boss.state !== 'warn') {
      const d = Math.hypot(this.boss.x - this.player.cx, this.boss.y - this.player.cy);
      if (d < bd + 60) best = { x: this.boss.x, y: this.boss.y };
    }
    if (this.attendance && !best) best = null;
    return best;
  }

  private fire(dt: number): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) { this.clip = this.clipMax; Audio.play('pickup', 0.7); }
      return;
    }
    const target = this.aimPoint();
    const wants = (Input.touchMode || Debug.autoAim) ? !!target : Input.fireHeld;
    if (!wants || !target || this.fireCd > 0) return;
    if (this.clip <= 0) {
      if (this.time.now - this.emptyShown > 900) {
        floatText(this, this.player.x, this.player.y - 26, t('ui.emptyClip'), COLORS.red, 7);
        this.emptyShown = this.time.now;
        Audio.play('empty');
      }
      this.reload = this.reloadTime;
      Audio.play('reload');
      return;
    }
    const s = this.shots.find((q) => !q.active);
    if (!s) return;
    const ang = Math.atan2(target.y - this.player.cy, target.x - this.player.cx);
    s.active = true; s.life = 1.6; s.dmg = SEMI.damage;
    s.vx = Math.cos(ang) * SEMI.projectileSpeed; s.vy = Math.sin(ang) * SEMI.projectileSpeed;
    s.img.setPosition(this.player.cx, this.player.cy).setVisible(true).setRotation(ang + Math.PI / 2);
    this.player.facing = Math.cos(ang) >= 0 ? 1 : -1;
    this.fireCd = 1 / SEMI.shotsPerSecond;
    this.clip--;
    Audio.play('shoot', 0.9 + Math.random() * 0.2);
    if (this.clip === 0) { this.reload = this.reloadTime; Audio.play('reload'); }
  }

  private throwCoffee(): void {
    const save = Save.get();
    const useNes = save.ammo.nescafe > 0 && (!!this.boss || save.ammo.maccoffee <= 0);
    const kind: 'maccoffee' | 'nescafe' | null = useNes ? 'nescafe' : save.ammo.maccoffee > 0 ? 'maccoffee' : null;
    if (!kind) { floatText(this, this.player.x, this.player.y - 26, '☕ 0', COLORS.red); Audio.play('empty'); return; }
    let target = this.aimPoint() ?? { x: this.player.x + this.player.facing * 60, y: this.player.cy };
    const dx = target.x - this.player.cx, dy = target.y - this.player.cy, d = Math.hypot(dx, dy);
    if (d > A.coffeeThrowRange) target = { x: this.player.cx + dx / d * A.coffeeThrowRange, y: this.player.cy + dy / d * A.coffeeThrowRange };
    Save.update((s) => { s.ammo[kind]--; });
    const img = this.add.image(this.player.cx, this.player.cy, `cup_${kind}`).setDepth(9700);
    this.cups.push({ img, sx: this.player.cx, sy: this.player.cy, tx: target.x, ty: target.y, t: 0, kind });
    Audio.play('throw');
  }

  private splash(c: Cup): void {
    const ammo = B.ammo[c.kind];
    const R = ammo.splashRadius * this.splashMult;
    const ring = this.add.circle(c.tx, c.ty, R, 0x733e39, 0.45).setDepth(9600);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.2, duration: 350, onComplete: () => ring.destroy() });
    const st = this.stains[this.stainIdx++ % this.stains.length];
    st.setPosition(c.tx, c.ty).setVisible(true).setScale(R / 10).setRotation(Math.random() * 6);
    Audio.play('splash');
    for (const p of this.papers) {
      if (!p.active) continue;
      if (Math.hypot(p.x - c.tx, p.y - c.ty) <= R + p.r) {
        p.soggy = ammo.soggy.seconds; p.soggyMult = ammo.soggy.speedMultiplier;
        this.damagePaper(p, ammo.damage);
      }
    }
    if (this.boss && Math.hypot(this.boss.x - c.tx, this.boss.y - c.ty) <= R + this.boss.r) {
      this.boss.soggy = ammo.soggy.seconds; this.boss.soggyMult = ammo.soggy.speedMultiplier;
      this.damageBoss(ammo.damage);
    }
    this.cameras.main.shake(80, 0.003);
  }

  private damagePaper(p: Paper, dmg: number): void {
    if (!p.active || p.spawnT > 0) return;
    const real = Math.min(dmg, p.hp);
    p.hp -= dmg;
    p.flash = 0.06;
    if ((p as Paper & { primary: boolean }).primary) this.destroyed += real;
    floatText(this, p.x, p.y - p.height / 2, `-${dmg}`, COLORS.text, 6);
    if (p.hp <= 0) {
      this.shredder.explode(p.maxHp >= 100 ? 16 : 7, p.x, p.y);
      Audio.play('tear', 0.8 + Math.random() * 0.4);
      this.kills++;
      const od = p.def.onDeath;
      const x = p.x, y = p.y;
      p.kill();
      if (od) for (let i = 0; i < od.count; i++) {
        const a = (i / od.count) * Math.PI * 2;
        this.spawnPaper(od.spawn, x + Math.cos(a) * 10, y + Math.sin(a) * 10, undefined, false)?.setScale(1);
      }
      if (Math.random() < A.dropChance) this.addPickup('maccoffee', x, y);
    } else Audio.play('hit');
  }

  private damageBoss(dmg: number): void {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    const real = Math.min(dmg, b.hp);
    b.hp -= dmg; this.destroyed += real; b.flash = 0.06;
    floatText(this, b.x + Phaser.Math.Between(-10, 10), b.y - b.r, `-${dmg}`, COLORS.accent, 7);
    Audio.play('hit', 0.7);
    if (b.kind === 'final_exam') {
      const tm = B.bosses.final_exam.timing;
      const f = b.hp / b.maxHp;
      if (b.phase === 1 && f < tm.phase2) { b.phase = 2; this.hud('toast', t('ui.extraSheets'), COLORS.red); this.cameras.main.shake(200, 0.006); }
      if (b.phase === 2 && f < tm.phase3) { b.phase = 3; b.img.setTint(0xffb0b0); this.cameras.main.shake(250, 0.008); Audio.play('boss', 1.3); }
    }
    if (b.hp <= 0) {
      this.shredder.explode(60, b.x, b.y);
      this.cameras.main.shake(400, 0.012);
      Audio.play('tear', 0.5);
      b.img.destroy(); b.shadow.destroy();
      this.boss = null;
      HudState.bossHp = 0;
      this.onCleared();
    }
  }

  damagePlayer(n: number, ignoreInvuln = false): void {
    if (this.ended || Debug.invulnerable) return;
    if (!ignoreInvuln && this.player.invuln > 0) return;
    if (this.shield > 0 && !ignoreInvuln) {
      this.shield--;
      this.player.invuln = B.player.hitInvulnerable;
      floatText(this, this.player.x, this.player.y - 28, t('ui.blocked'), COLORS.cyan);
      return;
    }
    this.sanity = Math.max(0, this.sanity - n);
    if (!ignoreInvuln) {
      this.player.invuln = B.player.hitInvulnerable;
      this.cameras.main.shake(120, 0.006);
      this.player.setTintFill(0xffffff);
      this.time.delayedCall(60, () => this.player.clearTint());
      Audio.play('hurt');
      floatText(this, this.player.x, this.player.y - 26, `−${n}%`, COLORS.red, 8);
      if (Math.random() < 0.25) this.bark('bark');
    }
    if (this.sanity <= 0) this.onFailed();
  }

  private enemyShot(x: number, y: number, ang: number, speed: number, dmg: number, tex: string): void {
    const s = this.enemyShots.find((q) => !q.active);
    if (!s) return;
    s.active = true; s.life = 6; s.dmg = dmg;
    s.vx = Math.cos(ang) * speed; s.vy = Math.sin(ang) * speed;
    s.img.setTexture(tex).setPosition(x, y).setVisible(true).setRotation(tex === 'staple' ? ang : 0);
  }

  private inDesk(x: number, y: number): boolean {
    for (const d of this.desks) if (x >= d.x && x <= d.x + d.w && y >= d.y - 4 && y <= d.y + d.h) return true;
    return false;
  }
  private outside(x: number, y: number): boolean {
    const b = this.bounds;
    return x < b.x - 4 || y < b.y - 12 || x > b.x + b.w + 4 || y > b.y + b.h + 4;
  }

  // ---------- assist, barks, hazards ----------

  private callProfessor(): void {
    if (this.assistUsed || this.ended) return;
    this.assistUsed = true;
    const a = this.prof.assist;
    if (a.id === 'time_dilation') this.frozen = Math.max(this.frozen, a.seconds ?? 8);
    else if (a.id === 'stress_detected') { this.sanity = Math.min(this.sanityMax, this.sanity + (a.heals ?? 40)); floatText(this, this.player.x, this.player.y - 28, `+${a.heals}`, COLORS.green, 8); }
    else if (a.id === 'isometry') this.isometry = a.seconds ?? 5;
    Audio.play('ding', 0.8);
    this.bark('assist');
    this.cameras.main.flash(150, 255, 255, 255);
  }

  private bark(kind: string): void {
    const l = oneLine(this.prof.id, kind);
    if (l) this.hud('bark', `${this.prof.displayName}${l.lang ? ` (${l.lang})` : ''}`, l.text);
  }

  private onCleared(): void {
    if (this.cleared || this.ended) return;
    this.cleared = true;
    Audio.play('win');
    this.hud('toast', t('ui.stageCleared'), COLORS.green);
    // Submission portal; at 23:58 the portal is down (503) for a few seconds.
    const x = this.bounds.x + this.bounds.w / 2, y = this.bounds.y + 6;
    const c = this.add.container(x, y).setDepth(9900);
    const box = this.add.rectangle(0, 0, 54, 18, 0x124e89).setStrokeStyle(1, 0x2ce8f5);
    const label = txt(this, 0, 0, t('ui.submit'), { size: 7, bold: true, origin: [0.5, 0.5] });
    c.add([box, label]);
    this.tweens.add({ targets: box, alpha: 0.6, yoyo: true, repeat: -1, duration: 400 });
    const down = this.deadline > 0 && this.deadline < A.portalDownBelowSeconds;
    this.exit = { img: c, x, y, lockedUntil: down ? this.time.now + B.hazards.portal_down.exitLockedSeconds * 1000 : 0 };
    if (down) { label.setText(B.hazards.portal_down.label).setColor(COLORS.red); box.setFillStyle(0x3a4466); this.hud('toast', t('ui.portalDown'), COLORS.red); }
    for (const p of this.papers) if (p.active) p.kill();
    for (const s of this.enemyShots) if (s.active) { s.active = false; s.img.setVisible(false); }
    if (Debug.autoSubmit) this.time.delayedCall(300, () => this.submit());
  }

  submit(): void {
    if (this.ended || !this.cleared) return;
    const onTime = this.deadline > 0;
    let score = clearedScore(this.sanity, this.sanityMax, onTime);
    if (this.attendanceMissed) score -= B.hazards.attendance_sheet.penaltyIfMissed;
    score = Math.max(0, score);
    this.finish({ cleared: true, score, late: !onTime, mercy: false });
  }

  private onFailed(): void {
    if (this.ended) return;
    const frac = this.destroyed / this.total;
    const mercy = hasMercyPass(this.course.id);
    const score = mercy ? B.scoring.mercyPassScore : failedScore(frac);
    Audio.play('buzz');
    this.cameras.main.shake(300, 0.01);
    this.finish({ cleared: false, score, late: false, mercy });
  }

  private finish(r: { cleared: boolean; score: number; late: boolean; mercy: boolean }): void {
    this.ended = true;
    Input.clear();
    const course = this.course.id;
    const result: StageResult = {
      courseId: course, stageIndex: this.stage.index, cleared: r.cleared, score: r.score, late: r.late, mercy: r.mercy,
      sanityLeft: Math.round(this.sanity), attendanceMissed: this.attendanceMissed, destroyedFraction: this.destroyed / this.total,
      retake: !r.cleared && !r.mercy,
    };
    // Achievement: Q.E.D. — finish Prof. Bezout's final with full Sanity.
    if (r.cleared && this.stage.boss === 'final_exam' && this.sanity >= this.sanityMax && this.prof.achievement.id === 'qed') {
      Save.update((s) => { if (!s.achievements.includes('qed')) s.achievements.push('qed'); });
      result.achievement = 'qed';
    }
    this.time.delayedCall(r.cleared ? 300 : 900, () => {
      this.scene.stop('HUD');
      this.scene.start('Results', result);
    });
  }

  // ---------- main loop ----------

  update(_t: number, dms: number): void {
    const dt = Math.min(0.05, dms / 1000);
    if (this.ended) return;
    this.elapsed += dt;
    const pl = this.player;

    pl.speedMult = this.eightAm ? B.hazards.eight_am.speedMultiplier : 1;
    pl.updateMove(dt);
    if (Input.consume('help')) this.callProfessor();
    if (Input.consume('coffee')) this.throwCoffee();
    Input.consume('interact');
    if (Input.keys.has('KeyR') && this.reload <= 0 && this.clip < this.clipMax) { this.reload = this.reloadTime; Audio.play('reload'); }
    this.fire(dt);

    // Deadline and the 23:59 wall.
    if (this.frozen > 0) this.frozen -= dt;
    else if (!this.cleared) this.deadline -= dt;
    if (this.deadline <= 0 && !this.late) { this.late = true; Audio.play('buzz'); this.hud('toast', t('ui.lateSubmission'), COLORS.red); }
    const df = 1 - Math.max(0, this.deadline) / this.stage.deadline;
    Audio.setSpeed(1 + 0.6 * Math.pow(Math.max(0, df - 0.5) * 2, 2));
    this.updateWall(dt);

    // Waves.
    if (!this.stage.boss && !this.cleared) {
      if (this.queue.length) {
        this.spawnCd -= dt;
        if (this.spawnCd <= 0) { const s = this.queue.shift()!; this.spawnPaper(s.type, undefined, undefined, s.hpOverride); this.spawnCd = A.spawnStaggerSeconds; }
      } else if (!this.papers.some((p) => p.active)) {
        this.wavePause -= dt;
        if (this.wavePause <= 0) { this.wavePause = A.wavePauseSeconds; this.nextWave(); }
      }
    }

    this.updatePapers(dt);
    this.updateBoss(dt);
    this.updateShots(dt);
    this.updateCups(dt);
    this.updatePickups();
    this.updateAttendance(dt);
    if (this.isometry > 0) this.isometry -= dt;

    // Mid-fight barks.
    this.barkCd -= dt;
    if (this.barkCd <= 0) { this.bark(Math.random() < 0.6 ? 'bark' : 'tip'); this.barkCd = Phaser.Math.Between(A.barkEverySeconds[0], A.barkEverySeconds[1]); }

    if (this.exit && Math.hypot(pl.x - this.exit.x, pl.y - 10 - this.exit.y) < 20) {
      if (this.time.now >= this.exit.lockedUntil) this.submit();
    } else if (this.exit && this.exit.lockedUntil && this.time.now >= this.exit.lockedUntil) {
      this.exit.lockedUntil = 0;
      const label = this.exit.img.list[1] as Phaser.GameObjects.Text;
      label.setText(t('ui.submit')).setColor(COLORS.text);
      (this.exit.img.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(0x124e89);
    }

    // HUD
    const save = Save.get();
    Object.assign(HudState, {
      mode: 'arena', sanity: this.sanity, sanityMax: this.sanityMax, deadline: this.deadline, frozen: this.frozen > 0,
      late: this.late, clip: this.clip, clipMax: this.clipMax, reloading: this.reload > 0, maccoffee: save.ammo.maccoffee,
      nescafe: save.ammo.nescafe, assistReady: !this.assistUsed, shield: this.shield,
      bossHp: this.boss ? this.boss.hp : 0, bossMax: this.boss ? this.boss.maxHp : 0,
    });
  }

  private updateWall(dt: number): void {
    const b = this.bounds;
    const frac = Math.max(0, this.deadline) / this.stage.deadline;
    let reach = -0.05;
    if (frac < A.wallStartsAt) reach = A.wallReachAtDeadline * (1 - frac / A.wallStartsAt);
    let target = b.x + b.w * reach;
    if (this.deadline <= 0) target = Math.min(b.x + b.w * A.wallMaxReach, this.wallX + A.wallLateSpeed * dt);
    if (this.frozen > 0 || this.cleared) target = this.wallX;
    this.wallX = this.deadline <= 0 ? target : Phaser.Math.Linear(this.wallX, target, 0.1);
    const g = this.wall;
    g.clear();
    if (this.wallX > b.x - 10) {
      g.fillStyle(this.frozen > 0 ? 0x2ce8f5 : 0xe43b44, 0.5).fillRect(0, b.y - 16, this.wallX, b.h + 32);
      g.fillStyle(this.frozen > 0 ? 0x2ce8f5 : 0xff0044, 1).fillRect(this.wallX - 3, b.y - 16, 3, b.h + 32);
      for (let y = b.y - 16; y < b.y + b.h + 16; y += 12) g.fillStyle(0xffffff, 0.25).fillRect(this.wallX - 12, y + ((this.elapsed * 30) % 12), 6, 2);
      this.wallLabel.setVisible(true).setPosition(this.wallX - 6, b.y + b.h / 2);
      if (this.player.x < this.wallX) {
        this.wallTick += dt;
        if (this.wallTick >= 0.2) { this.damagePlayer(Math.round(B.hazards.deadline_wall.touchDamagePerSecond * this.wallTick), true); this.wallTick = 0; this.cameras.main.shake(50, 0.003); }
        (this.player.body as Phaser.Physics.Arcade.Body).x += 40 * dt;
      }
    } else this.wallLabel.setVisible(false);
  }

  private updatePapers(dt: number): void {
    const pl = this.player;
    const px = pl.cx, py = pl.cy;
    const act = this.papers.filter((p) => p.active);
    const b = this.bounds;
    for (const p of act) {
      if (p.spawnT > 0) { p.spawnT -= dt; p.setScale(1 - Math.max(0, p.spawnT) / 0.35 * 0.8); continue; }
      if (p.soggy > 0) { p.soggy -= dt; if (p.soggy <= 0) p.soggyMult = 1; }
      const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) || 1;
      const sp = p.def.speed * p.soggyMult;
      let ang = Math.atan2(dy, dx);
      if (p.def.behaviour === 'swarm_chase') ang += Math.sin(this.elapsed * 3 + p.jitter) * 0.7;
      let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      // Separation so swarms spread out.
      for (const q of act) {
        if (q === p) continue;
        const sx = p.x - q.x, sy = p.y - q.y, sd = sx * sx + sy * sy, min = p.r + q.r;
        if (sd < min * min && sd > 0.01) { const k = (min - Math.sqrt(sd)) * 6; vx += sx * k / min; vy += sy * k / min; }
      }
      if (this.isometry > 0) {
        const ux = dx / d, uy = dy / d, toward = vx * ux + vy * uy;
        if (toward > 0) { vx -= toward * ux; vy -= toward * uy; }
      }
      p.x = Phaser.Math.Clamp(p.x + vx * dt, b.x + 4, b.x + b.w - 4);
      p.y = Phaser.Math.Clamp(p.y + vy * dt, b.y - 6, b.y + b.h - 4);
      p.setAngle(Math.sin(this.elapsed * 6 + p.jitter) * 8);
      if (p.def.behaviour === 'chase_and_shoot' && p.def.shot) {
        p.shotTimer -= dt;
        if (p.shotTimer <= 0 && d < 220) { p.shotTimer = p.def.shot.everySeconds; this.enemyShot(p.x, p.y, Math.atan2(dy, dx), p.def.shot.speed, p.def.shot.damage, 'staple'); }
      }
      if (d < p.r + 5) {
        this.damagePlayer(p.def.touchDamage);
        // Bounce off the student so paper never parks on top of them.
        const push = Math.min(22, 120 / Math.max(6, p.r));
        p.x = Phaser.Math.Clamp(p.x - dx / d * push, b.x + 4, b.x + b.w - 4);
        p.y = Phaser.Math.Clamp(p.y - dy / d * push, b.y - 6, b.y + b.h - 4);
      }
      if (p.flash > 0) { p.flash -= dt; p.setTintFill(0xffffff); } else if (p.soggy > 0) p.setTint(0xd7a070); else p.clearTint();
      p.setDepth(p.y + p.height / 2);
    }
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    const pl = this.player;
    if (b.soggy > 0) { b.soggy -= dt; if (b.soggy <= 0) b.soggyMult = 1; }
    const slow = b.soggyMult;
    b.timer -= dt * slow;
    const bd = this.bounds;
    if (b.kind === 'midterm_paper') {
      const tm = B.bosses.midterm_paper.timing;
      switch (b.state) {
        case 'idle':
          b.x += Math.cos(this.elapsed * 0.9) * 18 * dt; b.y += Math.sin(this.elapsed * 1.3) * 10 * dt;
          if (b.timer <= 0) {
            b.state = 'warn'; b.timer = tm.warn;
            b.img.setTexture(`midterm_plane_${this.skin}`);
            b.tx = pl.x; b.ty = pl.y - 8;
            b.shadow.setPosition(b.tx, b.ty + 8).setScale(3, 2).setAlpha(0.6);
            this.tweens.add({ targets: b.img, y: b.y - 30, alpha: 0.7, duration: tm.warn * 900 });
            Audio.play('dive');
          }
          break;
        case 'warn':
          b.shadow.setScale(3 + Math.sin(this.elapsed * 20) * 0.3, 2);
          if (b.timer <= 0) { b.state = 'dive'; b.timer = tm.dive; b.sx = b.x; b.sy = b.y; }
          break;
        case 'dive': {
          const k = 1 - Math.max(0, b.timer) / tm.dive;
          b.x = Phaser.Math.Linear(b.sx, b.tx, k); b.y = Phaser.Math.Linear(b.sy, b.ty, k);
          if (b.timer <= 0) {
            b.state = 'idle'; b.timer = tm.idle;
            b.img.setTexture(`midterm_paper_${this.skin}`).setAlpha(1);
            this.cameras.main.shake(160, 0.008);
            if (Math.hypot(pl.cx - b.x, pl.cy - b.y) < 26) this.damagePlayer(B.bosses.midterm_paper.touchDamage);
            const L = ['A', 'B', 'C', 'D'];
            for (let i = 0; i < tm.ringBubbles; i++) {
              const a = (i / tm.ringBubbles) * Math.PI * 2 + Math.random() * 0.3;
              this.enemyShot(b.x, b.y, a, B.bosses.midterm_paper.bubble.speed, B.bosses.midterm_paper.bubble.damage, `bubble_${L[i % 4]}`);
            }
          }
          break;
        }
      }
      if (b.state !== 'dive' && b.state !== 'warn') this.tweens.killTweensOf(b.img);
    } else {
      const tm = B.bosses.final_exam.timing;
      const rp = B.bosses.final_exam.redPenMark;
      const fast = b.phase === 3 ? tm.phase3SpeedUp : 1;
      b.fireTimer -= dt * slow;
      if (b.fireTimer <= 0) {
        b.fireTimer = tm.spiralEvery / fast;
        for (let k = 0; k < tm.arms; k++) this.enemyShot(b.x, b.y + 4, b.angle + (k / tm.arms) * Math.PI * 2, rp.speed * fast, rp.damage, 'redpen');
        b.angle += tm.spiralStep;
      }
      if (b.phase >= 2) {
        b.summonTimer -= dt;
        if (b.summonTimer <= 0) {
          b.summonTimer = tm.summonEvery;
          for (let i = 0; i < tm.summonCount; i++) this.spawnPaper('loose_page', b.x + Phaser.Math.Between(-30, 30), b.y + Phaser.Math.Between(10, 30), undefined, false);
          this.hud('toast', t('ui.extraSheets'), COLORS.red);
          Audio.play('ding', 0.7);
        }
      }
      if (b.phase === 3) {
        const dx = pl.cx - b.x, dy = pl.cy - b.y, d = Math.hypot(dx, dy) || 1;
        b.x += dx / d * tm.driftSpeed * slow * dt; b.y += dy / d * tm.driftSpeed * slow * dt;
      } else { b.x += Math.cos(this.elapsed * 0.6) * 12 * dt; }
      if (Math.hypot(pl.cx - b.x, pl.cy - b.y) < b.r + 6) this.damagePlayer(B.bosses.final_exam.touchDamage);
    }
    b.x = Phaser.Math.Clamp(b.x, bd.x + 20, bd.x + bd.w - 20);
    b.y = Phaser.Math.Clamp(b.y, bd.y + 10, bd.y + bd.h - 20);
    if (b.state !== 'warn') b.img.setPosition(b.x, b.y);
    else b.img.x = Phaser.Math.Linear(b.img.x, b.tx, 0.02);
    if (b.state !== 'warn') b.shadow.setPosition(b.x, b.y + b.r + 4).setAlpha(0.3);
    b.img.setDepth(b.y + b.r);
    if (b.flash > 0) { b.flash -= dt; b.img.setTintFill(0xffffff); }
    else if (b.phase === 3) b.img.setTint(0xffb0b0);
    else if (b.soggy > 0) b.img.setTint(0xd7a070);
    else b.img.clearTint();
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.active) continue;
      s.life -= dt;
      const ox = s.img.x, oy = s.img.y;
      const x = ox + s.vx * dt, y = oy + s.vy * dt;
      s.img.setPosition(x, y);
      // Bosses tower over the desks: in boss stages semicolons fly over them (desks still shield the player).
      if (s.life <= 0 || this.outside(x, y) || (!this.boss && this.inDesk(x, y))) { s.active = false; s.img.setVisible(false); continue; }
      // Swept test along this frame's path, so papers right on top of the player still get hit.
      const sx = x - ox, sy = y - oy, len2 = sx * sx + sy * sy || 1;
      const segDist = (cx: number, cy: number) => {
        const k = Phaser.Math.Clamp(((cx - ox) * sx + (cy - oy) * sy) / len2, 0, 1);
        return Math.hypot(ox + sx * k - cx, oy + sy * k - cy);
      };
      let hit = false;
      for (const p of this.papers) {
        if (!p.active || p.spawnT > 0) continue;
        if (segDist(p.x, p.y) < p.r + 3) { this.damagePaper(p, s.dmg); hit = true; break; }
      }
      const b = this.boss;
      if (!hit && b && b.state !== 'warn' && b.state !== 'dive' && segDist(b.x, b.y) < b.r + 3) { this.damageBoss(s.dmg); hit = true; }
      if (hit) { s.active = false; s.img.setVisible(false); }
    }
    const pl = this.player;
    for (const s of this.enemyShots) {
      if (!s.active) continue;
      s.life -= dt;
      const x = s.img.x + s.vx * dt, y = s.img.y + s.vy * dt;
      s.img.setPosition(x, y);
      // Shots launched from above a desk (boss) get a moment to clear it before desks count as cover.
      if (s.life <= 0 || this.outside(x, y) || (s.life < 5.7 && this.inDesk(x, y))) { s.active = false; s.img.setVisible(false); continue; }
      if (Math.abs(pl.cx - x) < 6 && Math.abs(pl.cy - y) < 9) {
        if (pl.invuln <= 0 || this.shield > 0) { this.damagePlayer(s.dmg); s.active = false; s.img.setVisible(false); }
      }
    }
  }

  private updateCups(dt: number): void {
    const fl = A.coffeeFlightSeconds;
    this.cups = this.cups.filter((c) => {
      c.t += dt;
      const k = Math.min(1, c.t / fl);
      const arc = Math.sin(k * Math.PI) * 24;
      c.img.setPosition(Phaser.Math.Linear(c.sx, c.tx, k), Phaser.Math.Linear(c.sy, c.ty, k) - arc).setRotation(k * 8);
      if (k >= 1) { this.splash(c); c.img.destroy(); return false; }
      return true;
    });
  }

  private updatePickups(): void {
    const pl = this.player;
    this.pickups = this.pickups.filter((p) => {
      if (Math.hypot(p.img.x - pl.x, p.img.y - (pl.y - 8)) > 14) return true;
      const save = Save.get();
      if (p.type === 'maccoffee' || p.type === 'nescafe') {
        const max = B.ammo[p.type].maxCarry;
        if (save.ammo[p.type] >= max) return true;
        Save.update((s) => { s.ammo[p.type as 'maccoffee'] = Math.min(max, s.ammo[p.type as 'maccoffee'] + 1); s.firstCoffee = true; });
        if (this.eightAm) { this.eightAm = false; }
        Audio.play('sachet');
        floatText(this, p.img.x, p.img.y - 8, t('ui.pickupCoffee', { name: B.ammo[p.type].displayName }), COLORS.accent);
      } else if (p.type === 'canteen_food') {
        if (this.sanity >= this.sanityMax) return true;
        this.sanity = Math.min(this.sanityMax, this.sanity + B.pickups.canteen_food.heals);
        Audio.play('pickup');
        floatText(this, p.img.x, p.img.y - 8, t('ui.pickupFood', { n: B.pickups.canteen_food.heals }), COLORS.green);
      } else if (p.type === 'deadline_extension') {
        this.frozen = Math.max(this.frozen, B.pickups.deadline_extension.freezeSeconds);
        Audio.play('pickup', 1.3);
        floatText(this, p.img.x, p.img.y - 8, t('ui.pickupExtension'), COLORS.cyan);
      } else if (p.type === 'feynman_lectures') {
        this.shield += B.pickups.feynman_lectures.blocksHits;
        Audio.play('pickup', 0.8);
        floatText(this, p.img.x, p.img.y - 8, t('ui.feynman'), COLORS.red);
      }
      this.tweens.killTweensOf(p.img);
      p.img.destroy();
      return false;
    });
  }

  private updateAttendance(dt: number): void {
    const h = B.hazards.attendance_sheet;
    if (this.attendanceAt > 0 && this.stage.deadline - this.deadline >= this.attendanceAt && !this.attendance && !this.cleared) {
      this.attendanceAt = -1;
      const b = this.bounds;
      const img = this.add.image(b.x + 20, b.y + 30 + Math.random() * (b.h - 60), 'attendance').setDepth(9400);
      this.attendance = { img, t: h.secondsOnScreen, vx: (b.w - 40) / h.secondsOnScreen, vy: 0 };
      this.hud('toast', t('ui.attendance'), COLORS.accent);
      Audio.play('ding', 1.2);
    }
    const a = this.attendance;
    if (!a) return;
    a.t -= dt;
    a.img.x += a.vx * dt;
    a.img.y += Math.sin(this.elapsed * 2) * 12 * dt;
    a.img.setAngle(Math.sin(this.elapsed * 3) * 10);
    if (Math.hypot(a.img.x - this.player.x, a.img.y - (this.player.y - 10)) < 14) {
      Audio.play('pickup', 1.5);
      floatText(this, a.img.x, a.img.y - 8, '✓', COLORS.green, 10);
      a.img.destroy(); this.attendance = null;
    } else if (a.t <= 0) {
      this.attendanceMissed = true;
      this.hud('toast', t('ui.missedAttendance'), COLORS.red);
      a.img.destroy(); this.attendance = null;
    }
  }

  // ---------- debug helpers (used by tests) ----------
  debugSpawn(kind: string, n: number): void { for (let i = 0; i < n; i++) this.spawnPaper(kind); }
  debugKillAll(): void {
    for (const p of this.papers) if (p.active) this.damagePaper(p, 99999);
    for (const p of this.papers) if (p.active) this.damagePaper(p, 99999);
    this.queue.forEach((s) => { this.destroyed += hpOf(s); });
    this.queue = [];
    if (!this.stage.boss) {
      for (let i = this.waveIdx + 1; i < this.stage.waves.length; i++) this.stage.waves[i].forEach((s) => { this.destroyed += hpOf(s); });
      this.waveIdx = this.stage.waves.length - 1;
      this.onCleared();
    }
    if (this.boss) this.damageBoss(this.boss.hp);
  }
  activeEnemies(): number { return this.papers.filter((p) => p.active).length + (this.boss ? 1 : 0); }
}
