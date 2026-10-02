import { neon } from "@neondatabase/serverless";

// Vercel adds this automatically once you connect a Neon (Postgres) database
// to this project (Vercel project -> Storage tab -> create/connect Postgres).
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getSql() {
  if (!connectionString) {
    throw new Error("No DATABASE_URL found. Have you connected a Postgres (Neon) database to this project in Vercel?");
  }
  return neon(connectionString);
}

// Creates the one table this app needs, if it doesn't already exist.
// Safe to run on every request — CREATE TABLE IF NOT EXISTS is a no-op once it's there.
async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS ledger_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export async function GET() {
  try {
    const sql = getSql();
    await ensureTable(sql);
    const rows = await sql`SELECT data FROM ledger_state WHERE id = 1`;
    return Response.json({ data: rows.length ? rows[0].data : null });
  } catch (e) {
    console.error("Neon read failed", e);
    return Response.json(
      { error: "Couldn't reach the database. Have you connected a Postgres storage database to this project in Vercel?" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const sql = getSql();
    await ensureTable(sql);
    const body = await request.json();
    await sql`
      INSERT INTO ledger_state (id, data, updated_at)
      VALUES (1, ${JSON.stringify(body)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Neon write failed", e);
    return Response.json(
      { error: "Couldn't reach the database. Have you connected a Postgres storage database to this project in Vercel?" },
      { status: 500 }
    );
  }
}
