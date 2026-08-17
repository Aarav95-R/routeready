// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // .expo is generated on every start — router.d.ts ships its own blanket
    // eslint-disable, which then reports as an unused directive.
    ignores: ["dist/*", ".expo/*"],
  },
  // eslint-config-expo declares the browser and node globals but not Jest's,
  // so every `jest.mock` in a setup file or a suite read as an undeclared
  // global. Declared here rather than by adding an `/* global jest */` comment
  // to each file, which is the same statement made once per file and forgotten
  // on the next one.
  {
    files: ["jest.setup.js", "**/__tests__/**", "**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: {
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
      },
    },
    // Two rules that Jest's mocking model forces a test file to break, so
    // they are turned off here rather than waived line by line — which is
    // what the suites were doing, one `eslint-disable-next-line` per import.
    //
    // `import/first`: a jest.mock() call is written above the imports it
    // applies to, because that is the order it takes effect in and reading it
    // the other way round is a lie about what the file does.
    //
    // `no-require-imports`: a jest.mock() factory cannot close over an import
    // — Jest hoists the call above them — so require() inside the factory is
    // the only thing that works, not a style choice.
    rules: {
      "import/first": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
