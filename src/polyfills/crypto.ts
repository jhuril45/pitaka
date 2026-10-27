/**
 * Stand-in for Node's `crypto` module, wired up in metro.config.js.
 *
 * The Parse React Native build calls `require('crypto').randomUUID()` for local
 * object ids, anonymous login and request ids; Hermes has no `crypto` module.
 */
export { randomUUID } from 'expo-crypto';
