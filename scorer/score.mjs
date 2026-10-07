#!/usr/bin/env node
/**
 * CAU: Semester Survivor — game scorer.
 *
 * Evaluates the game against the criteria in CLAUDE.md / GAME_PLAN.md and prints a
 * score out of 10 with prioritised feedback. Three kinds of evidence:
 *   1. static analysis of the repository (files, data, source),
 *   2. live probes: the production build is served and driven in headless Chromium,
 *   3. the Playwright test suite (pass ratio).
 *
 * Usage:  node scorer/score.mjs [--gen N] [--skip-tests] [--quick]
 * Output: scorer/reports/gen-N.json, scorer/reports/gen-N.md, and a row in scorer/HISTORY.md
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { CATEGORIES } from './criteria.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const REPORTS = path.join(ROOT, 'scorer', 'reports');
fs.mkdirSync(REPORTS, { recursive: true });
const gen = Number(opt('--gen', fs.readdirSync(REPORTS).filter((f) => /^gen-\d+\.json$/.test(f)).length));
const PORT = 4174;

const checks = [];
/** Record a check. score is 0..1. */
function check(category, id, weight, score, detail, fix) {
  const s = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  checks.push({ category, id, weight, score: s, detail, fix });
  const mark = s >= 0.999 ? '✓' : s <= 0.001 ? '✗' : '~';
  console.log(`  ${mark} [${category}] ${id} (${(s * 100).toFixed(0)}%) ${detail ?? ''}`);
}
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const sh = (cmd, timeout = 300_000) => {
  try { return { ok: true, out: execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout, encoding: 'utf8' }) }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};

