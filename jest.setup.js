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

// Same fix, one module further out. `@react-native-google-signin/google-signin`
// reads its native constants at *import* time — `TurboModuleRegistry.getEnforcing`
// throws outside a real binary — and sessionStore now imports socialAuth, which
// imports it. So five screen suites that have nothing to do with Google went red
// simply for mounting a screen that touches the session store.
//
// The package ships its own jest setup, but it mocks a path inside its `jest/build`
// tree rather than the `src/` this project's resolver actually loads, so it does
// not help here. Mocking the entry point does, and it is the same shape as the
// supabase mock above. Suites that test this module for real — socialAuth's own,
// and authError's — declare their own file-level mock, which still wins over this.
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { configure: jest.fn(), signIn: jest.fn(), signOut: jest.fn() },
}));

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
