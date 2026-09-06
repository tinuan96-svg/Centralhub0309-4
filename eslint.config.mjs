import { defineConfig, globalIgnores } from 'eslint/config';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'android/**',
    'ios/**',
    'public/**',
    'dist/**',
    'build/**',
    'scripts/**/*.mjs',
  ]),
  {
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'error',
    },
  },
]);
