// Screens that reach networkStore pull in progressRepo -> supabase.ts, which
// calls createClient at import time. Expo inlines EXPO_PUBLIC_* vars from
// .env when the app runs, but a bare `jest` process never loads .env on its
// own, so without this the client constructor throws before any mock can
// intervene.
require("dotenv").config();

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

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
