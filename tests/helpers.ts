import type { Page } from '@playwright/test';

export const URL = '/?debug';

export async function boot(page: Page, errors: string[] = []): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.scenes().includes('Menu'), null, { timeout: 60_000 });
}

export async function startGame(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.Save.newSemester());
  await page.evaluate(() => (window as any).__game.game.scene.getScene('Menu').scene.start('Campus'));
  await page.waitForFunction(() => (window as any).__game.scenes().includes('Campus'));
}

export const state = (page: Page) => page.evaluate(() => (window as any).__game.state());
export const scenes = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__game.scenes());
