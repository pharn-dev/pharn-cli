import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareVersionCore } from '../src/lib/semver.js';

// ---------------------------------------------------------------------------
// The `smol-toml` override, pinned.
//
// WHY THIS FILE EXISTS (P7 — a real, already-observed need, not a hypothetical):
// Dependabot alert 11 (GHSA-7w5x-hrqm-74c2 / CVE-2026-85730) reports an infinite
// loop in smol-toml's `parse()` for versions <= 1.7.0. It reaches this repo as a
// TRANSITIVE DEV dependency — markdownlint-cli2 -> smol-toml — and
// markdownlint-cli2@0.23.2, the LATEST release, pins it to EXACTLY "1.7.0". So
// there is no upstream upgrade path: `npm audit fix --force` would DOWNGRADE
// markdownlint-cli2 to 0.21.0, across two minors of the tool behind `lint:md`
// and the required CI check `Markdown lint`. The fix is an npm `overrides`
// entry, and an override is invisible — nothing else in CI enforces it. There is
// no `npm audit` step in .github/workflows/, so a markdownlint-cli2 bump or a
// regenerated lockfile could silently drop back below the patch line with every
// gate still green.
//
// The two layers below are the same shape as tests/lint-gate.test.ts, INCLUDING
// the half that keeps that file from going hollow: the checks are pure functions
// over a parsed lockfile, so they can be fed a PLANTED 1.7.0 tree and shown to
// reject it. A test that only observes today's happy state cannot distinguish
// "the invariant holds" from "the matcher stopped matching".
//
// WHAT IS GUARANTEED (P0 — floor primitive #3, a deterministic version compare):
//   the COMMITTED LOCKFILE resolves every smol-toml entry to >= MINIMUM. CI
//   installs from that lockfile via `npm ci`, so for CI the two coincide.
// WHAT IS NOT (named residuals, never claimed):
//   • A contributor's actual node_modules. A stale tree or `npm install --force`
//     can diverge from the lock; this file reads the lock, not the disk tree.
//   • Byte authenticity. The lock's `integrity` hash pins WHICH bytes were
//     resolved, never that they are benign (the same provenance-not-proof shape
//     LIMITS.md 1b names for pharn's own upstream).
//   • A prerelease. compareVersionCore deliberately compares a prerelease EQUAL
//     to its release (src/lib/semver.ts:10), so a hypothetical `1.7.1-rc.1` would
//     pass here. No smol-toml prerelease is in play; stated rather than implied.
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The first version carrying the fix. Everything at or above this is acceptable;
// `<= 1.7.0` is the advisory's vulnerable range.
const MINIMUM = '1.7.1';

// Anchored, so a NESTED copy (`node_modules/x/node_modules/smol-toml`) is caught
// and a LOOKALIKE (`node_modules/smol-toml-x`) is not. Both directions are
// demonstrated below — an over-broad matcher and an under-broad one fail
// differently, and only one of them is loud on its own.
const SMOL_TOML_KEY_RE = /(?:^|\/)node_modules\/smol-toml$/;

type LockPackages = Record<string, { version?: unknown }>;

type Verdict = { ok: true; checked: number } | { ok: false; reason: string };

// The lowest version a specifier admits, for the narrow prefix forms an override
// like this uses. P5: anything this does NOT model — a range union, `*`, an `x`
// wildcard, a bare `>` — returns null and is a HARD FAIL at the call site. The
// test refuses to reason about a form it cannot parse rather than assuming it is
// safe; the terminal fallback is a failure, never a guess.
function lowestAdmitted(specifier: string): string | null {
  const match = /^(?:[~^]|>=|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(
    specifier.trim(),
  );
  return match ? match[1]! : null;
}

// The demonstration layer, as a pure function so it can be planted against.
// Every failure mode is a distinct `reason`, because "the lock is fine" and "the
// matcher found nothing" are opposite conclusions that a boolean would merge.
function auditSmolToml(packages: LockPackages, minimum: string): Verdict {
  const entries = Object.entries(packages).filter(([key]) =>
    SMOL_TOML_KEY_RE.test(key),
  );

  // Vacuity guard: with no entries, an "every entry is safe" assertion passes
  // while checking nothing. That is the failure a matcher typo produces.
  if (entries.length === 0) return { ok: false, reason: 'no smol-toml entry' };

  for (const [key, meta] of entries) {
    const version: unknown = meta.version;
    if (typeof version !== 'string') {
      return { ok: false, reason: `${key}: version is not a string` };
    }
    const ordering = compareVersionCore(version, minimum);
    if (ordering === null) {
      return { ok: false, reason: `${key}: unparseable version "${version}"` };
    }
    if (ordering < 0) {
      return { ok: false, reason: `${key}: ${version} < ${minimum}` };
    }
  }
  return { ok: true, checked: entries.length };
}

function readLockPackages(): LockPackages {
  const lock = JSON.parse(
    readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'),
  ) as { packages?: LockPackages };
  return lock.packages ?? {};
}

describe('smol-toml override: the declared policy', () => {
  // The spelling layer. It asserts the override EXISTS and that the range it
  // declares cannot admit a vulnerable version — deliberately NOT an equality
  // against one literal specifier, which would red on a future TIGHTENING (say
  // `~1.7.3` after another advisory) that strictly improves security. A test
  // that fails for a safe change teaches people to edit the test reflexively,
  // which is exactly how a spelling layer goes hollow.
  it('declares an override whose lowest admitted version is patched', () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { overrides?: Record<string, string> };

    const specifier = pkg.overrides?.['smol-toml'];
    expect(
      specifier,
      'package.json must declare overrides["smol-toml"]',
    ).toBeDefined();
    expect(typeof specifier).toBe('string');

    const lowest = lowestAdmitted(specifier!);
    expect(lowest, `unmodelled specifier form: "${specifier!}"`).not.toBeNull();
    expect(compareVersionCore(lowest!, MINIMUM)).not.toBeNull();
    expect(compareVersionCore(lowest!, MINIMUM)).toBeGreaterThanOrEqual(0);
  });
});

