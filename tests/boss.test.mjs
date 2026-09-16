// Boss spawns with 3 HP, survives a real fan nuke, dies on the third poop hit and awards 2000 points.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser);

  const snap = () => page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    return { alive: !!(g.boss && g.boss.active), hp: g.boss ? g.boss.bossHP : null, score: g.score, fanTriggered: g.fanTriggered };
  });
  // A stationary poop dropped on the fan hub or on the boss, so the real overlap and fan code run.
  const dropPoop = (onFan) => page.evaluate((onFan) => {
    const g = window.__game.scene.getScene('Game');
    if (onFan) { g.fanSpinning = true; g.fanTriggered = false; }
    const [x, y] = onFan ? [g.fanCX, g.fanCY] : [g.boss.x, g.boss.y];
    const p = g.poops.create(x, y, 'poop');
    p.body.setAllowGravity(false);
    p.setVelocity(0, 0);
  }, onFan);

  await page.evaluate(() => window.__game.scene.getScene('Game').addScore(10000, 480, 300));
  await page.waitForTimeout(500);
  let s = await snap();
  assert.deepEqual([s.alive, s.hp], [true, 3], 'boss spawns with 3 HP');

  // Two enemy projectiles hanging in the air, well away from the player, for the nuke to clear.
  const hazardsBefore = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    for (const [x, tex] of [[150, 'dart'], [810, 'keyboard']]) {
      const h = g.hazards.create(x, 120, tex);
      h.body.setAllowGravity(false);
      h.setVelocity(0, 0);
    }
    return g.hazards.countActive();
  });
  assert.equal(hazardsBefore, 2, 'two hazards in the air before the nuke');

  await dropPoop(true);
  await page.waitForTimeout(300);
  s = await snap();
  assert.ok(s.fanTriggered, 'fan nuke fired');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').hazards.countActive()), 0,
    'fan nuke destroys enemy projectiles');
  assert.deepEqual([s.alive, s.hp], [true, 3], 'boss is immune to the fan nuke');

  const scoreBefore = s.score;
  for (const hp of [2, 1]) {
    await dropPoop(false);
    await page.waitForTimeout(1400);  // stun flash lasts 1000ms
    s = await snap();
    assert.deepEqual([s.alive, s.hp], [true, hp], `boss at ${hp} HP`);
  }
  await dropPoop(false);
  await page.waitForTimeout(1400);
  s = await snap();
  assert.equal(s.alive, false, 'boss defeated on hit 3');
  assert.equal(s.score, scoreBefore + 2000, 'defeat awards 2000 points');

  // He returns every 10,000 points with one more HP, but never while one is still on screen.
  await page.evaluate(() => window.__game.scene.getScene('Game').addScore(20000 - window.__game.scene.getScene('Game').score, 480, 300));
  await page.waitForTimeout(500);
  s = await snap();
  assert.deepEqual([s.alive, s.hp], [true, 4], 'boss #2 spawns at 20,000 with 4 HP');
  const bossNumAt30k = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.addScore(10000, 480, 300);
    return g.bossNum;
  });
  assert.equal(bossNumAt30k, 2, 'no second boss while one is alive');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS boss: 3 hits, fan-immune, +2000, returns tougher every 10,000');
} finally {
  await browser.close();
}
