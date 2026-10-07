import { test, expect } from '@playwright/test';
import { boot, startGame, state } from './helpers';
import coursesData from '../src/data/courses.json' with { type: 'json' };

test('the C++ core (WebAssembly) is running the game', async ({ page }) => {
  await boot(page);
  const s = await state(page);
  expect(s.core).toBe('cpp');
});

test('C++ and TypeScript build identical stages for every course', async ({ page }) => {
  await boot(page);
  for (const c of coursesData.courses) {
    const [cpp, ts] = await page.evaluate((id: string) => [(window as any).__game.stagePlan(id), (window as any).__game.stagePlanTs(id)], c.id);
    expect(cpp, c.id).toEqual(ts);
  }
});

test('C++ and TypeScript agree on grades', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const core = (window as any).__game.Core.core;
    return {
      letters: [95, 85, 75, 65, 30].map((p) => core.letterFor(p).letter).join(''),
      cleared: core.clearedScore(50, 100, true),
      failed: core.failedScore(0.5),
      percent: core.coursePercent('computer_programming', [70, 70, 90, 80]),
      gpa: core.gpa([4, 3, 2]),
    };
  });
  expect(r).toEqual({ letters: 'ABCDF', cleared: 90, failed: 20, percent: 79, gpa: 3 });
});

test('?core=ts falls back to the TypeScript game', async ({ page }) => {
  await page.goto('/?debug&core=ts');
  await page.waitForFunction(() => (window as any).__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
  expect((await state(page)).core).toBe('ts');
  await startGame(page);
  await page.evaluate(() => { const g = (window as any).__game; g.acceptCourse('engineering_physics'); g.enterArena('engineering_physics'); });
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'));
  await page.waitForTimeout(1500);
  const s = await state(page);
  expect(s.boss?.max ?? s.boss?.hp).toBeTruthy();
});
