// Throwers and the boss roam back and forth without stopping next to the player or leaving the
// screen, and the boss jumps for a player above him only when no shelf is overhead (issue #5).
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

  // Boss: player up on a shelf. In the open gap at x 355 he jumps; under a shelf at x 160 he doesn't.
  const bossJumps = (x) => page.evaluate(async (x) => {
    const g = window.__game.scene.getScene('Game');
    if (g.boss) { g.boss.destroy(); g.boss = null; }
    g.spawnBoss();
    Object.assign(g.boss, { speed: 0, nextJump: Infinity });
    g.boss.x = x;
    g.player.y = 200;
    await new Promise(r => setTimeout(r, 1200));   // settle on the floor
    g.boss.nextJump = 0;
    let minVy = 0;
    for (let i = 0; i < 20; i++) { minVy = Math.min(minVy, g.boss.body.velocity.y); await new Promise(r => setTimeout(r, 16)); }
    return minVy < -300;
  }, x);
  assert.equal(await bossJumps(355), true, 'boss in the open jumps for a player above');
  assert.equal(await bossJumps(160), false, 'boss under a shelf does not jump');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS movement: throwers roam past the player and turn at edges, boss jumps only with headroom');
} finally {
  await browser.close();
}
