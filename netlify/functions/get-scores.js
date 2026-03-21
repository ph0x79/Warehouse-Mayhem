import { neon } from '@neondatabase/serverless';

export default async function handler(req, context) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT initials, score FROM scores ORDER BY score DESC LIMIT 10`;
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    console.error('get-scores DB error:', err);
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
