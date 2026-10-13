import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  BINARY_SNIFF_BYTES,
  contentHash,
  contentHashBytes,
  isBinaryContent,
  sha256File,
} from '../src/lib/hash.js';

const raw = (b: Buffer | string): string =>
  createHash('sha256').update(b).digest('hex');

// The reference fold, written the way pharn-oss writes it
// (pharn/floor/check-spec.mjs bodyHash: `body.replace(/\r\n/g, "\n")`), over
// latin1 so every byte maps to exactly one code unit and back.
const referenceFold = (b: Buffer): string =>
  raw(Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));

const B = (s: string): Buffer => Buffer.from(s, 'latin1');

describe('contentHashBytes — the line-ending fold', () => {
  it('LF-only text hashes exactly like the raw bytes (old records stay valid)', () => {
    const lf = B('# Title\n\nbody line\nlast\n');
    expect(contentHashBytes(lf)).toBe(raw(lf));
  });

  it('a CRLF copy of an LF file has the same content hash; the raw hashes differ', () => {
    const lf = B('# Title\n\nbody line\nlast\n');
    const crlf = B('# Title\r\n\r\nbody line\r\nlast\r\n');
    expect(raw(crlf)).not.toBe(raw(lf));
    expect(contentHashBytes(crlf)).toBe(contentHashBytes(lf));
  });

  it('mixed endings hash like the all-LF file', () => {
    expect(contentHashBytes(B('a\r\nb\nc\r\nd\n'))).toBe(
      raw(B('a\nb\nc\nd\n')),
    );
  });

  it('a lone CR is byte-exact: a\\rb, a\\nb and ab are three different contents', () => {
    const cr = contentHashBytes(B('a\rb'));
    expect(cr).toBe(raw(B('a\rb')));
    expect(cr).not.toBe(contentHashBytes(B('a\nb')));
    expect(cr).not.toBe(contentHashBytes(B('ab')));
  });

  it('\\r\\r\\n folds to \\r\\n (one non-overlapping pass, as pharn-oss folds)', () => {
    expect(contentHashBytes(B('x\r\r\ny'))).toBe(raw(B('x\r\ny')));
  });

  it('a trailing CR with no LF after it is kept', () => {
    expect(contentHashBytes(B('end\r'))).toBe(raw(B('end\r')));
    expect(contentHashBytes(B('\r\n'))).toBe(raw(B('\n')));
  });

  it('the empty file hashes as the empty string', () => {
    expect(contentHashBytes(Buffer.alloc(0))).toBe(raw(''));
  });

  it('a real content change is still a different hash, CRLF or not', () => {
    const before = B('alpha\r\nbeta\r\n');
    const after = B('alpha\r\ngamma\r\n');
    expect(contentHashBytes(after)).not.toBe(contentHashBytes(before));
    expect(contentHashBytes(after)).not.toBe(
      contentHashBytes(B('alpha\nbeta\n')),
    );
  });
});

describe('isBinaryContent — NUL in the first BINARY_SNIFF_BYTES bytes', () => {
  it('sniffs exactly 8000 bytes (git’s own FIRST_FEW_BYTES)', () => {
    expect(BINARY_SNIFF_BYTES).toBe(8000);
  });

  it('a NUL at index 7999 is binary; a NUL at index 8000 is not', () => {
    const at7999 = Buffer.alloc(9000, 0x61);
    at7999[7999] = 0;
    const at8000 = Buffer.alloc(9000, 0x61);
    at8000[8000] = 0;
    expect(isBinaryContent(at7999)).toBe(true);
    expect(isBinaryContent(at8000)).toBe(false);
    expect(isBinaryContent(B('plain text\r\n'))).toBe(false);
    expect(isBinaryContent(Buffer.alloc(0))).toBe(false);
  });

  it('binary content is hashed raw: its CRLF and LF variants stay different', () => {
    const lf = B('\0PNG\nchunk\n');
    const crlf = B('\0PNG\r\nchunk\r\n');
    expect(contentHashBytes(lf)).toBe(raw(lf));
    expect(contentHashBytes(crlf)).toBe(raw(crlf));
    expect(contentHashBytes(crlf)).not.toBe(contentHashBytes(lf));
  });

  it('a NUL past the sniff window leaves the file text, so it is folded', () => {
    const lf = Buffer.concat([Buffer.alloc(8000, 0x61), B('\n\0tail\n')]);
    const crlf = Buffer.concat([Buffer.alloc(8000, 0x61), B('\r\n\0tail\r\n')]);
    expect(contentHashBytes(crlf)).toBe(contentHashBytes(lf));
  });

  it('a CRLF straddling the sniff boundary (\\r at 7999, \\n at 8000) is folded', () => {
    const crlf = Buffer.alloc(8001, 0x61);
    crlf[7999] = 0x0d;
    crlf[8000] = 0x0a;
    const lf = Buffer.alloc(8000, 0x61);
    lf[7999] = 0x0a;
    expect(contentHashBytes(crlf)).toBe(raw(lf));
  });
});

describe('contentHashBytes — differential against the reference fold', () => {
  it('agrees with latin1.replace(/\\r\\n/g, "\\n") on text and with raw sha256 on binary', () => {
    // A deterministic generator (no Math.random): every string over the
    // alphabet up to length 6, plus long strings built from a fixed LCG.
    const alphabet = [0x61, 0x0d, 0x0a, 0x00];
    const cases: Buffer[] = [];
    const build = (prefix: number[], depth: number): void => {
      cases.push(Buffer.from(prefix));
      if (depth === 0) return;
      for (const c of alphabet) build([...prefix, c], depth - 1);
    };
    build([], 6);
    let seed = 0x2545f491;
    for (let n = 0; n < 50; n++) {
      const len = 7990 + (n % 25);
      const buf = Buffer.alloc(len);
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        // NUL only rarely, so most long cases are text.
        buf[i] = alphabet[(seed >>> 16) % (n % 5 === 0 ? 4 : 3)]!;
      }
      cases.push(buf);
    }
    for (const b of cases) {
      const expected = isBinaryContent(b) ? raw(b) : referenceFold(b);
      expect(contentHashBytes(b)).toBe(expected);
    }
    expect(cases.length).toBeGreaterThan(5000);
  });
});

describe('contentHash / sha256File — the file readers', () => {
  const tmp = useTmpDir();

  it('contentHash folds; sha256File stays the raw byte hash', () => {
    const p = join(tmp.path(), 'f.md');
    writeFileSync(p, 'a\r\nb\r\n');
    expect(contentHash(p)).toBe(raw('a\nb\n'));
    expect(sha256File(p)).toBe(raw('a\r\nb\r\n'));
  });

  it('both throw on an unreadable path, like sha256File always has', () => {
    const missing = join(tmp.path(), 'nope');
    expect(() => contentHash(missing)).toThrow();
    expect(() => sha256File(missing)).toThrow();
  });
});

// GRILL P0: the claim "every comparison uses contentHash, so no comparison mixes
// a folded and a raw hash" is pinned here, not left to discipline. A new hashing
// site that reaches for the raw function would silently bring F-16 back for its
// path.
describe('the one comparison hash', () => {
  it('no file under src/ other than lib/hash.ts calls sha256File', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          const rel = relative(src, p).split('\\').join('/');
          if (rel === 'lib/hash.ts') continue;
          // Comments may NAME it (explaining the split); the assertion is
          // about imports and calls, so strip them first.
          const code = readFileSync(p, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
          if (/\bsha256File\b/.test(code)) offenders.push(rel);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
