jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearUserCache } from "../cache";
import { QUIZ_RESULTS_KEY, loadResults, recordAnswer, recordRound } from "../quizResults";

beforeEach(() => AsyncStorage.clear());

test("a device that has never taken the quiz starts empty rather than throwing", async () => {
  expect(await loadResults()).toEqual({ answers: {}, lastScore: null });
});

test("an answer is remembered by question", async () => {
  await recordAnswer("q1", true);
  expect((await loadResults()).answers).toEqual({ q1: true });
});

test("the latest answer replaces the one before it, in both directions", async () => {
  await recordAnswer("q1", false);
  await recordAnswer("q1", true);
  expect((await loadResults()).answers.q1).toBe(true);

  await recordAnswer("q1", false);
  expect((await loadResults()).answers.q1).toBe(false);
});

test("answers are written one at a time, so quitting a round keeps what was answered", async () => {
  await recordAnswer("q1", true);
  await recordAnswer("q2", false);
  // No recordRound() — the learner closed the round after two questions.
  const r = await loadResults();
  expect(r.answers).toEqual({ q1: true, q2: false });
  expect(r.lastScore).toBeNull();
});

test("finishing a round stores its score without disturbing the answers", async () => {
  await recordAnswer("q1", true);
  await recordRound(7);
  const r = await loadResults();
  expect(r.lastScore).toBe(7);
  expect(r.answers).toEqual({ q1: true });
});

test("signing out takes the score off the phone with everything else personal", async () => {
  // A shared phone would otherwise hand the next person to sign in the last
  // one's results. The key sits inside the prefix clearUserCache() already
  // sweeps, which is why that function needs no change for this feature.
  // Assert the behaviour rather than the string, so a later rename of either
  // cannot quietly strand the data outside the sweep.
  await recordAnswer("q1", true);
  await recordRound(7);
  expect(await AsyncStorage.getItem(QUIZ_RESULTS_KEY)).not.toBeNull();

  await clearUserCache();

  expect(await AsyncStorage.getItem(QUIZ_RESULTS_KEY)).toBeNull();
  expect(await loadResults()).toEqual({ answers: {}, lastScore: null });
});

test("a corrupt or half-written store reads as empty rather than crashing the tab", async () => {
  await AsyncStorage.setItem(QUIZ_RESULTS_KEY, "{not json");
  expect(await loadResults()).toEqual({ answers: {}, lastScore: null });
});
