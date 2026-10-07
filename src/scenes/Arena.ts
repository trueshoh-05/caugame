import Phaser from 'phaser';
import { balance, getCourse, getProfessor, rooms, type Course, type Professor, type Room } from '../systems/Data';
import { coursePercent } from '../systems/Grades';
import { oneLine } from '../systems/Dialog';
import { Save } from '../systems/Save';
import { t } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { Debug } from '../debug';
import { Core } from '../core/Core';
import type { WasmArena, WasmArenaState, WasmEvent, WasmStagePlan } from '../core/cau_core';
import { paintRoom, deskTexture } from '../art/rooms';
import { COLORS, floatText, setupCamera, txt } from '../ui';
import { HudState } from './HUD';
import type { StageResult } from './Results';

const B = balance;
const TS = 16;
const PAPER_STRIDE = 10;
const SHOT_STRIDE = 5;
const ESHOT_TEX = ['staple', 'redpen', 'bubble_A', 'bubble_B', 'bubble_C', 'bubble_D'];
const TONES = [COLORS.text, COLORS.accent, COLORS.red, COLORS.green, COLORS.cyan, COLORS.dim];
const PICKUP_TEX: Record<string, string> = { maccoffee: 'sachet_maccoffee', nescafe: 'sachet_nescafe', canteen_food: 'food', deadline_extension: 'extension', feynman_lectures: 'feynman' };

export interface ArenaData { courseId: string; stageIndex: number }

/**
 * One stage of a course. The fight itself runs in the C++ core (cpp/src/arena.cpp, compiled
 * to WebAssembly): this scene sends it input, draws the state it reports, and turns its
 * events into sound, particles and text.
 */
export class ArenaScene extends Phaser.Scene {
  course!: Course;
  prof!: Professor;
  room!: Room;
  plan!: WasmStagePlan;
  skin = 'code';
  sim!: WasmArena;
  st!: WasmArenaState;
  kinds: string[] = [];

  private playerImg!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private walkT = 0;
  private paperImgs: Phaser.GameObjects.Image[] = [];
  private shotImgs: Phaser.GameObjects.Image[] = [];
  private eshotImgs: Phaser.GameObjects.Image[] = [];
  private cupImgs: Phaser.GameObjects.Image[] = [];
  private pickupImgs = new Map<number, Phaser.GameObjects.Image>();
  private stains: Phaser.GameObjects.Image[] = [];
  private stainIdx = 0;
  private shredder!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wall!: Phaser.GameObjects.Graphics;
  private wallLabel!: Phaser.GameObjects.Text;
  private bossImg: Phaser.GameObjects.Image | null = null;
  private bossShadow: Phaser.GameObjects.Image | null = null;
  private exit: { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } | null = null;
  private attendanceImg: Phaser.GameObjects.Image | null = null;
  private desks: { x: number; y: number; w: number; h: number }[] = [];
  private finished = false;
  private lastAmmo = '';

  constructor() { super('Arena'); }

  init(d: ArenaData): void {
    this.course = getCourse(d.courseId);
    this.prof = getProfessor(this.course.professor);
    this.room = rooms[this.course.arena];
    this.plan = Core.core!.stage(d.courseId, d.stageIndex);
    this.skin = this.course.skin;
  }

  create(): void {
    setupCamera(this);
    Input.clear();
    this.paperImgs = []; this.shotImgs = []; this.eshotImgs = []; this.cupImgs = []; this.pickupImgs.clear();
    this.stains = []; this.stainIdx = 0; this.bossImg = null; this.bossShadow = null; this.exit = null;
    this.attendanceImg = null; this.desks = []; this.finished = false; this.lastAmmo = '';

    const save = Save.get();
    this.sim = new Core.module!.Arena(Core.core!, {
      courseId: this.course.id, stageIndex: this.plan.index, upgrades: save.upgrades, firstCoffee: save.firstCoffee,
      lunch: save.lunch, maccoffee: save.ammo.maccoffee, nescafe: save.ammo.nescafe, seed: Math.floor(Math.random() * 2 ** 31) + 1,
    });
    if (save.lunch) Save.update((s) => { s.lunch = false; });
    this.kinds = Core.module!.enemyKinds(Core.core!);
    for (const k of this.kinds) {
      const tex = this.textures.get(`${k}_${this.skin}`).getSourceImage();
      this.sim.setSpriteSize(k, tex.width, tex.height);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.sim.delete(); });

