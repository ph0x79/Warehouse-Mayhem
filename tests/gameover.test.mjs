// Game over always shows the top 10, and highlights the player's row when the score qualifies.
import assert from 'node:assert/strict';
import { launch, openGame } from './lib.mjs';

const TOP = Array.from({ length: 10 }, (_, i) => ({ initials: 'AB' + String.fromCharCode(65 + i), score: 5000 - i * 400 }));

const browser = await launch();
try {
  const { page, errors } = await openGame(browser, { startGame: false });
  let boardDown = false;
  await page.route('**/.netlify/functions/get-scores', r => boardDown
    ? r.fulfill({ status: 500, contentType: 'application/json', body: '[]' })
    : r.fulfill({ contentType: 'application/json', body: JSON.stringify(TOP) }));
  await page.route('**/.netlify/functions/submit-score', r => r.fulfill({ status: 500, body: '{}' }));
  const texts = () => page.evaluate(() => window.__game.scene.getScene('GameOver').children.list
    .filter(o => o.type === 'Text').map(o => o.text));

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

  // A non-qualifying score skips the initials prompt; a qualifying one still gets it.
  const sceneAfterGameOver = async score => {
    await page.evaluate(score => {
      const m = window.__game.scene;
      m.getScenes(true).forEach(s => m.stop(s.scene.key));
      m.start('Game');
    }, score);
    await page.waitForTimeout(1000);
    await page.evaluate(score => {
      const g = window.__game.scene.getScene('Game');
      g.score = score;
      g.triggerGameOver();
    }, score);
    await page.waitForTimeout(2500);
    return page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
  };

  assert.ok((await sceneAfterGameOver(50)).includes('GameOver'), 'score below 10th place skips initials');
  assert.ok((await sceneAfterGameOver(9999)).includes('EnterInitials'), 'top-10 score still prompts for initials');

  // A save the server refused is not shown as saved: no local row, and the player is told.
  await page.evaluate(() => {
    const m = window.__game.scene;
    m.getScenes(true).forEach(s => m.stop(s.scene.key));
    m.start('EnterInitials', { score: 4500 });
  });
  await page.waitForTimeout(300);
  for (const k of ['W', 'J', 'F', 'Enter']) await page.keyboard.press(k);
  await page.waitForFunction(() => window.__game.scene.isActive('GameOver'), null, { timeout: 5000 });
  await page.waitForTimeout(800);
  assert.ok((await texts()).includes('SCORE NOT SAVED'), 'failed save is reported');
  rows = await page.evaluate(() => window.__game.scene.getScene('GameOver').children.list
    .filter(o => o.type === 'Text' && /^\s*\d+\.\s/.test(o.text)).map(o => [o.text, o.style.color]));
  assert.deepEqual(highlighted(rows), [], 'failed save is not highlighted');
  assert.ok(!rows.some(([t]) => t.includes('WJF')), 'failed save is not inserted locally');

  // With the board down, a big score still gets the initials prompt; when the submit fails too,
  // GameOver says the score was not saved and the board is offline.
  boardDown = true;
  assert.ok((await sceneAfterGameOver(9999)).includes('EnterInitials'), 'board down: initials prompt still shown');
  for (const k of ['W', 'J', 'F', 'Enter']) await page.keyboard.press(k);
  await page.waitForFunction(() => window.__game.scene.isActive('GameOver'), null, { timeout: 5000 });
  await page.waitForTimeout(800);
  assert.ok((await texts()).includes('SCORE NOT SAVED'), 'board and submit down: failed save is reported');
  assert.ok((await texts()).includes('LEADERBOARD OFFLINE'), 'board down: offline shown, not an empty board');

  assert.deepEqual(errors, [], 'page errors');
  console.log('PASS gameover: top 10 always shown, own row highlighted, initials when qualifying or board down, failures shown');
} finally {
  await browser.close();
}
