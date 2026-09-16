// Every enemy type and the boss rest on the floor with their baseline body and display sizes.
// UPDATE_BASELINE=1 rewrites floor-baseline.json; only do that when a size change is intended.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib.mjs';

const BASELINE = new URL('./floor-baseline.json', import.meta.url);
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
      name, bottom: Math.round(s.body.bottom), bodyW: s.body.width, bodyH: s.body.height,
      displayW: Math.round(s.displayWidth), displayH: Math.round(s.displayHeight),
      onFloor: s.body.blocked.down || s.body.touching.down,
    });
    return { floorTop: window.__game.config.height - 64, rows: [...window.__spawned.map(([t, e]) => row(t, e)), row('boss', g.boss)] };
  });

  assert.deepEqual(rows.map(r => r.name), [...TYPES, 'boss'], 'every type spawned');
  for (const r of rows) {
    assert.ok(r.onFloor, `${r.name} is not resting on anything`);
    assert.ok(Math.abs(r.bottom - floorTop) <= 1, `${r.name} bottom ${r.bottom}, floor ${floorTop}`);
  }
  if (process.env.UPDATE_BASELINE) {
    writeFileSync(BASELINE, JSON.stringify(rows, null, 1) + '\n');
    console.log('floor baseline rewritten');
  } else {
    const base = Object.fromEntries(JSON.parse(readFileSync(BASELINE, 'utf8')).map(r => [r.name, r]));
    for (const r of rows) {
      for (const k of ['bodyW', 'bodyH', 'displayW', 'displayH']) {
        assert.equal(r[k], base[r.name][k], `${r.name} ${k} changed from baseline`);
      }
    }
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
  console.log(`PASS floor: ${rows.length} sprites at y=${floorTop}, sizes match baseline, ${variants.length} worker outfits`);
} finally {
  await browser.close();
}
