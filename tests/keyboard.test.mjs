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

  // A guard walking at 130 px/s from walkerX in dir, a stopped guard at stillX if given, and the
  // player on the floor at px. The world is paused while Space is pressed, so the throw sees exactly
  // this layout. Returns handles to the two guards, because a stunned enemy leaves the group.
  const walkerThrow = async (px, walkerX, dir, stillX) => {
    await guardsAt(...(stillX === undefined ? [walkerX] : [walkerX, stillX]));
    await page.evaluate(([px, dir]) => {
      const g = window.__game.scene.getScene('Game');
      g.physics.world.pause();
      g.fanCharge = 0;  // four hits would charge the fan, and its downdraft changes the later arcs
      const e = g.enemies.getChildren()[0];
      Object.assign(e, { speed: 130, dir, dirUntil: Infinity, pace: 1, paceUntil: Infinity });
      e.body.velocity.x = 130 * dir;
      g.player.body.reset(px, 536);
    }, [px, dir]);
    const guard = i => page.evaluateHandle(i => window.__game.scene.getScene('Game').enemies.getChildren()[i], i);
    const handles = [await guard(0), await guard(1)];
    await spaceThrow();
    await page.evaluate(() => window.__game.scene.getScene('Game').physics.world.resume());
    return handles;
  };
  const stunned = h => until(page, e => e.stunned, h);
  // The spawn point is restored after these, for the fan checks.
  const spawn = await page.evaluate(() => {
    const { x, y } = window.__game.scene.getScene('Game').player;
    return { x, y };
  });

  // A guard walking away is hit: Space leads him to where he will be when the poop lands.
  let [walker, still] = await walkerThrow(330, 600, 1);
  assert.ok(await stunned(walker), 'walking guard: Space leads him and hits');

  // The pallet at x 670-750 blocks the arc to where the walker stands now, but not to where he will
  // be. clearShot must test the lead point, or Space gives up on him for the guard on the far left.
  [walker, still] = await walkerThrow(400, 740, 1, 20);
  assert.ok(await stunned(walker), 'walker past a pallet: Space leads him over it');
  assert.equal(await still.evaluate(s => s.stunned), false, 'and does not settle for the far guard');

  // Walking left onto that pallet: the arc meets him before it meets the pallet, but only where he
  // will be by then. clearShot's box must walk with him, or the shot reads as blocked.
  [walker, still] = await walkerThrow(400, 770, -1, 20);
  assert.ok(await stunned(walker), 'walker onto a pallet: Space hits him');
  assert.equal(await still.evaluate(s => s.stunned), false, 'and does not settle for the far guard');

  // Near the left wall he turns 40 px from the edge, so the lead stops there instead of past the wall.
  [walker] = await walkerThrow(450, 100, -1);
  assert.ok(await stunned(walker), 'guard turning at the wall: Space aims where he turns');
  await page.evaluate(({ x, y }) => window.__game.scene.getScene('Game').player.body.reset(x, y), spawn);

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
