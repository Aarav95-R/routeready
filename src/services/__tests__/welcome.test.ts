import AsyncStorage from "@react-native-async-storage/async-storage";
import { forgetWelcome, hasSeenWelcome, markWelcomeSeen } from "../welcome";

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

// The flag is deliberately left in place on sign-out, so that somebody coming
// back to their own account is not welcomed twice. Deletion is the one exit
// there is no coming back from, and the id it is keyed by is about to stop
// existing.
test("deleting the account forgets that it was ever welcomed", async () => {
  await markWelcomeSeen("u1");

  await forgetWelcome("u1");

  // On key presence rather than on the read value: the AsyncStorage jest mock
  // answers a removed key with undefined where the real one answers null, and
  // the claim being made here is simply that the row is off the disk.
  expect(await AsyncStorage.getAllKeys()).not.toContain("welcome:u1");
});

test("forgetting one account leaves the other person on this phone alone", async () => {
  await markWelcomeSeen("u1");
  await markWelcomeSeen("u2");

  await forgetWelcome("u1");

  expect(await hasSeenWelcome("u2")).toBe(true);
});

// Same argument as markWelcomeSeen: this runs during a teardown that has
// already succeeded on the server. A disk that will not write must not throw
// its way out of a deletion that has already happened.
test("an unwritable disk does not throw out of a deletion", async () => {
  const spy = jest.spyOn(AsyncStorage, "removeItem").mockRejectedValueOnce(new Error("disk"));
  await expect(forgetWelcome("u1")).resolves.toBeUndefined();
  spy.mockRestore();
});

test("with no account there is nothing to forget", async () => {
  await markWelcomeSeen("u1");
  await forgetWelcome("");
  expect(await hasSeenWelcome("u1")).toBe(true);
});
