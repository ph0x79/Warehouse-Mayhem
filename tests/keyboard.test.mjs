// Keyboard-only players throw with Space: at the spinning fan first, else at the nearest enemy.
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
  // One stopped guard on screen at x, nothing else.
  const guardAt = x => page.evaluate(x => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    g.spawnEnemy('guard');
    Object.assign(g.enemies.getChildren()[0], { x, speed: 0, shootDelay: 1e9 });
    return g.player.x;
  }, x);

  await page.evaluate(() => window.__game.scene.getScene('Game').enemies.clear(true, true));
  assert.deepEqual(await spaceThrow(), [], 'nothing to aim at, no throw');

  const px = await guardAt(900);
  assert.ok(px < 900, `player starts left of the guard (x ${px})`);
  let vx = await spaceThrow();
  assert.equal(vx.length, 1, 'Space throws one poop');
  assert.ok(vx[0] > 0, `aimed right at the guard (vx ${vx[0]})`);

  await guardAt(40);
  vx = await spaceThrow();
  assert.ok(vx.length === 1 && vx[0] < 0, `aimed left at the guard (vx ${vx})`);

  // A spinning fan takes priority over the guard: the nuke clears the screen. The player stands
  // at x 330, where no shelf sits between him and the hub (the spawn point has one overhead).
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.player.x = 330;
    g.fanSpinning = true;
    g.fanTriggered = false;
  });
  await spaceThrow();
  assert.ok(await until(page, () => window.__game.scene.getScene('Game').fanTriggered),
    'Space at a spinning fan sets off the nuke');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS keyboard: Space throws at the spinning fan, else the nearest enemy');
} finally {
  await browser.close();
}
