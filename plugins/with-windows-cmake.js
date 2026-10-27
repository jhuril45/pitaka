/**
 * Local Android builds on Windows fail with "Filename longer than 260 characters":
 * the ninja shipped with the default CMake 3.22.1 (ninja 1.10) ignores Windows
 * long-path support, and React Native codegen object paths exceed 260 chars.
 * CMake 3.31.6 bundles ninja 1.12, which handles them.
 *
 * Applied only when prebuild runs on Windows, so EAS/macOS/Linux builds keep
 * the React Native default.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const CMAKE_VERSION = '3.31.6';
const MARKER = '// pitaka: windows-cmake';

module.exports = function withWindowsCmake(config) {
  if (process.platform !== 'win32') return config;
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER} (ninja >= 1.12 supports paths over 260 chars)
android {
    externalNativeBuild {
        cmake {
            version "${CMAKE_VERSION}"
        }
    }
}
`;
    }
    return cfg;
  });
};