// ---------------------------------------------------------------- static
function staticChecks() {
  console.log('\n== Static analysis');
  const pkg = JSON.parse(read('package.json') ?? '{}');
  const scripts = pkg.scripts ?? {};
  const need = ['dev', 'build', 'preview', 'test'];
  check('build', 'npm scripts', 1, need.filter((s) => scripts[s]).length / need.length, need.filter((s) => !scripts[s]).join(', ') || 'all present', 'Add the missing npm scripts (dev, build, preview, test).');
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  check('build', 'stack: Phaser 3 + TypeScript + Vite', 1, ['phaser', 'typescript', 'vite'].filter((d) => deps[d]).length / 3, Object.keys(deps).join(', '), 'Use Phaser 3, TypeScript and Vite as CLAUDE.md requires.');
  const tsconfig = read('tsconfig.json') ?? '';
  check('build', 'TypeScript strict', 1, /"strict"\s*:\s*true/.test(tsconfig) ? 1 : 0, '', 'Set "strict": true in tsconfig.json.');
  const vite = read('vite.config.ts') ?? '';
  check('build', "vite base './' (GitHub Pages)", 1, /base:\s*['"]\.\/['"]/.test(vite) ? 1 : 0, '', "Set base: './' in vite.config.ts.");
  const wf = walk(path.join(ROOT, '.github', 'workflows')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  check('build', 'GitHub Pages deploy workflow', 1.5, /deploy-pages|pages/.test(wf) && /main/.test(wf) ? 1 : 0, wf ? 'found' : 'missing', 'Add .github/workflows/*.yml that builds and deploys to GitHub Pages on push to main.');

  const tsc = sh('npx tsc --noEmit');
  check('build', 'typecheck passes', 2, tsc.ok ? 1 : 0, tsc.ok ? '' : tsc.out.split('\n').slice(0, 3).join(' | '), 'Fix TypeScript errors.');
  const build = sh('npx vite build', 300_000);
  check('build', 'production build passes', 3, build.ok ? 1 : 0, build.ok ? '' : build.out.slice(-300), 'Fix the Vite build.');
  const dist = walk(path.join(ROOT, 'dist'));
  const bytes = dist.reduce((a, f) => a + fs.statSync(f).size, 0);
  check('performance', 'first load under 5 MB', 2, bytes > 0 && bytes < 5e6 ? 1 : 0, `${(bytes / 1e6).toFixed(2)} MB`, 'Keep the shipped build under 5 MB (no reference images in dist).');
  const media = dist.filter((f) => /\.(png|jpe?g|gif|webp|mp3|ogg|wav|m4a|ttf|otf|woff2?)$/i.test(f));
  check('rules', 'v1 ships no external art/audio files', 2, media.length === 0 ? 1 : (exists('CREDITS.md') ? 0.5 : 0), media.map((f) => path.basename(f)).join(', ') || 'none', 'Version 1 must draw sprites in code and synthesise sound; anything else must be CC0/CC-BY and in CREDITS.md.');

  // ---- text & rules
  const en = JSON.parse(read('src/data/text/en.json'));
  const allText = JSON.stringify(en);
  const banned = /\b(guns?|blood|bloody|rifle|pistol|shotgun|bullets?|murder|corpse)\b/i;
  const srcFiles = walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|json)$/.test(f));
  const srcAll = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const literalText = [...srcAll.matchAll(/['"`]([^'"`\n]{3,})['"`]/g)].map((m) => m[1]).join('\n');
  const bannedHits = [...(allText + '\n' + literalText).matchAll(new RegExp(banned, 'gi'))].map((m) => m[0]);
  check('rules', 'tone: no guns, blood or violence words', 2, bannedHits.length ? 0 : 1, bannedHits.slice(0, 5).join(', ') || 'clean', 'Weapon is a laptop, projectiles are semicolons and coffee. Remove violent vocabulary.');
  const profs = JSON.parse(read('src/data/professors.json')).professors;
  const displayNames = profs.map((p) => p.displayName);
  const nameLeaks = /\b(?:real\s*name|realName)\s*[:=]/i.test(srcAll);
  check('rules', 'professors only appear by displayName', 1, nameLeaks ? 0 : 1, displayNames.join(', '), 'Never store or show a professor\'s real name.');
  const misspell = /\b(ze|zis|dat|vat|ees|haf)\b/i.test(allText);
  check('rules', 'no imitated-accent dialog', 1, misspell ? 0 : 1, '', 'Remove misspellings that imitate pronunciation.');
  check('rules', 'professors cannot be damaged (no damage path to NPCs)', 1, /damage(Professor|Npc|NPC|Student)/.test(srcAll) ? 0 : 1, '', 'Professors and students must never be hittable.');
  check('rules', 'mute button always available', 1, /mute/i.test(read('src/scenes/HUD.ts') ?? '') && /MuteButton/.test(read('src/scenes/Menu.ts') ?? '') ? 1 : 0, '', 'Show a mute button on every screen.');
  check('rules', 'CREDITS.md present', 1, exists('CREDITS.md') ? 1 : 0, '', 'Add CREDITS.md (even if v1 has no external assets, say so and credit the palette).');

  // ---- data-driven
  const used = new Set([...srcAll.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)].map((m) => m[1]));
  const get = (o, k) => k.split('.').reduce((n, p) => (n && typeof n === 'object' ? n[p] : undefined), o);
  const missing = [...used].filter((k) => !k.endsWith('.') && get(en, k) === undefined);
  check('data', 'every t() key exists in en.json', 2, used.size ? 1 - missing.length / used.size : 0, missing.length ? `missing: ${missing.slice(0, 6).join(', ')}` : `${used.size} keys ok`, 'Add the missing keys to src/data/text/en.json.');
  const sceneSrc = walk(path.join(ROOT, 'src', 'scenes')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const hard = [...sceneSrc.matchAll(/\b(?:txt|button|floatText|say)\(\s*this,[^;]*?,\s*'([A-Za-z][^'{}]*\s[^']*)'/g)].map((m) => m[1]).filter((s) => !/^#|^[A-Z_]+$/.test(s));
  check('data', 'no hard-coded player-facing strings in scenes', 1.5, Math.max(0, 1 - hard.length / 5), hard.slice(0, 5).join(' | ') || 'none', 'Move player-facing text into src/data/text/en.json and read it with t().');
  const courses = JSON.parse(read('src/data/courses.json'));
  const roomIds = walk(path.join(ROOT, 'src', 'data', 'rooms')).map((f) => path.basename(f, '.json'));
  const arenas = courses.courses.map((c) => c.arena);
  check('data', 'arena rooms exist as data (src/data/rooms)', 1, arenas.filter((a) => roomIds.includes(a)).length / arenas.length * (roomIds.includes('exam_hall') ? 1 : 0.8), roomIds.join(', '), 'Create a rect-based room file per arena in src/data/rooms/.');
  const enemiesTs = /balance\.enemies\[/.test(srcAll) && /stageSizing/.test(srcAll + (read('cpp/src/rules.cpp') ?? ''));
  check('data', 'balance numbers come from enemies.json', 1.5, enemiesTs ? 1 : 0, '', 'Read all balance numbers from enemies.json.');
  const magic = ((read('src/scenes/Arena.ts') ?? '') + (read('cpp/src/arena.cpp') ?? '')).match(/(?:hp|damage|speed|cooldown)\s*[:=]\s*\d{2,}/gi) ?? [];
  check('data', 'no balance literals in Arena', 1, Math.max(0, 1 - magic.length / 4), magic.slice(0, 4).join(', ') || 'none', 'Move balance literals into enemies.json.');
  const registry = read('src/systems/AssetRegistry.ts') ?? '';
  check('data', 'AssetRegistry lets sprites be swapped for files', 1, /kind:\s*'file'/.test(registry) ? 1 : 0, '', 'Keep an AssetRegistry mapping keys to code-drawn grids or files.');
  const sfxSwap = /AssetRegistry|registerSound|soundFile/.test(read('src/systems/Audio.ts') ?? '');
  check('data', 'sounds swappable via the registry too', 0.5, sfxSwap ? 1 : 0, '', 'Let the AssetRegistry map sound ids to optional audio files.');

  // ---- completeness vs plan (static part)
  const langs = ['ru', 'uz'].filter((l) => exists(`src/data/text/${l}.json`));
  let keyCoverage = 0;
  if (langs.length) {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
    const enKeys = flat(en);
    keyCoverage = langs.map((l) => { const lk = new Set(flat(JSON.parse(read(`src/data/text/${l}.json`)))); return enKeys.filter((k) => lk.has(k)).length / enKeys.length; }).reduce((a, b) => a + b, 0) / 2;
  }
  check('plan', 'Russian and Uzbek text files (same keys)', 2, keyCoverage, langs.length ? `${langs.join(', ')} · ${(keyCoverage * 100).toFixed(0)}% key coverage` : 'missing', 'Add src/data/text/ru.json and uz.json with the same keys as en.json.');
  const readme = read('README.md') ?? '';
  check('plan', 'README with how to play', 1, /how to play/i.test(readme) ? 1 : readme ? 0.4 : 0, readme ? `${readme.length} chars` : 'missing', 'Add README.md with controls (desktop + phone), dev commands and the scorer.');
  const eggs = Object.keys(en.easterEggs);
  const eggUsed = eggs.filter((k) => srcAll.includes(`easterEggs.${k}`) || (/easterEggs\.\$\{/.test(srcAll) && new RegExp(`['"]${k}['"]`).test(srcAll)));
  check('plan', 'easter eggs wired in', 1, eggUsed.length / eggs.length, `${eggUsed.length}/${eggs.length}${eggs.length - eggUsed.length ? ' missing: ' + eggs.filter((k) => !eggUsed.includes(k)).join(', ') : ''}`, 'Use every joke in text.easterEggs somewhere in the game.');
  const hazards = Object.keys(JSON.parse(read('src/data/enemies.json')).hazards);
  const hazUsed = hazards.filter((h) => srcAll.includes(h) || srcAll.includes(h.replace(/_(\w)/g, (_, c) => c.toUpperCase())));
  const hazImpl = ['portal_down', 'attendance_sheet', 'eight_am', 'deadline_wall', 'wifi_dead'].filter((h) => new RegExp(h.split('_')[0], 'i').test(sceneSrc));
  check('plan', 'all five hazards implemented', 1, Math.min(hazUsed.length, hazImpl.length) / hazards.length, hazImpl.join(', '), 'Implement Deadline wall, Portal down, Wi-Fi drop, 8 a.m. class and Attendance sheet.');
  const ui = ['enterName', 'credits', 'share', 'chooseLanguage', 'callProfessor', 'mute'];
  const uiUsed = ui.filter((k) => srcAll.includes(`ui.${k}`) || (k === 'mute' && /MuteButton/.test(srcAll)));
  check('plan', 'menu features (name, language, credits, share)', 1, uiUsed.length / ui.length, `missing: ${ui.filter((k) => !uiUsed.includes(k)).join(', ') || 'none'}`, 'Add a student-name field, language picker, credits screen and share button.');
  const font = /@font-face|FontFace|fonts\.googleapis/.test(srcAll + (read('index.html') ?? ''));
  check('plan', 'font covering Latin, Cyrillic and Uzbek (oʻ, gʻ)', 1, font ? 1 : 0.3, font ? 'webfont loaded' : 'system monospace only', 'Load a font with Latin, Cyrillic and oʻ/gʻ (e.g. a Google Font with cyrillic subset) and fall back to monospace.');
  const screens = walk(path.join(ROOT, 'docs', 'screens')).map((f) => path.basename(f));
  const phone = screens.filter((s) => /phone/.test(s)).length, desk = screens.filter((s) => /desktop/.test(s)).length;
  check('plan', 'desktop + 844×390 screenshots in docs/screens', 0.5, Math.min(1, (Math.min(phone, 3) + Math.min(desk, 3)) / 6), `${desk} desktop, ${phone} phone`, 'Save desktop and phone screenshots to docs/screens/ (the tests do this).');
  const music = JSON.parse(read('src/data/music.json') ?? '{"tracks":{}}');
  const tracks = ['menu', 'campus', 'stage', 'midterm', 'final', 'results', 'retake'].filter((k) => music.tracks?.[k]);
  check('plan', 'music for every context (data-driven sequencer)', 1, tracks.length / 7, tracks.join(', '), 'Add chiptune patterns for menu, campus, stage, mid-term, final, results and retake.');
  const tests = walk(path.join(ROOT, 'tests')).filter((f) => /\.spec\.ts$/.test(f));
  check('tests', 'test suite exists', 1, Math.min(1, tests.length / 5), `${tests.length} spec files`, 'Cover smoke, campus, course, systems and touch with Playwright specs.');
}

// ---------------------------------------------------------------- live probes
async function liveChecks() {
  console.log('\n== Live probes (production build, headless Chromium)');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const base = `http://localhost:${PORT}/?debug`;
  const browser = await chromium.launch();
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); }
    const errors = [];
    const open = async (vp = { width: 960, height: 540 }, touch = false) => {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const t0 = Date.now();
      await page.goto(base);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForFunction(() => window.__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
      return { page, ctx, bootMs: Date.now() - t0 };
    };
    const G = (page, fn, arg) => page.evaluate(fn, arg);
    const toCampus = async (page) => {
      await G(page, () => { const g = window.__game; g.Save.newSemester(); g.game.scene.getScene('Menu').scene.start('Campus'); });
      await page.waitForFunction(() => window.__game.scenes().includes('Campus'));
    };
    const toArena = async (page, course) => {
      await G(page, (c) => { const g = window.__game; g.acceptCourse(c); g.enterArena(c); }, course);
      await page.waitForFunction(() => window.__game.scenes().includes('Arena'));
      await page.waitForTimeout(600);
    };
    const st = (page) => G(page, () => window.__game.state());

    // --- boot
    const { page, ctx, bootMs } = await open();
    check('performance', 'boots to the title screen quickly', 1, bootMs < 6000 ? 1 : bootMs < 12000 ? 0.5 : 0, `${bootMs} ms`, 'Speed up boot (paint the campus lazily, keep the bundle small).');

    // --- campus
    await toCampus(page);
    const reach = await G(page, () => window.__game.reachability());
    check('campus', 'every walkable tile reachable from playerStart', 2, reach.reached / reach.walk, `${reach.reached}/${reach.walk}`, 'Make sure no walkable area is sealed off.');
    const coll = await G(page, () => window.__game.collisionRows());
    const campusData = JSON.parse(read('src/data/campus.json'));
    let same = 0, tot = 0;
    campusData.grid.forEach((row, y) => [...row].forEach((c, x) => { tot++; if ((campusData.legend[c].walkable ? '0' : '1') === coll?.[y]?.[x]) same++; }));
    check('campus', 'collision grid matches campus.json tile for tile', 2, same / tot, `${same}/${tot}`, 'Build collisions straight from campus.json: only # and . block.');
    const before = (await st(page)).player;
    await G(page, () => window.__game.move(1, 0));
    await page.waitForTimeout(700);
    await G(page, () => window.__game.move(0, 0));
    const after = (await st(page)).player;
    check('campus', 'player walks on campus', 1, after.x - before.x > 20 ? 1 : 0, `moved ${Math.round(after.x - before.x)} px`, 'Movement on campus is broken.');
    const npcOk = await G(page, () => {
      const c = window.__game.game.scene.getScene('Campus');
      return window.__game.campus.npcs.filter((n) => c.children.list.some((o) => o.texture?.key === n.prof && Math.floor(o.x / 16) === n.at[0])).length / window.__game.campus.npcs.length;
    });
    check('campus', 'professor NPCs placed from campus.json', 1, npcOk, '', 'Place professors at campus.json npcs.');
    const hud = await G(page, () => window.__game.HudState);
    check('campus', 'minimap and objective on campus', 1, (hud.minimap ? 0.5 : 0) + (hud.objective ? 0.5 : 0), hud.objective, 'Show a minimap and the current objective on campus.');
    // talk to Prof. Admin -> dialog -> quest card
    const admin = campusData.npcs.find((n) => n.prof === 'prof_admin').at;
    await G(page, ([x, y]) => window.__game.teleportTile(x, y + 1), admin);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const dlg = (await G(page, () => window.__game.scenes())).includes('Dialog');
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    const quest = (await G(page, () => window.__game.scenes())).includes('QuestCard');
    check('systems', 'talking to a professor opens dialog then the portal quest card', 2, (dlg ? 0.5 : 0) + (quest ? 0.5 : 0), `dialog=${dlg} quest=${quest}`, 'E near a professor should open the typewriter dialog, then the quest card.');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    const accepted = (await st(page)).save.accepted.includes('computer_programming');
    check('systems', 'accepting the quest unlocks the course', 1, accepted ? 1 : 0, '', 'Accept should record the course and unlock its arena door.');
    // locked door joke + walking time computed elsewhere
    const walkSecs = await G(page, () => {
      const g = window.__game, c = g.campus, [W, H] = c.size;
      const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && c.legend[c.grid[y][x]].walkable;
      const s = c.gates.find((x) => x.id === 'south_gate').at, t = c.buildings.find((b) => b.id === 'nw').doors[0].front;
      const dist = new Map([[s.join(), 0]]); const open = [[0, s[0], s[1]]];
      while (open.length) {
        open.sort((a, b) => a[0] - b[0]); const [d, x, y] = open.shift();
        if (x === t[0] && y === t[1]) return d * 16 / g.balance.player.campusSpeed;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
          if (!ok(nx, ny) || (dx && dy && !(ok(x + dx, y) && ok(x, y + dy)))) continue;
          const nd = d + (dx && dy ? Math.SQRT2 : 1);
          if (nd < (dist.get(`${nx},${ny}`) ?? 1e9)) { dist.set(`${nx},${ny}`, nd); open.push([nd, nx, ny]); }
        }
      }
      return -1;
    });
    check('campus', 'south gate → north-west building in 20–30 s', 1, walkSecs >= 20 && walkSecs <= 30 ? 1 : 0, `${walkSecs.toFixed(1)} s`, 'Tune campus walking speed so the crossing takes 20–30 s.');
    const wifi = await G(page, () => { const z = window.__game.campus.zones.find((z) => z.type === 'wifi_dead'); if (!z) return null; window.__game.teleportTile(z.rect[0] + 2, z.rect[1] + 2); return true; });
    await page.waitForTimeout(400);
    const wifiDead = wifi && (await G(page, () => window.__game.HudState.wifiDead));
    check('campus', 'Wi-Fi dead zone disables the minimap', 0.5, wifiDead ? 1 : 0, '', 'Hide the minimap inside wifi_dead zones.');

    // --- arena: core shooter
    await toArena(page, 'computer_programming');
    let s = await st(page);
    check('shooter', 'arena loads with stage from course components', 1, s.stage?.type === 'ca' && s.stage?.hpBudget === 800 ? 1 : 0, JSON.stringify(s.stage), 'Stage 1 of Computer Programming should be CA with 800 hp.');
    await page.waitForTimeout(2500);
    await G(page, () => window.__game.spawn('homework', 3));
    await page.waitForTimeout(500);
    // Aim at a real paper (in screen pixels), so the probe doesn't shoot into a desk.
    const aim = await G(page, () => { const a = window.__game.game.scene.getScene('Arena'); const p = a.papers.find((q) => q.active && !a.inDesk(q.x, q.y)) ?? a.papers.find((q) => q.active); return p ? { x: p.x, y: p.y } : { x: 240, y: 135 }; });
    const cbox = await page.locator('canvas').boundingBox();
    await page.mouse.move(cbox.x + aim.x / 480 * cbox.width, cbox.y + aim.y / 270 * cbox.height);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    s = await st(page);
    check('shooter', 'mouse fire spends the 30-shot clip', 1.5, s.clip < 30 ? 1 : 0, `clip ${s.clip}`, 'Hold left click to fire semicolons.');
    const dmgDone = await G(page, () => window.__game.game.scene.getScene('Arena').destroyed);
    check('shooter', 'semicolons damage paper', 1.5, dmgDone > 0 ? 1 : 0, `${dmgDone} hp destroyed`, 'Semicolons must hit and damage paper.');
    // empty clip -> compiling
    await G(page, () => { const a = window.__game.game.scene.getScene('Arena'); a.clip = 0; a.reload = 0; });
    await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
    const rel = await G(page, () => window.__game.HudState.reloading);
    check('shooter', "empty clip shows error and 'compiling...' reload", 1, rel ? 1 : 0, '', "Firing on empty should show error: expected ';' and start the reload.");
    // coffee
    await G(page, () => window.__game.spawn('homework', 4));
    await page.waitForTimeout(500);
    const coffeeBefore = (await st(page)).save.ammo.maccoffee;
    const throwsBefore = await G(page, () => window.__game.Audio.played.throw ?? 0);
    await G(page, () => { const g = window.__game; g.setAutoAim(true); g.press('coffee'); });
    await page.waitForTimeout(900);
    const thrown = (await G(page, () => window.__game.Audio.played.throw ?? 0)) > throwsBefore;
    const soggy = await G(page, () => window.__game.game.scene.getScene('Arena').papers.some((p) => p.active && p.soggy > 0) || window.__game.Audio.played.splash > 0);
    const coffeeAfter = (await st(page)).save.ammo.maccoffee;
    check('shooter', 'coffee throw splashes and makes paper soggy', 1.5, (thrown ? 0.5 : 0) + (soggy ? 0.5 : 0), `thrown=${thrown} ammo ${coffeeBefore}→${coffeeAfter}, soggy=${soggy}`, 'Q / right click throws coffee with splash and soggy slow.');
    // dash
    const p0 = (await st(page)).player;
    await G(page, () => { window.__game.move(-1, 0); window.__game.press('dash'); });
    await page.waitForTimeout(260);
    await G(page, () => window.__game.move(0, 0));
    const p1 = (await st(page)).player;
    check('shooter', 'dash (all-nighter) bursts the player forward', 1, p0.x - p1.x > 30 ? 1 : 0, `${Math.round(p0.x - p1.x)} px`, 'Space dashes with brief invulnerability.');
    // assist
    // Invulnerable for this probe, so a paper hit during the wait can't mask the heal.
    await G(page, () => { const a = window.__game.game.scene.getScene('Arena'); window.__game.setInvulnerable(true); a.sanity = 30; window.__game.press('help'); });
    await page.waitForTimeout(300);
    const healed = (await st(page)).sanity;
    await G(page, () => window.__game.setInvulnerable(false));
    check('shooter', 'professor assist (H) works once per stage', 1, healed >= 69 ? 1 : 0, `sanity 30→${healed}`, "Prof. Admin's Stress detected should restore 40 Sanity.");
    // feel
    const played = await G(page, () => window.__game.Audio.played);
    const sfxKinds = Object.keys(played).length;
    check('shooter', 'synthesised sound effects fire', 1, Math.min(1, sfxKinds / 6), `${sfxKinds} kinds: ${Object.keys(played).join(', ')}`, 'Add sfx for shoot, hit, tear, splash, pickup, ding, buzz.');
    const deadline1 = (await st(page)).deadline; await page.waitForTimeout(1100); const deadline2 = (await st(page)).deadline;
    check('shooter', 'Deadline counts down', 1, deadline2 < deadline1 ? 1 : 0, `${deadline1?.toFixed(1)}→${deadline2?.toFixed(1)}`, 'The deadline timer must count down.');
    // The fight logic lives in the C++ core (cpp/src/arena.cpp); the scene draws it.
    const arenaSrc = (read('src/scenes/Arena.ts') ?? '') + (read('src/scenes/ArenaTs.ts') ?? '') + (read('cpp/src/arena.cpp') ?? '');
    const feel = ['shake', 'setTintFill', 'explode', 'stain', 'floatText'].filter((k) => arenaSrc.includes(k));
    check('shooter', 'feel: shake, hit flash, shreds, stains, damage numbers', 1, feel.length / 5, feel.join(', '), 'Add screen shake, white hit flash, paper shreds, coffee stains and −5% damage numbers.');
    const behaviours = ['swarm_chase', 'chase_and_shoot', 'onDeath', 'midterm_plane', 'phase'].filter((k) => arenaSrc.includes(k));
    check('shooter', 'enemy behaviours and both bosses', 1.5, behaviours.length / 5, behaviours.join(', '), 'Implement swarm, chase, staple shooting, splitting projects, dive-bombing mid-term and 3-phase final.');
    // performance: 60 papers + 4x throttle
    await G(page, () => { window.__game.setInvulnerable(true); window.__game.setAutoAim(false); });
    await page.waitForTimeout(1500);
    const idle = (await st(page)).fps;
    await G(page, () => window.__game.spawn('quiz', 60));
    await page.waitForTimeout(2500);
    const busy = await st(page);
    check('performance', '60 papers on screen hold the frame rate', 2, busy.enemies >= 60 ? Math.min(1, busy.fps / (idle * 0.85)) : 0, `idle ${idle.toFixed(0)} fps → ${busy.fps.toFixed(0)} fps with ${busy.enemies} papers`, 'Pool objects, avoid per-frame allocations and Text creation.');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(3000);
    const thr = (await st(page)).fps;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('performance', '4× CPU throttle (mid-range Android) stays playable', 1.5, Math.min(1, thr / (idle * 0.6)), `${thr.toFixed(0)} fps throttled (baseline ${idle.toFixed(0)})`, 'Cut per-frame work: fewer Text updates, cheaper separation, pooled particles.');
    // mercy pass
    await G(page, () => window.__game.setInvulnerable(false));
    await G(page, () => window.__game.damagePlayer(1000));
    await page.waitForFunction(() => window.__game.scenes().includes('Results'), null, { timeout: 10_000 }).catch(() => {});
    s = await st(page);
    check('systems', 'mercy pass in Prof. Admin\'s course', 1, s.save.progress.computer_programming?.[0] === 70 ? 1 : 0, JSON.stringify(s.save.progress), 'Failing a Computer Programming stage should record 70 and move on.');
    await ctx.close();

    // --- a whole course with a scripted invulnerable player (real shooting, no kill switch)
    {
      const { page: p2, ctx: c2 } = await open();
      await toCampus(p2);
      await G(p2, () => { const g = window.__game; g.setInvulnerable(true); g.setAutoAim(true); g.setAutoSubmit(true); });
      await toArena(p2, 'engineering_physics');
      const t0 = Date.now();
      let stagesDone = 0;
      for (let stage = 0; stage < 2; stage++) {
        await p2.waitForFunction(() => window.__game.scenes().includes('Arena'), null, { timeout: 20_000 }).catch(() => {});
        const ts = Date.now();
        while (!(await G(p2, () => window.__game.scenes())).includes('Results') && Date.now() - ts < 180_000) {
          const a = (Date.now() - ts) / 1400;
          await G(p2, ([x, y]) => window.__game.move(x, y), [Math.sign(Math.sin(a)) * 0.8, Math.cos(a * 3) * 0.3]);
          await p2.waitForTimeout(300);
        }
        if ((await G(p2, () => window.__game.scenes())).includes('Results')) stagesDone++;
        await p2.keyboard.press('KeyE');
      }
      const r = (await st(p2)).save.results.engineering_physics;
      check('systems', 'Engineering Physics completes start to finish (scripted player)', 2, r ? 1 : stagesDone / 2, r ? `${r.percent}% ${r.letter} in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `${stagesDone}/2 stages`, 'A scripted invulnerable player must be able to clear every stage by shooting.');
      await c2.close();
    }

    // --- save / transcript
    {
      const { page: p3, ctx: c3 } = await open();
      await toCampus(p3);
      await G(p3, () => window.__game.acceptCourse('calculus_for_engineers'));
      await p3.reload();
      await p3.waitForFunction(() => window.__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
      const kept = (await st(p3)).save.accepted.includes('calculus_for_engineers');
      check('systems', 'progress survives a reload', 1, kept ? 1 : 0, '', 'Save to localStorage after every change.');
      await G(p3, () => {
        const g = window.__game; g.game.scene.getScene('Menu').scene.start('Campus');
        g.Save.update((s) => { s.results = { computer_programming: { percent: 95, letter: 'A', points: 4 }, calculus_for_engineers: { percent: 85, letter: 'B', points: 3 }, engineering_physics: { percent: 72, letter: 'C', points: 2 } }; });
      });
      await p3.waitForFunction(() => window.__game.scenes().includes('Campus'));
      const door = campusData.buildings.find((b) => b.id === 'nw').doors[0].front;
      await G(p3, ([x, y]) => window.__game.teleportTile(x, y), door);
      await p3.waitForTimeout(250);
      await p3.keyboard.press('KeyE');
      await p3.waitForTimeout(800);
      const tr = (await G(p3, () => window.__game.scenes())).includes('Transcript');
      const g = await G(p3, () => window.__game.Debug.lastGpa);
      check('systems', 'transcript with GPA at the end of the semester', 1, tr && g === 3 ? 1 : tr ? 0.5 : 0, `transcript=${tr} gpa=${g}`, 'All three grades → registrar door → transcript with GPA.');
      await c3.close();
    }

    // --- languages
    {
      const { page: p4, ctx: c4 } = await open();
      const langs = await G(p4, () => ['ru', 'uz'].map((l) => { window.__game.setLang(l); return [l, window.__game.state().lang]; }));
      const ok = langs.filter(([a, b]) => a === b).length;
      check('plan', 'language switch works (en / ru / uz)', 1, ok / 2, JSON.stringify(langs), 'Language picker must switch to ru and uz.');
      await c4.close();
    }

    // --- phone
    {
      const { page: m, ctx: mc } = await open({ width: 844, height: 390 }, true);
      const box = await m.locator('canvas').boundingBox();
      check('touch', 'canvas fills the 844×390 screen', 1, box.height >= 380 ? 1 : 0, `${Math.round(box.width)}×${Math.round(box.height)}`, 'Use Scale.FIT so the game fills a landscape phone.');
      await m.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 160 / 270);
      await m.waitForFunction(() => window.__game.scenes().includes('Campus'), null, { timeout: 10_000 }).catch(() => {});
      const started = (await G(m, () => window.__game.scenes())).includes('Campus');
      check('touch', 'tap to start works on touch', 1, started ? 1 : 0, '', 'The start button must react to a tap.');
      if (!started) await toCampus(m);
      await G(m, () => { const g = window.__game; g.acceptCourse('computer_programming'); g.setInvulnerable(true); g.enterArena('computer_programming'); });
      await m.waitForFunction(() => window.__game.scenes().includes('Arena'));
      await m.waitForTimeout(2500);
      const b0 = (await st(m)).player;
      const cdp2 = await mc.newCDPSession(m);
      const sx = box.x + box.width * 0.2, sy = box.y + box.height * 0.7;
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
      for (let i = 1; i <= 5; i++) { await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + i * 12, y: sy - i * 4, id: 1 }] }); await m.waitForTimeout(40); }
      await m.waitForTimeout(700);
      const ms = await st(m);
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check('touch', 'left-thumb joystick moves the player', 2, ms.player.x - b0.x > 15 ? 1 : 0, `${Math.round(ms.player.x - b0.x)} px`, 'Floating joystick on the left half of the screen.');
      check('touch', 'auto-aim + auto-fire on touch', 2, ms.clip < 30 ? 1 : 0, `clip ${ms.clip}`, 'On touch, fire automatically at the nearest paper.');
      const btns = await G(m, () => window.__game.Input.buttons.filter((b) => b.visible).map((b) => b.id));
      check('touch', 'coffee, dash and help buttons on screen', 1.5, ['coffee', 'dash', 'help'].filter((b) => btns.includes(b)).length / 3, btns.join(', '), 'Show coffee, dash and help buttons in the right-thumb area.');
      const coffeeBtn = await G(m, () => window.__game.Input.buttons.find((b) => b.id === 'coffee'));
      const c0 = (await st(m)).save.ammo.maccoffee;
      await m.touchscreen.tap(box.x + box.width * coffeeBtn.x / 480, box.y + box.height * coffeeBtn.y / 270);
      await m.waitForTimeout(300);
      const c1 = (await st(m)).save.ammo.maccoffee;
      check('touch', 'tapping the coffee button throws coffee', 1, c1 < c0 ? 1 : 0, `${c0}→${c1}`, 'Touch buttons must trigger their actions.');
      // Overflow: every visible text object inside the 480x270 logical screen.
      const overflow = await G(m, () => {
        const bad = [];
        for (const sc of window.__game.game.scene.getScenes(true)) {
          if (sc.scene.key === 'Arena' || sc.scene.key === 'Campus') continue;
          for (const o of sc.children.list) {
            if (o.type !== 'Text' || !o.visible || !o.text) continue;
            const b = o.getBounds();
            if (b.left < -1 || b.top < -1 || b.right > 481 || b.bottom > 271) bad.push(`${sc.scene.key}:${o.text.slice(0, 20)}`);
          }
        }
        return bad;
      });
      check('touch', 'no HUD text overflows the screen', 1, overflow.length ? Math.max(0, 1 - overflow.length / 3) : 1, overflow.slice(0, 3).join(' | ') || 'none', 'Keep every HUD text inside 480×270.');
      await mc.close();
      const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
      const pp = await pc.newPage();
      await pp.goto(base);
      const rot = await pp.locator('#rotate').isVisible();
      check('touch', '"rotate your phone" screen in portrait', 1, rot ? 1 : 0, '', 'Show a rotate overlay in portrait.');
      await pc.close();
    }
    const uniq = [...new Set(errors)];
    check('build', 'no console errors during probes', 2, uniq.length === 0 ? 1 : Math.max(0, 1 - uniq.length / 3), uniq.slice(0, 3).join(' | ') || 'none', 'Fix the runtime errors.');
  } finally {
    await browser.close();
    server.kill();
  }
}

// ---------------------------------------------------------------- tests
function testSuite() {
  console.log('\n== Playwright test suite');
  const r = sh('npx playwright test --reporter=json', 1_500_000);
  let passed = 0, total = 0, failedNames = [];
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf('{')));
    const walkSuites = (s) => { for (const sp of s.specs ?? []) for (const t of sp.tests) { total++; if (t.results.some((x) => x.status === 'passed')) passed++; else failedNames.push(sp.title); } for (const c of s.suites ?? []) walkSuites(c); };
    for (const s of j.suites) walkSuites(s);
  } catch { /* unparsable */ }
  check('tests', 'Playwright suite passes', 4, total ? passed / total : 0, `${passed}/${total} passed${failedNames.length ? ' · failing: ' + failedNames.slice(0, 4).join(' | ') : ''}`, 'Make every Playwright test pass.');
}

// ---------------------------------------------------------------- report
function report() {
  const cats = Object.entries(CATEGORIES).map(([id, c]) => {
    const cs = checks.filter((x) => x.category === id);
    const w = cs.reduce((a, x) => a + x.weight, 0);
    const score = w ? (10 * cs.reduce((a, x) => a + x.weight * x.score, 0)) / w : 0;
    return { id, name: c.name, weight: c.weight, score: Math.round(score * 10) / 10, checks: cs.length };
  });
  const tw = cats.reduce((a, c) => a + c.weight, 0);
  const overall = Math.round((cats.reduce((a, c) => a + c.weight * c.score, 0) / tw) * 10) / 10;
  // Feedback: biggest lost points first (weight within category × category weight).
  const catW = Object.fromEntries(cats.map((c) => [c.id, c.weight / tw / checks.filter((x) => x.category === c.id).reduce((a, x) => a + x.weight, 0)]));
  const feedback = checks.filter((c) => c.score < 0.999).map((c) => ({ ...c, impact: Math.round(10 * (1 - c.score) * c.weight * catW[c.category] * 100) / 100 })).sort((a, b) => b.impact - a.impact);
  const out = { generation: gen, date: new Date().toISOString(), overall, categories: cats, feedback, checks };
  fs.writeFileSync(path.join(REPORTS, `gen-${gen}.json`), JSON.stringify(out, null, 2));
  const md = [
    `# Scorer report — generation ${gen}`, '', `**Overall: ${overall} / 10**  ·  ${out.date}`, '',
    '| Category | Weight | Score |', '|---|---|---|',
    ...cats.map((c) => `| ${c.name} | ${c.weight} | ${c.score} |`), '',
    '## Feedback (largest impact first)', '',
    ...(feedback.length ? feedback.map((f, i) => `${i + 1}. **[${f.category}] ${f.id}** — ${(f.score * 100).toFixed(0)}% (−${f.impact} pts). ${f.detail ? `_${f.detail}_. ` : ''}${f.fix}`) : ['Nothing left to fix.']), '',
    '## All checks', '', '| | Category | Check | Score | Detail |', '|---|---|---|---|---|',
    ...checks.map((c) => `| ${c.score >= 0.999 ? '✓' : c.score <= 0.001 ? '✗' : '~'} | ${c.category} | ${c.id} | ${(c.score * 100).toFixed(0)}% | ${String(c.detail ?? '').replace(/\|/g, '/').slice(0, 120)} |`),
  ].join('\n');
  fs.writeFileSync(path.join(REPORTS, `gen-${gen}.md`), md + '\n');
  const hist = path.join(ROOT, 'scorer', 'HISTORY.md');
  if (!fs.existsSync(hist)) fs.writeFileSync(hist, `# Score history\n\n| Gen | Date | Overall | ${cats.map((c) => c.name).join(' | ')} |\n|---|---|---|${cats.map(() => '---').join('|')}|\n`);
  fs.appendFileSync(hist, `| ${gen} | ${out.date.slice(0, 16).replace('T', ' ')} | **${overall}** | ${cats.map((c) => c.score).join(' | ')} |\n`);
  console.log(`\n${'='.repeat(60)}\nGeneration ${gen}: ${overall} / 10`);
  for (const c of cats) console.log(`  ${c.name.padEnd(34)} ${String(c.score).padStart(4)}  (w ${c.weight})`);
  console.log('\nTop feedback:');
  feedback.slice(0, 10).forEach((f, i) => console.log(`  ${i + 1}. [${f.category}] ${f.id} (−${f.impact}): ${f.fix}`));
  console.log(`\nReport: scorer/reports/gen-${gen}.md`);
  return overall;
}

staticChecks();
if (!flag('--static')) await liveChecks();
if (!flag('--skip-tests') && !flag('--static')) testSuite();
const overall = report();
process.exitCode = overall >= Number(opt('--target', 8)) ? 0 : 1;
