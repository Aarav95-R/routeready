import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasSeenWelcome, markWelcomeSeen } from "../welcome";

beforeEach(() => AsyncStorage.clear());

test("a brand-new account has not seen the welcome", async () => {
  expect(await hasSeenWelcome("u1")).toBe(false);
});

test("marking it seen survives the next launch", async () => {
  await markWelcomeSeen("u1");
  expect(await hasSeenWelcome("u1")).toBe(true);
});

// A shared phone. The learner who signs in second is as new to the app as the
// first one was, and a device-wide flag would have answered for them.
test("the flag belongs to the account, not to the phone", async () => {
  await markWelcomeSeen("u1");
  expect(await hasSeenWelcome("u2")).toBe(false);
});

test("marking twice is not an error and does not unset it", async () => {
  await markWelcomeSeen("u1");
  await markWelcomeSeen("u1");
  expect(await hasSeenWelcome("u1")).toBe(true);
});

// A banner nobody can dismiss is worse than no banner: with no account to
// write the flag against, the dismissal would not survive the screen.
test("with nobody signed in the welcome is treated as already seen", async () => {
  expect(await hasSeenWelcome("")).toBe(true);
});

test("with nobody signed in nothing is written to disk", async () => {
  await markWelcomeSeen("");
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

// Home draws off this before its rows arrive. A storage read that throws
// would take the whole screen down for a banner.
test("unreadable storage reports seen rather than throwing", async () => {
  const spy = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
  expect(await hasSeenWelcome("u1")).toBe(true);
  spy.mockRestore();
});

test("an unwritable disk does not take the screen down with it", async () => {
  const spy = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
  await expect(markWelcomeSeen("u1")).resolves.toBeUndefined();
  spy.mockRestore();
});
