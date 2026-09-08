import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // A RATCHET, not a quality bar. These are the measured numbers rounded
      // DOWN to the whole number (measured 97.06 / 92.48 / 97.55 / 97.92), so
      // what they catch is a DELETION — an error-path suite removed, a branch
      // that stops being exercised. They do not say the assertions are any good:
      // coverage records which lines ran, never whether anything was checked.
      //
      // Rounded down on purpose. A floor set to the measured value itself would
      // redden an unrelated PR on a fractional run-to-run fluctuation, and the
      // fix for that looks like "lower the floor" — the exact reflex a ratchet
      // exists to prevent.
      //
      // The previous floors (90 / 82 / 95 / 92) sat up to 10 points below
      // measured, which is enough slack for whole error-path suites to be
      // deleted with CI still green.
      thresholds: {
        statements: 97,
        branches: 92,
        functions: 97,
        lines: 97,
      },
    },
  },
});
