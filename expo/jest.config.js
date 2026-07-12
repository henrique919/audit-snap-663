/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/lib"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@expo-google-fonts/.+$": "<rootDir>/lib/__tests__/mocks/expoGoogleFonts.js",
    "^expo-font$": "<rootDir>/lib/__tests__/mocks/expoFont.js",
  },
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
      },
    ],
  },
  collectCoverageFrom: [
    "lib/persistence/**/*.ts",
    "lib/reportFreshness.ts",
    "lib/report.ts",
    "lib/reportImages.ts",
    "lib/reportFonts.ts",
    "lib/mediaRegistry.ts",
    "lib/files.ts",
    "lib/store.ts",
    "!lib/persistence/README.md",
  ],
  coveragePathIgnorePatterns: ["/node_modules/", "/__tests__/"],
};
