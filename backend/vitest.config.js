// Backend tests run in Node, not jsdom, and are CommonJS like the rest of the
// server. The root vitest.config.ts only picks up src/**, so the backend needs
// its own config rather than sharing that one.
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
  },
});
