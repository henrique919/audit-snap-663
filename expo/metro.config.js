const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // Replays are excluded. The feedback module remains resolvable because the
  // current Sentry browser package imports it during static rendering, but we
  // never initialise a feedback integration in telemetry.ts.
  includeWebReplay: false,
  includeWebFeedback: true,
  enableSourceContextInDevelopment: false,
});

module.exports = config;
