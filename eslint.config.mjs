import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';

const rules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  // Watchers read objects they do not own, where an empty string means the
  // field was not supplied and the next candidate should win — `data.to ||
  // data.recipient || 'unknown'`. `??` would stop at the empty string, so
  // `||` is the intended operator for text and this rule has nothing to say
  // about it.
  //
  // Numbers and booleans stay strict on purpose: `maxBodySize: 0` is a real
  // setting that `||` silently replaced with the 64KB default, and this is
  // the rule that catches the next one.
  '@typescript-eslint/prefer-nullish-coalescing': ['warn', { ignorePrimitives: { string: true } }],
  '@typescript-eslint/prefer-optional-chain': 'warn',
};

const typescript = (files, project) => ({
  files,
  languageOptions: {
    parser,
    parserOptions: {
      project,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules,
});

export default [
  typescript(['src/**/*.ts'], './tsconfig.json'),
  // The Playwright specs run in Node and drive a browser, so they carry their
  // own tsconfig: DOM types for the callbacks `page.evaluate` sends across,
  // and none of the library's decorator or path settings.
  typescript(['e2e/**/*.ts', 'playwright.config.ts'], './e2e/tsconfig.json'),
  // The `nestlens-mcp` package's bin: plain CommonJS that npm runs as it is.
  // `npx tsc -p packages/mcp` type-checks it against `nestlens/mcp`.
  {
    files: ['packages/mcp/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { process: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'error', strict: ['error', 'global'] },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // In `src/` an assertion that turns out wrong is a TypeError in someone
      // else's application; in a spec it is the test failing, which is what a
      // test is for. `expect(result!.id).toBe(1)` after asserting the result
      // exists is the clearer way to write it, and the rule fires on ~200 of
      // them — enough noise to bury a real warning in `src/`.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  eslintConfigPrettier,
];
