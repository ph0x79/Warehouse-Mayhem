// While the fan spins, its downdraft slows everything thrown under it. The arc solver scales with
// speed, so a slowed shot still lands on the target — that is what makes it safe to slow the
// player's own poop, which is the one throw that has to reach the fan.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });

  // Throws a poop at a fixed target and returns its launch velocity plus where it crosses the
  // target x, stepping the same equations the physics body uses.
  const shot = () => page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.poops.clear(true, true);
    const ox = 200, oy = 400, tx = 700, ty = 150;
    const s = g.lob(g.poops, 'poop', ox, oy, tx, ty, 520, {});
    const vx = s.body.velocity.x, vy = s.body.velocity.y;
    const t  = (tx - ox) / vx;                       // time to reach the target x
    const yAt = oy + vy * t + 0.5 * 800 * t * t;     // C.GRAVITY
    s.destroy();
    // Total launch speed is the wrong measure: vy carries a -0.5*G*dist/spd compensation term
    // that grows as spd falls, so a slower throw leaves the hand lofted higher. Horizontal speed
    // and time of flight are what actually slow down.
    return { vx, flight: t, yAt, ty };
  });

  const normal = await shot();
  assert.ok(Math.abs(normal.yAt - normal.ty) < 1, `normal shot lands on target (off by ${normal.yAt - normal.ty})`);

  await page.evaluate(() => window.__game.scene.getScene('Game').startFanSpin());
  const windy = await shot();

  const ratio = windy.vx / normal.vx;
  assert.ok(Math.abs(ratio - 0.75) < 0.01, `downdraft slows the throw to 75% (got ${(ratio * 100).toFixed(1)}%)`);
  assert.ok(Math.abs(windy.flight / normal.flight - 4 / 3) < 0.01, 'and stretches the flight time to match');
  assert.ok(Math.abs(windy.yAt - windy.ty) < 1, `slowed shot still lands on target (off by ${windy.yAt - windy.ty})`);

  // Enemy throws go through the same helper, so they are slowed too.
  const dart = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.hazards.clear(true, true);
    const s = g.lob(g.hazards, 'dart', 100, 300, 600, 300, 400, {});
    const vx = s.body.velocity.x;
    s.destroy();
    return vx;
  });
  assert.ok(Math.abs(dart - 400 * 0.75) < 1, `enemy projectiles are slowed too (vx ${dart.toFixed(0)})`);

  // The fan hands the air back when it stops.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.fanTriggered = true;
    g.fanSpeed = 0.05;
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').fanWind), 1,
    'wind clears once the fan spins down');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS wind: fan downdraft slows projectiles 25% without breaking their aim');
} finally {
  await browser.close();
}
