// lob() drops its worldbounds listener however the projectile dies, and a scene shutdown with projectiles in the air is clean.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser);

  const counts = await page.evaluate(async () => {
    const g = window.__game.scene.getScene('Game');
    const n = () => g.physics.world.listenerCount('worldbounds');
    const before = n();
    // Thrown upward and away from the player, so nothing hits him first.
    const shots = [150, 300, 660, 810].map(x => g.lob(g.hazards, 'dart', x, 100, x, 0, 200, { ttl: 200 }));
    const during = n();
    shots[0].destroy();                                   // direct destroy, like a hit
    g.nukeAllEnemies();                                   // fan nuke
    await new Promise(r => setTimeout(r, 400));           // ttl for anything left
    return { before, during, after: n() };
  });
  assert.equal(counts.during, counts.before + 4, 'one listener per live projectile');
  assert.equal(counts.after, counts.before, 'listeners removed when projectiles are destroyed');

  // Shut the scene down with a projectile still in the air.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.lob(g.hazards, 'dart', 480, 100, 480, 0, 200);
    window.__game.scene.stop('Game');
  });
  await page.waitForTimeout(300);

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS lob: worldbounds listeners cleaned up');
} finally {
  await browser.close();
}
