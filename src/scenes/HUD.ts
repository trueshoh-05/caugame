import Phaser from 'phaser';
import { Audio } from '../systems/Audio';
import { Input, type Action } from '../systems/Input';
import { raw, t, pick } from '../systems/Language';
import { MAP_H, MAP_W } from '../systems/MapBuilder';
import { COLORS, H, NUM, W, setupCamera, txt } from '../ui';

/** Gameplay scenes write here every frame; the HUD only reads. */
export const HudState = {
  mode: 'none' as 'none' | 'campus' | 'arena',
  sanity: 100, sanityMax: 100,
  deadline: 0, deadlineMax: 1, frozen: false, late: false,
  clip: 30, clipMax: 30, reloading: false,
  maccoffee: 0, nescafe: 0,
  title: '',
  grade: '',
  bossHp: 0, bossMax: 0, bossName: '',
  objective: '',
  minimap: '' as string, playerTile: [0, 0] as [number, number], wifiDead: false,
  interact: '' as string,          // label of the contextual interact action, '' = none
  assistReady: false, assistName: '',
  shield: 0,
};

export class MuteButton {
  private icon: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const bg = scene.add.rectangle(x, y, 18, 16, NUM(COLORS.panel), 0.9).setStrokeStyle(1, NUM(COLORS.panel2)).setDepth(9000)
      .setInteractive({ useHandCursor: true });
    this.icon = txt(scene, x, y, '', { size: 9, origin: [0.5, 0.5] }).setDepth(9001);
    this.refresh();
    bg.setName('mute');
    bg.on('pointerup', () => { Audio.unlock(); Audio.setMuted(!Audio.muted); this.refresh(); });
  }
  refresh(): void { this.icon.setText(Audio.muted ? '♪̸' : '♪').setColor(Audio.muted ? COLORS.red : COLORS.text); }
}

