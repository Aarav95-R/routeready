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
