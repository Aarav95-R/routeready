// Loads supabase/seed.sql into a Supabase project over a direct Postgres
// connection — used when the file is too large for the browser SQL editor.
//
// Usage:
//   npx tsx scripts/seed/push.ts "<postgres-connection-string>"
//
// Get the connection string from Supabase:
//   Project Settings -> Database -> Connection string -> "Session pooler" (URI),
//   then replace [YOUR-PASSWORD] with your database password.
//
// Re-running is safe: it clears the seeded tables first, then reloads.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const conn = process.argv[2] ?? process.env.DATABASE_URL;
if (!conn) {
  console.error('Usage: npx tsx scripts/seed/push.ts "<postgres-connection-string>"');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected. Clearing any existing seed data…");
  await client.query("truncate test_centres, manoeuvres, show_me_tell_me restart identity cascade;");
  console.log("Loading supabase/seed.sql (this takes a few seconds)…");
  await client.query(readFileSync("supabase/seed.sql", "utf8"));
  const { rows } = await client.query(
    `select
       (select count(*) from test_centres)    as centres,
       (select count(*) from routes)          as routes,
       (select count(*) from hazards)         as hazards,
       (select count(*) from show_me_tell_me) as questions,
       (select count(*) from manoeuvres)      as manoeuvres;`
  );
  console.log("Done. Row counts:", rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
