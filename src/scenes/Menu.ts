import Phaser from 'phaser';
import { Save } from '../systems/Save';
import { LANGS, LANG_NAMES, getLang, setLang, t, raw, pick } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { courses, getCourse } from '../systems/Data';
import { COLORS, H, NUM, W, button, setupCamera, txt } from '../ui';
import { MuteButton } from './HUD';
import { buildCampus } from '../systems/MapBuilder';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    setupCamera(this);
    Input.clear();
    Audio.music('menu');
    const d = Save.get();
    // Background: a slow parade of paper drifting down the screen.
    for (let i = 0; i < 14; i++) {
      const kinds = ['quiz', 'homework', 'loose_page', 'lab_report'];
      const skin = pick(courses.courses).skin;
      const s = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(-40, H), `${pick(kinds)}_${skin}`).setAlpha(0.25);
      this.tweens.add({ targets: s, y: H + 40, angle: Phaser.Math.Between(-90, 90), duration: Phaser.Math.Between(9000, 16000), repeat: -1, delay: -Phaser.Math.Between(0, 9000), onRepeat: () => { s.x = Phaser.Math.Between(0, W); s.y = -30; } });
    }
    this.add.rectangle(W / 2, 62, 330, 62, NUM(COLORS.bg), 0.85).setStrokeStyle(1, NUM(COLORS.accent));
    txt(this, W / 2, 48, t('ui.title'), { size: 20, bold: true, color: COLORS.accent, origin: [0.5, 0.5] });
    txt(this, W / 2, 74, t('ui.subtitle'), { size: 8, color: COLORS.dim, origin: [0.5, 0.5] });
    this.add.image(W / 2 - 60, 120, 'player_0').setScale(2);
    this.add.image(W / 2 + 60, 122, `homework_code`).setScale(2);
    const semi = this.add.image(W / 2 - 30, 112, 'semicolon').setScale(2);
    this.tweens.add({ targets: semi, x: W / 2 + 40, duration: 700, repeat: -1 });

    let y = 160;
    const go = (fresh: boolean) => {
      Audio.unlock();
      if (fresh) Save.newSemester();
      this.scene.start('Campus');
    };
    if (Save.hasProgress()) {
      const cur = Object.keys(d.progress)[0];
      const label = cur ? t('ui.resume', { course: getCourse(cur).name }) : t('ui.continue');
      button(this, W / 2, y, 180, 18, label, () => go(false)); y += 22;
      button(this, W / 2, y, 180, 16, t('ui.newGame'), () => go(true)); y += 22;
    } else {
      const b = button(this, W / 2, y, 180, 20, t('ui.tapToStart'), () => go(true)); y += 24;
      this.tweens.add({ targets: b.label, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
    }
    // Language picker
    txt(this, W / 2, y + 4, t('ui.chooseLanguage'), { size: 7, color: COLORS.dim, origin: [0.5, 0.5] });
    y += 16;
    LANGS.forEach((code, i) => {
      const x = W / 2 + (i - (LANGS.length - 1) / 2) * 64;
      const b = button(this, x, y, 60, 14, LANG_NAMES[code], () => {
        setLang(code); Save.update((s) => { s.lang = code; });
        this.scene.restart();
      }, code === getLang() ? '#124e89' : COLORS.panel2);
      b.label.setFontSize(7);
    });
    txt(this, W / 2, H - 12, Input.touchMode ? t('ui.howToPlayTouch') : t('ui.howToPlay'), { size: 7, color: COLORS.dim, origin: [0.5, 0.5], wrap: 460, align: 'center' });
    // Achievements & reset
    if (d.achievements.length) {
      txt(this, 8, 8, d.achievements.map((a) => '★ ' + t(`achievements.${a}`)).join('\n'), { size: 7, color: COLORS.accent });
    }
    let armed = false;
    const reset = button(this, 56, H - 30, 96, 12, t('ui.reset'), () => {
      if (!armed) { armed = true; reset.setLabel(t('ui.resetConfirm')); return; }
      Save.reset(); this.scene.restart();
    }, COLORS.bg);
    reset.label.setFontSize(6);
    new MuteButton(this, W - 14, 14);
    if (d.credits) txt(this, W - 8, H - 44, `${t('ui.credits')}: ${d.credits}`, { size: 7, color: COLORS.dim, origin: [1, 0.5] });
    // Student name (shown on the transcript). "sudo" gets a reply.
    const nameBtn = button(this, W - 60, H - 30, 104, 12, t('ui.nameLabel', { name: d.name || t('ui.noName') }), () => {
      const n = window.prompt(t('ui.enterNamePrompt'), Save.get().name)?.trim().slice(0, 18);
      if (n === undefined || n === null) return;
      Save.update((x) => { x.name = n; });
      nameBtn.setLabel(t('ui.nameLabel', { name: n || t('ui.noName') }));
      if (n.toLowerCase().startsWith('sudo')) this.toast(t('easterEggs.sudoName'));
    }, COLORS.bg);
    nameBtn.label.setFontSize(6);
    const credBtn = button(this, 56, H - 44, 96, 12, t('ui.creditsTitle'), () => this.showCredits(), COLORS.bg);
    credBtn.label.setFontSize(6);
    // Paint the campus while the player reads the menu, so entering it is instant.
    this.time.delayedCall(400, () => { if (!this.textures.exists('campus_ground')) buildCampus(this).layer.tilemap.destroy(); });
    this.input.keyboard?.once('keydown-ENTER', () => go(!Save.hasProgress()));
    void raw;
  }

  private toast(s: string): void {
    const tt = txt(this, W / 2, 140, s, { size: 9, bold: true, color: COLORS.accent, origin: [0.5, 0.5], bg: COLORS.bg }).setPadding(4, 2, 4, 2).setDepth(50);
    this.tweens.add({ targets: tt, alpha: 0, delay: 2200, duration: 400, onComplete: () => tt.destroy() });
  }

  private showCredits(): void {
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(0, 0, W, H, 0x181425, 0.92).setOrigin(0, 0).setInteractive().setDepth(100));
    items.push(txt(this, W / 2, 50, t('ui.creditsTitle'), { size: 14, bold: true, color: COLORS.accent, origin: [0.5, 0.5] }).setDepth(101));
    items.push(txt(this, W / 2, 120, t('ui.creditsBody'), { size: 8, align: 'center', origin: [0.5, 0.5], wrap: 420 }).setDepth(101));
    const b = button(this, W / 2, 210, 100, 16, t('ui.back'), () => { items.forEach((o) => o.destroy()); b.destroy(); });
    b.bg.setDepth(102); b.label.setDepth(103);
  }
}
