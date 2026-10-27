// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*', 'android/*', 'ios/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    rules: {
      // Money must stay in integer minor units; see shared/money.ts.
      'no-restricted-globals': ['error', { name: 'parseFloat', message: 'Use parseMoney() for amounts.' }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: 'Use parseMoney() for amounts.' },
      ],
    },
  },
  {
    // Back4App Cloud Code: Node CommonJS with a global `Parse`.
    files: ['cloud/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { Parse: 'readonly', require: 'readonly', module: 'writable' },
    },
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: 'Money is integer centavos.' }],
    },
  },
]);
