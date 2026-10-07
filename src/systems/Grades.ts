import { balance, courses, getCourse, getProfessor } from './Data';
import type { CourseResult } from './Save';
import { Core } from '../core/Core';

// Each rule runs in the C++ core (cpp/src/rules.cpp) when it is loaded; the TypeScript below is the fallback.

const S = balance.scoring;

export function letterFor(percent: number): { letter: string; points: number } {
  if (Core.core) return Core.core.letterFor(percent);
  const bands = [...courses.gradeScale.bands].sort((a, b) => b.min - a.min);
  const b = bands.find((x) => percent >= x.min) ?? bands[bands.length - 1];
  return { letter: b.letter, points: b.points };
}

/** Stage score out of 100 for a cleared stage. */
export function clearedScore(sanityLeft: number, sanityMax: number, onTime: boolean): number {
  if (Core.core) return Core.core.clearedScore(sanityLeft, sanityMax, onTime);
  const bonus = Math.round(S.sanityBonusMax * Math.max(0, Math.min(1, sanityLeft / sanityMax)));
  return S.cleared + bonus + (onTime ? S.onTimeBonus : 0);
}

/** Stage score for a failed stage: 40 x fraction destroyed. */
export function failedScore(fractionDestroyed: number): number {
  if (Core.core) return Core.core.failedScore(fractionDestroyed);
  return Math.round(40 * Math.max(0, Math.min(1, fractionDestroyed)));
}

export function coursePercent(courseId: string, stageScores: number[]): number {
  if (Core.core) return Core.core.coursePercent(courseId, stageScores.map((x) => x ?? 0));
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
  if (Core.core) return Core.core.creditsFor(percent);
  return Math.round(percent * S.creditsPerCoursePercent);
}

export function gpa(results: Record<string, CourseResult>): number {
  const ids = Object.keys(results);
  if (!ids.length) return 0;
  if (Core.core) return Core.core.gpa(ids.map((id) => results[id].points));
  const sum = ids.reduce((a, id) => a + results[id].points, 0);
  return Math.round((sum / ids.length) * 100) / 100;
}

export function hasMercyPass(courseId: string): boolean {
  if (Core.core) return Core.core.hasMercyPass(courseId);
  return getProfessor(getCourse(courseId).professor).personalityRule === 'mercy_pass';
}
