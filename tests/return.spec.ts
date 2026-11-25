import { test, expect } from '@playwright/test';
import { boot, startGame, scenes } from './helpers';

// Regression: walking into a door to enter a room, then choosing "Back to campus" after the
// fight, must leave you on the campus, not throw you straight into the next fight.
for (const [course, door, push] of [
  ['computer_programming', [46, 66], [-1, 0]],   // AE building, east door (mercy pass: stage counts, next stage would start)
  ['engineering_physics', [91, 36], [1, 0]],     // East building, west door (retake)
] as const) {
  test(`back to campus after failing ${course} stays on campus`, async ({ page }) => {
    await boot(page);
    await startGame(page);
    await page.evaluate((c) => (window as any).__game.acceptCourse(c), course);
    await page.evaluate(([x, y]) => (window as any).__game.teleportTile(x, y), door);
    await page.evaluate(([x, y]) => (window as any).__game.move(x, y), push);
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'), null, { timeout: 10_000 });
    await page.evaluate(() => (window as any).__game.move(0, 0));
    await page.waitForTimeout(500);
    await page.evaluate(() => (window as any).__game.damagePlayer(1000));
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Results'), null, { timeout: 10_000 });
    await page.waitForTimeout(400);
    const box = (await page.locator('canvas').boundingBox())!;
    // "Back to campus" is the right-hand button at the bottom (logical 320, 240).
    await page.mouse.click(box.x + box.width * 320 / 480, box.y + box.height * 240 / 270);
    await page.waitForTimeout(2500);
    const s = await scenes(page);
    expect(s).toContain('Campus');
    expect(s).not.toContain('Arena');
    // Walking into the door on purpose still enters the room.
    await page.evaluate(([x, y]) => (window as any).__game.move(x, y), push);
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'), null, { timeout: 10_000 });
    await page.evaluate(() => (window as any).__game.move(0, 0));
  });
}
