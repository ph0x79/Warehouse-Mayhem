// submit-score validation, run in plain Node with no browser. Only the Neon client is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Swap '@neondatabase/serverless' for a stub, so the test needs no root npm install and no network.
const inserts = [];
let dbFails = false;
globalThis.__sql = async (_strings, ...values) => {
  if (dbFails) throw new Error('db down');
  inserts.push(values);
};
registerHooks({
  resolve: (spec, ctx, next) => spec === '@neondatabase/serverless'
    ? { url: 'data:text/javascript,export const neon = () => globalThis.__sql', shortCircuit: true }
    : next(spec, ctx),
});
const { default: handler } = await import('../netlify/functions/submit-score.js');

const post = body => new Request('http://x/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('rejects each bad submission before touching the database', async () => {
  const bad = [
    ['GET', new Request('http://x/'), 405, /Method Not Allowed/],
    ['invalid JSON', post('{not json'), 400, /Invalid JSON/],
    ['initials not a string', post({ initials: 123, score: 10 }), 400, /initials/],
    ['initials blank after trim', post({ initials: '   ', score: 10 }), 400, /initials/],
    ['initials over 3 chars', post({ initials: 'ABCD', score: 10 }), 400, /initials/],
    ['score not a number', post({ initials: 'ABC', score: '10' }), 400, /score/],
    ['score not an integer', post({ initials: 'ABC', score: 1.5 }), 400, /score/],
    ['score negative', post({ initials: 'ABC', score: -1 }), 400, /score/],
    ['score over max', post({ initials: 'ABC', score: 100_000_000 }), 400, /score/],
  ];
  for (const [name, req, status, error] of bad) {
    const res = await handler(req);
    assert.equal(res.status, status, name);
    assert.match(await res.text(), error, name);
  }
  assert.deepEqual(inserts, [], 'no rejected payload reaches the database');
});

test('accepts a good score and stores trimmed, upper-cased initials', async () => {
  inserts.length = 0;
  const res = await handler(post({ initials: ' abc ', score: 99_999_999 }));
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(inserts, [['ABC', 99_999_999]]);
});

test('returns 500 when the database call fails', async t => {
  t.mock.method(console, 'error', () => {});
  dbFails = true;
  try {
    assert.equal((await handler(post({ initials: 'ABC', score: 0 }))).status, 500);
  } finally {
    dbFails = false;
  }
});
