import campusJson from '../data/campus.json';
import coursesJson from '../data/courses.json';
import professorsJson from '../data/professors.json';
import enemiesJson from '../data/enemies.json';
import musicJson from '../data/music.json';

export type XY = [number, number];

export interface Door { at: XY; front: XY; side: string; leadsTo: string | null; part?: string }
export interface Building { id: string; name: string; nameConfirmed: boolean; seed: XY; bbox: number[]; tiles: number; doors: Door[] }
export interface Campus {
  size: XY; tileSize: number; planPixelsPerTile: number;
  legend: Record<string, { name: string; walkable: boolean; draw?: string }>;
  playerStart: XY; grid: string[]; buildings: Building[];
  gates: { id: string; at: XY; note?: string }[];
  npcs: { prof: string; at: XY }[];
  pickups: { type: string; at: XY; gives?: string }[];
  props: { type: string; at: XY }[];
  zones: { type: string; rect: number[]; note?: string }[];
}
export interface Component { type: 'ca' | 'midterm' | 'projects' | 'final'; weight: number }
export interface Course {
  id: string; name: string; professor: string; arena: string; skin: string; confirmed: boolean;
  components: Component[]; portalPage: Record<string, string>; shieldPickup?: string;
}
export interface GradeBand { min: number; letter: string; points: number }
export interface Professor {
  id: string; displayName: string; course: string; building: string; office?: string;
  tic: { phrase: string; chance: number; maxPerBox: number } | null;
  voiceBlipPitch: number; personalityRule: string;
  assist: { id: string; name: string; effect: string; seconds?: number; heals?: number };
  signatureItem: string;
  achievement: { id: string; name: string; condition: string };
}
export interface EnemyDef {
  hp: number; speed: number; touchDamage: number; behaviour: string;
  shot?: { name: string; damage: number; speed: number; everySeconds: number };
  onDeath?: { spawn: string; count: number }; idleTeammates?: number;
}

export const campus = campusJson as unknown as Campus;
export const courses = coursesJson as unknown as {
  semesterOrder: string[]; courses: Course[]; gradeScale: { confirmed: boolean; bands: GradeBand[] };
};
export const professors = (professorsJson as unknown as { professors: Professor[] }).professors;
export const balance = enemiesJson as unknown as typeof enemiesJson & { enemies: Record<string, EnemyDef> };
export const music = musicJson as unknown as {
  bpm: Record<string, number>;
  tracks: Record<string, { lead: (number | null)[]; bass: (number | null)[]; drums: string }>;
};

export function getCourse(id: string): Course {
  const c = courses.courses.find((x) => x.id === id);
  if (!c) throw new Error('unknown course ' + id);
  return c;
}
export function getProfessor(id: string): Professor {
  const p = professors.find((x) => x.id === id);
  if (!p) throw new Error('unknown professor ' + id);
  return p;
}
export function courseForArena(arena: string): Course | undefined {
  return courses.courses.find((c) => c.arena === arena);
}

// Arena rooms live in src/data/rooms/*.json and are picked up automatically.
export interface Room {
  id: string; name: string; floor: string; size: XY;
  playerStart: XY; spawns: XY[]; desks: number[][]; pickups: { type: string; at: XY }[];
}
const roomModules = import.meta.glob('../data/rooms/*.json', { eager: true }) as Record<string, { default: Room }>;
export const rooms: Record<string, Room> = {};
for (const m of Object.values(roomModules)) rooms[m.default.id] = m.default;
