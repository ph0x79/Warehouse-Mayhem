import { neon } from '@neondatabase/serverless';

export default async function handler(req, context) {
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

  const { initials, score } = body;

  if (typeof initials !== 'string' || initials.trim().length === 0 || initials.trim().length > 3) {
    return new Response(JSON.stringify({ error: 'initials must be 1–3 characters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 99_999_999) {
    return new Response(JSON.stringify({ error: 'score must be a non-negative integer' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    await sql`INSERT INTO scores (initials, score) VALUES (${initials.trim().toUpperCase()}, ${score})`;
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
