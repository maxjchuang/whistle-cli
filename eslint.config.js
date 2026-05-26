const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/log/**'],
  },
  {
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        RequestInit: 'readonly',
        require: 'readonly',
        module: 'readonly',
        setTimeout: 'readonly',
        TextDecoder: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off',
    },
  },
];
