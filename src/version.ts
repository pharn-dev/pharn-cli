import { createRequire } from 'node:module';

// Lives directly under src/, one level above the package root — the same
// depth as the bundled dist/index.js output, so this `require` resolves
// correctly whether run unbundled (tsx, per-file import.meta.url) or bundled
// (esbuild leaves a createRequire(import.meta.url) call unresolved, so it
// runs at runtime against the single output file's own location).
const require = createRequire(import.meta.url);
export const PHARN_VERSION: string = (
  require('../package.json') as { version: string }
).version;
