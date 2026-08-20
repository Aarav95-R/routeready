import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Whether this account has been shown its welcome yet.
 *
 * The first-run home screen is chosen by the record — no drives, so it teaches
 * the app — and that is the right rule for the introduction underneath. It is
 * the wrong rule for the welcome above it, which is about the account having
 * just been made rather than about the record being empty: somebody who opens
 * Centres, looks around and comes back has not driven anything and does not
 * need welcoming a second time. So this is the one piece of first-run state
 * that is remembered rather than derived.
 *
 * Keyed by user id, not device. A learner signing in second on a shared phone
 * is as new to the app as the first one was, and a device-wide flag would have
 * answered on their behalf. The key is left in place on sign-out — it is a bare
 * id with a boolean against it, and clearing it would show the welcome again to
 * somebody coming back to their own account.
 */
const key = (userId: string) => `welcome:${userId}`;

/**
 * Reads as *seen* whenever it cannot answer — no account, or a disk that will
 * not read. Both are cases where showing the banner risks one that cannot be
 * dismissed, since the dismissal has nowhere to be written.
 */
export async function hasSeenWelcome(userId: string): Promise<boolean> {
  if (!userId) return true;
  try {
    return (await AsyncStorage.getItem(key(userId))) !== null;
  } catch {
    return true;
  }
}

/**
 * Swallows a write failure rather than reporting it. The caller is a banner
 * being dismissed or tapped through, and both of those have already navigated
 * or animated away by the time this settles — there is no screen left to show
 * an error on, and the cost of the failure is one banner shown once more.
 */
export async function markWelcomeSeen(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(key(userId), "1");
  } catch {
    /* see above */
  }
}

/**
 * Forget that this account was ever welcomed.
 *
 * The comment on `key` explains why sign-out leaves the flag alone: somebody
 * returning to their own account should not be welcomed a second time. Deletion
 * is the exit with no return, and the id this is keyed by is about to stop
 * existing — leaving the row behind would mean a stranger who later signs up
 * and happens to be issued the same id inherits it.
 *
 * Swallows a failure for the same reason `markWelcomeSeen` does, and a
 * stronger one: by the time this runs the server has already deleted the
 * account, so throwing would abandon the local teardown half-done over one
 * boolean.
 */
export async function forgetWelcome(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    /* see above */
  }
}