export class HUDScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private sanityText!: Phaser.GameObjects.Text;
  private deadlineText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private gradeText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private terminal!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private objective!: Phaser.GameObjects.Text;
  private bark!: Phaser.GameObjects.Container;
  private barkText!: Phaser.GameObjects.Text;
  private barkName!: Phaser.GameObjects.Text;
  private barkTimer = 0;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer = 0;
  private minimap!: Phaser.GameObjects.Image;
  private wifiText!: Phaser.GameObjects.Text;
  private btnLabels: Partial<Record<Action, Phaser.GameObjects.Text>> = {};
  private termTimer = 0;
  private overlay?: Phaser.GameObjects.Image;

  constructor() { super('HUD'); }

  create(): void {
    setupCamera(this);
    this.g = this.add.graphics();
    this.titleText = txt(this, 6, 3, '', { size: 7, color: COLORS.dim });
    this.sanityText = txt(this, 8, 14, '', { size: 7 });
    this.gradeText = txt(this, W - 28, 3, '', { size: 7, origin: [1, 0], align: 'right', color: COLORS.accent });
    this.deadlineText = txt(this, W / 2, 12, '', { size: 10, bold: true, origin: [0.5, 0.5] });
    this.ammoText = txt(this, W - 6, H - 22, '', { size: 8, origin: [1, 1], align: 'right' });
    this.terminal = txt(this, 6, H - 10, '', { size: 7, color: COLORS.green });
    this.bossText = txt(this, W / 2, 30, '', { size: 7, origin: [0.5, 0.5], color: COLORS.red });
    this.objective = txt(this, 6, 16, '', { size: 7, color: COLORS.accent, wrap: 260 });
    this.toastText = txt(this, W / 2, 70, '', { size: 9, bold: true, origin: [0.5, 0.5], align: 'center', wrap: 360 }).setStroke('#181425', 3);
    this.minimap = this.add.image(W - 8, 26, HudState.minimap || '__DEFAULT').setOrigin(1, 0).setScale(0.5).setAlpha(0.9);
    this.wifiText = txt(this, W - 8 - (MAP_W / 4), 26 + MAP_H / 4, t('ui.wifiDead'), { size: 7, color: COLORS.red, origin: [0.5, 0.5] });

    this.bark = this.add.container(0, 0).setVisible(false);
    const bb = this.add.rectangle(W / 2, 48, 300, 26, NUM(COLORS.bg), 0.92).setStrokeStyle(1, NUM(COLORS.accent));
    this.barkName = txt(this, W / 2 - 146, 37, '', { size: 6, color: COLORS.accent });
    this.barkText = txt(this, W / 2 - 146, 45, '', { size: 7, wrap: 292 });
    this.bark.add([bb, this.barkName, this.barkText]);

    new MuteButton(this, W - 14, 12);
    this.nextTerminal();

    // Touch buttons (positions in logical pixels, right thumb area).
    const defs: { id: Action; x: number; y: number; r: number; label: string }[] = [
      { id: 'coffee', x: W - 30, y: H - 66, r: 16, label: t('ui.coffee') },
      { id: 'dash', x: W - 68, y: H - 40, r: 16, label: t('ui.dash') },
      { id: 'help', x: W - 70, y: H - 84, r: 12, label: t('ui.callProfessor') },
      { id: 'interact', x: W - 30, y: H - 110, r: 16, label: 'E' },
    ];
    Input.buttons = defs.map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, visible: false }));
    for (const d of defs) this.btnLabels[d.id] = txt(this, d.x, d.y, d.label, { size: 6, origin: [0.5, 0.5], align: 'center', wrap: d.r * 2 }).setVisible(false);

    this.input.keyboard?.on('keydown-M', () => this.toggleOverlay());
    this.events.on('bark', (name: string, text: string) => this.showBark(name, text));
    this.events.on('toast', (text: string, color?: string) => this.toast(text, color));
  }

  showBark(name: string, text: string): void {
    this.barkName.setText(name);
    this.barkText.setText(text);
    this.bark.setVisible(true);
    this.barkTimer = 3.2;
  }

  toast(text: string, color = COLORS.text): void {
    this.toastText.setText(text).setColor(color).setAlpha(1);
    this.toastTimer = 2.2;
  }

  private nextTerminal(): void { this.terminal.setText('> ' + pick(raw<string[]>('terminal'))); this.termTimer = 7; }

  private toggleOverlay(): void {
    if (!import.meta.env.DEV || HudState.mode !== 'campus') return;
    const campus = this.scene.get('Campus') as Phaser.Scene & { togglePlanOverlay?: () => void };
    campus.togglePlanOverlay?.();
    void this.overlay;
  }

  update(_t: number, dms: number): void {
    const dt = dms / 1000;
    const s = HudState;
    const g = this.g;
    g.clear();
    const arena = s.mode === 'arena';
    // Editor chrome: top tab bar and bottom terminal strip.
    g.fillStyle(NUM(COLORS.bg), 0.85).fillRect(0, 0, W, arena ? 24 : 12);
    g.fillStyle(NUM(COLORS.panel), 1).fillRect(0, 0, 120, 11);
    g.fillStyle(NUM(COLORS.accent), 1).fillRect(0, 10, 120, 1);
    g.fillStyle(NUM(COLORS.bg), 0.85).fillRect(0, H - 13, W, 13);
    g.fillStyle(NUM(COLORS.blue), 1).fillRect(0, H - 13, W, 1);
    this.titleText.setText(s.title);
    this.gradeText.setText(s.grade).setVisible(arena);

    this.termTimer -= dt;
    if (this.termTimer <= 0) this.nextTerminal();

    this.sanityText.setVisible(arena);
    this.deadlineText.setVisible(arena);
    this.ammoText.setVisible(arena);
    if (arena) {
      const frac = Math.max(0, s.sanity / s.sanityMax);
      g.fillStyle(0x181425, 1).fillRect(52, 14, 64, 7);
      g.fillStyle(frac > 0.5 ? 0x63c74d : frac > 0.25 ? 0xfeae34 : 0xe43b44, 1).fillRect(53, 15, 62 * frac, 5);
      this.sanityText.setText(`${t('ui.sanity')}`).setPosition(6, 13);
      if (s.shield) { g.fillStyle(0xa22633, 1).fillRect(120, 14, 6, 7); }
      // Deadline: counts down toward 23:59.
      const left = Math.max(0, s.deadline);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      const label = s.late ? t('ui.deadlinePassed') : s.frozen ? `${t('ui.frozen')} ${mm}:${String(ss).padStart(2, '0')}` : `${t('ui.deadline')} ${mm}:${String(ss).padStart(2, '0')}`;
      this.deadlineText.setText(label).setColor(s.late ? COLORS.red : s.frozen ? COLORS.cyan : left < 10 ? COLORS.red : COLORS.text);
      const df = Math.max(0, Math.min(1, s.deadline / s.deadlineMax));
      g.fillStyle(0x3a4466, 1).fillRect(W / 2 - 60, 20, 120, 2);
      g.fillStyle(s.frozen ? 0x2ce8f5 : 0xe43b44, 1).fillRect(W / 2 - 60, 20, 120 * df, 2);
      this.ammoText.setText(`${s.reloading ? t('ui.compiling') : `; ${s.clip}/${s.clipMax}`}\n☕ ${s.maccoffee}  ★ ${s.nescafe}`);
      if (s.bossMax > 0 && s.bossHp > 0) {
        g.fillStyle(0x181425, 1).fillRect(W / 2 - 90, 34, 180, 5);
        g.fillStyle(0xe43b44, 1).fillRect(W / 2 - 89, 35, 178 * (s.bossHp / s.bossMax), 3);
        this.bossText.setText(s.bossName).setVisible(true);
      } else this.bossText.setVisible(false);
    } else this.bossText.setVisible(false);

    // Campus: objective + minimap.
    this.objective.setVisible(s.mode === 'campus').setText(s.objective);
    const showMini = s.mode === 'campus' && !!s.minimap;
    if (showMini && this.minimap.texture.key !== s.minimap) this.minimap.setTexture(s.minimap);
    this.minimap.setVisible(showMini && !s.wifiDead);
    this.wifiText.setVisible(showMini && s.wifiDead);
    if (showMini && !s.wifiDead) {
      const mx = W - 8 - MAP_W / 2 + s.playerTile[0] / 2, my = 26 + s.playerTile[1] / 2;
      g.fillStyle(0xff0044, 1).fillRect(mx - 1, my - 1, 3, 3);
      g.lineStyle(1, 0x5a6988, 1).strokeRect(W - 8 - MAP_W / 2, 26, MAP_W / 2, MAP_H / 2);
    }

    // Touch controls.
    const touch = Input.touchMode && s.mode !== 'none';
    for (const b of Input.buttons) {
      let vis = touch;
      if (b.id === 'interact') vis = touch && !!s.interact;
      if (b.id === 'coffee' || b.id === 'dash' || b.id === 'help') vis = touch && arena;
      b.visible = vis;
      const lbl = this.btnLabels[b.id]!;
      lbl.setVisible(vis);
      if (!vis) continue;
      if (b.id === 'interact') lbl.setText(s.interact);
      if (b.id === 'help') lbl.setAlpha(s.assistReady ? 1 : 0.4);
      g.fillStyle(b.id === 'interact' ? 0x124e89 : 0x3a4466, b.id === 'help' && !s.assistReady ? 0.25 : 0.55).fillCircle(b.x, b.y, b.r);
      g.lineStyle(1, 0xfeae34, 0.8).strokeCircle(b.x, b.y, b.r);
    }
    if (touch && Input.joystick.active) {
      const j = Input.joystick;
      g.fillStyle(0xffffff, 0.12).fillCircle(j.ox, j.oy, 28);
      g.lineStyle(1, 0xffffff, 0.4).strokeCircle(j.ox, j.oy, 28);
      const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), m = Math.min(1, 28 / Math.max(1, d));
      g.fillStyle(0xfeae34, 0.6).fillCircle(j.ox + dx * m, j.oy + dy * m, 10);
    } else if (touch && s.mode !== 'none') {
      g.fillStyle(0xffffff, 0.06).fillCircle(60, H - 60, 28);
      g.lineStyle(1, 0xffffff, 0.15).strokeCircle(60, H - 60, 28);
    }

    if (this.barkTimer > 0) { this.barkTimer -= dt; if (this.barkTimer <= 0) this.bark.setVisible(false); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; this.toastText.setAlpha(Math.min(1, this.toastTimer * 2)); }
  }
}
