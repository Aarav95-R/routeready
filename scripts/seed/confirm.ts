/**
 * The guard in front of the one script in this repo that destroys data.
 *
 * `push.ts` opens with
 *
 *     truncate test_centres, manoeuvres, show_me_tell_me restart identity cascade
 *
 * and the cascade reaches `routes` and `hazards` with it. Which database that
 * lands on is decided by whatever PGHOST happens to be exported in the shell,
 * or by a connection string on argv — neither of which is visible at the moment
 * you press enter, and both of which survive from an earlier session.
 *
 * So the script now refuses by default and reads the target back before it will
 * go. Pure and argument-taking rather than reading `process` itself, because a
 * guard nobody can test is not a guard.
 */

export const CONFIRM_FLAG = "--yes-truncate";

/**
 * The host being pointed at, for reading back to a person.
 *
 * A connection string is parsed rather than printed, because it carries the
 * password — and echoing a password back inside the warning that tells somebody
 * to be careful is its own small disaster.
 */
function targetHost(argv: string[], env: Record<string, string | undefined>): string {
  const conn = argv.find((a) => a.startsWith("postgres://") || a.startsWith("postgresql://"))
    ?? env.DATABASE_URL;
  if (conn) {
    try {
      return new URL(conn).hostname;
    } catch {
      return "unknown (unparseable connection string)";
    }
  }
  return env.PGHOST ?? "unknown target";
}

/**
 * `null` to proceed, or the sentence to print before exiting.
 *
 * Returns the message rather than printing or exiting itself, so the decision
 * and the side effect stay separable — which is the only reason this is
 * testable at all.
 */
export function confirmDestructive(
  argv: string[],
  env: Record<string, string | undefined>
): string | null {
  if (argv.includes(CONFIRM_FLAG)) return null;

  return [
    "",
    "  This will TRUNCATE test_centres, manoeuvres and show_me_tell_me.",
    "  The cascade takes routes and hazards with them.",
    "",
    `  Target: ${targetHost(argv, env)}`,
    "",
    "  Nothing has been changed. Check that host is the one you mean, then",
    `  run it again with ${CONFIRM_FLAG}.`,
    "",
  ].join("\n");
}

/**
 * The acknowledgement that the cascade is about to take somebody's driving
 * history with it. Deliberately separate from CONFIRM_FLAG: that one asks
 * "is this the right database", which is a different question from "am I
 * willing to lose what is in it".
 */
export const USER_DATA_FLAG = "--and-user-data";

/**
 * The tables the cascade reaches that are not the seed's to give back.
 *
 * TRUNCATE ... CASCADE does not consult ON DELETE clauses — it truncates
 * every table holding a foreign key into a target, whatever those clauses
 * say. Both of these reference `routes`, so both go.
 */
export const USER_DATA_TABLES = ["user_progress", "favourites"] as const;

/**
 * `null` to proceed, or the sentence to print before exiting.
 *
 * Takes counts rather than a database client for the same reason
 * confirmDestructive takes argv rather than reading process: the decision and
 * the side effect stay separable, and the decision stays testable.
 *
 * Empty tables are the ordinary case and must not cost a second flag. There
 * is no honest way to preserve the rows when they are not — a seed run mints
 * new route ids, so progress that survived would point at routes that no
 * longer exist. The choice being offered is to look at the number first, not
 * to keep it.
 */
export function confirmUserData(
  counts: Record<string, number>,
  argv: string[],
): string | null {
  const losing = USER_DATA_TABLES
    .map((t) => [t, counts[t] ?? 0] as const)
    .filter(([, n]) => n > 0);

  if (losing.length === 0) return null;
  if (argv.includes(USER_DATA_FLAG)) return null;

  return [
    "",
    "  The cascade does not stop at the seed tables. These hold rows:",
    "",
    ...losing.map(([t, n]) => `    ${t.padEnd(16)} ${n}`),
    "",
    "  TRUNCATE ... CASCADE ignores ON DELETE clauses, so all of it goes. A",
    "  seed run also mints new route ids, so none of it would still point at",
    "  anything afterwards even if it were spared.",
    "",
    `  Nothing has been changed. To go ahead anyway, add ${USER_DATA_FLAG}.`,
    "",
  ].join("\n");
}