describe('smol-toml override: the committed lockfile', () => {
  it('resolves every smol-toml entry to a patched version', () => {
    const verdict = auditSmolToml(readLockPackages(), MINIMUM);
    expect(verdict).toEqual({ ok: true, checked: expect.any(Number) });
  });

  it('actually checks something (the matcher finds a real entry)', () => {
    const verdict = auditSmolToml(readLockPackages(), MINIMUM);
    expect(verdict.ok && verdict.checked).toBeGreaterThan(0);
  });
});

// The half that proves the check BITES. Without these, a matcher that silently
// stopped matching, or a comparator used in the wrong direction, would leave
// every assertion above green.
describe('smol-toml override: the check rejects what it claims to', () => {
  it('rejects the exact vulnerable version from the advisory', () => {
    const verdict = auditSmolToml(
      { 'node_modules/smol-toml': { version: '1.7.0' } },
      MINIMUM,
    );
    expect(verdict).toEqual({
      ok: false,
      reason: 'node_modules/smol-toml: 1.7.0 < 1.7.1',
    });
  });

  it('rejects a vulnerable copy NESTED under another package', () => {
    const verdict = auditSmolToml(
      {
        'node_modules/smol-toml': { version: '1.7.2' },
        'node_modules/markdownlint-cli2/node_modules/smol-toml': {
          version: '1.6.0',
        },
      },
      MINIMUM,
    );
    expect(verdict.ok).toBe(false);
  });

  it('accepts the boundary version, so it is not simply always-red', () => {
    const verdict = auditSmolToml(
      { 'node_modules/smol-toml': { version: MINIMUM } },
      MINIMUM,
    );
    expect(verdict).toEqual({ ok: true, checked: 1 });
  });

  it('does not match a lookalike package name', () => {
    // `smol-toml-x` must not satisfy the check on smol-toml's behalf. With the
    // lookalike as the only candidate there are no real entries, so the vacuity
    // guard is what fires — which is the point: an under-matching regex is loud.
    const verdict = auditSmolToml(
      { 'node_modules/smol-toml-x': { version: '0.0.1' } },
      MINIMUM,
    );
    expect(verdict).toEqual({ ok: false, reason: 'no smol-toml entry' });
  });

  it('fails loudly on an unparseable version rather than passing it', () => {
    const verdict = auditSmolToml(
      { 'node_modules/smol-toml': { version: 'latest' } },
      MINIMUM,
    );
    expect(verdict).toEqual({
      ok: false,
      reason: 'node_modules/smol-toml: unparseable version "latest"',
    });
  });

  it('fails loudly on a missing version field', () => {
    const verdict = auditSmolToml({ 'node_modules/smol-toml': {} }, MINIMUM);
    expect(verdict).toEqual({
      ok: false,
      reason: 'node_modules/smol-toml: version is not a string',
    });
  });
});

describe('lowestAdmitted: the specifier forms it models', () => {
  it.each([
    ['~1.7.1', '1.7.1'],
    ['^1.7.1', '1.7.1'],
    ['>=1.7.1', '1.7.1'],
    ['1.7.2', '1.7.2'],
  ])('reads the floor of %s as %s', (specifier, expected) => {
    expect(lowestAdmitted(specifier)).toBe(expected);
  });

  it.each([['*'], ['1.x'], ['>1.7.0'], ['1.7.1 || 2.0.0'], ['']])(
    'returns null for the unmodelled form %j, so the caller hard-fails',
    (specifier) => {
      expect(lowestAdmitted(specifier)).toBeNull();
    },
  );
});
