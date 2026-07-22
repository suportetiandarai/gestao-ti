import eslint from '@eslint/js';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

const sharedBrowserGlobals = {
  ...globals.browser,
  mostrarAviso: 'readonly',
  usuarioAtual: 'readonly',
  perfilAtual: 'readonly',
  html2pdf: 'readonly',
  SignaturePad: 'readonly',
  XLSX: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.tmp-sheet/**',
      '.codex-solicitacoes/**',
      'fontes_drive_auditoria/**',
      'supabase/.temp/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: sharedBrowserGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-unsafe-finally': 'error',
    },
  },
  {
    files: ['app.js', 'auth.js', 'signature.js', 'inventory-*.js', 'glpi-dashboard.js'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
    },
  },
  {
    files: ['glpi-dashboard-core.js'],
    languageOptions: {
      globals: { ...sharedBrowserGlobals, module: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['tests/**/*.cjs', 'playwright.config.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: { sourceType: 'module' },
      globals: {
        ...globals.browser,
        Deno: 'readonly',
      },
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    },
  },
  {
    files: ['supabase/functions/**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    },
  },
];
