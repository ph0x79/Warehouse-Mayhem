// Shared setup for the headless browser checks. Serves nothing itself: run.sh starts the server.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 8731}`;

// The game never exposes its Phaser.Game instance, so the test copy of index.html assigns it to window.
const src = readFileSync(path.join(REPO, 'index.html'), 'utf8')
  .replace('new Phaser.Game(config);', 'window.__game = new Phaser.Game(config);');

// Polls fn in the page instead of a fixed sleep. A timeout resolves false, so the caller's own
// assert reports what never happened; any other error still throws.
export const until = (page, fn, arg, timeout = 5000) =>
  page.waitForFunction(fn, arg, { timeout }).then(() => true, e => {
    if (e.name !== 'TimeoutError') throw e;
    return false;
  });

export function launch() {
  return chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
}

// Opens the game. With startGame, jumps straight into GameScene with player damage and spawning off.
export async function openGame(browser, { viewport = { width: 960, height: 640 }, hasTouch = false, startGame = true } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/index.html', r => r.fulfill({ contentType: 'text/html', body: src }));
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForFunction(() => window.__game && window.__game.isBooted, null, { timeout: 20000 });
  await page.waitForFunction(() => window.__game.scene.isActive('Title'), null, { timeout: 20000 });
  if (startGame) {
    await page.evaluate(() => {
      const m = window.__game.scene;
      m.getScenes(true).forEach(s => m.stop(s.scene.key));
      m.start('Game');
    });
    await page.waitForFunction(() => window.__game.scene.isActive('Game'), null, { timeout: 5000 });
    await page.evaluate(() => {
      const g = window.__game.scene.getScene('Game');
      g.hurtPlayer = () => {};
      g.tickSpawning = () => {};
    });
  }
  return { ctx, page, errors };
}
