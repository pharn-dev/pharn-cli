import { build } from 'esbuild';

// Usage: node scripts/build.mjs [outfile]
//
// `npm run build` passes nothing and gets the published `dist/index.js` (the
// path `bin.pharn` names). The one optional argument exists for
// tests/dist-smoke.test.ts, which bundles into a temp dir with THESE options —
// so the bundle the required `Test` gate executes is built by the same code as
// the one that ships, never by a copy of its settings that could drift.
const args = process.argv.slice(2);
if (args.length > 1) {
  console.error('Usage: node scripts/build.mjs [outfile]');
  process.exit(1);
}
const outfile = args[0] ?? 'dist/index.js';

// Bundle to a single file so the published package isn't a 30-file 1:1 mirror
// of src/. Comments and insignificant whitespace are stripped, but identifiers
// are left unmangled — this is a CLI, not a browser bundle, so there's no
// obfuscation motive, and PHARN_DEBUG=1 stack traces stay readable without
// needing a shipped sourcemap.
await build({
  entryPoints: ['src/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@clack/prompts', 'minimist', 'picocolors'],
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
});
