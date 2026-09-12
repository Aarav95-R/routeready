/**
 * Verifies supabase/migrations/2026-09-12-paywall.sql against the real,
 * live schema without ever applying it.
 *
 * Generated from the migration file rather than hand-copied into a second
 * .sql file, because a hand-copied verification is exactly how this safety
 * net stops matching the migration it exists to prove — and this one has
 * already been trusted once, in a round of this task that applied the
 * migration to production. Two copies of the same DDL drift; this pair must
 * never be allowed to.
 *
 * There is one Supabase project and the app's .env points at it, so running
 * the migration for real is a migration applied in production — where
 * `routes.steps` disappearing breaks turn-by-turn in every already-installed
 * build, and a gated `hazards` hides the data the mock test marks against.
 * The app catches up in a later task; a shipped build never catches up
 * without a release. Applying the schema is a release step the project
 * owner performs, not something a verification run does.
 *
 * DDL is transactional in Postgres, so the whole migration can run for real
 * against the real schema and then be rolled back — this is free, and
 * stronger than a one-way apply, because it proves the migration against
 * production's actual data (real centres, real routes, real difficulty
 * ties) instead of against a guess at its shape.
 *
 * Run: npx tsx scripts/verify-paywall-migration.ts
 *
 * Then confirm the rollback actually left no trace:
 *   npx supabase db query --linked "select count(*) from information_schema.columns where table_name='routes' and column_name='steps'"
 * Expected: 1 — the column is still there.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIGRATION = "supabase/migrations/2026-09-12-paywall.sql";

// The same three shape checks scripts/check-paywall.ts runs, combined into
// one row: `supabase db query` only surfaces the result of the final
// statement in a multi-statement file, so three separate selects would show
// only the last of them and hide the first two.
const SHAPE_CHECKS = `
select
  (select count(*)::int from information_schema.columns
     where table_name = 'routes' and column_name = 'steps') as steps_col,
  (select count(*)::int from routes r
     left join route_details d on d.route_id = r.id
     where d.route_id is null) as orphaned,
  (select count(*)::int from (
     select centre_id from routes group by centre_id
     having count(*) filter (where is_free) <> 1
   ) bad) as bad_centres;
`;

function buildScript(): string {
  const raw = readFileSync(MIGRATION, "utf8");
  const lines = raw.split("\n");

  // Strip exactly the migration's own transaction wrapper — its `begin;`
  // and its trailing `commit;` — so this script can supply its own
  // `rollback` instead. Everything else about the file, comments included,
  // is left untouched, because this exists to prove the file that ships,
  // not a paraphrase of it.
  const beginIdx = lines.findIndex((l) => l.trim() === "begin;");
  const commitIdx = lines.map((l) => l.trim()).lastIndexOf("commit;");
  if (beginIdx === -1 || commitIdx === -1 || commitIdx <= beginIdx) {
    throw new Error(
      `${MIGRATION} doesn't have the expected begin;/commit; wrapper — has its shape changed?`,
    );
  }
  const body = [...lines.slice(0, beginIdx), ...lines.slice(beginIdx + 1, commitIdx)].join("\n");

  return `begin;\n${body}\n-- ── Shape checks, generated from scripts/check-paywall.ts's own ──────────\n${SHAPE_CHECKS}\nrollback;\n`;
}

function main() {
  const script = buildScript();
  const tmpFile = join(tmpdir(), `verify-paywall-migration-${process.pid}.sql`);
  writeFileSync(tmpFile, script);
  try {
    const out = execFileSync(
      "npx",
      ["supabase", "db", "query", "--linked", "--file", tmpFile],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
    console.log(out);
  } finally {
    unlinkSync(tmpFile);
  }
}

main();
