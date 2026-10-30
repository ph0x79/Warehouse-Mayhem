// Every enemy type and the boss rest on the floor.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const TYPES = ['worker', 'blade', 'guard', 'manager'];

const browser = await launch();
try {
  const { page, errors } = await openGame(browser);
  await page.evaluate((types) => {
    const g = window.__game.scene.getScene('Game');
    g.enemies.clear(true, true);
    window.__spawned = [];
    types.forEach((t, i) => {
      const before = new Set(g.enemies.getChildren());
      g.spawnEnemy(t);
      const e = g.enemies.getChildren().find(c => !before.has(c));
      if (e) { e.speed = 0; e.x = 200 + i * 120; window.__spawned.push([t, e]); }
    });
    g.spawnBoss();
    g.boss.speed = 0;
    g.boss.nextJump = Infinity;
    g.boss.x = 800;
  }, TYPES);
  await page.waitForTimeout(1500);  // let gravity settle

  const { floorTop, rows } = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    const row = (name, s) => ({
      name, bottom: Math.round(s.body.bottom), onFloor: s.body.blocked.down || s.body.touching.down,
    });
    return { floorTop: window.__game.config.height - 64, rows: [...window.__spawned.map(([t, e]) => row(t, e)), row('boss', g.boss)] };
  });

  assert.deepEqual(rows.map(r => r.name), [...TYPES, 'boss'], 'every type spawned');
  for (const r of rows) {
    assert.ok(r.onFloor, `${r.name} is not resting on anything`);
    assert.ok(Math.abs(r.bottom - floorTop) <= 1, `${r.name} bottom ${r.bottom}, floor ${floorTop}`);
  }

  // The worker role picks one of three outfits at random, so the spawn above only checks whichever
  // one came up. They have to stay the same size as each other or floor placement turns flaky.
  const variants = await page.evaluate(() => ['worker', 'worker_b', 'worker_c'].map(k => {
    const f = window.__game.textures.get(k).get(0);
    return [k, f.width, f.height];
  }));
  for (const [k, w, h] of variants) {
    assert.deepEqual([w, h], [16, 34], `${k} frame is not 16x34`);
  }

  assert.deepEqual(errors, [], 'page errors');
  console.log(`PASS floor: ${rows.length} sprites at y=${floorTop}, ${variants.length} worker outfits`);
} finally {
  await browser.close();
}
