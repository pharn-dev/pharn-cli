import {
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { applyWrites, ApplyError } from '../src/lib/apply-update.js';
import { createBackup } from '../src/lib/backup.js';
import { findSymlinkComponent } from '../src/lib/symlink-guard.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('findSymlinkComponent — the shared physical path gate', () => {
  const tmp = useTmpDir();

  it('a clean path with every component real → null', () => {
    const base = tmp.path();
    write(join(base, 'a/b/c.md'));
    expect(findSymlinkComponent(base, 'a/b/c.md')).toBeNull();
  });

  it('a symlinked MIDDLE component → that component, accumulated', () => {
    // The escape is real (outside sits out of `base`) but stays in the fixture.
    const base = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(join(base, 'a'), { recursive: true });
    write(join(outside, 'c.md'));
    symlinkSync(outside, join(base, 'a/b'));

    expect(findSymlinkComponent(base, 'a/b/c.md')).toBe('a/b');
  });

  it('a symlinked LEAF → the leaf', () => {
    const base = tmp.path();
    write(join(base, 'real.md'));
    symlinkSync(join(base, 'real.md'), join(base, 'link.md'));
    expect(findSymlinkComponent(base, 'link.md')).toBe('link.md');
  });

  it('a DANGLING symlink component → still refused, never followed', () => {
    // The precedent is apply-update.test's dangling-destination case: a symlink
    // pointing at nothing must be an offender, not "absent, therefore writable".
    const base = tmp.path();
    symlinkSync(join(tmp.path(), 'not-yet-there'), join(base, 'link.md'));
    expect(findSymlinkComponent(base, 'link.md')).toBe('link.md');
  });

  it('a nonexistent TAIL → null (applyWrites creates parents AFTER this walk)', () => {
    // Load-bearing, not incidental: applyWrites calls mkdirSync only once this
    // returns, so a restore into a deleted subtree MUST pass the walk.
    const base = tmp.path();
    expect(findSymlinkComponent(base, 'deep/nested/gone.md')).toBeNull();
  });

  it('a nonexistent MIDDLE component does not abort the walk', () => {
    // The walk keeps going past a missing component; stopping early would miss an
    // offender further along that a later mkdir could materialize under.
    const base = tmp.path();
    write(join(base, 'a/real.md'));
    expect(findSymlinkComponent(base, 'a/missing/still-fine.md')).toBeNull();
  });

  it('returns the FIRST offender when two components are symlinks', () => {
    const base = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(base, { recursive: true });
    mkdirSync(join(outside, 'inner'), { recursive: true });
    symlinkSync(join(outside, 'inner'), join(outside, 'inner-link'));
    symlinkSync(outside, join(base, 'first'));

    expect(findSymlinkComponent(base, 'first/inner-link/x.md')).toBe('first');
  });

  // The observable half of the ONE declared convergence of this refactor: the
  // manifest walker normalized via toPosix before splitting, the other two split
  // the raw string. The core normalizes uniformly. On a posix platform `sep` is
  // '/', so what toPosix changes here is the trailing-slash strip and the empty
  // segments — all three forms below must agree with the clean twin.
  it('empty, duplicate and trailing separators match the clean twin', () => {
    const base = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(join(base, 'a'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(base, 'a/b'));

    expect(findSymlinkComponent(base, 'a/b/c.md')).toBe('a/b');
    expect(findSymlinkComponent(base, 'a//b/c.md')).toBe('a/b');
    expect(findSymlinkComponent(base, '/a/b/c.md')).toBe('a/b');
    expect(findSymlinkComponent(base, 'a/b/')).toBe('a/b');
  });

  it('the BASE itself being a symlink is not an offender (below-root only)', () => {
    // The rationale the three old walkers each repeated verbatim: a project root
    // or clone temp dir may legitimately sit under a symlinked ancestor (macOS
    // `/tmp` is exactly this), so only components BELOW the base are checked.
    const real = join(tmp.path(), 'real-root');
    const viaLink = join(tmp.path(), 'root-link');
    write(join(real, 'a/b.md'));
    symlinkSync(real, viaLink);

    expect(findSymlinkComponent(viaLink, 'a/b.md')).toBeNull();
  });

  // The separator half of the convergence is PLATFORM-LATENT, and saying so is
  // the honest version of the claim: toPosix splits on `sep`, which is '/' on
  // posix, so a '\'-separated rel is ONE opaque segment here and would only be
  // split into components on win32. There is therefore no posix assertion that
  // distinguishes the core's uniform toPosix from the old raw split — the
  // difference is pinned where it is real, on toPosix itself
  // (tests/validate.test.ts). What IS assertable here: a backslash rel is not
  // silently treated as a traversable path on this platform.
  it('a backslash rel is one opaque segment on posix (no phantom components)', () => {
    const base = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(base, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(base, 'a'));

    // 'a' IS a symlink, but 'a\\b\\c.md' never yields an 'a' component on posix,
    // so the walk lstats the whole literal name and finds nothing.
    expect(findSymlinkComponent(base, 'a\\b\\c.md')).toBeNull();
    expect(findSymlinkComponent(base, 'a/b/c.md')).toBe('a');
  });
});

