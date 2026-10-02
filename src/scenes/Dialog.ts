import Phaser from 'phaser';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { recordShown, type Line } from '../systems/Dialog';
import { t } from '../systems/Language';
import { COLORS, H, NUM, W, button, setupCamera, txt } from '../ui';

export interface DialogData { lines: Line[]; profId: string; portrait?: string; onDone: () => void }

/** Typewriter dialog overlay with per-professor blip pitch, formula whiteboards and language tags. */
export class DialogScene extends Phaser.Scene {
  private data_!: DialogData;
  private i = 0;
  private shown = 0;
  private full = '';
  private body!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.Text;
  private tag!: Phaser.GameObjects.Text;
  private more!: Phaser.GameObjects.Text;
  private acc = 0;
  private done = false;

  constructor() { super('Dialog'); }

  init(d: DialogData): void { this.data_ = d; this.i = 0; this.done = false; }

  create(): void {
    setupCamera(this);
    const top = H - 84;
    this.add.rectangle(0, 0, W, H, 0x181425, 0.35).setOrigin(0, 0).setInteractive().on('pointerup', () => this.advance());
    this.add.rectangle(10, top, W - 20, 70, NUM(COLORS.bg), 0.96).setOrigin(0, 0).setStrokeStyle(1, NUM(COLORS.accent));
    this.add.rectangle(14, top + 4, 54, 62, NUM(COLORS.panel)).setOrigin(0, 0);
    if (this.data_.portrait) this.add.image(41, top + 36, this.data_.portrait).setScale(2.4);
    this.nameText = txt(this, 76, top + 5, '', { size: 8, bold: true, color: COLORS.accent });
    this.tag = txt(this, W - 18, top + 5, '', { size: 6, color: COLORS.cyan, origin: [1, 0] });
    this.board = this.add.rectangle(74, top + 18, W - 100, 40, 0xffffff).setOrigin(0, 0).setStrokeStyle(2, 0x8b9bb4).setVisible(false);
    this.body = txt(this, 78, top + 20, '', { size: 9, wrap: W - 108 });
    this.more = txt(this, W - 20, top + 60, '▼', { size: 7, color: COLORS.accent, origin: [1, 0.5] });
    this.tweens.add({ targets: this.more, alpha: 0.2, yoyo: true, repeat: -1, duration: 400 });
    const skip = button(this, W - 40, top - 8, 52, 12, t('ui.skip'), () => this.finish(), COLORS.panel);
    skip.label.setFontSize(7);
    this.showLine();
  }

  private showLine(): void {
    const line = this.data_.lines[this.i];
    if (!line) { this.finish(); return; }
    this.nameText.setText(line.speaker);
    this.tag.setText(line.lang ? line.lang.toUpperCase() : line.formula ? 'f(x)' : '');
    this.board.setVisible(line.formula);
    this.body.setColor(line.formula ? '#124e89' : COLORS.text).setFontStyle(line.formula ? 'bold' : line.lang ? 'italic' : 'normal');
    this.body.setFontSize(line.formula ? 10 : 9);
    this.full = line.text;
    this.shown = 0;
    this.acc = 0;
    this.body.setText('');
    const ach = recordShown(line, this.data_.profId);
    if (ach) {
      const hud = this.scene.get('HUD');
      hud.events.emit('toast', t('ui.achievement', { name: t(`achievements.${ach}`) }), COLORS.accent);
      Audio.play('win');
    }
  }

  private advance(): void {
    if (this.done) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; this.body.setText(this.full); return; }
    this.i++;
    this.showLine();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    Input.clear();
    this.scene.stop();
    this.data_.onDone();
  }

  update(_t: number, dms: number): void {
    if (Input.consume('interact') || Input.consume('dash')) this.advance();
    if (Input.consume('pause')) this.finish();
    if (this.shown < this.full.length) {
      this.acc += dms;
      const line = this.data_.lines[this.i];
      while (this.acc > 22 && this.shown < this.full.length) {
        this.acc -= 22;
        this.shown++;
        if (this.shown % 2 === 0 && this.full[this.shown - 1] !== ' ') Audio.blip(line.pitch);
      }
      this.body.setText(this.full.slice(0, this.shown));
    }
    this.more.setVisible(this.shown >= this.full.length);
  }
}
