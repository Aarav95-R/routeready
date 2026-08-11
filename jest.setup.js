jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

// Screens that reach networkStore pull in progressRepo -> supabase.ts, whose
// module-level createClient() call needs real Supabase credentials that a
// fresh clone or a CI runner without secrets does not have. sessionStore's
// and centresRepo's own suites already mock this module per-file for the
// same reason (see src/stores/__tests__/sessionStore.test.ts and
// src/services/__tests__/repos.test.ts); this is the same fix generalised so
// no screen test needs to know supabase.ts sits behind networkStore just to
// mount. A test-file-level jest.mock("@/lib/supabase", ...) — as those two
// suites use — still wins over this one for its own file.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

// useSafeAreaInsets() throws without a <SafeAreaProvider> ancestor. Screens
// that call it directly (the centres screen among them) render standalone
// under test, so every suite gets the library's own frame-0 stand-in rather
// than each screen test wiring up a provider by hand. The mock module is a
// bare `export default {...}`, so its `.default` — not the require() result
// itself — is what needs to stand in for the package's named exports.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});
