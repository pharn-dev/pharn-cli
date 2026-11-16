import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Clears the host's proxy variables before every test file, so no result
    // depends on the environment of the machine running the suite.
    setupFiles: ['tests/setup/hermetic-env.ts'],
    coverage: {
      provider: 'v8',
      // lcov is added for pharn-ci's diff-coverage gate (.pharn/ci.yml);
      // the rest are vitest's own defaults.
      reporter: ['text', 'html', 'clover', 'json', 'lcov'],
      include: ['src/**/*.ts'],
      // A FLOOR, not a ratchet (CORE-190). The command suites now run the real
      // modules end to end (tests/commands/, tests/support/harness.ts) instead
      // of mocking src/ apart, and an end-to-end suite deliberately does not
      // reach every defensive branch a mock could poke (a thrown `undefined`,
      // a stubbed module returning an impossible shape). A floor pinned to the
      // measured number would make deleting such a branch, or a redundant mock
      // case, fail CI; 90 / 85 leaves room for that and still fails when a
      // whole command or error-path suite stops running.
      //
      // Coverage records which lines ran, never whether anything was checked:
      // the behaviour is pinned by the suites' assertions, not by this number.
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
