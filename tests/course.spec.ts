import { test, expect } from '@playwright/test';
import { boot, startGame, state, scenes } from './helpers';
import enemies from '../src/data/enemies.json' with { type: 'json' };
import coursesData from '../src/data/courses.json' with { type: 'json' };

test('stage health totals match stageSizing for every course', async ({ page }) => {
  await boot(page);
  for (const c of coursesData.courses) {
    const plan = await page.evaluate((id: string) => (window as any).__game.stagePlan(id), c.id);
    plan.forEach((s: any, i: number) => {
      const budget = enemies.stageSizing.courseHpBudget * c.components[i].weight / 100;
      expect(s.hpBudget).toBe(budget);
      expect(s.total).toBe(budget);
      expect(s.deadline).toBe(enemies.stageSizing.deadlineSeconds.base + enemies.stageSizing.deadlineSeconds.perWeightPoint * c.components[i].weight);
      if (c.components[i].type === 'midterm') expect(s.boss).toBe('midterm_paper');
      if (c.components[i].type === 'final') expect(s.boss).toBe('final_exam');
    });
  }
});

test('Computer Programming can be completed by a scripted invulnerable player', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, errors);
  await startGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setInvulnerable(true); g.setAutoAim(true); g.setAutoSubmit(true);
    g.acceptCourse('computer_programming');
    g.enterArena('computer_programming');
  });
  for (let stage = 0; stage < 4; stage++) {
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'), null, { timeout: 20_000 });
    // Strafe left and right along the front of the room, out from behind the desks.
    const t0 = Date.now();
    while (!(await scenes(page)).includes('Results')) {
      const a = (Date.now() - t0) / 1400;
      await page.evaluate(([x, y]) => (window as any).__game.move(x, y), [Math.sign(Math.sin(a)) * 0.8, Math.cos(a * 3) * 0.3]);
      if (stage === 0 && Date.now() - t0 > 4000 && Date.now() - t0 < 4500) await page.screenshot({ path: 'docs/screens/arena-desktop.png' });
      if (stage === 3 && Date.now() - t0 > 8000 && Date.now() - t0 < 8600) await page.screenshot({ path: 'docs/screens/final-boss-desktop.png' });
      await page.waitForTimeout(250);
      // Real time, not game time: on a slow machine the game clock runs slower than the wall clock.
      expect(Date.now() - t0, `stage ${stage} still running`).toBeLessThan(240_000);
    }
    await page.evaluate(() => (window as any).__game.move(0, 0));
    console.log(`stage ${stage} cleared in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.waitForTimeout(300);
    if (stage === 3) await page.screenshot({ path: 'docs/screens/results-desktop.png' });
    await page.keyboard.press('KeyE');
  }
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Campus'), null, { timeout: 10_000 });
  const s = await state(page);
  const r = s.save.results.computer_programming;
  expect(r).toBeTruthy();
  expect(r.percent).toBeGreaterThan(70);
  expect(['A', 'B', 'C', 'D', 'F']).toContain(r.letter);
  expect(errors).toEqual([]);
});

test('failing a stage of Prof. Admin Manzur triggers the mercy pass', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => { const g = (window as any).__game; g.acceptCourse('computer_programming'); g.enterArena('computer_programming'); });
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'));
  await page.evaluate(() => (window as any).__game.damagePlayer(1000));
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Results'), null, { timeout: 10_000 });
  const s = await state(page);
  expect(s.save.progress.computer_programming[0]).toBe(enemies.scoring.mercyPassScore);
});

test('failing a stage in another course means a retake', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => { const g = (window as any).__game; g.acceptCourse('calculus_for_engineers'); g.enterArena('calculus_for_engineers'); });
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'));
  await page.evaluate(() => (window as any).__game.damagePlayer(1000));
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Results'), null, { timeout: 10_000 });
  const s = await state(page);
  expect(s.save.progress.calculus_for_engineers).toBeUndefined();
});
