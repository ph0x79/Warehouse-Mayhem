// Game over always shows the top 10, and highlights the player's row when the score qualifies.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const TOP = Array.from({ length: 10 }, (_, i) => ({ initials: 'AB' + String.fromCharCode(65 + i), score: 5000 - i * 400 }));

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: false });
  await page.route('**/.netlify/functions/get-scores', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(TOP) }));

  // Starts GameOver and returns its leaderboard rows as [text, color].
  const board = async (initials, score) => {
    await page.evaluate(([initials, score]) => {
      const m = window.__game.scene;
      m.getScenes(true).forEach(s => m.stop(s.scene.key));
      m.start('GameOver', { initials, score });
    }, [initials, score]);
    await page.waitForTimeout(800);
    return page.evaluate(() => window.__game.scene.getScene('GameOver').children.list
      .filter(o => o.type === 'Text' && /^\s*\d+\.\s/.test(o.text))
      .map(o => [o.text.replace(/\s+/g, ' ').trim(), o.style.color]));
  };
  const highlighted = rows => rows.filter(([, c]) => c === '#FFC425').map(([t]) => t);

  let rows = await board('ZZZ', 50);
  assert.equal(rows.length, 10, 'non-qualifying score still sees 10 rows');
  assert.deepEqual(highlighted(rows), [], 'nothing highlighted when the score misses the top 10');

  // Not in the (cached) response yet, so it is inserted locally at rank 3.
  rows = await board('WJF', 4500);
  assert.equal(rows.length, 10, 'qualifying score keeps the board at 10 rows');
  assert.deepEqual(highlighted(rows), ['3. WJF 4500'], 'new entry inserted and highlighted');

  // Already in the response: highlight it, do not duplicate it.
  rows = await board('ABB', 4600);
  assert.deepEqual(highlighted(rows), ['2. ABB 4600'], 'existing entry highlighted');
  assert.equal(rows.filter(([t]) => t.includes('ABB')).length, 1, 'no duplicate row');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS gameover: top 10 always shown, own row highlighted');
} finally {
  await browser.close();
}
