import { balance, courses, getCourse, getProfessor } from './Data';
import type { CourseResult } from './Save';

const S = balance.scoring;

export function letterFor(percent: number): { letter: string; points: number } {
  const bands = [...courses.gradeScale.bands].sort((a, b) => b.min - a.min);
  const b = bands.find((x) => percent >= x.min) ?? bands[bands.length - 1];
  return { letter: b.letter, points: b.points };
}

/** Stage score out of 100 for a cleared stage. */
export function clearedScore(sanityLeft: number, sanityMax: number, onTime: boolean): number {
  const bonus = Math.round(S.sanityBonusMax * Math.max(0, Math.min(1, sanityLeft / sanityMax)));
  return S.cleared + bonus + (onTime ? S.onTimeBonus : 0);
}

/** Stage score for a failed stage: 40 x fraction destroyed. */
export function failedScore(fractionDestroyed: number): number {
  return Math.round(40 * Math.max(0, Math.min(1, fractionDestroyed)));
}

export function coursePercent(courseId: string, stageScores: number[]): number {
  const c = getCourse(courseId);
  let total = 0;
  c.components.forEach((comp, i) => { total += (stageScores[i] ?? 0) * comp.weight / 100; });
  return Math.round(total * 10) / 10;
}

export function courseResult(courseId: string, stageScores: number[], wonStages: number, mercy: boolean): CourseResult {
  const percent = coursePercent(courseId, stageScores);
  return { percent, ...letterFor(percent), stageScores, wonStages, mercy };
}

export function creditsFor(percent: number): number {
  return Math.round(percent * S.creditsPerCoursePercent);
}

export function gpa(results: Record<string, CourseResult>): number {
  const ids = Object.keys(results);
  if (!ids.length) return 0;
  const sum = ids.reduce((a, id) => a + results[id].points, 0);
  return Math.round((sum / ids.length) * 100) / 100;
}

export function hasMercyPass(courseId: string): boolean {
  return getProfessor(getCourse(courseId).professor).personalityRule === 'mercy_pass';
}
