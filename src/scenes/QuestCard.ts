import Phaser from 'phaser';
import { getCourse, getProfessor, rooms } from '../systems/Data';
import { t } from '../systems/Language';
import { Input } from '../systems/Input';
import { COLORS, H, NUM, W, button, setupCamera, txt } from '../ui';

export interface QuestData { courseId: string; onAccept: () => void }

/** The quest, laid out like the course page on the CAU portal ("No data" and all). */
export class QuestCardScene extends Phaser.Scene {
  private d!: QuestData;
  constructor() { super('QuestCard'); }
  init(d: QuestData): void { this.d = d; }

  create(): void {
    setupCamera(this);
    const c = getCourse(this.d.courseId);
    const p = getProfessor(c.professor);
    this.add.rectangle(0, 0, W, H, 0x181425, 0.6).setOrigin(0, 0).setInteractive();
    const x0 = 24, y0 = 12, w = W - 48, h = H - 24;
    this.add.rectangle(x0, y0, w, h, 0xf4f6fa).setOrigin(0, 0).setStrokeStyle(1, 0x8b9bb4);
    this.add.rectangle(x0, y0, w, 16, 0x124e89).setOrigin(0, 0);
    txt(this, x0 + 6, y0 + 4, t('questCard.portalHeader'), { size: 7, color: '#ffffff' });
    txt(this, x0 + 8, y0 + 21, c.name, { size: 11, bold: true, color: '#181425' });
    const room = rooms[c.arena]?.name ?? c.arena;
    txt(this, x0 + 8, y0 + 35, `${t('questCard.professor')}: ${p.displayName}  ·  ${t('questCard.room')}: ${room}`, { size: 7, color: '#3a4466' });

    const field = (label: string, value: string, x: number, y: number, wrap: number): number => {
      txt(this, x, y, label, { size: 6, bold: true, color: '#124e89' });
      const noData = value === 'No data';
      const v = txt(this, x, y + 8, noData ? t('questCard.noData') : value, { size: 6, color: noData ? '#8b9bb4' : '#262b44', wrap });
      return y + 10 + v.height;
    };
    const pp = c.portalPage;
    const colW = (w - 28) / 2;
    let ly = y0 + 48;
    ly = field(t('questCard.courseDescription'), pp.description, x0 + 8, ly, colW);
    ly = field(t('questCard.objectives'), pp.objectives, x0 + 8, ly + 2, colW);
    ly = field(t('questCard.learningOutcomes'), pp.learningOutcomes, x0 + 8, ly + 2, colW);
    const rx = x0 + 18 + colW;
    let ry = y0 + 48;
    txt(this, rx, ry, t('questCard.gradeComponents'), { size: 6, bold: true, color: '#124e89' });
    ry += 9;
    for (const comp of c.components) {
      this.add.rectangle(rx, ry, colW, 9, 0xe6eaf2).setOrigin(0, 0);
      txt(this, rx + 2, ry + 1, t(`questCard.components.${comp.type}`), { size: 6, color: '#262b44' });
      txt(this, rx + colW - 2, ry + 1, `${comp.weight}%`, { size: 6, bold: true, color: '#a22633', origin: [1, 0] });
      ry += 10;
    }
    ry += 3;
    txt(this, rx, ry, t('questCard.textbook'), { size: 6, bold: true, color: '#124e89' });
    ry = field(t('questCard.coreReading'), pp.coreReading, rx, ry + 9, colW);
    ry = field(t('questCard.additionalReading'), pp.additionalReading, rx, ry + 1, colW);
    ry = field(t('questCard.guidedIndependentStudy'), pp.guidedIndependentStudy, rx, ry + 1, colW);
    void ly; void ry;

    button(this, W / 2, y0 + h - 14, 120, 16, t('ui.accept'), () => this.accept(), '#124e89');
    void NUM; void COLORS;
  }

  private accept(): void { Input.clear(); this.scene.stop(); this.d.onAccept(); }

  update(): void { if (Input.consume('interact')) this.accept(); }
}
