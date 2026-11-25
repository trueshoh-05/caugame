import Phaser from 'phaser';
import { balance, courses, getCourse, getProfessor } from '../systems/Data';
import { courseResult, creditsFor, hasMercyPass } from '../systems/Grades';
import { oneLine } from '../systems/Dialog';
import { Save } from '../systems/Save';
import { t } from '../systems/Language';
import { Audio } from '../systems/Audio';
import { Input } from '../systems/Input';
import { Analytics } from '../systems/Analytics';
import { COLORS, H, NUM, W, button, panel, setupCamera, txt } from '../ui';

export interface StageResult {
  courseId: string; stageIndex: number; cleared: boolean; score: number; late: boolean; mercy: boolean;
  sanityLeft: number; attendanceMissed: boolean; destroyedFraction: number; retake: boolean; achievement?: string;
}

export function backToCampus(scene: Phaser.Scene): void {
  scene.scene.stop();
  if (scene.scene.isSleeping('Campus')) scene.scene.wake('Campus');
  else scene.scene.start('Campus');
}

export class ResultsScene extends Phaser.Scene {
  private r!: StageResult;
  private courseDone = false;
  constructor() { super('Results'); }
  init(r: StageResult): void { this.r = r; }

  create(): void {
    setupCamera(this);
    Input.clear();
    const r = this.r;
    const course = getCourse(r.courseId);
    const prof = getProfessor(course.professor);
    const total = course.components.length;
    let unlocked: string[] = r.achievement ? [r.achievement] : [];

    // Record the stage.
    this.courseDone = false;
    let creditsEarned = 0;
    if (!r.retake) {
      Save.update((s) => {
        const prog = s.progress[r.courseId] ?? [];
        prog[r.stageIndex] = r.score;
        const wins = s.wins;
        if (r.cleared) wins[r.courseId] = (wins[r.courseId] ?? 0) + 1;
        s.progress[r.courseId] = prog;
        if (prog.length >= total && prog.every((x) => x !== undefined && x !== null)) {
          const won = wins[r.courseId] ?? 0;
          const res = courseResult(r.courseId, prog, won, prog.length > 0 && hasMercyPass(r.courseId) && won < total);
          s.results[r.courseId] = res;
          delete s.progress[r.courseId];
          delete wins[r.courseId];
          creditsEarned = creditsFor(res.percent);
          s.credits += creditsEarned;
          this.courseDone = true;
          if (prof.achievement.id === 'curved' && won === 0 && res.percent >= 60 && !s.achievements.includes('curved')) {
            s.achievements.push('curved'); unlocked.push('curved');
          }
        }
      });
    }
    const stageType = course.components[r.stageIndex].type;
    Analytics.event(r.cleared ? 'stage-clear' : r.mercy ? 'stage-mercy' : 'stage-fail', r.courseId, stageType);
    if (this.courseDone) Analytics.event('course-complete', r.courseId, Save.get().results[r.courseId].letter);
    Audio.music(r.cleared || r.mercy ? 'results' : 'retake');
    Audio.play(r.cleared ? 'win' : 'buzz');

    this.add.rectangle(0, 0, W, H, NUM(COLORS.bg)).setOrigin(0, 0);
    panel(this, 16, 10, W - 32, H - 20);
    txt(this, 24, 16, `${course.name} — ${t(`questCard.components.${course.components[r.stageIndex].type}`)} (${course.components[r.stageIndex].weight}%)`, { size: 8, color: COLORS.dim });
    const head = r.cleared ? t('ui.submitted') : r.mercy ? t('ui.mercyPass') : t('ui.retake');
    txt(this, W / 2, 40, head, { size: 18, bold: true, origin: [0.5, 0.5], color: r.cleared ? COLORS.green : r.mercy ? COLORS.accent : COLORS.red });

    // Stage breakdown.
    // Show every part of the stage score so the total visibly adds up.
    const S = balance.scoring;
    const rows: [string, string][] = [];
    if (r.cleared) {
      const onTime = r.late ? 0 : S.onTimeBonus;
      const attendance = r.attendanceMissed ? balance.hazards.attendance_sheet.penaltyIfMissed : 0;
      const sanityBonus = r.score - S.cleared - onTime + attendance;
      rows.push([t('ui.clearedPts'), `${S.cleared}`]);
      rows.push([t('ui.sanityBonus', { n: r.sanityLeft }), `+${sanityBonus}`]);
      rows.push([r.late ? t('ui.late') : t('ui.onTime'), `+${onTime}`]);
      if (attendance) rows.push([t('ui.attendanceMissedShort'), `−${attendance}`]);
    } else {
      rows.push([t('ui.stageFailed'), '']);
      rows.push([t('ui.destroyedPct', { n: Math.round(r.destroyedFraction * 100) }), r.mercy || r.retake ? '' : `+${r.score}`]);
    }
    const rowY = (i: number) => 56 + i * 10;
    rows.forEach(([a, b], i) => {
      txt(this, 120, rowY(i), a, { size: 8 });
      txt(this, W - 120, rowY(i), b, { size: 8, origin: [1, 0], color: COLORS.accent });
    });
    if (!r.retake) {
      const y = rowY(rows.length) + 2;
      this.add.rectangle(120, y - 2, W - 240, 1, NUM(COLORS.dim)).setOrigin(0, 0);
      txt(this, 120, y, t('ui.stageScore'), { size: 8, bold: true });
      txt(this, W - 120, y, `${r.score}/100`, { size: 8, bold: true, origin: [1, 0], color: COLORS.accent });
    }

    // Professor line.
    const line = oneLine(prof.id, r.cleared ? 'win' : 'fail');
    if (line) {
      this.add.image(40, 132, prof.id).setScale(1.5);
      txt(this, 58, 112, prof.displayName, { size: 7, color: COLORS.accent });
      txt(this, 58, 122, line.text, { size: 8, wrap: W - 100, color: line.formula ? COLORS.cyan : COLORS.text });
    }

    let y = 160;
    if (this.courseDone) {
      const res = Save.get().results[r.courseId];
      txt(this, W / 2, y, `${t('ui.courseComplete')}: ${res.percent}% · ${res.letter}`, { size: 12, bold: true, origin: [0.5, 0.5], color: COLORS.accent });
      txt(this, W / 2, y + 14, t('ui.creditsEarned', { n: creditsEarned }), { size: 8, origin: [0.5, 0.5], color: COLORS.green });
      y += 26;
      this.shop(y);
      button(this, W / 2, H - 24, 150, 16, t('ui.backToCampus'), () => backToCampus(this), '#124e89');
    } else if (r.retake) {
      button(this, W / 2 - 80, H - 30, 140, 18, t('ui.retry'), () => this.scene.start('Arena', { courseId: r.courseId, stageIndex: r.stageIndex }), '#a22633');
      button(this, W / 2 + 80, H - 30, 140, 18, t('ui.backToCampus'), () => backToCampus(this));
    } else {
      const next = course.components[r.stageIndex + 1];
      txt(this, W / 2, y + 4, t('ui.stageOf', { n: r.stageIndex + 2, total }) + ' · ' + t(`questCard.components.${next.type}`) + ` ${next.weight}%`, { size: 8, origin: [0.5, 0.5], color: COLORS.dim });
      button(this, W / 2 - 80, H - 30, 140, 18, t('ui.continueStage'), () => this.scene.start('Arena', { courseId: r.courseId, stageIndex: r.stageIndex + 1 }), '#124e89');
      button(this, W / 2 + 80, H - 30, 140, 18, t('ui.backToCampus'), () => backToCampus(this));
    }
    unlocked = [...new Set(unlocked)];
    unlocked.forEach((a, i) => txt(this, W / 2, 148 + i * 10, '★ ' + t('ui.achievement', { name: t(`achievements.${a}`) }), { size: 8, bold: true, origin: [0.5, 0.5], color: COLORS.accent }));
    void courses;
  }

