import { verifyCopy } from "../verifyCopy";

test("each flow gets its own words", () => {
  const titles = (["signup", "recovery", "email"] as const).map((t) => verifyCopy(t).title);
  expect(new Set(titles).size).toBe(3);
});

test("the address is repeated back, so a typo is visible", () => {
  expect(verifyCopy("signup").subtitle("sam@example.com")).toContain("sam@example.com");
  expect(verifyCopy("recovery").subtitle("sam@example.com")).toContain("sam@example.com");
});

// An unknown type must still render a screen rather than crash it — Supabase
// adds link types without announcing them.
test("an unrecognised type still has words", () => {
  expect(verifyCopy("nonsense" as never).title).toBeTruthy();
});
