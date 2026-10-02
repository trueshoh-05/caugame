const KEY = 'cau-semester-survivor-v1';

export interface CourseResult { percent: number; letter: string; points: number; stageScores: number[]; wonStages: number; mercy: boolean }
export interface SaveData {
  lang: string;
  muted: boolean;
  name: string;
  accepted: string[];                       // courses whose quest was accepted
  progress: Record<string, number[]>;       // course -> stage scores so far
  results: Record<string, CourseResult>;    // finished courses
  credits: number;
  upgrades: string[];
  achievements: string[];
  ticCount: number;
  ammo: { maccoffee: number; nescafe: number };
  firstCoffee: boolean;
  campusPos: [number, number] | null;
  lunch: boolean;
  wins: Record<string, number>;
}

export function defaultSave(): SaveData {
  return {
    lang: 'en', muted: false, name: '', accepted: [], progress: {}, results: {}, credits: 0, upgrades: [],
    achievements: [], ticCount: 0, ammo: { maccoffee: 3, nescafe: 0 }, firstCoffee: false, campusPos: null, lunch: false, wins: {},
  };
}

let data: SaveData = load();

function load(): SaveData {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...defaultSave(), ...JSON.parse(s) };
  } catch { /* storage unavailable */ }
  return defaultSave();
}

export const Save = {
  get: (): SaveData => data,
  write(): void { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } },
  update(fn: (d: SaveData) => void): void { fn(data); Save.write(); },
  hasProgress: (): boolean => data.accepted.length > 0 || Object.keys(data.results).length > 0,
  /** Start a new semester but keep settings, credits, upgrades and achievements. */
  newSemester(): void {
    const keep = { lang: data.lang, muted: data.muted, name: data.name, credits: data.credits, upgrades: data.upgrades, achievements: data.achievements, ticCount: data.ticCount };
    data = { ...defaultSave(), ...keep };
    Save.write();
  },
  reset(): void { data = { ...defaultSave(), lang: data.lang, muted: data.muted }; Save.write(); },
  reload(): void { data = load(); },
};
