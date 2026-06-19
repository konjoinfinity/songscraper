export default {
  testEnvironment: 'node',
  // Pure ESM — no transform. Run via: node --experimental-vm-modules jest
  transform: {},
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  // Ratchet floor (Konjo retrofit): the browser/network glue (loadChartPage,
  // createSongDoc's live API handoff) still needs a real browser/network to cover,
  // so a hard 80% gate would false-fail today. These floors sit just below the
  // current measured baseline (~75% lines) so CI blocks regressions while we keep
  // ratcheting toward the 80% target. Raise these whenever coverage climbs.
  coverageThreshold: {
    global: {
      lines: 72,
      statements: 70,
      functions: 68,
      branches: 75,
    },
  },
};
