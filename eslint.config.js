const expoConfig = require('eslint-config-expo/flat');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  globalIgnores([
    'dist/*',
    'node_modules/*',
    'ios/*',
    'android/*',
    'supabase/functions/**',
  ]),
  expoConfig,
  {
    rules: {
      // Swallowed errors hide real failures — see gotchas.md. Empty catch
      // blocks are allowed only when they carry a comment explaining why.
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },
]);
