/**
 * Integration tests against the live **dev** Back4App app (never prod).
 * Needs cloud/main.js deployed and the setupSchema + seedShared jobs run.
 * Reads the app keys from .env.local.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/integration'],
  transform: { '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  testTimeout: 30000,
};
