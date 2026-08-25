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
// This script TRUNCATES before it loads, so it refuses to run without
// --yes-truncate and prints the host it was about to empty. Which database
// that is comes from an env var you exported in some earlier shell, and that
// is not a thing worth finding out afterwards.
import { readFileSync } from "node:fs";
import { Client, type ClientConfig } from "pg";
import { confirmDestructive, confirmUserData, USER_DATA_TABLES } from "./confirm";


// Before the connection is even opened: a refusal that has already connected
// is a refusal that has already been pointed at something.
const refusal = confirmDestructive(process.argv.slice(2), process.env);
if (refusal !== null) {
  console.error(refusal);
  process.exit(1);
}
const conn = process.argv.slice(2).find((a) => a.startsWith("postgres://") || a.startsWith("postgresql://"))
  ?? process.env.DATABASE_URL;
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

  // Counted before anything is destroyed, because "how much progress was
  // there" is not a question anybody gets to ask afterwards. The host was
  // confirmed on argv; this is the other half of the blast radius.
  const counts = await client.query(
    "select " + USER_DATA_TABLES.map((t) => `(select count(*) from ${t}) as ${t}`).join(", ") + ";"
  );
  // pg returns bigint counts as strings, and "0" is truthy.
  const userRows = Object.fromEntries(
    Object.entries(counts.rows[0]).map(([k, v]) => [k, Number(v)])
  );
  const userDataRefusal = confirmUserData(userRows, process.argv.slice(2));
  if (userDataRefusal !== null) {
    console.error(userDataRefusal);
    await client.end();
    process.exit(1);
  }

  console.log("Connected. Clearing any existing seed data…");
  await client.query("truncate test_centres, manoeuvres, show_me_tell_me restart identity cascade;");
  // The generator writes one statement per line, and the file is now ~8 MB.
  // Sent as a single query that is one 8 MB string for the server to parse
  // before anything happens, with no progress and a timeout if it is slow —
  // so it goes in batches instead, inside the file's own begin/commit.
  const statements = readFileSync("supabase/seed.sql", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"));
  console.log(`Loading supabase/seed.sql — ${statements.length} statements…`);
  const BATCH = 250;
  for (let i = 0; i < statements.length; i += BATCH) {
    await client.query(statements.slice(i, i + BATCH).join("\n"));
    const done = Math.min(i + BATCH, statements.length);
    process.stdout.write(`\r  ${done}/${statements.length} (${Math.round((done / statements.length) * 100)}%)`);
  }
  process.stdout.write("\n");
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
