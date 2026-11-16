import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Usage: node scripts/build.mjs [outdir]
//
// `npm run build` passes nothing and gets the published `dist/` (`index.js`,
// the path `bin.pharn` names, plus its chunks). The one optional argument
// exists for tests/dist-smoke.test.ts, which bundles into a temp dir with THESE
// options — so the bundle the required `Test` gate executes is built by the
// same code as the one that ships, never by a copy of its settings that could
// drift. tests/build-config.test.ts imports `buildOptions` to pin them.

/**
 * The esbuild options for the published bundle, written into `outdir`.
 *
 * A bundle, so the published package isn't a 1:1 mirror of src/. Split into
 * chunks: src/index.ts `await import()`s the command it runs, and each command
 * becomes its own chunk, so `pharn --version` loads neither a command nor
 * @clack/prompts (a single file would hoist every external import to its top).
 * Every chunk sits directly in `outdir` (no directory in `chunkNames`), the
 * depth src/version.ts's `require('../package.json')` assumes, whichever chunk
 * holds it. Comments and insignificant whitespace are stripped, but identifiers
 * are left unmangled — this is a CLI, not a browser bundle, so there's no
 * obfuscation motive, and PHARN_DEBUG=1 stack traces stay readable without
 * needing a shipped sourcemap.
 */
export function buildOptions(outdir = 'dist') {
  return {
    entryPoints: ['src/index.ts'],
    outdir,
    splitting: true,
    chunkNames: '[name]-[hash]',
    bundle: true,
    platform: 'node',
    format: 'esm',
    // The `engines` floor (>=24.2.0).
    target: 'node24',
    external: ['@clack/prompts', 'minimist', 'picocolors'],
    minifyWhitespace: true,
    minifySyntax: true,
    legalComments: 'none',
  };
}

// Build only when run as a script, never when imported by a test.
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    console.error('Usage: node scripts/build.mjs [outdir]');
    process.exit(1);
  }
  await build(buildOptions(args[0]));
}