    // Room and desks (drawing only: the core does the collisions).
    this.add.image(0, 0, paintRoom(this, this.room, save.upgrades.includes('dark_mode'))).setOrigin(0, 0).setDepth(-100);
    for (const [x, y, w, h] of this.room.desks) {
      const r = { x: x * TS, y: y * TS, w: w * TS, h: h * TS };
      this.desks.push(r);
      this.add.image(r.x, r.y - 2, deskTexture(this, w, h, this.room.floor)).setOrigin(0, 0).setDepth(r.y + r.h);
    }

    this.playerShadow = this.add.image(0, 0, 'shadow').setAlpha(0.3).setOrigin(0.5, 0.6);
    this.playerImg = this.add.image(0, 0, 'player_0').setOrigin(0.5, 1);
    for (let i = 0; i < this.sim.papers().length / PAPER_STRIDE; i++) this.paperImgs.push(this.add.image(-50, -50, 'quiz_code').setVisible(false));
    for (let i = 0; i < this.sim.shots().length / SHOT_STRIDE; i++) this.shotImgs.push(this.add.image(-50, -50, 'semicolon').setVisible(false).setDepth(9000));
    for (let i = 0; i < this.sim.enemyShots().length / SHOT_STRIDE; i++) this.eshotImgs.push(this.add.image(-50, -50, 'staple').setVisible(false).setDepth(9001));
    for (let i = 0; i < B.arena.maxStains; i++) this.stains.push(this.add.image(-50, -50, 'stain').setVisible(false).setDepth(-50).setAlpha(0.6));
    this.shredder = this.add.particles(0, 0, 'shred', {
      speed: { min: 30, max: 110 }, angle: { min: 0, max: 360 }, lifespan: 500, scale: { start: 1, end: 0.4 },
      alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 120, emitting: false,
    }).setDepth(9500);
    this.wall = this.add.graphics().setDepth(9800);
    this.wallLabel = txt(this, 0, 0, B.hazards.deadline_wall.label, { size: 10, bold: true, color: '#ffffff' }).setDepth(9801).setOrigin(1, 0.5).setVisible(false);

    this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    HudState.mode = 'arena';
    HudState.title = `${this.course.id}.cpp`;
    const sofar = coursePercent(this.course.id, save.progress[this.course.id] ?? []);
    HudState.grade = `${t('questCard.components.' + this.plan.type)} ${this.plan.weight}% · ${this.plan.index + 1}/${this.course.components.length}\n${t('ui.grade')}: ${sofar}%`;
    HudState.deadlineMax = this.plan.deadline;
    HudState.bossMax = 0; HudState.bossHp = 0;
    HudState.assistName = this.prof.assist.name;
    HudState.interact = '';
    Audio.music(this.plan.boss === 'final_exam' ? 'final' : this.plan.boss ? 'midterm' : 'stage');

