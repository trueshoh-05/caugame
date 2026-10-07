import { getProfessor } from './Data';
import { raw } from './Language';
import { Save } from './Save';
import { Core } from '../core/Core';

export type RawLine = string | { text?: string; formula?: string; lang?: string };
export interface Line { text: string; formula: boolean; lang?: string; speaker: string; pitch: number; tics: number }

/** Fill {tic}: the phrase appears with the professor's chance, at most maxPerBox times per box. */
export function insertTic(text: string, profId: string, rng?: () => number): { text: string; count: number } {
  if (Core.core && !rng) return Core.core.insertTic(text, profId);  // C++ core (cpp/src/rules.cpp)
  rng ??= Math.random;
  const p = getProfessor(profId);
  let count = 0;
  const out = text.replace(/\s*\{tic\}/g, () => {
    if (p.tic && count < p.tic.maxPerBox && rng() < p.tic.chance) { count++; return ' ' + p.tic.phrase; }
    return '';
  });
  return { text: out, count };
}

export function professorLines(profId: string, kind: string): Line[] {
  const p = getProfessor(profId);
  const list = raw<RawLine[]>(`professors.${profId}.${kind}`) ?? [];
  return list.map((l) => makeLine(l, profId, p.displayName, p.voiceBlipPitch));
}

export function oneLine(profId: string, kind: string): Line | null {
  const lines = professorLines(profId, kind);
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
}

function makeLine(l: RawLine, profId: string, speaker: string, pitch: number): Line {
  if (typeof l === 'string') {
    const r = insertTic(l, profId);
    return { text: r.text, formula: false, speaker, pitch, tics: r.count };
  }
  if (l.formula) return { text: l.formula, formula: true, speaker, pitch, tics: 0 };
  const r = insertTic(l.text ?? '', profId);
  return { text: r.text, formula: false, lang: l.lang, speaker, pitch, tics: r.count };
}

/** Called when a line is actually shown; counts tics for the achievement. Returns achievement id if unlocked. */
export function recordShown(line: Line, profId: string): string | null {
  if (!line.tics) return null;
  const p = getProfessor(profId);
  let unlocked: string | null = null;
  Save.update((d) => {
    d.ticCount += line.tics;
    if (p.tic && d.ticCount >= 50 && !d.achievements.includes(p.achievement.id)) {
      d.achievements.push(p.achievement.id);
      unlocked = p.achievement.id;
    }
  });
  return unlocked;
}
