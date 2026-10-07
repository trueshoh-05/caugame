// Prints a behavioural fingerprint of a built C++ core: every stage plan plus a seeded,
// scripted fight per stage. Two builds of the same C++ source print the same thing.
//   node scripts/core-fingerprint.mjs [path/to/cau_core.mjs]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modPath = path.resolve(process.argv[2] ?? 'src/core/generated/cau_core.mjs');
const createCauCore = (await import(pathToFileURL(modPath).href)).default;
const M = await createCauCore();
const data = (p) => fs.readFileSync(path.join('src/data', p), 'utf8');
const rooms = '[' + fs.readdirSync('src/data/rooms').filter((f) => f.endsWith('.json')).sort().map((f) => data(`rooms/${f}`)).join(',') + ']';
const core = new M.Core(data('enemies.json'), data('courses.json'), data('professors.json'), data('campus.json'), rooms);
const courses = JSON.parse(data('courses.json')).courses;
const out = [];
for (const c of courses) {
  for (const s of core.stagePlan(c.id)) {
    const a = new M.Arena(core, { courseId: c.id, stageIndex: s.index, seed: 7 + s.index, firstCoffee: true });
    a.setInvulnerable(true); a.setAutoSubmit(true);
    let t = 0;
    for (; !a.state().ended && t < 400; t += 1 / 60) {
      const ang = t / 1.4;
      a.step(1 / 60, { autoAim: true, moveX: (Math.sin(ang) >= 0 ? 1 : -1) * 0.8, moveY: Math.cos(ang * 3) * 0.3 });
      a.events();
    }
    out.push({ course: c.id, stage: s.index, total: s.total, waves: s.waves.map((w) => w.length), seconds: Math.round(t * 60), result: a.result() });
    a.delete();
  }
}
console.log(JSON.stringify(out, null, 1));
