// ESLint (flat config). Philosophy: lint must be GREEN today and must never
// block a build or a commit. Existing debt (explicit `any`, non-null `!`,
// react-hooks/exhaustive-deps suppressions) is reported as a WARNING so it is
// visible and can be paid down gradually; only real bug classes are errors.
//
// Why no typescript-eslint? The repo uses TypeScript 7, and typescript-eslint
// (parser and plugin) refuses to load on TS 7 (tracked upstream:
// typescript-eslint/typescript-eslint#10940). Types are already checked by
// `tsc --noEmit` (which also enforces noUnusedLocals), so ESLint only needs to
// *parse* TypeScript: @babel/eslint-parser does that. The two typescript-eslint
// rules we would have used are replaced by core `no-restricted-syntax`
// selectors below. When typescript-eslint supports TS 7, swap the parser and
// replace those selectors with @typescript-eslint/no-explicit-any and
// @typescript-eslint/no-non-null-assertion (also at "warn").
import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Every rule of the plugin's recommended set, downgraded to "warn": hooks mistakes show up
// in review output without ever blocking a build.
const hooksAsWarnings = Object.fromEntries(Object.keys(reactHooks.configs['recommended-latest'].rules).map((name) => [name, 'warn']));

// .ts files must NOT enable JSX (it makes `<T>(x) => ...` generics ambiguous); .tsx files must.
const tsParser = (jsx) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    sourceType: 'module',
    babelOptions: {
      babelrc: false,
      configFile: false,
      // Syntax only: ESLint never runs transforms, it just needs the parser to understand TS (+ JSX).
      parserOpts: { plugins: jsx ? ['typescript', 'jsx'] : ['typescript'] },
    },
  },
});

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.data/**',
      'data/**',
      'tests/e2e/screens/**',
      'docs/site/**', // generated help pages
      'integrations/**', // Salesforce package, Zapier and Make apps: their own tooling
      'web/public/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  ...[
    { files: ['**/*.ts', '**/*.mts'], jsx: false },
    { files: ['**/*.tsx'], jsx: true },
  ].map(({ files, jsx }) => ({
    files,
    languageOptions: {
      ...tsParser(jsx),
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    plugins: { 'react-hooks': reactHooks },
    // Do not fail on `eslint-disable` comments that are no longer needed, and do not
    // count the existing exhaustive-deps suppressions against anyone.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // TypeScript does these checks (and better); core versions give false positives on types.
      'no-undef': 'off',
      'no-unused-vars': 'off', // tsc noUnusedLocals covers it
      'no-redeclare': 'off',
      'no-dupe-class-members': 'off',
      'no-use-before-define': 'off',

      // Existing debt: WARN, never error. See docs/CONTRIBUTING.md#lint-and-existing-debt.
      'no-restricted-syntax': [
        'warn',
        { selector: 'TSAnyKeyword', message: 'Avoid explicit `any`: use a real type or `unknown` (existing uses are tolerated; do not add new ones).' },
        {
          selector: 'TSNonNullExpression',
          message: 'Avoid the non-null assertion `!`: narrow or check instead (existing uses are tolerated; do not add new ones).',
        },
      ],
      ...hooksAsWarnings, // includes rules-of-hooks and exhaustive-deps

      // Noise in this codebase that is not worth blocking on.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-fallthrough': 'warn',
      'no-async-promise-executor': 'warn',
      'no-misleading-character-class': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-cond-assign': ['warn', 'except-parens'],
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  })),
  {
    // Plain JavaScript (the relay, site scripts, config files).
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'warn', 'no-empty': ['warn', { allowEmptyCatch: true }], 'no-useless-escape': 'warn' },
  },
];
