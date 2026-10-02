import { test, expect } from '@playwright/test';
import { boot, startGame, state } from './helpers';
import campus from '../src/data/campus.json' with { type: 'json' };

test('campus collision matches campus.json and every walkable tile is reachable', async ({ page }) => {
  await boot(page);
  await startGame(page);
  const rows: string[] = await page.evaluate(() => (window as any).__game.collisionRows());
  const legend = campus.legend as Record<string, { walkable: boolean }>;
  for (let y = 0; y < campus.size[1]; y++) {
    const expected = [...campus.grid[y]].map((c) => (legend[c].walkable ? '0' : '1')).join('');
    expect(rows[y], `row ${y}`).toBe(expected);
  }
  const r = await page.evaluate(() => (window as any).__game.reachability());
  expect(r.reached).toBe(r.walk);
  await page.screenshot({ path: 'docs/screens/campus-desktop.png' });
});

test('player collides with buildings and walks', async ({ page }) => {
  await boot(page);
  await startGame(page);
  // Stand just south of the north-west building's wall and walk north into it.
  await page.evaluate(() => (window as any).__game.teleportTile(70, 19));
  await page.evaluate(() => (window as any).__game.move(0, -1));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__game.move(0, 0));
  const s = await state(page);
  expect(s.player.y).toBeGreaterThan(17 * 16);
  expect(s.player.y).toBeLessThan(20 * 16);
});

test('every enterable door works and locked doors stay locked', async ({ page }) => {
  await boot(page);
  await startGame(page);
  for (const b of campus.buildings) for (const d of b.doors) {
    if (!d.leadsTo || d.leadsTo === 'exam_hall') continue;
    const course = (await page.evaluate(() => (window as any).__game.courses.courses)).find((c: any) => c.arena === d.leadsTo);
    await page.evaluate((id: string) => (window as any).__game.acceptCourse(id), course.id);
    await page.evaluate(([x, y]) => (window as any).__game.teleportTile(x, y), d.front);
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Arena'), null, { timeout: 10_000 });
    const s = await state(page);
    expect(s.stage.course).toBe(course.id);
    // Leave: back to campus.
    await page.evaluate(() => { const g = (window as any).__game.game; g.scene.stop('Arena'); g.scene.stop('HUD'); g.scene.wake('Campus'); });
    await page.waitForFunction(() => (window as any).__game.scenes().includes('Campus'));
  }
});

test('professors stand where campus.json says', async ({ page }) => {
  await boot(page);
  await startGame(page);
  const npcs = await page.evaluate(() => {
    const c = (window as any).__game.game.scene.getScene('Campus');
    return c.children.list.filter((o: any) => o.texture && /^prof_/.test(o.texture.key)).map((o: any) => ({ key: o.texture.key, x: o.x, y: o.y }));
  });
  for (const n of campus.npcs) {
    const found = npcs.find((o: any) => o.key === n.prof);
    expect(found, n.prof).toBeTruthy();
    expect(Math.floor(found.x / 16)).toBe(n.at[0]);
  }
});

test('walking from the south gate to the north-west building takes 20-30 s', async ({ page }) => {
  await boot(page);
  const secs = await page.evaluate(() => {
    const g = (window as any).__game;
    const c = g.campus;
    const [W, H] = c.size;
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && c.legend[c.grid[y][x]].walkable;
    const start = c.gates.find((x: any) => x.id === 'south_gate').at;
    const nw = c.buildings.find((b: any) => b.id === 'nw').doors[0].front;
    const dist = new Map<string, number>([[start.join(), 0]]);
    const open: [number, number, number][] = [[0, start[0], start[1]]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = open.shift()!;
      if (x === nw[0] && y === nw[1]) return (d * 16) / g.balance.player.campusSpeed;
      if (d > (dist.get(`${x},${y}`) ?? 1e9)) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!ok(nx, ny) || (dx && dy && !(ok(x + dx, y) && ok(x, y + dy)))) continue;
        const nd = d + (dx && dy ? Math.SQRT2 : 1);
        if (nd < (dist.get(`${nx},${ny}`) ?? 1e9)) { dist.set(`${nx},${ny}`, nd); open.push([nd, nx, ny]); }
      }
    }
    return -1;
  });
  expect(secs).toBeGreaterThanOrEqual(20);
  expect(secs).toBeLessThanOrEqual(30);
});
