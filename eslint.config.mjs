import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // The whole repo is ESM Node ("type": "module"), so `nodeBuiltin` — Node minus
      // the CJS-only names — is the accurate platform, and `__dirname`/`require` in
      // an .mjs still trips no-undef. (Plain `globals.node` would declare those five
      // CJS names as available, silently passing a real ESM runtime crash.) This is
      // what covers scripts/*.mjs: typescript-eslint turns no-undef off for TS, so
      // before this the plain-JS surface had no platform declared at all.
      globals: globals.nodeBuiltin,
    },
    rules: {
      // Severity is `error`, not `warn`: `npm run lint` runs --max-warnings 0, so a
      // warning already fails the gate. Warnings are not a tier here, and the config
      // should not advertise a softness the gate does not have.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
