/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  roots: ["<rootDir>/lib"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@react-native-async-storage/async-storage$":
      "@react-native-async-storage/async-storage/jest/async-storage-mock",
    "^@expo-google-fonts/.+$": "<rootDir>/lib/__tests__/mocks/expoGoogleFonts.js",
    "^expo-font$": "<rootDir>/lib/__tests__/mocks/expoFont.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
  collectCoverageFrom: [
    "lib/annotationGeometry.ts",
    "lib/annotationSvg.ts",
    "lib/dialogs.ts",
    "lib/format.ts",
    "lib/issueIndex.ts",
    "lib/persistence/**/*.ts",
    "lib/reportFreshness.ts",
    "lib/report.ts",
    "lib/reportImages.ts",
    "lib/reportFonts.ts",
    "lib/reportPrintWeb.ts",
    "lib/mediaRegistry.ts",
    "lib/files.ts",
    "lib/store.ts",
    "!lib/persistence/README.md",
  ],
  coveragePathIgnorePatterns: ["/node_modules/", "/__tests__/"],
};
