// The reticle is the aim cursor during play, so the OS arrow is hidden. Every way out of the
// game scene has to bring it back: pause, death, and leaving for another scene.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });
  const cursor = () => page.evaluate(() => window.__game.canvas.style.cursor);

  assert.equal(await cursor(), 'none', 'hidden while playing');

  await page.evaluate(() => window.__game.scene.getScene('Game').togglePause());
  await page.waitForTimeout(300);
  assert.equal(await cursor(), 'default', 'back on the pause screen');

  await page.evaluate(() => window.__game.scene.getScene('Game').togglePause());
  await page.waitForTimeout(300);
  assert.equal(await cursor(), 'none', 'hidden again on resume');

  await page.evaluate(() => window.__game.scene.getScene('Game').triggerGameOver());
  await page.waitForTimeout(300);
  assert.equal(await cursor(), 'default', 'back as soon as the player dies');

  // And it stays back once the scene has actually handed over.
  await page.waitForTimeout(1500);
  assert.equal(await cursor(), 'default', 'still back after the scene change');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS cursor: hidden in play, restored on pause, death and scene change');
} finally {
  await browser.close();
}
