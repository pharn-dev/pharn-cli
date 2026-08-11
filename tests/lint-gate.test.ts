import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The lint gate has no soft tier: `npm run lint` runs --max-warnings 0 over src/,
// tests/, and scripts/, so ANY warning from ANY rule fails — a rule added at
// 'warn' later cannot quietly reopen the tier, because the threshold is on the
// warning COUNT, not on any rule's severity.
//
// Two layers hold that, and both are here on purpose. The first pins the gate's
// SPELLING (the script string). The second DEMONSTRATES the gate: it lints real
// source through the repo's own eslint.config.mjs and asserts the exit code. The
// spelling alone would keep passing if an eslint upgrade stopped flagging unused
// vars in .mjs, or if no-undef were disabled for the plain-JS surface — the flag
// would still be in the string while the gate had gone hollow.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslintBin = join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');

// Lint `source` as if it were the file at `asPath` — via --stdin, so the check is
// hermetic: no fixture is ever written into the repo and no cleanup can be missed.
// The path is what selects the config block, which is exactly what we're testing.
function lintExitCodeAs(asPath: string, source: string): number {
  const r = spawnSync(
    process.execPath,
    [eslintBin, '--stdin', '--stdin-filename', asPath, '--max-warnings', '0'],
    { cwd: repoRoot, input: source, encoding: 'utf8' },
  );
  return r.status ?? -1;
}

describe('lint gate: no soft tier', () => {
  it('the lint script fails on any warning and covers all three source dirs', () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as {
      scripts: { lint: string };
    };
    const tokens = pkg.scripts.lint.split(/\s+/);

    expect(pkg.scripts.lint).toMatch(/--max-warnings[= ]0\b/);
    for (const dir of ['src', 'tests', 'scripts']) {
      expect(tokens).toContain(dir);
    }
  });

  // The demonstration, on each surface the gate claims to cover. `unusedPlant`
  // does not match the /^_/ ignore pattern, so it is a genuine offence.
  it.each([
    ['src/_plant.ts', 'a TypeScript file under src/'],
    ['tests/_plant.ts', 'a TypeScript file under tests/'],
    ['scripts/_plant.mjs', 'a plain-JS file under scripts/'],
  ])('rejects an unused variable in %s (%s)', (asPath) => {
    expect(lintExitCodeAs(asPath, 'const unusedPlant = 1;\n')).toBe(1);
  });

  it('accepts clean source, so the gate is not simply always-red', () => {
    expect(lintExitCodeAs('src/_plant.ts', 'export const ok = 1;\n')).toBe(0);
    expect(lintExitCodeAs('scripts/_plant.mjs', 'export const ok = 1;\n')).toBe(
      0,
    );
  });
});

describe('lint gate: the config states the platform truthfully', () => {
  // eslint.config.mjs declares globals.nodeBuiltin, NOT globals.node. The repo is
  // ESM throughout ("type": "module"), and plain `node` would additionally declare
  // require/module/exports/__dirname/__filename — CJS-only names that do not exist
  // in ESM — so a real runtime crash would pass the hardened gate. nodeBuiltin is
  // Node minus those five, which is why this case reds under `node` and passes here.
  it('still flags __dirname and require in an ESM .mjs', () => {
    expect(
      lintExitCodeAs('scripts/_plant.mjs', 'export const p = __dirname;\n'),
    ).toBe(1);
    expect(
      lintExitCodeAs(
        'scripts/_plant.mjs',
        'export const m = require("node:fs");\n',
      ),
    ).toBe(1);
  });

  // The other half of the platform statement: console/process ARE declared, which
  // is what resolved scripts/install-local.mjs's six no-undef errors in config
  // alone — the script itself was never wrong and stays byte-for-byte unchanged.
  it('does not flag console or process in a plain-JS script', () => {
    expect(
      lintExitCodeAs(
        'scripts/_plant.mjs',
        'console.log(process.argv.length);\n',
      ),
    ).toBe(0);
  });
});
