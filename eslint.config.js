import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Configuración de lint orientada a capturar errores reales, no a reformatear.
// Las reglas de estilo se dejan como aviso para no bloquear por el código histórico.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'scratch/**', '.tmp-*/**', '.npm-cache/**', 'index.legacy.html', 'dist-debug/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
    },
  },
];
