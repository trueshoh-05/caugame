import Phaser from 'phaser';
import { courses, getCourse, getProfessor } from '../systems/Data';
import { gpa } from '../systems/Grades';
import { Save } from '../systems/Save';
import { t } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { COLORS, H, NUM, W, button, setupCamera, txt } from '../ui';
import { Debug } from '../debug';

/** End of semester: the transcript, GPA, and a shareable PNG of it. */
export class TranscriptScene extends Phaser.Scene {
  constructor() { super('Transcript'); }

  create(): void {
    setupCamera(this);
    Input.clear();
    this.scene.stop('HUD');
    if (this.scene.isSleeping('Campus') || this.scene.isActive('Campus')) this.scene.stop('Campus');
    Audio.music('results');
    const d = Save.get();
    this.add.rectangle(0, 0, W, H, NUM(COLORS.bg)).setOrigin(0, 0);
    this.add.rectangle(30, 12, W - 60, H - 52, 0xf4f6fa).setOrigin(0, 0).setStrokeStyle(2, 0x124e89);
    this.add.rectangle(30, 12, W - 60, 18, 0x124e89).setOrigin(0, 0);
    txt(this, 38, 16, `${t('ui.title')} · ${t('ui.transcript')} · ${d.name || t('ui.noName')}`, { size: 8, bold: true, color: '#ffffff' });
    txt(this, W - 38, 16, t('ui.semesterDone'), { size: 7, color: '#c0cbdc', origin: [1, 0] });
    const cols = [40, 210, 330, 380, 420];
    const head = [t('ui.course'), 'Professor', '%', t('ui.letter'), t('ui.gpa')];
    head[1] = t('questCard.professor');
    head.forEach((h, i) => txt(this, cols[i], 38, h, { size: 7, bold: true, color: '#124e89' }));
    let y = 52;
    for (const id of courses.semesterOrder) {
      const r = d.results[id];
      const c = getCourse(id);
      this.add.rectangle(36, y - 2, W - 72, 14, y % 2 ? 0xe6eaf2 : 0xf4f6fa).setOrigin(0, 0);
      txt(this, cols[0], y, c.name, { size: 7, color: '#181425' });
      txt(this, cols[1], y, getProfessor(c.professor).displayName, { size: 7, color: '#3a4466' });
      txt(this, cols[2], y, r ? `${r.percent}` : '—', { size: 7, color: '#181425' });
      txt(this, cols[3], y, r ? r.letter + (r.mercy ? '*' : '') : '—', { size: 8, bold: true, color: r && r.points >= 3 ? '#3e8948' : '#a22633' });
      txt(this, cols[4], y, r ? r.points.toFixed(1) : '—', { size: 7, color: '#181425' });
      y += 16;
    }
    const g = gpa(d.results);
    txt(this, W / 2, y + 16, `${t('ui.gpa')}: ${g.toFixed(2)}`, { size: 16, bold: true, color: '#124e89', origin: [0.5, 0.5] });
    if (d.achievements.length) txt(this, W / 2, y + 36, d.achievements.map((a) => '★ ' + t(`achievements.${a}`)).join('   '), { size: 7, color: '#be4a2f', origin: [0.5, 0.5] });
    txt(this, W - 38, H - 50, `${t('ui.credits')}: ${d.credits}`, { size: 6, color: '#8b9bb4', origin: [1, 1] });
    Debug.lastGpa = g;

    button(this, W / 2 - 80, H - 22, 140, 16, t('ui.share'), () => this.share(), '#124e89');
    button(this, W / 2 + 80, H - 22, 140, 16, t('ui.playAgain'), () => { Save.newSemester(); this.scene.start('Menu'); });
  }

  private share(): void {
    this.game.renderer.snapshot((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      const a = document.createElement('a');
      a.href = img.src;
      a.download = 'cau-transcript.png';
      document.body.appendChild(a); a.click(); a.remove();
      Debug.sharedImage = img.src.length;
      this.scene.get('Transcript').events.emit('shared');
      txt(this, W / 2, H - 40, t('ui.shareSaved'), { size: 7, color: COLORS.green, origin: [0.5, 0.5] });
    });
  }
}
