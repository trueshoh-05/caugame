import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test('title screen renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(page).toHaveTitle(/Semester Survivor/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screens/menu-desktop.png' });
  expect(errors).toEqual([]);
});

test('portrait phone shows the rotate screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/?debug');
  await expect(page.locator('#rotate')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/rotate-portrait.png' });
  await ctx.close();
});
