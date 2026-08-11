import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The dashboard went unlinted for its whole life: `npm run lint` at the root
 * covers `src/**\/*.ts` only, and CI type-checked the library alone, so half
 * the shipped product had no static analysis at all. What that hid was small —
 * one `any`, one unused binding and three suppression comments — but it hid it
 * indefinitely, and would have hidden the next one too.
 *
 * The rules mirror the library's, plus the two React rules that only make sense
 * here: hook dependencies, and the component-export shape Fast Refresh needs.
 */
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `rules-of-hooks` stays an error — it caught a `useMemo` below an early
      // return, which crashed the detail page with "rendered fewer hooks than
      // expected". `set-state-in-effect` arrived with this plugin's compiler-era
      // rules and currently reports nine places, most of them the ordinary
      // fetch-on-mount shape where the state is set after an `await` and so is
      // not synchronous at all. Kept visible as a warning rather than gating
      // CI on a rule that does not yet distinguish the two; JsonViewer's is
      // genuine and belongs in the next dashboard pass.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Deliberately matches the library: `||` is the intended operator for
      // text, where an empty string means "not supplied", and stays strict for
      // numbers and booleans, where a configured `0` or `false` is a decision.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'warn',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/prefer-optional-chain': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/**/*.{spec,test}.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}'],
    rules: {
      // Same reasoning as the library: in a spec a wrong assertion fails the
      // test, which is the point of the test.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-refresh/only-export-components': 'off',
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
];
