const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { Buffer: "readonly" },
    },
  },
]);
