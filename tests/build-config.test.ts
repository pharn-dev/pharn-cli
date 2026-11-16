import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOptions } from '../scripts/build.mjs';

// The esbuild options `npm run build` and tests/dist-smoke.test.ts both use,
// read from scripts/build.mjs itself. dist-smoke proves the bundle they make
// runs; this pins the choices that make it start fast and find package.json.

const ROOT = resolve(import.meta.dirname, '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  engines: { node: string };
};

describe('scripts/build.mjs buildOptions', () => {
  it('targets the engines floor major (node24)', () => {
    const floorMajor = /^>=(\d+)\./.exec(PKG.engines.node)![1];
    expect(buildOptions().target).toBe('node24');
    expect(buildOptions().target).toBe(`node${floorMajor}`);
  });

  it('splits the ESM bundle so a command loads only when it runs', () => {
    const options = buildOptions();
    expect(options.splitting).toBe(true);
    expect(options.format).toBe('esm');
    expect(options.bundle).toBe(true);
    expect(options.entryPoints).toEqual(['src/index.ts']);
  });

  it('writes index.js and every chunk flat into the outdir, dist by default', () => {
    expect(buildOptions().outdir).toBe('dist');
    expect(buildOptions('/tmp/x/dist').outdir).toBe('/tmp/x/dist');
    // No directory in the chunk name: each chunk sits beside index.js, the
    // depth src/version.ts's `require('../package.json')` assumes.
    expect(buildOptions().chunkNames).toBe('[name]-[hash]');
    expect(buildOptions().outfile).toBeUndefined();
  });

  it('leaves the runtime dependencies external', () => {
    expect(buildOptions().external).toEqual(['@clack/prompts', 'picocolors']);
  });
});
