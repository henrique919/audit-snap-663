/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/lib"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
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
    "lib/store.ts",
    "!lib/persistence/README.md",
  ],
  coveragePathIgnorePatterns: ["/node_modules/", "/__tests__/"],
};