    this.st = this.sim.state();
    this.handleEvents(this.sim.events());  // pickups and the boss placed at creation
    this.render();
    this.time.delayedCall(200, () => {
      this.hud('toast', `${t(`questCard.components.${this.plan.type}`)} · ${this.plan.weight}%`, COLORS.accent);
      if (this.st.eightAm) this.time.delayedCall(1600, () => this.hud('toast', t('ui.eightAm'), COLORS.cyan));
    });
    Debug.scene = this;
  }

  private hud(ev: string, ...args: unknown[]): void { this.scene.get('HUD')?.events.emit(ev, ...args); }

  // ---------------------------------------------------------------- loop

  update(_t: number, dms: number): void {
    if (this.finished) return;
    const dt = Math.min(0.05, dms / 1000);
    const mv = Input.move();
    this.sim.setInvulnerable(Debug.invulnerable);
    this.sim.setAutoSubmit(Debug.autoSubmit);
    this.sim.step(dt, {
      moveX: mv.x, moveY: mv.y,
      fireHeld: Input.enabled && Input.fireHeld, hasAim: !Input.touchMode, aimX: Input.aim.x, aimY: Input.aim.y,
      autoAim: Input.touchMode || Debug.autoAim,
      coffee: Input.consume('coffee'), dash: Input.consume('dash'), help: Input.consume('help'),
      reload: Input.keys.has('KeyR'),
    });
    Input.consume('interact');
    this.st = this.sim.state();
    this.handleEvents(this.sim.events());
    this.render();
  }

  private render(): void {
    const s = this.st;
    // Player.
    const moving = Math.hypot(s.vx, s.vy) > 5;
    if (moving) { this.walkT += this.game.loop.delta / 1000; this.playerImg.setTexture(Math.floor(this.walkT * 8) % 2 ? 'player_1' : 'player_0'); }
    else this.playerImg.setTexture('player_0');
    this.playerImg.setPosition(s.x, s.y).setFlipX(s.facing < 0).setDepth(s.y)
      .setAlpha(s.dashing ? 0.6 : s.invuln > 0 ? (Math.floor(s.invuln * 20) % 2 ? 0.4 : 1) : 1);
    this.playerShadow.setPosition(s.x, s.y).setDepth(s.y - 1);

    // Papers.
    const pb = this.sim.papers();
    for (let i = 0; i < this.paperImgs.length; i++) {
      const o = i * PAPER_STRIDE, img = this.paperImgs[i];
      if (!pb[o]) { if (img.visible) img.setVisible(false); continue; }
      const key = `${this.kinds[pb[o + 1]]}_${this.skin}`;
      if (img.texture.key !== key) img.setTexture(key);
      img.setVisible(true).setPosition(pb[o + 2], pb[o + 3]).setAngle(pb[o + 4]).setScale(pb[o + 5]).setDepth(pb[o + 3] + img.height / 2);
      if (pb[o + 6]) img.setTintFill(0xffffff); else if (pb[o + 7]) img.setTint(0xd7a070); else img.clearTint();
    }
    // Shots.
    const sb = this.sim.shots();
    for (let i = 0; i < this.shotImgs.length; i++) {
      const o = i * SHOT_STRIDE, img = this.shotImgs[i];
      if (!sb[o]) { if (img.visible) img.setVisible(false); continue; }
      img.setVisible(true).setPosition(sb[o + 2], sb[o + 3]).setRotation(sb[o + 4] + Math.PI / 2);
    }
    const eb = this.sim.enemyShots();
    for (let i = 0; i < this.eshotImgs.length; i++) {
      const o = i * SHOT_STRIDE, img = this.eshotImgs[i];
      if (!eb[o]) { if (img.visible) img.setVisible(false); continue; }
      const tex = ESHOT_TEX[eb[o + 1]];
      if (img.texture.key !== tex) img.setTexture(tex);
      img.setVisible(true).setPosition(eb[o + 2], eb[o + 3]).setRotation(tex === 'staple' ? eb[o + 4] : 0);
    }
    // Coffee in flight.
    const cups = this.sim.cups();
    const fl = B.arena.coffeeFlightSeconds;
    while (this.cupImgs.length < cups.length) this.cupImgs.push(this.add.image(0, 0, 'cup_maccoffee').setDepth(9700));
    this.cupImgs.forEach((img, i) => {
      const c = cups[i];
      if (!c) { img.setVisible(false); return; }
      const k = Math.min(1, c.t / fl);
      img.setTexture(`cup_${c.kind}`).setVisible(true).setRotation(k * 8)
        .setPosition(Phaser.Math.Linear(c.sx, c.tx, k), Phaser.Math.Linear(c.sy, c.ty, k) - Math.sin(k * Math.PI) * 24);
    });
    // Boss.
    const b = s.boss;
    if (b && this.bossImg && this.bossShadow) {
      if (b.state === 'warn') this.bossImg.x = Phaser.Math.Linear(this.bossImg.x, b.tx, 0.02);
      else {
        this.bossImg.setPosition(b.x, b.y);
        this.bossShadow.setPosition(b.x, b.y + b.r + 4).setAlpha(0.3).setScale(3, 2);
      }
      this.bossImg.setDepth(b.y + b.r);
      if (b.flash) this.bossImg.setTintFill(0xffffff);
      else if (b.phase === 3) this.bossImg.setTint(0xffb0b0);
      else if (b.soggy) this.bossImg.setTint(0xd7a070);
      else this.bossImg.clearTint();
      if (b.state === 'warn') this.bossShadow.setScale(3 + Math.sin(s.elapsed * 20) * 0.3, 2);
    }
    // Attendance sheet.
    if (this.attendanceImg && s.attendance) this.attendanceImg.setPosition(s.attendanceX, s.attendanceY).setAngle(Math.sin(s.elapsed * 3) * 10);
    this.drawWall();

    // HUD, music, save.
    Object.assign(HudState, {
      mode: 'arena', sanity: s.sanity, sanityMax: s.sanityMax, deadline: s.deadline, frozen: s.frozen, late: s.late,
      clip: s.clip, clipMax: s.clipMax, reloading: s.reloading, maccoffee: s.maccoffee, nescafe: s.nescafe,
      assistReady: s.assistReady, shield: s.shield, bossHp: b ? b.hp : 0, bossMax: b ? b.max : 0,
    });
    const df = 1 - Math.max(0, s.deadline) / s.deadlineMax;
    Audio.setSpeed(1 + 0.6 * Math.pow(Math.max(0, df - 0.5) * 2, 2));
    const ammo = `${s.maccoffee},${s.nescafe},${s.firstCoffeeTaken}`;
    if (ammo !== this.lastAmmo) {
      this.lastAmmo = ammo;
      Save.update((d) => { d.ammo.maccoffee = s.maccoffee; d.ammo.nescafe = s.nescafe; if (s.firstCoffeeTaken) d.firstCoffee = true; });
    }
  }

  private drawWall(): void {
    const s = this.st, b = s.bounds, g = this.wall;
    g.clear();
    if (s.wallX <= b.x - 10) { this.wallLabel.setVisible(false); return; }
    g.fillStyle(s.frozen ? 0x2ce8f5 : 0xe43b44, 0.5).fillRect(0, b.y - 16, s.wallX, b.h + 32);
    g.fillStyle(s.frozen ? 0x2ce8f5 : 0xff0044, 1).fillRect(s.wallX - 3, b.y - 16, 3, b.h + 32);
    for (let y = b.y - 16; y < b.y + b.h + 16; y += 12) g.fillStyle(0xffffff, 0.25).fillRect(s.wallX - 12, y + ((s.elapsed * 30) % 12), 6, 2);
    this.wallLabel.setVisible(true).setPosition(s.wallX - 6, b.y + b.h / 2);
  }

  // ---------------------------------------------------------------- events from the core

  private handleEvents(evs: WasmEvent[]): void {
    for (const e of evs) {
      switch (e.type) {
        case 'sfx': Audio.play(e.key, e.a || 1); break;
        case 'float': floatText(this, e.x, e.y, this.floatLabel(e), TONES[e.tone], e.a || 7); break;
        case 'shake': this.cameras.main.shake(e.a, e.b); break;
        case 'flash': this.cameras.main.flash(150, 255, 255, 255); break;
        case 'toast': this.hud('toast', t(e.key, { n: e.a, total: e.b }), TONES[e.tone]); break;
        case 'bark': this.bark(e.key); break;
        case 'shred': this.shredder.explode(e.a, e.x, e.y); break;
        case 'splash': {
          const ring = this.add.circle(e.x, e.y, e.a, 0x733e39, 0.45).setDepth(9600);
          this.tweens.add({ targets: ring, alpha: 0, scale: 1.2, duration: 350, onComplete: () => ring.destroy() });
          const st = this.stains[this.stainIdx++ % this.stains.length];
          st.setPosition(e.x, e.y).setVisible(true).setScale(e.a / 10).setRotation(Math.random() * 6);
          break;
        }
        case 'pickupSpawn': {
          const img = this.add.image(e.x, e.y, PICKUP_TEX[e.key] ?? 'food').setDepth(e.y);
          this.tweens.add({ targets: img, y: e.y - 3, yoyo: true, repeat: -1, duration: 500 });
          this.pickupImgs.set(e.a, img);
          break;
        }
        case 'pickupTaken': {
          const img = this.pickupImgs.get(e.a);
          if (img) { this.tweens.killTweensOf(img); img.destroy(); this.pickupImgs.delete(e.a); }
          break;
        }
        case 'teammates':
          for (let i = 0; i < e.a; i++) {
            const x = e.x + i * 30, y = e.y;
            this.add.image(x, y, 'student').setOrigin(0.5, 1).setDepth(y).setTint([0xffffff, 0xb0e0ff, 0xffd0d0][i % 3]);
            const dots = txt(this, x, y - 26, '...', { size: 7, color: '#ffffff', origin: [0.5, 1] }).setDepth(9999);
            this.tweens.add({ targets: dots, alpha: 0.2, yoyo: true, repeat: -1, duration: 700 + i * 100 });
          }
          break;
        case 'bossSpawn':
          this.bossImg = this.add.image(e.x, e.y, `${e.key}_${this.skin}`).setDepth(e.y + 30).setScale(0.3);
          this.bossShadow = this.add.image(e.x, e.y + 30, 'shadow').setScale(3, 2).setAlpha(0.35).setDepth(-40);
          this.tweens.add({ targets: this.bossImg, scale: 1, duration: 600, ease: 'Back.easeOut' });
          HudState.bossName = `${t(`enemies.${e.key}`)} — ${t('ui.boss')}`;
          break;
        case 'bossTexture':
          if (!this.bossImg) break;
          this.tweens.killTweensOf(this.bossImg);
          if (e.key === 'plane') {
            this.bossImg.setTexture(`midterm_plane_${this.skin}`).setScale(1);
            this.tweens.add({ targets: this.bossImg, y: this.bossImg.y - 30, alpha: 0.7, duration: B.bosses.midterm_paper.timing.warn * 900 });
          } else this.bossImg.setTexture(`midterm_paper_${this.skin}`).setAlpha(1).setScale(1);
          break;
        case 'bossWarn': this.bossShadow?.setPosition(e.x, e.y).setScale(3, 2).setAlpha(0.6); break;
        case 'bossDead':
          this.bossImg?.destroy(); this.bossShadow?.destroy();
          this.bossImg = null; this.bossShadow = null;
          HudState.bossHp = 0;
          break;
        case 'cleared': {
          const c = this.add.container(e.x, e.y).setDepth(9900);
          const box = this.add.rectangle(0, 0, 54, 18, 0x124e89).setStrokeStyle(1, 0x2ce8f5);
          const label = txt(this, 0, 0, t('ui.submit'), { size: 7, bold: true, origin: [0.5, 0.5] });
          c.add([box, label]);
          this.tweens.add({ targets: box, alpha: 0.6, yoyo: true, repeat: -1, duration: 400 });
          if (e.a) { label.setText(B.hazards.portal_down.label).setColor(COLORS.red); box.setFillStyle(0x3a4466); }
          this.exit = { box, label };
          break;
        }
        case 'portalUp': this.exit?.label.setText(t('ui.submit')).setColor(COLORS.text); this.exit?.box.setFillStyle(0x124e89); break;
        case 'attendanceSpawn': this.attendanceImg = this.add.image(e.x, e.y, 'attendance').setDepth(9400); break;
        case 'attendanceTaken': case 'attendanceMissed': this.attendanceImg?.destroy(); this.attendanceImg = null; break;
        case 'ended': this.finish(); break;
        default: break;
      }
    }
  }

  private floatLabel(e: WasmEvent): string {
    if (!e.key.startsWith('@')) return e.key;
    const [key, param] = e.key.slice(1).split('|');
    const name = param ? (B.ammo as unknown as Record<string, { displayName: string }>)[param]?.displayName ?? param : '';
    return t(key, { n: e.b, name });
  }

  private bark(kind: string): void {
    const l = oneLine(this.prof.id, kind);
    if (l) this.hud('bark', `${this.prof.displayName}${l.lang ? ` (${l.lang})` : ''}`, l.text);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    Input.clear();
    const r = this.sim.result();
    const result: StageResult = {
      courseId: this.course.id, stageIndex: this.plan.index, cleared: r.cleared, score: r.score, late: r.late, mercy: r.mercy,
      sanityLeft: r.sanityLeft, attendanceMissed: r.attendanceMissed, destroyedFraction: r.destroyedFraction, retake: r.retake,
    };
    if (r.achievement) {
      Save.update((s) => { if (!s.achievements.includes(r.achievement!)) s.achievements.push(r.achievement!); });
      result.achievement = r.achievement;
    }
    this.time.delayedCall(r.cleared ? 300 : 900, () => {
      this.scene.stop('HUD');
      this.scene.start('Results', result);
    });
  }

  // ---------------------------------------------------------------- debug handle (tests, scorer)

  get player(): { x: number; y: number } { return { x: this.st.x, y: this.st.y }; }
  teleport(x: number, y: number): void { this.sim.debugTeleport(x, y); this.st = this.sim.state(); }
  get stage(): { index: number; type: string; hpBudget: number } { return this.plan; }
  get total(): number { return this.st.total; }
  get destroyed(): number { return this.st.destroyed; }
  get cleared(): boolean { return this.st.cleared; }
  get deadline(): number { return this.st.deadline; }
  get sanity(): number { return this.st.sanity; }
  set sanity(v: number) { this.sim.debugSetSanity(v); this.st = this.sim.state(); }
  get clip(): number { return this.st.clip; }
  set clip(v: number) { this.sim.debugSetClip(v); this.st = this.sim.state(); }
  set reload(_v: number) { /* setting clip also clears the reload */ }
  get boss(): { hp: number; maxHp: number; phase: number; state: string } | null {
    const b = this.st.boss;
    return b ? { hp: b.hp, maxHp: b.max, phase: b.phase, state: b.state } : null;
  }
  get papers(): { active: boolean; soggy: number; x: number; y: number }[] {
    const pb = this.sim.papers();
    const out: { active: boolean; soggy: number; x: number; y: number }[] = [];
    for (let o = 0; o < pb.length; o += PAPER_STRIDE) out.push({ active: !!pb[o], soggy: pb[o + 7], x: pb[o + 2], y: pb[o + 3] });
    return out;
  }
  inDesk(x: number, y: number): boolean { return this.desks.some((d) => x >= d.x && x <= d.x + d.w && y >= d.y - 4 && y <= d.y + d.h); }
  activeEnemies(): number { return this.sim.activeEnemies(); }
  debugSpawn(kind: string, n: number): void { this.sim.debugSpawn(kind, n); }
  debugKillAll(): void { this.sim.debugKillAll(); }
  damagePlayer(n: number): void { this.sim.debugDamagePlayer(n); }
  submit(): void { this.sim.submit(); }
}
