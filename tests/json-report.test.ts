import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cap, serializeJsonReport } from '../src/lib/json-report.js';
import { serializeStatusReport } from '../src/lib/status-report.js';
import type { StatusReport } from '../src/lib/status-report.js';

// Code points, not raw characters, so no control byte sits in this source.
const ESC = '\u001b';
const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const LS = String.fromCodePoint(0x2028);
const PS = String.fromCodePoint(0x2029);
const HOSTILE = `a${ESC}[31m${RLO}b${ZWSP}c${LS}d${PS}e\u0000f\u009bg`;

describe('cap', () => {
  it('leaves a short value alone and cuts a long one with an ellipsis', () => {
    expect(cap('abc', 3)).toBe('abc');
    expect(cap('abcd', 3)).toBe('abc…');
  });
});

describe('serializeJsonReport', () => {
  it('parses back to the exact input, hostile keys and values included', () => {
    const report = {
      [HOSTILE]: [HOSTILE, { nested: HOSTILE }],
      n: 1,
      ok: true,
    };
    const out = serializeJsonReport(report);
    expect(JSON.parse(out)).toEqual(report);
  });

  it('emits no character a terminal would interpret, apart from the line feeds between lines', () => {
    const out = serializeJsonReport({ v: HOSTILE, w: 'tab\tand\nnewline' });
    // eslint-disable-next-line no-control-regex
    expect(out.replace(/\n/g, '')).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).not.toContain(RLO);
    expect(out).toContain('\\u001b');
    expect(out).toContain('\\u2028');
  });

  it('is two-space indented JSON', () => {
    expect(serializeJsonReport({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}');
  });

  it('is what serializeStatusReport prints, byte for byte', () => {
    const report = { schemaVersion: 1, archetypes: [HOSTILE] };
    expect(serializeStatusReport(report as unknown as StatusReport)).toBe(
      serializeJsonReport(report),
    );
  });
});

// One serializer, one escape: no report module forks its own. A new `--json`
// report goes through `serializeJsonReport` rather than calling `escapeUnsafe`.
describe('the one serializer', () => {
  it('is the only report module that uses escapeUnsafe', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'lib');
    const users = readdirSync(dir)
      .filter((f) => /report/.test(f) && f.endsWith('.ts'))
      .filter((f) =>
        readFileSync(join(dir, f), 'utf8').includes('escapeUnsafe'),
      )
      .sort();
    expect(users).toEqual(['json-report.ts']);
  });
});
