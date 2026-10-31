import { neon } from '@neondatabase/serverless';

// Netlify enforces rateLimit only on a function with a custom path, so it moves off
// /.netlify/functions/submit-score. Over the limit Netlify answers 429 and the game shows
// SCORE NOT SAVED. The limit is five saves a minute per IP, shared by everyone behind one
// address, which is still well above one household's pace (#31).
export const config = {
  path: '/api/submit-score',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

// Ceiling on what one hour of perfect play can score (derivation in the commit that set it):
// at most 2000/1.5 pts/s from throws plus 500 pts/s from fan nukes, times 3600 s.
const MAX_SCORE = 6_600_000;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { initials, score } = body ?? {};
  const name = typeof initials === 'string' ? initials.trim().toUpperCase() : '';

  // The game's initials entry only offers A-Z, so anything else did not come from it.
  if (!/^[A-Z]{1,3}$/.test(name)) {
    return new Response(JSON.stringify({ error: 'initials must be 1–3 letters A–Z' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return new Response(JSON.stringify({ error: 'score must be a non-negative integer' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    await sql`INSERT INTO scores (initials, score) VALUES (${name}, ${score})`;
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('submit-score DB error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
