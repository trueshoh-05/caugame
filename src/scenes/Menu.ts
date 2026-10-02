import Phaser from 'phaser';
import { Save } from '../systems/Save';
import { LANGS, LANG_NAMES, getLang, setLang, t, raw, pick } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { courses, getCourse } from '../systems/Data';
import { COLORS, H, NUM, W, button, setupCamera, txt } from '../ui';
import { MuteButton } from './HUD';

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
    const reset = button(this, 40, H - 30, 64, 12, t('ui.reset'), () => {
      if (!armed) { armed = true; reset.setLabel(t('ui.resetConfirm')); return; }
      Save.reset(); this.scene.restart();
    }, COLORS.bg);
    reset.label.setFontSize(6);
    new MuteButton(this, W - 14, 14);
    if (d.credits) txt(this, W - 8, H - 30, `${t('ui.credits')}: ${d.credits}`, { size: 7, color: COLORS.dim, origin: [1, 0.5] });
    this.input.keyboard?.once('keydown-ENTER', () => go(!Save.hasProgress()));
    void raw;
  }
}
