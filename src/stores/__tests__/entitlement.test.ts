jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const mockCurrentInfo = jest.fn();
const mockIdentify = jest.fn();
const mockRestore = jest.fn();
const mockBuy = jest.fn();
// jest.mock() factories are hoisted above every other statement in this file's
// compiled output, including these consts. Reading mockCurrentInfo etc.
// directly as an object-literal property would freeze in the `undefined` they
// hold at that hoisted moment, so each is read lazily, inside a wrapper that
// only runs once a test actually calls the function — by which point the
// consts above have long since been assigned.
jest.mock("@/services/purchases", () => ({
  ENTITLEMENT_ID: "full",
  configure: jest.fn(),
  identify: (...args: unknown[]) => mockIdentify(...args),
  signOutPurchases: jest.fn(),
  currentInfo: (...args: unknown[]) => mockCurrentInfo(...args),
  offers: jest.fn().mockResolvedValue([]),
  buy: (...args: unknown[]) => mockBuy(...args),
  restore: (...args: unknown[]) => mockRestore(...args),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { MIRROR_KEY, useEntitlement } from "../entitlement";

const ACTIVE = { active: true, product: "routeready_monthly", renewsAt: "2026-10-12T00:00:00Z" };
const LAPSED = { active: false, product: null, renewsAt: null };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useEntitlement.setState({ status: "unknown", product: null, renewsAt: null });
});

test("init with no answer and no mirror lands on lapsed", async () => {
  mockCurrentInfo.mockResolvedValue(null);
  await useEntitlement.getState().init();
  expect(useEntitlement.getState().status).toBe("lapsed");
});

test("init with no answer honours what the device last knew", async () => {
  await AsyncStorage.setItem(MIRROR_KEY, "active");
  mockCurrentInfo.mockResolvedValue(null);
  await useEntitlement.getState().init();
  expect(useEntitlement.getState().status).toBe("active");
});

test("a live answer is written to the mirror", async () => {
  mockCurrentInfo.mockResolvedValue(ACTIVE);
  await useEntitlement.getState().init();
  expect(useEntitlement.getState().status).toBe("active");
  expect(useEntitlement.getState().product).toBe("routeready_monthly");
  expect(await AsyncStorage.getItem(MIRROR_KEY)).toBe("active");
});

test("going active does not touch the route cache", async () => {
  await AsyncStorage.setItem("cache:routes:c1", "[]");
  mockCurrentInfo.mockResolvedValue(ACTIVE);
  await useEntitlement.getState().init();
  expect(await AsyncStorage.getItem("cache:routes:c1")).not.toBeNull();
});

test("going from active to lapsed sweeps the cached routes", async () => {
  mockCurrentInfo.mockResolvedValue(ACTIVE);
  await useEntitlement.getState().init();
  await AsyncStorage.setItem("cache:routes:c1", "[]");
  await AsyncStorage.setItem("cache:route-steps:r1", "[]");

  mockCurrentInfo.mockResolvedValue(LAPSED);
  await useEntitlement.getState().refresh();

  expect(useEntitlement.getState().status).toBe("lapsed");
  expect(await AsyncStorage.getItem("cache:routes:c1")).toBeNull();
  expect(await AsyncStorage.getItem("cache:route-steps:r1")).toBeNull();
});

test("a cancellation discovered on a cold start still sweeps the cached routes", async () => {
  // The in-memory store starts every fresh process at "unknown" — there is no
  // persist middleware — so this reproduces reopening the app days after
  // cancelling through the App Store: the mirror still says "active" from the
  // last session, nobody has been running init()/refresh() in between, and
  // the very first apply() of the new process is the one that has to notice
  // the loss and sweep.
  await AsyncStorage.setItem(MIRROR_KEY, "active");
  useEntitlement.setState({ status: "unknown", product: null, renewsAt: null });
  await AsyncStorage.setItem("cache:routes:c1", "[]");

  mockCurrentInfo.mockResolvedValue(LAPSED);
  await useEntitlement.getState().init();

  expect(useEntitlement.getState().status).toBe("lapsed");
  expect(await AsyncStorage.getItem("cache:routes:c1")).toBeNull();
});

test("staying lapsed does not sweep repeatedly", async () => {
  mockCurrentInfo.mockResolvedValue(LAPSED);
  await useEntitlement.getState().init();
  await AsyncStorage.setItem("cache:routes:c1", "[]");
  await useEntitlement.getState().refresh();
  // Nothing changed, so nothing is dropped — a lapsed person may still have the
  // free routes cached and must keep driving them offline.
  expect(await AsyncStorage.getItem("cache:routes:c1")).not.toBeNull();
});

test("a cancelled purchase leaves the status alone", async () => {
  mockCurrentInfo.mockResolvedValue(LAPSED);
  await useEntitlement.getState().init();
  mockBuy.mockResolvedValue(null);
  const err = await useEntitlement.getState().purchase("monthly");
  expect(err).toBeNull();
  expect(useEntitlement.getState().status).toBe("lapsed");
});

test("restore that finds nothing says so in a sentence", async () => {
  mockRestore.mockResolvedValue(LAPSED);
  const err = await useEntitlement.getState().restore();
  expect(err).toBe("No subscription found on this Apple ID.");
});

test("reset clears the mirror and the status, for sign-out", async () => {
  mockCurrentInfo.mockResolvedValue(ACTIVE);
  await useEntitlement.getState().init();
  await useEntitlement.getState().reset();
  expect(useEntitlement.getState().status).toBe("unknown");
  expect(await AsyncStorage.getItem(MIRROR_KEY)).toBeNull();
});
