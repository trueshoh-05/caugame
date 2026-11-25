import { test, expect } from '@playwright/test';

const STUB = `window.__gc = []; window.goatcounter = { count: (v) => window.__gc.push(v) };
              window.__gc.push({ path: location.pathname, event: false });`;

test('on the public site: visit and game events are counted, without names', async ({ page, baseURL }) => {
  const scripts: string[] = [];
  // Serve the built game as if it were https://causurvivor.uz, and stand in for GoatCounter's script.
  await page.route('https://causurvivor.uz/**', async (route) => {
    const url = new URL(route.request().url());
    const res = await page.request.get(new URL(url.pathname + url.search, baseURL).toString());
    await route.fulfill({ response: res });
  });
  await page.route('https://gc.zgo.at/count.js', (route) => { scripts.push(route.request().url()); return route.fulfill({ contentType: 'text/javascript', body: STUB }); });
  await page.goto('https://causurvivor.uz/');
  await page.waitForFunction(() => (window as any).__gc?.length >= 1, null, { timeout: 30_000 });
  expect(scripts).toHaveLength(1);
  const attr = await page.evaluate(() => document.querySelector('script[data-goatcounter]')?.getAttribute('data-goatcounter'));
  expect(attr).toBe('https://trueshoh.goatcounter.com/count');
  // Start a game from the title screen.
  await page.waitForTimeout(1500);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 160 / 270);
  await page.waitForTimeout(1500);
  const paths: string[] = await page.evaluate(() => (window as any).__gc.filter((e: any) => e.event).map((e: any) => e.path));
  expect(paths).toContain('game/start/desktop/en');
  expect(paths.join(' ')).not.toMatch(/Student|name/i);
});

test('locally and in tests nothing is counted', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (/goatcounter|gc\.zgo\.at/.test(r.url())) requests.push(r.url()); });
  await page.goto('/');
  await page.waitForTimeout(4000);
  expect(requests).toEqual([]);
});
