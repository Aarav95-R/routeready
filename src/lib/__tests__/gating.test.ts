import {
  canDrive, firstDrivable, isEntitled, lockedCount, resolveStatus,
} from "../gating";

const free = { is_free: true };
const locked = { is_free: false };

describe("canDrive", () => {
  test("the free route is drivable by anyone", () => {
    expect(canDrive(free, "lapsed")).toBe(true);
    expect(canDrive(free, "unknown")).toBe(true);
  });

  test("a locked route needs an active subscription", () => {
    expect(canDrive(locked, "active")).toBe(true);
    expect(canDrive(locked, "lapsed")).toBe(false);
  });

  test("an unresolved status does not open a locked route", () => {
    // `unknown` reaching here means the mirror was already consulted and had
    // nothing. Opening on it would unlock everything on a fresh install.
    expect(canDrive(locked, "unknown")).toBe(false);
  });
});

describe("resolveStatus", () => {
  test("a live answer always wins", () => {
    expect(resolveStatus("active", "lapsed")).toBe("active");
    expect(resolveStatus("lapsed", "active")).toBe("lapsed");
  });

  test("falls back to what this device last knew", () => {
    expect(resolveStatus("unknown", "active")).toBe("active");
    expect(resolveStatus("unknown", "lapsed")).toBe("lapsed");
  });

  test("a device that has never resolved one is lapsed", () => {
    // Harmless: such a device has no cached route details to unlock either.
    expect(resolveStatus("unknown", null)).toBe("lapsed");
  });
});

describe("isEntitled", () => {
  test("only active counts", () => {
    expect(isEntitled("active")).toBe(true);
    expect(isEntitled("lapsed")).toBe(false);
    expect(isEntitled("unknown")).toBe(false);
  });
});

describe("lockedCount", () => {
  test("counts what a non-subscriber cannot drive", () => {
    expect(lockedCount([free, locked, locked], "lapsed")).toBe(2);
  });

  test("is zero for a subscriber", () => {
    expect(lockedCount([free, locked, locked], "active")).toBe(0);
  });

  test("is zero for an empty centre", () => {
    expect(lockedCount([], "lapsed")).toBe(0);
  });
});

describe("firstDrivable", () => {
  test("finds the free route for a non-subscriber", () => {
    const routes = [{ is_free: false, id: "a" }, { is_free: true, id: "b" }];
    expect(firstDrivable(routes, "lapsed")?.id).toBe("b");
  });

  test("is the first route outright for a subscriber", () => {
    const routes = [{ is_free: false, id: "a" }, { is_free: true, id: "b" }];
    expect(firstDrivable(routes, "active")?.id).toBe("a");
  });

  test("is null when there is nothing to drive", () => {
    expect(firstDrivable([], "active")).toBeNull();
  });
});
