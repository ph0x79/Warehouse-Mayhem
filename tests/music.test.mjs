// M is the only music shortcut. Space and Enter must never toggle it, even after the mute button
// has been clicked: a focused <button> fires on both, which used to flip the music mid-game.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });
  const muted = () => page.evaluate(() => document.getElementById('bgMusic').muted);
  const focus = () => page.evaluate(() => document.activeElement.id || document.activeElement.tagName);

  assert.equal(await muted(), true, 'starts muted');

  await page.click('#muteBtn');
  assert.equal(await muted(), false, 'button unmutes');
  assert.notEqual(await focus(), 'muteBtn', 'button drops focus after use');

  for (const key of ['Space', 'Enter', 'KeyW', 'KeyA']) {
    await page.keyboard.press(key);
    assert.equal(await muted(), false, `${key} leaves the music alone`);
  }

  await page.keyboard.press('KeyM');
  assert.equal(await muted(), true, 'M mutes');
  await page.keyboard.press('KeyM');
  assert.equal(await muted(), false, 'M unmutes');

  // M is a legal initial, so the shortcut stands down while the initials screen is up.
  await page.evaluate(() => {
    const m = window.__game.scene;
    m.getScenes(true).forEach(s => m.stop(s.scene.key));
    m.start('EnterInitials', { score: 500 });
  });
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyM');
  assert.equal(await muted(), false, 'M does not toggle music while entering initials');
  assert.equal(
    await page.evaluate(() => window.__game.scene.getScene('EnterInitials').letters.join('')),
    'M', 'M types into the initials instead');

  // Leaving the scene hands the shortcut back.
  await page.evaluate(() => {
    const m = window.__game.scene;
    m.getScenes(true).forEach(s => m.stop(s.scene.key));
    m.start('Title');
  });
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyM');
  assert.equal(await muted(), true, 'M works again after the initials screen');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS music: M is the only shortcut, Space and Enter never toggle');
} finally {
  await browser.close();
}
