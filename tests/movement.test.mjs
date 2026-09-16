// Pursuers hold a standoff distance instead of stacking under the player, and backing off never
// walks them off screen where they would be culled (issue #5).
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });

  // One guard at a given x, pace pinned to steady so the random stops and bursts don't flake.
  const place = (x) => page.evaluate((x) => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    g.player.x = 480;
    g.spawnEnemy('guard');
    const e = g.enemies.getChildren()[0];
    e.x = x; e.shootDelay = 1e9; e.pace = 1; e.paceUntil = 1e12; e.standoff = 120;
  }, x);
  const read = () => page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    const e = g.enemies.getChildren()[0];
    g.player.x = 480;
    return e ? { alive: e.active, dist: Math.abs(e.x - g.player.x), x: e.x } : { alive: false };
  });

  await place(500);
  await page.waitForTimeout(1500);
  let s = await read();
  assert.ok(s.alive && s.dist >= 90 && s.dist <= 150, `close guard backs off to its standoff (dist ${s.dist})`);

  await place(900);
  await page.waitForTimeout(3000);
  s = await read();
  assert.ok(s.alive && s.dist >= 90 && s.dist <= 150, `far guard closes to its standoff (dist ${s.dist})`);

  // Player hugging the left wall: the guard wants to back off leftwards past the edge and must stop.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    g.spawnEnemy('guard');
    const e = g.enemies.getChildren()[0];
    e.x = 60; e.shootDelay = 1e9; e.pace = 1; e.paceUntil = 1e12; e.standoff = 120;
    g.player.x = 90;
  });
  await page.waitForTimeout(1500);
  s = await page.evaluate(() => {
    const e = window.__game.scene.getScene('Game').enemies.getChildren()[0];
    return { alive: !!(e && e.active), x: e ? e.x : null };
  });
  assert.ok(s.alive && s.x >= 0, `guard backed against the edge stays on screen (x ${s.x})`);

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS movement: pursuers hold a standoff and never back off screen');
} finally {
  await browser.close();
}
