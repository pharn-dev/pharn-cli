import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `degit` is the ONE dependency that fetches and tar-extracts untrusted remote
// content (`src/lib/repo.ts` -> `fetchRepo`), so the extraction guarantees
// `THREAT-MODEL.md` §2/§4b and `LIMITS.md` §3b state are degit's behaviour, not
// pharn's. They are written as MEASURED facts against one specific version. A
// caret range let npm hand users bytes nobody had measured — and it already did:
// `^3.6.1` floated the lockfile to 3.8.0 while every document still said 3.6.6.
//
// This test pins the declaration to an exact version and ties that version to
// the version the documents name, so a deliberate bump goes red until each
// "measured against" claim has been re-measured and re-written.
//
// The limit, stated rather than implied away (P0): this proves the documents
// NAME the installed version. It can never prove the measured prose is still
// TRUE of those bytes — only a human re-reading degit's source can. It likewise
// says nothing about what a consumer's `npm install` resolves; lockfiles are not
// published, so the exact range in `package.json` is the only thing that travels.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file that states a fact measured against a specific degit version. */
const MEASURED_SOURCES = [
  'THREAT-MODEL.md',
  'LIMITS.md',
  'src/lib/repo.ts',
] as const;

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

function readJson(relPath: string): unknown {
  return JSON.parse(read(relPath));
}

describe('degit version pin', () => {
  const pkg = readJson('package.json') as {
    dependencies?: Record<string, string>;
  };
  const declared = pkg.dependencies?.degit;

  it('declares degit as an exact version, never a range', () => {
    // No `^`, `~`, `>=`, `x`, or `*`: the published package must resolve the one
    // version the threat model was measured against, not "whatever 3.x is newest".
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('resolves that exact version in package-lock.json', () => {
    const lock = readJson('package-lock.json') as {
      packages?: Record<string, { version?: string }>;
    };
    expect(lock.packages?.['node_modules/degit']?.version).toBe(declared);
  });

  it.each(MEASURED_SOURCES)(
    'names the declared version in %s',
    (relPath: string) => {
      // The literal `degit@<version>` is the repo's convention for "this claim
      // was measured against these bytes". Bumping the dependency without
      // updating the claim fails here.
      expect(read(relPath)).toContain(`degit@${declared}`);
    },
  );
});
