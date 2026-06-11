import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/degit.d.ts'],
      // Conservative floors set just below current measured coverage so CI stays
      // green; raise as coverage improves.
      thresholds: {
        statements: 90,
        branches: 82,
        functions: 95,
        lines: 92,
      },
    },
  },
});
