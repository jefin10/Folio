// Expo auto-configures monorepo resolution (watchFolders / nodeModulesPaths).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
// Keep Metro lean on a low-RAM PC.
config.maxWorkers = 2;

module.exports = withNativeWind(config, { input: './global.css' });
