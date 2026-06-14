export default {
  testEnvironment: 'node',
  // Pure ESM — no transform. Run via: node --experimental-vm-modules jest
  transform: {},
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
    },
  },
};
