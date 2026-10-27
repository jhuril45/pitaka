// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Parse's React Native build requires Node's `crypto` for randomUUID().
// Point it at a tiny shim backed by expo-crypto.
const cryptoShim = path.resolve(__dirname, 'src/polyfills/crypto.ts');
// On web, react-native-web has no `react-native/Libraries/...` deep imports;
// Parse's RN build needs this one (for LiveQuery), so give it a small emitter.
const RN_EVENT_EMITTER = 'react-native/Libraries/vendor/emitter/EventEmitter';
const eventEmitterShim = path.resolve(__dirname, 'src/polyfills/event-emitter.ts');
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'crypto') {
    return { type: 'sourceFile', filePath: cryptoShim };
  }
  if (platform === 'web' && moduleName === RN_EVENT_EMITTER) {
    return { type: 'sourceFile', filePath: eventEmitterShim };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

// Don't crawl the generated native projects: a Gradle build writes thousands of
// files there and can leave Metro unresponsive while it re-indexes them.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const projectRoot = escapeRegExp(path.resolve(__dirname)).replace(/\\\\/g, '[\\\\/]');
const nativeDirs = [new RegExp(`^${projectRoot}[\\\\/](android|ios)[\\\\/].*`)];
const existing = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...nativeDirs];

module.exports = config;
