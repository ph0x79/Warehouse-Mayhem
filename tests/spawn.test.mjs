// Spawns stop at MAX_ENEMIES, the mix drifts from walkers to managers only by 20,000, and the idle
// HEAT STRESS label is not re-rendered every frame.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser);

  // Tally 400 spawns at each score, clearing the field each time so the cap never kicks in.
  const mix = (score) => page.evaluate((score) => {
    const g = window.__game.scene.getScene('Game');
    g.score = score; g.elapsed = 0;
    const n = {};
    for (let i = 0; i < 400; i++) {
      g.spawnNextEnemy();
      g.enemies.getChildren().slice().forEach(e => { n[e.enemyType || e.texture.key] = (n[e.enemyType || e.texture.key] || 0) + 1; e.destroy(); });
    }
    return n;
  }, score);

  const m0 = await mix(0);
  assert.ok(!m0.guard && !m0.manager, `no guards or managers at 0: ${JSON.stringify(m0)}`);
  const m10 = await mix(10000);
  assert.ok(m10.blade &&m10.guard && m10.manager, `mixed crowd at 10,000: ${JSON.stringify(m10)}`);
  assert.deepEqual(Object.keys(await mix(20000)), ['manager'], 'managers only at 20,000');
  assert.deepEqual(Object.keys(await mix(35000)), ['manager'], 'managers only past 20,000');

  const capped = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.score = 6000;
    for (let i = 0; i < 30; i++) g.spawnNextEnemy();
    return g.enemies.countActive();
  });
  assert.equal(capped, 10, 'spawns stop at 10 live enemies');

  const redraws = await page.evaluate(() => new Promise(r => {
    const l = window.__game.scene.getScene('Game').fanLabel;
    let c = 0; const orig = l.updateText.bind(l);
    l.updateText = () => { c++; return orig(); };
    setTimeout(() => r(c), 1000);
  }));
  assert.equal(redraws, 0, 'idle label is not re-rendered');

  assert.deepEqual(errors, []);
  console.log('spawn: PASS');
} finally {
  await browser.close();
}
