import { neon } from '@neondatabase/serverless';

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
