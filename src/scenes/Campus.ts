import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { balance, campus, courses, courseForArena, getCourse, getProfessor, rooms } from '../systems/Data';
import { buildCampus, charAt, type BuiltMap } from '../systems/MapBuilder';
import { professorLines, oneLine } from '../systems/Dialog';
import { Save } from '../systems/Save';
import { t, raw } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { Debug } from '../debug';
import { Analytics } from '../systems/Analytics';
import { COLORS, RENDER_SCALE, floatText, txt } from '../ui';
import { HudState } from './HUD';
import type { DialogData } from './Dialog';

const T = campus.tileSize;

interface Interactable { x: number; y: number; label: string; act: () => void; r?: number }

export class CampusScene extends Phaser.Scene {
  player!: Player;
  map!: BuiltMap;
  private interactables: Interactable[] = [];
  private markers: Map<string, Phaser.GameObjects.Text> = new Map();
  private planOverlay?: Phaser.GameObjects.Image;
  private aboveImg!: Phaser.GameObjects.Image;
  private busy = false;
  private coffeeCooldown: Record<string, number> = {};
  private lastDoorMsg = 0;

  constructor() { super('Campus'); }

  create(): void {
    this.busy = false;
    this.interactables = [];
    this.markers.clear();
    Input.clear();
    Audio.music('campus');
    this.map = buildCampus(this);
    this.add.image(0, 0, this.map.ground).setOrigin(0, 0).setDepth(-10);
    this.aboveImg = this.add.image(0, 0, this.map.above).setOrigin(0, 0).setDepth(100000);

    const d = Save.get();
    const start = d.campusPos ?? [campus.playerStart[0] * T + T / 2, campus.playerStart[1] * T + T];
    this.player = new Player(this, start[0], start[1]);
    this.player.canDash = false;
    this.physics.add.collider(this.player, this.map.layer);

    const cam = this.cameras.main;
    cam.setZoom(RENDER_SCALE);
    cam.setBounds(0, 0, campus.size[0] * T, campus.size[1] * T);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.physics.world.setBounds(0, 0, campus.size[0] * T, campus.size[1] * T);

    this.placeProps();
    this.placePickups();
    this.placeProfessors();
    this.placeStudents();
    this.placeDoors();

    this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    HudState.mode = 'campus';
    HudState.minimap = this.map.minimap;
    HudState.title = 'campus.json';
    HudState.grade = '';
    this.refreshObjective();
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.onWake());
    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.busy = false; Input.clear(); });
    Debug.scene = this;
    if (import.meta.env.DEV && this.textures.exists('plan_overlay')) {
      this.planOverlay = this.add.image(0, 0, 'plan_overlay').setOrigin(0, 0).setScale(T / campus.planPixelsPerTile).setAlpha(0.5).setDepth(200000).setVisible(false);
    }
  }

  togglePlanOverlay(): void { this.planOverlay?.setVisible(!this.planOverlay.visible); }

  private onWake(): void {
    this.busy = false;
    Input.clear();
    // Back from a room: forget the wall contact that got us in, and don't let the door fire again at once.
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
    this.lastDoorMsg = this.time.now;
    Audio.music('campus');
    HudState.mode = 'campus';
    this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    this.refreshObjective();
    Debug.scene = this;
  }

  private tileXY(at: [number, number]): [number, number] { return [at[0] * T + T / 2, at[1] * T + T / 2]; }

  private placeProps(): void {
    const key: Record<string, string> = { fountain: 'fountain', monument: 'monument', bench: 'bench', sign_room404: 'sign', sign_floor0: 'sign', sign_not_implemented: 'sign', door_out_of_bounds: 'sign' };
    const egg: Record<string, string> = { sign_room404: 'room404', sign_floor0: 'floor0', sign_not_implemented: 'construction', door_out_of_bounds: 'outOfBounds' };
    for (const p of campus.props) {
      const [x, y] = this.tileXY(p.at);
      const img = this.add.image(x, y + T / 2, key[p.type] ?? 'sign').setOrigin(0.5, 1).setDepth(y + T / 2);
      if (egg[p.type]) {
        const text = t(`easterEggs.${egg[p.type]}`);
        if (p.type === 'sign_floor0') txt(this, x, y - 2, text, { size: 5, color: '#181425', origin: [0.5, 1] }).setDepth(img.depth + 1);
        this.interactables.push({ x, y, label: t('ui.talk'), act: () => this.say(text, x, y) });
      }
    }
  }

  private placePickups(): void {
    for (const p of campus.pickups) {
      const [x, y] = this.tileXY(p.at);
      const key = p.type === 'food_point' ? 'food_point' : 'coffee_point';
      this.add.image(x, y + T / 2, key).setOrigin(0.5, 1).setDepth(y + T / 2);
      if (p.type === 'coffee_point') {
        const gives = p.gives as 'maccoffee' | 'nescafe';
        const name = (balance.ammo as unknown as Record<string, { displayName: string; maxCarry: number }>)[gives];
        txt(this, x, y - 8, name.displayName, { size: 5, color: COLORS.accent, origin: [0.5, 1] }).setDepth(y + 20);
        this.interactables.push({ x, y, label: t('ui.coffee'), act: () => {
          const id = `${p.at}`;
          if ((this.coffeeCooldown[id] ?? 0) > this.time.now) { this.say('...', x, y); return; }
          this.coffeeCooldown[id] = this.time.now + 20000;
          let got = false;
          Save.update((s) => {
            s.firstCoffee = true;
            if (s.ammo[gives] < name.maxCarry) { s.ammo[gives] = Math.min(name.maxCarry, s.ammo[gives] + (gives === 'nescafe' ? 1 : 2)); got = true; }
          });
          Audio.play('sachet');
          floatText(this, x, y - 10, got ? t('ui.pickupCoffee', { name: name.displayName }) : '6/6', COLORS.accent);
        } });
      } else {
        this.interactables.push({ x, y, label: t('ui.talk'), act: () => {
          Save.update((s) => { s.lunch = true; });
          Audio.play('pickup');
          floatText(this, x, y - 10, t('ui.pickupFood', { n: balance.pickups.canteen_food.heals }), COLORS.green);
        } });
      }
    }
  }

  private placeProfessors(): void {
    for (const n of campus.npcs) {
      const prof = getProfessor(n.prof);
      const [x, y] = this.tileXY(n.at);
      const s = this.add.image(x, y + T / 2, n.prof).setOrigin(0.5, 1).setDepth(100002);
      this.add.image(x, y + T / 2, 'shadow').setAlpha(0.3).setOrigin(0.5, 0.6).setDepth(y);
      this.tweens.add({ targets: s, scaleY: 1.03, yoyo: true, repeat: -1, duration: 900 + Math.random() * 300 });
      txt(this, x, y - 18, prof.displayName, { size: 5, color: COLORS.accent, origin: [0.5, 1] }).setDepth(100003).setStroke('#181425', 2);
      const mark = txt(this, x, y - 26, '!', { size: 10, bold: true, color: COLORS.accent, origin: [0.5, 1] }).setDepth(100003).setStroke('#181425', 2);
      this.tweens.add({ targets: mark, y: y - 30, yoyo: true, repeat: -1, duration: 400 });
      this.markers.set(prof.course, mark);
      this.interactables.push({ x, y, label: t('ui.talk'), r: 22, act: () => this.talkTo(n.prof) });
    }
  }

  private placeStudents(): void {
    const list = (campus as unknown as { students?: { at: [number, number]; name: string; line: number }[] }).students ?? [];
    const lines = raw<string[]>('students');
    for (const st of list) {
      const [x, y] = this.tileXY(st.at);
      const s = this.add.image(x, y + T / 2, 'student').setOrigin(0.5, 1).setDepth(y + T / 2);
      if (st.line % 2) s.setTint(0xb0e0ff);
      const name = st.name === 'undefined' ? t('easterEggs.undefinedStudent') : st.name;
      txt(this, x, y - 18, name, { size: 5, color: COLORS.dim, origin: [0.5, 1] }).setDepth(100003);
      this.tweens.add({ targets: s, x: x + 6, yoyo: true, repeat: -1, duration: 2200 + st.line * 300, ease: 'Sine.easeInOut' });
      this.interactables.push({ x, y, label: t('ui.talk'), act: () => this.say(lines[st.line % lines.length], x, y) });
    }
  }

  private placeDoors(): void {
    for (const { door, building } of this.map.doorTiles) {
      const [x, y] = this.tileXY(door.at);
      const [fx, fy] = this.tileXY(door.front);
      const ix = (x + fx) / 2, iy = (y + fy) / 2;
      this.interactables.push({ x: ix, y: iy, r: 16, label: t('ui.enter'), act: () => this.useDoor(door.leadsTo, building.name, ix, iy) });
    }
  }

  private say(text: string, x: number, y: number): void {
    const b = txt(this, x, y - 22, text, { size: 6, color: '#181425', bg: '#ffffff', origin: [0.5, 1], wrap: 150, align: 'center' }).setDepth(150000).setPadding(3, 2, 3, 2);
    this.tweens.add({ targets: b, alpha: 0, delay: 2200, duration: 400, onComplete: () => b.destroy() });
  }

  private talkTo(profId: string): void {
    const prof = getProfessor(profId);
    const course = getCourse(prof.course);
    const d = Save.get();
    if (d.results[course.id]) { this.speak(profId, [oneLine(profId, 'idle')!]); return; }
    if (d.accepted.includes(course.id)) { this.speak(profId, [oneLine(profId, 'tip')!]); return; }
    this.speak(profId, professorLines(profId, 'quest'), () => {
      this.busy = true;
      this.scene.pause();
      this.scene.launch('QuestCard', {
        courseId: course.id,
        onAccept: () => {
          Analytics.event('course-accept', course.id);
          Save.update((s) => { if (!s.accepted.includes(course.id)) s.accepted.push(course.id); });
          Audio.play('ding');
          this.scene.resume();
          this.refreshObjective();
        },
      });
      this.scene.bringToTop('QuestCard');
    });
  }

  speak(profId: string, lines: ReturnType<typeof professorLines>, then?: () => void): void {
    this.busy = true;
    this.scene.pause();
    const data: DialogData = { lines, profId, portrait: profId, onDone: () => { this.scene.resume(); this.busy = false; then?.(); } };
    this.scene.launch('Dialog', data);
    this.scene.bringToTop('Dialog');
  }

  private useDoor(leadsTo: string | null, buildingName: string, x: number, y: number): void {
    const d = Save.get();
    if (!leadsTo) {
      const jokes = [t('easterEggs.room404'), t('easterEggs.construction'), t('ui.locked')];
      this.say(jokes[Math.floor(x + y) % jokes.length], x, y);
      Audio.play('buzz');
      return;
    }
    const course = courseForArena(leadsTo);
    if (!course) {
      // The exam hall doubles as the registrar's office.
      if (courses.semesterOrder.every((c) => d.results[c])) { this.leave(); this.scene.start('Transcript'); }
      else this.say(t('ui.transcriptLocked'), x, y);
      return;
    }
    if (d.results[course.id]) { this.say(t('ui.courseDone', { letter: d.results[course.id].letter }), x, y); return; }
    if (!d.accepted.includes(course.id)) {
      this.say(t('ui.lockedNeedQuest', { prof: getProfessor(course.professor).displayName }), x, y);
      Audio.play('buzz');
      return;
    }
    Audio.play('door');
    void buildingName;
    this.enterArena(course.id);
  }

  enterArena(courseId: string): void {
    const d = Save.get();
    const stageIndex = (d.progress[courseId] ?? []).length;
    this.leave();
    this.scene.sleep();
    this.scene.stop('HUD');
    this.scene.run('Arena', { courseId, stageIndex });
  }

  private leave(): void {
    Save.update((s) => { s.campusPos = [Math.round(this.player.x), Math.round(this.player.y)]; });
  }

  refreshObjective(): void {
    const d = Save.get();
    for (const [cid, m] of this.markers) m.setVisible(!d.accepted.includes(cid) && !d.results[cid]);
    const next = courses.semesterOrder.find((c) => !d.results[c]);
    if (!next) { HudState.objective = t('ui.objective', { text: t('ui.objTranscript') }); return; }
    const c = getCourse(next);
    if (!d.accepted.includes(next)) HudState.objective = t('ui.objective', { text: t('ui.objTalk', { prof: getProfessor(c.professor).displayName }) });
    else HudState.objective = t('ui.objective', { text: t('ui.objEnter', { room: rooms[c.arena]?.name ?? c.arena }) });
  }

  update(_t: number, dms: number): void {
    const dt = Math.min(0.05, dms / 1000);
    if (this.busy) return;
    this.player.speedMult = balance.player.campusSpeed / balance.player.speed;
    this.player.updateMove(dt);
    const tx = Math.floor(this.player.x / T), ty = Math.floor((this.player.y - 2) / T);
    HudState.playerTile = [tx, ty];
    HudState.wifiDead = campus.zones.some((z) => z.type === 'wifi_dead' && tx >= z.rect[0] && ty >= z.rect[1] && tx < z.rect[0] + z.rect[2] && ty < z.rect[1] + z.rect[3]);
    const under = charAt(tx, ty);
    this.aboveImg.setAlpha(under === 'a' ? 0.55 : under === 't' ? 0.7 : 1);

    // Nearest interactable within reach.
    let best: Interactable | null = null, bd = 1e9;
    for (const it of this.interactables) {
      const dd = Math.hypot(it.x - this.player.x, it.y - (this.player.y - 6));
      if (dd < (it.r ?? 18) && dd < bd) { bd = dd; best = it; }
    }
    HudState.interact = best ? (Input.touchMode ? best.label.replace(/^E:\s*/, '') : best.label) : '';
    if (Input.consume('interact') && best) best.act();
    else if (best && best.label === t('ui.enter') && this.time.now - this.lastDoorMsg > 1500) {
      // Walking into a door also uses it, but only while the player is actually pushing a direction:
      // the physics "blocked" flags are stale right after returning from a room.
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const mv = Input.move();
      const pushing = Math.hypot(mv.x, mv.y) > 0.3;
      if (pushing && bd < 12 && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) { this.lastDoorMsg = this.time.now; best.act(); }
    }
    Input.consume('help'); Input.consume('coffee'); Input.consume('pause');
  }
}