  update(): void {
    if (!Input.consume('interact')) return;
    const r = this.r;
    if (this.courseDone) backToCampus(this);
    else if (r.retake) this.scene.start('Arena', { courseId: r.courseId, stageIndex: r.stageIndex });
    else this.scene.start('Arena', { courseId: r.courseId, stageIndex: r.stageIndex + 1 });
  }

  private shop(y: number): void {
    const s = Save.get();
    const credits = txt(this, W / 2, y, '', { size: 7, origin: [0.5, 0.5], color: COLORS.dim });
    const refresh = () => credits.setText(`${t('ui.shop')} · ${t('ui.credits')}: ${Save.get().credits}`);
    refresh();
    const ups = balance.upgrades;
    ups.forEach((u, i) => {
      const x = W / 2 + (i - (ups.length - 1) / 2) * 104;
      const owned = s.upgrades.includes(u.id);
      txt(this, x, y + 10, u.effect, { size: 6, origin: [0.5, 0], color: COLORS.dim, align: 'center', wrap: 98 });
      const b = button(this, x, y + 32, 98, 14, owned ? `${u.name}: ${t('ui.owned')}` : `${u.name} · ${u.cost}`, () => {
        const d = Save.get();
        if (d.upgrades.includes(u.id)) return;
        if (d.credits < u.cost) { b.setLabel(t('ui.notEnough')); Audio.play('buzz'); return; }
        Save.update((x) => { x.credits -= u.cost; x.upgrades.push(u.id); });
        Audio.play('pickup');
        b.setLabel(`${u.name}: ${t('ui.owned')}`); b.setEnabled(false);
        refresh();
      });
      b.label.setFontSize(6);
      if (owned) b.setEnabled(false);
    });
  }
}
