// Loads supabase/seed.sql into a Supabase project over a direct Postgres
// connection — used when the file is too large for the browser SQL editor.
//
// Two ways to provide credentials:
//
//   A) Separate values via env vars (best when your password has special
//      characters like / ? @ # — no URL-encoding needed):
//        $env:PGHOST="db.<ref>.supabase.co"
//        $env:PGPORT="5432"
//        $env:PGUSER="postgres"
//        $env:PGPASSWORD="your-password-verbatim"
//        $env:PGDATABASE="postgres"
//        npx tsx scripts/seed/push.ts
//
//   B) A full connection string (only if the password has no URL-special chars):
//        npx tsx scripts/seed/push.ts "postgresql://user:pass@host:5432/postgres"
//
// Re-running is safe: it clears the seeded tables first, then reloads.
import { readFileSync } from "node:fs";
import { Client, type ClientConfig } from "pg";

const conn = process.argv[2] ?? process.env.DATABASE_URL;
if (!conn && !process.env.PGHOST) {
  console.error(
    "No credentials found.\n" +
      "Either set PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE env vars, or pass a\n" +
      'connection string: npx tsx scripts/seed/push.ts "postgresql://user:pass@host:5432/postgres"'
  );
  process.exit(1);
}

// When conn is absent, node-postgres reads PGHOST/PGUSER/PGPASSWORD/... from env.
const config: ClientConfig = conn
  ? { connectionString: conn, ssl: { rejectUnauthorized: false } }
  : { ssl: { rejectUnauthorized: false } };

async function main() {
  const client = new Client(config);
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
