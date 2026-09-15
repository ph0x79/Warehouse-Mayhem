// Canvas letterboxes at 3:2, fits and stays centred; aim and the touch joystick map to game coordinates.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900, touch: false },
  { name: 'phone portrait 390x844', width: 390, height: 844, touch: true },
  { name: 'phone landscape 844x390', width: 844, height: 390, touch: true },
];

const browser = await launch();
try {
  for (const vp of VIEWPORTS) {
    const { ctx, page, errors } = await openGame(browser, { viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });
    await page.evaluate(() => {
      const g = window.__game.scene.getScene('Game');
      const orig = g.throwPoop;
      g.throwPoop = function (x, y) { window.__aim = [x, y]; return orig.call(this, x, y); };
    });
    await page.waitForTimeout(300);  // let the scale manager settle

    const r = await page.evaluate(() => {
      const b = document.querySelector('canvas').getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    });
    const at = `${vp.name}: canvas ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`;
    assert.ok(Math.abs(r.width / r.height - 1.5) < 0.01, `${at} is not 3:2`);
    assert.ok(r.left >= -0.5 && r.top >= -0.5 && r.left + r.width <= vp.width + 0.5 && r.top + r.height <= vp.height + 0.5, `${at} overflows the viewport`);
    assert.ok(Math.abs(r.left - (vp.width - r.width) / 2) <= 1 && Math.abs(r.top - (vp.height - r.height) / 2) <= 1, `${at} is not centred`);

    const toScreen = (gx, gy) => [r.left + gx * r.width / 960, r.top + gy * r.height / 640];
    const [ax, ay] = toScreen(700, 300);
    if (vp.touch) await page.touchscreen.tap(ax, ay); else await page.mouse.click(ax, ay);
    await page.waitForTimeout(150);
    const aim = await page.evaluate(() => window.__aim);
    assert.ok(aim && Math.abs(aim[0] - 700) <= 1 && Math.abs(aim[1] - 300) <= 1, `${at} aimed at ${aim}, expected 700,300`);

    if (vp.touch) {
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, gx, gy) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x: toScreen(gx, gy)[0], y: toScreen(gx, gy)[1], id: 1 }],
      });
      const flags = async () => {
        await page.waitForTimeout(80);
        return page.evaluate(() => { const g = window.__game.scene.getScene('Game'); return [g.touchLeft, g.touchRight, g.touchJump]; });
      };
      const CX = 95, CY = 640 - 90;  // joystick centre in setupTouchControls()
      await touch('touchStart', CX, CY);      assert.deepEqual(await flags(), [false, false, false], `${at} joystick centre`);
      await touch('touchMove', CX - 60, CY);  assert.deepEqual(await flags(), [true, false, false], `${at} joystick left`);
      await touch('touchMove', CX + 60, CY);  assert.deepEqual(await flags(), [false, true, false], `${at} joystick right`);
      await touch('touchMove', CX, CY - 60);  assert.deepEqual(await flags(), [false, false, true], `${at} joystick up`);
      await touch('touchEnd');                assert.deepEqual(await flags(), [false, false, false], `${at} joystick release`);
    }

    assert.deepEqual(errors, [], `${at} page errors`);
    console.log(`PASS scale: ${at}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
