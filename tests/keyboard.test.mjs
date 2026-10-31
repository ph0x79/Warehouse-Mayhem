// Keyboard-only players throw with Space: at the spinning fan first, else the nearest enemy or
// boss, skipping any target a shelf blocks.
import assert from 'node:assert/strict';
import { launch, openGame, until } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser);

  // Clears the cooldown and the air, presses Space, and returns the new poops' horizontal velocities.
  const spaceThrow = async () => {
    await page.evaluate(() => {
      const g = window.__game.scene.getScene('Game');
      g.poops.clear(true, true);
      g.lastThrow = -1e9;
    });
    await page.keyboard.press('Space');
    return page.evaluate(() => window.__game.scene.getScene('Game').poops.getChildren().map(p => p.body.velocity.x));
  };
  // Stopped guards on screen at the given x positions, and nothing else.
  const guardsAt = (...xs) => page.evaluate(xs => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    for (const x of xs) {
      g.spawnEnemy('guard');
      const e = g.enemies.getChildren().at(-1);
      Object.assign(e, { x, speed: 0, shootDelay: 1e9 });
      e.body.reset(x, e.y);  // the body follows x only on the next physics step, and Space may come first
    }
    return g.player.x;
  }, xs);

  await guardsAt();
  assert.deepEqual(await spaceThrow(), [], 'nothing to aim at, no throw');

  const px = await guardsAt(900);
  assert.ok(px < 400, `player starts on the left (x ${px})`);
  let vx = await spaceThrow();
  assert.equal(vx.length, 1, 'Space throws one poop');
  assert.ok(vx[0] > 0, `aimed right at the guard (vx ${vx[0]})`);

  await guardsAt(40, 900);
  vx = await spaceThrow();
  assert.ok(vx.length === 1 && vx[0] < 0, `aimed at the nearer guard, on the left (vx ${vx})`);

  // The boss is a target too.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    g.spawnBoss();
    Object.assign(g.boss, { x: 40, speed: 0, nextJump: Infinity, lastThrow: Infinity });
  });
  vx = await spaceThrow();
  assert.ok(vx.length === 1 && vx[0] < 0, `aimed left at the boss (vx ${vx})`);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.boss.destroy();
    g.boss = null;
  });

  // From the spawn point a shelf sits between the player and the fan hub, so the spinning fan
  // gives way to a guard he can actually hit.
  await guardsAt(200);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.fanSpinning = true;
    g.fanTriggered = false;
  });
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').enemies.getChildren()[0]?.stunned),
    'blocked fan shot: Space hits the guard instead');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').fanTriggered), false,
    'and does not waste the throw on the shelf');

  // A guard standing over a pallet is still hittable: the poop meets him before the pallet.
  await guardsAt(355);
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').enemies.getChildren()[0]?.stunned),
    'guard over a pallet: Space hits him, not the blocked fan');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').fanTriggered), false,
    'and the fan is not set off');

  // A guard on the edge of the top-right shelf, seen from the floor below it: the arc reaches his
  // box where it also meets the shelf, and the shelf wins in the game. So Space takes the farther
  // guard on the floor instead.
  await guardsAt(200, 780);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    const e = g.enemies.getChildren()[1];
    e.y = 130;
    e.body.reset(e.x, e.y);
    g.player.x = 695;
    g.player.body.reset(695, g.player.y);
  });
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').enemies.getChildren()[0]?.stunned),
    'guard behind a shelf edge: Space hits the guard on the floor');

  // From the top-right shelf, the arc to a guard on the top-left shelf peaks with the poop's centre
  // under 10 px from the top, so its body hits the ceiling. Space takes the farther guard on the floor.
  await guardsAt(250, 172);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    const e = g.enemies.getChildren()[1];
    e.y = 190;
    e.body.reset(e.x, e.y);
    g.player.body.reset(802, 124);
    g.fanSpinning = false;  // the hub is in the clear from here and would take priority
  });
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').enemies.getChildren()[0]?.stunned),
    'arc grazing the ceiling: Space hits the guard on the floor');

  // At x 330 the hub is in the clear, so the spinning fan takes priority over the guard.
  await guardsAt(800);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.fanSpinning = true;
    g.player.body.reset(330, 536);
  });
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').fanTriggered),
    'clear fan shot: Space sets off the nuke');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS keyboard: Space throws at the spinning fan, else the nearest enemy or boss it can reach');
} finally {
  await browser.close();
}
