/**
 * The seam between this app and RevenueCat, tested against a faked SDK.
 *
 * What is worth asserting here is the *translation*, not the SDK: that a
 * CustomerInfo becomes the three facts this app uses, that a cancelled sheet
 * is told apart from a failed purchase, and that a build with no API key stays
 * inert rather than throwing. The SDK itself is somebody else's test suite.
 */
const mockPurchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn().mockResolvedValue(undefined),
  logIn: jest.fn(),
  logOut: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
};

// This file's own mock, which wins over the blanket one in jest.setup.js.
// Read lazily for the hoisting reason spelled out in entitlement.test.ts.
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, k: string) => (mockPurchases as Record<string, unknown>)[k] }),
  LOG_LEVEL: { VERBOSE: "VERBOSE", DEBUG: "DEBUG", INFO: "INFO", WARN: "WARN", ERROR: "ERROR" },
}));

const KEY = "EXPO_PUBLIC_REVENUECAT_IOS_KEY";

/**
 * Load the wrapper fresh, with or without a key.
 *
 * The key is read once at module scope — that is deliberate, it cannot change
 * while the app runs — so the only way to test both builds is to reset the
 * registry between them.
 */
function load(apiKey: string | undefined): typeof import("../purchases") {
  if (apiKey === undefined) delete process.env[KEY];
  else process.env[KEY] = apiKey;
  let mod: typeof import("../purchases");
  jest.isolateModules(() => { mod = require("../purchases"); });
  return mod!;
}

/** A CustomerInfo carrying an active "full" entitlement. */
function activeInfo(product = "routeready_monthly", expires = "2026-10-12T00:00:00Z") {
  return {
    entitlements: {
      active: { full: { productIdentifier: product, expirationDate: expires } },
    },
  };
}

const emptyInfo = { entitlements: { active: {} } };

const weeklyPkg = { identifier: "$rc_weekly", product: { priceString: "£3.00" } };
const monthlyPkg = { identifier: "$rc_monthly", product: { priceString: "£9.00" } };

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.setLogLevel.mockResolvedValue(undefined);
});

afterEach(() => { delete process.env[KEY]; });

describe("currentInfo", () => {
  test("turns an active entitlement into the three facts the app uses", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue(activeInfo());
    const { currentInfo } = load("appl_test");

    expect(await currentInfo()).toEqual({
      active: true,
      product: "routeready_monthly",
      renewsAt: "2026-10-12T00:00:00Z",
    });
  });

  test("reports an inactive entitlement rather than nothing at all", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue(emptyInfo);
    const { currentInfo } = load("appl_test");

    expect(await currentInfo()).toEqual({ active: false, product: null, renewsAt: null });
  });
});

describe("identify", () => {
  test("logs the Supabase user id in and returns what the store already knows", async () => {
    mockPurchases.logIn.mockResolvedValue({ customerInfo: activeInfo("routeready_weekly") });
    const { identify } = load("appl_test");

    const entitlement = await identify("user-123");

    expect(mockPurchases.logIn).toHaveBeenCalledWith("user-123");
    expect(entitlement).toEqual({
      active: true,
      product: "routeready_weekly",
      renewsAt: "2026-10-12T00:00:00Z",
    });
  });
});

describe("offers", () => {
  test("returns both plans with the store's own prices, weekly first", async () => {
    mockPurchases.getOfferings.mockResolvedValue({
      current: { weekly: weeklyPkg, monthly: monthlyPkg },
    });
    const { offers } = load("appl_test");

    expect(await offers()).toEqual([
      { plan: "weekly", priceString: "£3.00" },
      { plan: "monthly", priceString: "£9.00" },
    ]);
  });

  test("returns nothing when there is no current offering", async () => {
    mockPurchases.getOfferings.mockResolvedValue({ current: null });
    const { offers } = load("appl_test");

    expect(await offers()).toEqual([]);
  });

  test("omits a plan the offering does not carry", async () => {
    mockPurchases.getOfferings.mockResolvedValue({
      current: { weekly: null, monthly: monthlyPkg },
    });
    const { offers } = load("appl_test");

    expect(await offers()).toEqual([{ plan: "monthly", priceString: "£9.00" }]);
  });
});

describe("buy", () => {
  test("purchases the package matching the plan and returns the new entitlement", async () => {
    mockPurchases.getOfferings.mockResolvedValue({
      current: { weekly: weeklyPkg, monthly: monthlyPkg },
    });
    mockPurchases.purchasePackage.mockResolvedValue({ customerInfo: activeInfo("routeready_weekly") });
    const { buy } = load("appl_test");

    const entitlement = await buy("weekly");

    expect(mockPurchases.purchasePackage).toHaveBeenCalledWith(weeklyPkg);
    expect(entitlement?.active).toBe(true);
    expect(entitlement?.product).toBe("routeready_weekly");
  });

  test("returns null when the person cancelled the sheet", async () => {
    mockPurchases.getOfferings.mockResolvedValue({
      current: { weekly: weeklyPkg, monthly: monthlyPkg },
    });
    mockPurchases.purchasePackage.mockRejectedValue(
      Object.assign(new Error("cancelled"), { userCancelled: true }),
    );
    const { buy } = load("appl_test");

    expect(await buy("weekly")).toBeNull();
  });

  test("rethrows a real failure, so the sheet can say nothing was charged", async () => {
    mockPurchases.getOfferings.mockResolvedValue({
      current: { weekly: weeklyPkg, monthly: monthlyPkg },
    });
    mockPurchases.purchasePackage.mockRejectedValue(
      Object.assign(new Error("network down"), { userCancelled: false }),
    );
    const { buy } = load("appl_test");

    await expect(buy("weekly")).rejects.toThrow("network down");
  });

  test("returns null rather than throwing when the plan is not on offer", async () => {
    mockPurchases.getOfferings.mockResolvedValue({ current: { weekly: null, monthly: monthlyPkg } });
    const { buy } = load("appl_test");

    expect(await buy("weekly")).toBeNull();
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  test("maps what the store gives back", async () => {
    mockPurchases.restorePurchases.mockResolvedValue(activeInfo("routeready_monthly"));
    const { restore } = load("appl_test");

    expect(await restore()).toEqual({
      active: true,
      product: "routeready_monthly",
      renewsAt: "2026-10-12T00:00:00Z",
    });
  });
});

describe("a build with no API key", () => {
  test("configures nothing and reports an unknown entitlement", async () => {
    const { configure, currentInfo, identify, offers, buy, restore } = load(undefined);

    await configure();
    expect(mockPurchases.configure).not.toHaveBeenCalled();

    expect(await currentInfo()).toBeNull();
    expect(await identify("user-123")).toBeNull();
    expect(await offers()).toEqual([]);
    expect(await buy("weekly")).toBeNull();
    expect(await restore()).toBeNull();
    expect(mockPurchases.getCustomerInfo).not.toHaveBeenCalled();
  });
});

describe("configure", () => {
  test("hands RevenueCat the key when there is one", async () => {
    const { configure } = load("appl_test");

    await configure();

    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: "appl_test" });
  });
});
