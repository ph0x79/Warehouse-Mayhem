// Art review helper, not a test. Needs the server from run.sh (or: python3 -m http.server 8731 from the repo root).
// Usage: node snapshot.mjs <label> <texture1,texture2,...>
// Writes out/<label>-sheet.png (textures at x4, nearest-neighbour) and out/<label>-game.png (960x640 gameplay).
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib.mjs';

const [label = 'snap', texArg = ''] = process.argv.slice(2);
const keys = texArg.split(',').filter(Boolean);
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: false });
  // Boot waits on the logo preload; without this a slow or unreachable server gives a sheet of green "missing" boxes.
  await page.waitForFunction(() => window.__game.textures.exists('chimp'), null, { timeout: 20000 });

  if (keys.length) {
    const sheet = await page.evaluate((keys) => {
      const SCALE = 4, PAD = 12, LABEL = 18;
      const tm = window.__game.textures;
      const items = keys.map(k => {
        const t = tm.get(k);
        const names = t.getFrameNames().length ? t.getFrameNames() : ['__BASE'];
        return { k, frames: names.map(n => t.get(n)) };
      });
      const rowH = f => Math.max(...f.map(fr => fr.cutHeight)) * SCALE;
      const rowW = f => f.reduce((a, fr) => a + fr.cutWidth * SCALE + PAD, 0);
      const W = Math.max(320, ...items.map(i => rowW(i.frames))) + PAD;
      const H = items.reduce((a, i) => a + rowH(i.frames) + LABEL + PAD, PAD);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(0, 0, W, H);
      let y = PAD;
      for (const { k, frames } of items) {
        ctx.fillStyle = '#fff';
        ctx.font = '13px monospace';
        ctx.fillText(`${k}  ${frames[0].cutWidth}x${frames[0].cutHeight}${frames.length > 1 ? ' x' + frames.length : ''}`, PAD, y + 12);
        y += LABEL;
        let x = PAD;
        for (const fr of frames) {
          ctx.drawImage(fr.source.image, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, x, y, fr.cutWidth * SCALE, fr.cutHeight * SCALE);
          x += fr.cutWidth * SCALE + PAD;
        }
        y += rowH(frames) + PAD;
      }
      return c.toDataURL('image/png');
    }, keys);
    writeFileSync(new URL(`${label}-sheet.png`, OUT), Buffer.from(sheet.split(',')[1], 'base64'));
  }

  // Gameplay shot: one of each enemy plus the boss, frozen in place.
  await page.evaluate(() => {
    const m = window.__game.scene;
    m.getScenes(true).forEach(s => m.stop(s.scene.key));
    m.start('Game');
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    g.hurtPlayer = () => {};
    g.tickSpawning = () => {};
    ['worker', 'blade', 'guard', 'manager'].forEach((t, i) => {
      const before = new Set(g.enemies.getChildren());
      g.spawnEnemy(t);
      const e = g.enemies.getChildren().find(c => !before.has(c));
      if (e) { e.speed = 0; e.x = 300 + i * 90; }
    });
    g.spawnBoss();
    g.boss.speed = 0;
    g.boss.x = 760;
  });
  await page.waitForTimeout(1500);
  await page.locator('canvas').screenshot({ path: new URL(`${label}-game.png`, OUT).pathname });
  console.log(`snapshot ${label}: tests/out/${keys.length ? label + '-sheet.png, ' : ''}${label}-game.png; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
} finally {
  await browser.close();
}
