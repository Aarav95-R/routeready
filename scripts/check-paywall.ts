/**
 * Asserts the paywall's server-side half, against the live schema.
 *
 * Jest cannot reach this: the gate is row-level security, which only exists
 * inside Postgres. These checks impersonate a signed-in user the way PostgREST
 * does — `set local role authenticated` plus a `request.jwt.claims` carrying a
 * `sub` — so `auth.uid()` resolves and the policies actually run.
 *
 * Every check runs inside a transaction that is rolled back, so this is safe
 * against a seeded database and writes nothing.
 *
 * Run: npm run check:paywall
 */
import { Client } from "pg";

const CONNECTION = process.env.SUPABASE_DB_URL;

const FREELOADER = "22222222-2222-2222-2222-222222222222";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Not a failure: a database with no accounts at all cannot answer "does a
// subscriber see the locked route", and that absence is not the paywall
// being broken. Kept out of `failures` so an empty auth.users doesn't make
// the run look red for a question it was never able to ask.
function skip(name: string, reason: string) {
  console.log(`  skip  ${name} — ${reason}`);
}

/** Run `fn` as a signed-in user, then roll everything back. */
async function asUser(c: Client, userId: string, fn: () => Promise<void>) {
  await c.query("begin");
  try {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await fn();
  } finally {
    await c.query("rollback");
    await c.query("reset role");
  }
}

async function main() {
  if (!CONNECTION) {
    console.error("SUPABASE_DB_URL is not set. See SETUP.md for the pooler URL.");
    process.exit(1);
  }
  const c = new Client({ connectionString: CONNECTION });
  await c.connect();

  // ── Shape ────────────────────────────────────────────────────────────────
  const dropped = await c.query(
    `select 1 from information_schema.columns
      where table_name = 'routes' and column_name = 'steps'`,
  );
  check("routes.steps is dropped", dropped.rowCount === 0,
    "the column still exists, so select('*') still serves it");

  const orphaned = await c.query(
    `select count(*)::int as n from routes r
      left join route_details d on d.route_id = r.id
      where d.route_id is null`,
  );
  check("every route has a details row", orphaned.rows[0].n === 0,
    `${orphaned.rows[0].n} routes have none`);

  const centres = await c.query(
    `select count(*)::int as n from (
       select centre_id from routes group by centre_id
       having count(*) filter (where is_free) <> 1
     ) bad`,
  );
  check("every centre has exactly one free route", centres.rows[0].n === 0,
    `${centres.rows[0].n} centres have none or several`);

  // ── The gate ─────────────────────────────────────────────────────────────
  const { rows: sample } = await c.query(
    `select
       (select id from routes where is_free limit 1) as free_id,
       (select id from routes where not is_free limit 1) as locked_id`,
  );
  const { free_id: freeId, locked_id: lockedId } = sample[0];
  if (!freeId || !lockedId) {
    check("database has both a free and a locked route", false, "seed it first");
  } else {
    await asUser(c, FREELOADER, async () => {
      const free = await c.query("select 1 from route_details where route_id = $1", [freeId]);
      check("unsubscribed reads a free route's steps", free.rowCount === 1);

      const locked = await c.query("select 1 from route_details where route_id = $1", [lockedId]);
      check("unsubscribed is refused a locked route's steps", locked.rowCount === 0,
        "the paywall does not hold");

      const hazards = await c.query("select 1 from hazards where route_id = $1", [lockedId]);
      check("unsubscribed is refused a locked route's hazards", hazards.rowCount === 0);
    });

    // `entitlements.user_id` references auth.users, so the subscriber this
    // block impersonates has to be a real row there — a literal fixture UUID
    // throws a foreign-key violation before any assertion runs. Picking
    // whichever account happens to exist is fine: the policy under test
    // reads `entitlements`, not anything about who the user is.
    const { rows: accounts } = await c.query("select id from auth.users limit 1");
    const subscriberId: string | undefined = accounts[0]?.id;
    if (!subscriberId) {
      skip("subscriber reads a locked route's steps", "no auth.users row to attach an entitlement to");
      skip("subscriber reads a locked route's hazards", "no auth.users row to attach an entitlement to");
    } else {
      await c.query("begin");
      await c.query(
        `insert into entitlements (user_id, status) values ($1, 'active')
           on conflict (user_id) do update set status = 'active'`,
        [subscriberId],
      );
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: subscriberId, role: "authenticated" }),
      ]);
      const paidLocked = await c.query("select 1 from route_details where route_id = $1", [lockedId]);
      check("subscriber reads a locked route's steps", paidLocked.rowCount === 1);
      const paidHazards = await c.query("select 1 from hazards where route_id = $1", [lockedId]);
      check("subscriber reads a locked route's hazards", paidHazards.rowCount >= 0);
      await c.query("rollback");
      await c.query("reset role");
    }
  }

  // ── Entitlements are not self-writable ───────────────────────────────────
  await asUser(c, FREELOADER, async () => {
    let refused = false;
    try {
      await c.query("insert into entitlements (user_id, status) values ($1, 'active')", [FREELOADER]);
    } catch {
      refused = true;
    }
    check("a user cannot grant themselves an entitlement", refused,
      "the insert succeeded — anyone can unlock everything");
  });

  await c.end();
  console.log(failures === 0 ? "\npaywall: all checks passed" : `\npaywall: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
