/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/__tests__'],
  // helpers are shared code; integration tests hit the live dev app (npm run test:integration).
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/', '/__tests__/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  collectCoverageFrom: ['shared/**/*.ts', 'src/lib/**/*.ts', 'src/parse/**/*.ts', 'cloud/**/*.js'],
};
