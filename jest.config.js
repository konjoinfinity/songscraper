export default {
  testEnvironment: 'node',
  // Pure ESM — no transform. Run via: node --experimental-vm-modules jest
  transform: {},
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  // Ratchet floor (Konjo retrofit): browser/network modules (scrapeSong, google/*,
  // server routes) have no unit coverage yet, so a hard 80% gate would be a false
  // failure today. These floors sit just below the current measured baseline so CI
  // blocks regressions while we raise coverage toward the 80% target over time.
  coverageThreshold: {
    global: {
      lines: 45,
      statements: 45,
      functions: 45,
      branches: 45,
    },
  },
};
