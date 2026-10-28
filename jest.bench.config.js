/**
 * Benchmarks (npm run bench): the app's data layer with 10,000 transactions.
 *
 * @type {import('jest').Config}
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  roots: ['<rootDir>/__tests__/bench'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 300000,
};
