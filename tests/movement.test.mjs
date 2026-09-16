// Throwers and the boss roam back and forth without stopping next to the player or leaving the
// screen, and the boss jumps up through shelves and drops down through them (issue #5).
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });

  // One guard at x heading dir, pace steady and direction pinned so randomness doesn't flake.
  const guard = (x, dir) => page.evaluate(([x, dir]) => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    g.player.x = 480;
    g.spawnEnemy('guard');
    const e = g.enemies.getChildren()[0];
    Object.assign(e, { x, dir, shootDelay: 1e9, pace: 1, paceUntil: 1e12, dirUntil: 1e12 });
  }, [x, dir]);
  const guardX = () => page.evaluate(() => {
    const e = window.__game.scene.getScene('Game').enemies.getChildren()[0];
    return e && e.active ? e.x : null;
  });

  await guard(490, 1);
  await page.waitForTimeout(800);
  const passed = await guardX();
  assert.ok(passed > 540, `guard next to the player keeps walking past (x ${passed})`);

  await guard(60, -1);
  await page.waitForTimeout(1500);
  const turned = await guardX();
  assert.ok(turned !== null && turned > 40, `guard walking into the left edge turns back (x ${turned})`);

  // Boss standing still under the left shelf unit (lowest shelf top 444). With the player above he
  // jumps up through the shelf and lands on it; with the player below he drops back to the floor.
  const bossBottom = (playerY) => page.evaluate(async (playerY) => {
    const g = window.__game.scene.getScene('Game');
    const b = g.boss;
    Object.assign(b, { speed: 0, nextJump: 0, throwDelay: 1e9 });
    for (let i = 0; i < 90; i++) {                 // ~1.5s, player pinned so gravity can't move it
      g.player.x = 480; g.player.y = playerY;
      b.x = 160;
      if (!b.body.blocked.down) b.nextJump = Infinity;   // one move only
      await new Promise(r => setTimeout(r, 16));
    }
    return Math.round(b.body.bottom);
  }, playerY);
  await page.evaluate(async () => {
    const g = window.__game.scene.getScene('Game');
    if (g.boss) { g.boss.destroy(); g.boss = null; }
    g.spawnBoss();
    Object.assign(g.boss, { speed: 0, nextJump: Infinity, x: 160 });
    await new Promise(r => setTimeout(r, 1200));   // settle on the floor
  });
  assert.equal(await bossBottom(100), 444, 'boss jumps up through a shelf and lands on it');
  assert.equal(await bossBottom(560), 576, 'boss drops through his shelf to a player below');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS movement: throwers roam past the player and turn at edges, boss jumps up and drops down through shelves');
} finally {
  await browser.close();
}
