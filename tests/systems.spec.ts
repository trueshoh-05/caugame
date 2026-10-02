import { test, expect } from '@playwright/test';
import { boot, startGame, state } from './helpers';

test('progress survives a page reload', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => (window as any).__game.acceptCourse('engineering_physics'));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
  const s = await state(page);
  expect(s.save.accepted).toContain('engineering_physics');
});

test('full semester ends in a transcript with a GPA', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.Save.update((s: any) => {
      s.results = {
        computer_programming: { percent: 92, letter: 'A', points: 4, stageScores: [], wonStages: 4, mercy: false },
        calculus_for_engineers: { percent: 81, letter: 'B', points: 3, stageScores: [], wonStages: 3, mercy: false },
        engineering_physics: { percent: 75, letter: 'C', points: 2, stageScores: [], wonStages: 2, mercy: false },
      };
    });
  });
  const door = await page.evaluate(() => (window as any).__game.campus.buildings.find((b: any) => b.id === 'nw').doors[0].front);
  await page.evaluate(([x, y]) => (window as any).__game.teleportTile(x, y), door);
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Transcript'), null, { timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/screens/transcript-desktop.png' });
  const gpa = await page.evaluate(() => (window as any).__game.Debug.lastGpa);
  expect(gpa).toBe(3);
});

test('Metroman says "and whatnot" in about half his boxes, never twice in one', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__game;
    let withTic = 0, boxes = 0, doubles = 0;
    for (let i = 0; i < 400; i++) for (const l of g.professorLines('prof_metroman', 'tip')) {
      boxes++;
      const n = (l.text.match(/and whatnot/g) ?? []).length;
      if (n) withTic++;
      if (n > 1) doubles++;
      if (l.text.includes('{tic}')) doubles++;
    }
    return { ratio: withTic / boxes, doubles };
  });
  expect(r.doubles).toBe(0);
  expect(r.ratio).toBeGreaterThan(0.35);
  expect(r.ratio).toBeLessThan(0.65);
});

test('60 papers on screen keep the frame rate up', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => { const g = (window as any).__game; g.setInvulnerable(true); g.acceptCourse('calculus_for_engineers'); g.enterArena('calculus_for_engineers'); });
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'));
  await page.waitForTimeout(2500);
  // Headless Chromium renders WebGL in software, so compare against this machine's own baseline.
  const idle = (await state(page)).fps;
  await page.evaluate(() => (window as any).__game.spawn('quiz', 60));
  await page.waitForTimeout(3000);
  const s = await state(page);
  expect(s.enemies).toBeGreaterThanOrEqual(60);
  expect(s.fps).toBeGreaterThan(idle * 0.8);
});
