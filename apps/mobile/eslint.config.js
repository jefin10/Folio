const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['android/**', 'ios/**', '.expo/**', 'node_modules/**', 'modules/**/android/**'] },
  {
    rules: {
      // Forms pre-fill once from loaded data / route params; kept as a warning.
      'react-hooks/set-state-in-effect': 'warn',
      // TypeScript already verifies namespace members (enums re-exported by expo-notifications).
      'import/namespace': 'off',
    },
  },
];
