import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS scores (
    id         BIGSERIAL PRIMARY KEY,
    initials   TEXT        NOT NULL CHECK (char_length(initials) BETWEEN 1 AND 3),
    score      INTEGER     NOT NULL CHECK (score >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS scores_score_desc_idx ON scores (score DESC)
`;

console.log('Migration complete.');
