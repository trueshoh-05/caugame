import { test, expect } from '@playwright/test';

test('phone landscape 844x390: joystick moves, auto-fire shoots', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
  await page.screenshot({ path: 'docs/screens/menu-phone.png' });
  const box = (await page.locator('canvas').boundingBox())!;
  // Tap "Tap to start" (logical 240,160).
  await page.touchscreen.tap(box.x + box.width * 240 / 480, box.y + box.height * 160 / 270);
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Campus'), null, { timeout: 15_000 });
  await page.screenshot({ path: 'docs/screens/campus-phone.png' });
  await page.evaluate(() => { const g = (window as any).__game; g.acceptCourse('computer_programming'); g.setInvulnerable(true); g.enterArena('computer_programming'); });
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'));
  await page.waitForTimeout(2500);
  const before = (await page.evaluate(() => (window as any).__game.state())).player;
  // Drag the left-thumb joystick to the right using CDP touch events.
  const cdp = await ctx.newCDPSession(page);
  const sx = box.x + box.width * 0.2, sy = box.y + box.height * 0.7;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + i * 12, y: sy, id: 1 }] }); await page.waitForTimeout(50); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/screens/arena-phone.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => (window as any).__game.state());
  expect(after.player.x).toBeGreaterThan(before.x + 20);
  // Auto-fire: clip goes down without any mouse input.
  expect(after.clip).toBeLessThan(30);
  expect(errors).toEqual([]);
  await ctx.close();
});
