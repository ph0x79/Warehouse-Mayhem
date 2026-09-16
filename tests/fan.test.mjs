// The fan charges only on points earned while it is idle and out of cooldown. Points the nuke
// itself awards, and anything scored during the 10s lockout, must not count toward the next spin.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: true });
  const fan = () => page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    return { charge: g.fanCharge, spinning: g.fanSpinning, score: g.score, locked: g.time.now < g.fanLockoutUntil };
  });

  // Charge it to the threshold the normal way.
  await page.evaluate(() => window.__game.scene.getScene('Game').addScore(1000, 400, 300));
  assert.equal((await fan()).charge, 1000, 'points charge the fan while it is idle');

  await page.waitForTimeout(400);
  assert.equal((await fan()).spinning, true, 'fan spins up at the threshold');

  // Points scored while it is already spinning must not bank toward the next one.
  await page.evaluate(() => window.__game.scene.getScene('Game').addScore(500, 400, 300));
  assert.equal((await fan()).charge, 1000, 'no charge accrues while the fan spins');

  // Fill the screen, then set the nuke off the way a player does: put a poop on the hub and let
  // updateFan find it. This is the reported bug — the kills the explosion scores used to land
  // after the threshold was snapshotted, so they counted toward the next spin.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    ['worker', 'worker', 'guard', 'manager', 'manager'].forEach(t => g.spawnEnemy(t));
    g.__scoreBeforeNuke = g.score;
    g.poops.create(g.fanCX, g.fanCY, 'poop');
  });
  await page.waitForTimeout(200);
  const gained = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    return g.score - g.__scoreBeforeNuke;
  });
  assert.equal((await fan()).spinning, true, 'poop on the hub fired the nuke, fan still winding down');
  assert.ok(gained >= 1000, `nuke awarded a real pile of points (got ${gained})`);

  let f = await fan();
  assert.equal(f.charge, 1000, 'nuke kills do not charge the fan');
  assert.equal(f.locked, true, 'nuke starts the cooldown');

  // Spin-down clears the bank. It finishes well inside the 10s lockout.
  await page.waitForTimeout(3500);
  f = await fan();
  assert.equal(f.spinning, false, 'fan has spun down');
  assert.equal(f.charge, 0, 'spin-down clears the charge');
  assert.equal(f.locked, true, 'still in cooldown');

  // Scoring during the rest of the cooldown stays off the meter.
  await page.evaluate(() => window.__game.scene.getScene('Game').addScore(700, 400, 300));
  assert.equal((await fan()).charge, 0, 'points during cooldown do not charge the fan');
  assert.match(
    await page.evaluate(() => window.__game.scene.getScene('Game').fanLabel.text),
    /HEAT STRESS \d+s/, 'HUD counts the cooldown down');

  // Once the cooldown ends, charging resumes from zero.
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.fanLockoutUntil = g.time.now;
    g.addScore(250, 400, 300);
  });
  assert.equal((await fan()).charge, 250, 'charging resumes from zero after the cooldown');
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => window.__game.scene.getScene('Game').fanLabel.text),
    'HEAT STRESS 25%', 'HUD reads the fresh charge, not leftover score');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS fan: nuke points and cooldown points never charge the fan');
} finally {
  await browser.close();
}
