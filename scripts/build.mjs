import { build } from 'esbuild';

// Bundle to a single file so the published package isn't a 30-file 1:1 mirror
// of src/. Comments and insignificant whitespace are stripped, but identifiers
// are left unmangled — this is a CLI, not a browser bundle, so there's no
// obfuscation motive, and PHARN_DEBUG=1 stack traces stay readable without
// needing a shipped sourcemap.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@clack/prompts', 'degit', 'minimist', 'picocolors'],
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
});
