import { balance, getCourse } from './Data';

export interface Spawn { type: string; hpOverride?: number }
export interface Stage {
  courseId: string; index: number; type: string; weight: number;
  hpBudget: number; deadline: number;
  waves: Spawn[][];          // empty for boss stages
  boss: 'midterm_paper' | 'final_exam' | null;
}

const SZ = balance.stageSizing;

export function hpOf(s: Spawn): number { return s.hpOverride ?? balance.enemies[s.type].hp; }

/** Build the enemy list for a wave stage so that the primary spawns' health adds up to exactly `budget`. */
export function buildWaves(kind: 'ca' | 'projects', budget: number): Spawn[][] {
  const cfg = SZ.waves[kind] as { mix: Record<string, number>; waveCount: number };
  const types = Object.keys(cfg.mix).sort((a, b) => balance.enemies[b].hp - balance.enemies[a].hp);
  let remaining = budget;
  const spawns: Spawn[] = [];
  for (const type of types) {
    const hp = balance.enemies[type].hp;
    let n = Math.round((budget * cfg.mix[type]) / hp);
    if (n === 0 && cfg.mix[type] > 0 && remaining >= hp) n = 1;
    n = Math.min(n, Math.floor(remaining / hp));
    for (let i = 0; i < n; i++) spawns.push({ type });
    remaining -= n * hp;
  }
  const smallest = types[types.length - 1];
  const sHp = balance.enemies[smallest].hp;
  while (remaining >= sHp) { spawns.push({ type: smallest }); remaining -= sHp; }
  if (remaining > 0) {
    // Leftover health goes onto one extra-tough paper so totals match exactly.
    const last = spawns[spawns.length - 1] ?? { type: smallest };
    if (!spawns.length) spawns.push(last);
    last.hpOverride = hpOf(last) + remaining;
    remaining = 0;
  }
  // Deal spawns into waves, big papers spread out, smallest first wave gets the swarm.
  const waves: Spawn[][] = Array.from({ length: cfg.waveCount }, () => []);
  const sorted = [...spawns].sort((a, b) => hpOf(b) - hpOf(a));
  const totals = new Array(cfg.waveCount).fill(0);
  for (const s of sorted) {
    const i = totals.indexOf(Math.min(...totals));
    waves[i].push(s); totals[i] += hpOf(s);
  }
  return waves.filter((w) => w.length);
}

export function buildStage(courseId: string, index: number): Stage {
  const course = getCourse(courseId);
  const comp = course.components[index];
  const hpBudget = Math.round((SZ.courseHpBudget * comp.weight) / 100);
  const deadline = SZ.deadlineSeconds.base + SZ.deadlineSeconds.perWeightPoint * comp.weight;
  const stage: Stage = { courseId, index, type: comp.type, weight: comp.weight, hpBudget, deadline, waves: [], boss: null };
  if (comp.type === 'midterm') stage.boss = 'midterm_paper';
  else if (comp.type === 'final') stage.boss = 'final_exam';
  else stage.waves = buildWaves(comp.type, hpBudget);
  return stage;
}

export function stageTotalHp(stage: Stage): number {
  if (stage.boss) return stage.hpBudget;
  return stage.waves.flat().reduce((a, s) => a + hpOf(s), 0);
}
