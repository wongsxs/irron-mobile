const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withCustomArch(config) {
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => item.key !== 'reactNativeArchitectures'
    );
    config.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'arm64-v8a',
    });
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('abiFilters "arm64-v8a"')) {
      config.modResults.contents = config.modResults.contents.replace(
        'defaultConfig {',
        'defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a"\n        }'
      );
    }
    return config;
  });

  return config;
};
