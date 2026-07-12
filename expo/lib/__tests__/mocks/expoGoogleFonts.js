/** Jest stub for @expo-google-fonts/* — avoids ESM parse errors in Node. */
module.exports = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === "__esModule") return true;
      return prop;
    },
  },
);