// Invariant 2 of the refactor: each site keeps its own failure shape, byte for
// byte. Asserted on the message ITSELF (`toBe`), not via `toThrow('…')` — a
// string argument to toThrow is a SUBSTRING test (@vitest/expect computes
// `actual.includes(expected)` for a string matcher), which would still pass
// against a reworded message that merely contained the old one.
describe('the adapters preserve each call site’s message byte-for-byte', () => {
  const tmp = useTmpDir();

  it('createBackup keeps its parameterized "Cannot back up …" message', () => {
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-src');
    mkdirSync(proj, { recursive: true });
    write(join(outside, 'a.md'), 'bytes from outside the project');
    symlinkSync(outside, join(proj, 'linked-dir'));

    let message = '';
    try {
      createBackup(proj, ['linked-dir/a.md'], new Date(2026, 7, 7, 9, 15, 0));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe(
      'Cannot back up linked-dir/a.md: linked-dir is a symlink.',
    );
  });

  it('applyWrites keeps its "… refusing to write through it." message', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-dir');
    write(join(repo, 'b.md'), 'new bytes');
    mkdirSync(join(outside, 'nested'), { recursive: true });
    mkdirSync(proj, { recursive: true });
    symlinkSync(outside, join(proj, 'deep'));

    let message = '';
    try {
      applyWrites({
        projectRoot: proj,
        expected: new Map([['deep/nested/b.md', join(repo, 'b.md')]]),
        writes: ['deep/nested/b.md'],
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ApplyError);
      message = (err as Error).message;
    }
    // applyWrites wraps the refusal in ApplyError's own prefix; the adapter's
    // string must survive inside it unchanged.
    expect(message).toBe(
      'Failed to write deep/nested/b.md: deep is a symlink; refusing to write through it.',
    );
  });
});

// Structural anti-fork pin, in the spirit of tests/init.test.ts's isTTY inv-6:
// the component-accumulation idiom must exist in exactly one module, so a fourth
// copy-paste of the walk cannot quietly reappear beside the shared core.
//
// HONEST SCOPE — what a green run here does and does not prove: this matches a
// literal source spelling. It catches a COPY-PASTE fork that keeps that spelling
// (the failure mode that actually happened three times). It does NOT catch a fork
// respelled as `current += '/' + segment`, `[current, segment].join('/')`, or via
// `path.posix.join`. The trade is accepted deliberately: the pin is also coupled
// to that formatting, so reflowing the line fails this test for a reason
// unrelated to any fork.
describe('the symlink-component walk lives in exactly one module', () => {
  it('no src file outside symlink-guard.ts accumulates path components', () => {
    const here = fileURLToPath(import.meta.url);
    const srcDir = join(here, '..', '..', 'src');
    const guard = join(srcDir, 'lib', 'symlink-guard.ts');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return e.name.endsWith('.ts') ? [p] : [];
      });

    const idiom = 'current = current ?';
    const offenders = walk(srcDir).filter(
      (f) => f !== guard && readFileSync(f, 'utf8').includes(idiom),
    );
    expect(offenders).toEqual([]);

    // …and the core itself still carries it, so the pin cannot pass vacuously
    // after a rename or a move.
    expect(readFileSync(guard, 'utf8')).toContain(idiom);
  });
});
