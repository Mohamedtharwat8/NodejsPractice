const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['client/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^(req|res|next)$' }] },
  },
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.jest } } },
];
