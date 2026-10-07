import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NODE_FLOOR,
  nodeFloorLines,
  nodeFloorRefusal,
  nodeFloorStatus,
} from '../src/lib/node-floor.js';

// ---------------------------------------------------------------------------
// The Node floor: pharn-oss's floor CLIs refuse to run below Node 24.2.0 (their
// `import.meta.main` gate silently skipped every check on older Node), so this
// CLI refuses first, up front, instead of installing into a project that would
// then fail mid-run. Fail-CLOSED: a version it cannot read is refused.
// ---------------------------------------------------------------------------

describe('NODE_FLOOR', () => {
  it('is 24.2.0, the number pharn-oss refuses below', () => {
    expect(NODE_FLOOR).toBe('24.2.0');
  });

  // The declared bound and the enforced one are one number. tests/engines.test.ts
  // pins the README badge and the smoke workflow to `engines.node`; this pins the
  // runtime check to it, so the three cannot drift apart.
  it('equals the lower bound of package.json engines.node', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { engines: { node: string } };
    expect(pkg.engines.node).toBe(`>=${NODE_FLOOR}`);
  });
});

describe('nodeFloorStatus', () => {
  it.each(['24.2.0', '24.2.1', '24.13.1', '25.0.0', '30.0.0', '100.0.0'])(
    'accepts %s',
    (v) => {
      expect(nodeFloorStatus(v)).toEqual({ kind: 'ok', current: v });
    },
  );

  it.each(['24.1.9', '24.0.0', '22.18.0', '22.22.2', '20.13.0', '18.20.4'])(
    'refuses %s as below the floor',
    (v) => {
      expect(nodeFloorStatus(v)).toEqual({ kind: 'below', current: v });
    },
  );

  // Numeric, not lexical: 24.10.0 is newer than 24.2.0 although "10" < "2".
  it('compares numerically, not lexically', () => {
    expect(nodeFloorStatus('24.10.0').kind).toBe('ok');
    expect(nodeFloorStatus('9.0.0').kind).toBe('below');
  });

  // semver orders a prerelease BEFORE its release, so a prerelease of the floor
  // may predate the behaviour the floor is about. compareVersionCore equates the
  // two; this layer must not.
  it('treats a prerelease of the floor itself as below it', () => {
    expect(nodeFloorStatus('24.2.0-rc.1').kind).toBe('below');
    expect(nodeFloorStatus('24.2.0-nightly20250601abc').kind).toBe('below');
  });

  it('accepts a prerelease of a LATER version', () => {
    expect(nodeFloorStatus('24.3.0-rc.1').kind).toBe('ok');
    expect(nodeFloorStatus('25.0.0-nightly20260101abc').kind).toBe('ok');
  });

  // Fail CLOSED: the opposite of the MIN_CLI gate. A Node version that cannot be
  // read is not one the floor can vouch for.
  describe('an unparseable version is refused, never waved through', () => {
    it.each([
      '',
      'not-a-version',
      'v24.2.0',
      '24.2',
      '24.2.0.1',
      ' 24.2.0',
      '24.2.0 ',
      '+24.2.0',
      '24.x.0',
      '24.2.0\u001b[31m',
    ])('%j', (v) => {
      expect(nodeFloorStatus(v)).toEqual({ kind: 'unparseable', raw: v });
    });

    it('an absent version', () => {
      expect(nodeFloorStatus(undefined)).toEqual({
        kind: 'unparseable',
        raw: undefined,
      });
    });
  });

  it('defaults to the running Node, which satisfies the floor the suite runs on', () => {
    expect(nodeFloorStatus(process.versions.node).kind).toBe('ok');
  });
});

describe('nodeFloorRefusal', () => {
  it('is null when the Node is fine', () => {
    expect(nodeFloorRefusal(nodeFloorStatus('24.2.0'), 'init')).toBeNull();
    expect(nodeFloorRefusal(nodeFloorStatus('26.0.0'), 'update')).toBeNull();
  });

  it('names the required and the current version, the command, and that nothing was written', () => {
    const msg = nodeFloorRefusal(nodeFloorStatus('22.11.0'), 'init')!;
    expect(msg).toContain('24.2.0');
    expect(msg).toContain('22.11.0');
    expect(msg).toContain('pharn init');
    expect(msg).toContain('Nothing was written');
  });

  it('is command-specific', () => {
    expect(nodeFloorRefusal(nodeFloorStatus('20.13.0'), 'update')).toContain(
      'pharn update',
    );
  });

  it('refuses an unparseable version and says it could not read it', () => {
    const msg = nodeFloorRefusal(nodeFloorStatus('garbage'), 'init')!;
    expect(msg).toContain('24.2.0');
    expect(msg).toContain('"garbage"');
    expect(msg).toContain('could not read');
    expect(msg).toContain('Nothing was written');
  });

  it('refuses an absent version', () => {
    const msg = nodeFloorRefusal(nodeFloorStatus(undefined), 'update')!;
    expect(msg).toContain('no version reported');
    expect(msg).toContain('Nothing was written');
  });

  // The version string is environment text: it is displayed, never trusted.
  it('strips terminal control characters from a hostile version string', () => {
    const msg = nodeFloorRefusal(
      nodeFloorStatus('1.2.3\u001b]52;c;QQ==\u0007'),
      'init',
    )!;
    expect(msg).not.toContain('\u001b');
    expect(msg).not.toContain('\u0007');
  });
});

describe('nodeFloorLines (the status NODE note)', () => {
  it('shows the floor and the running version, with no mismatch line, when ok', () => {
    const lines = nodeFloorLines(nodeFloorStatus('24.13.1'));
    expect(lines.join('\n')).toContain('>= 24.2.0');
    expect(lines.join('\n')).toContain('v24.13.1');
    expect(lines.join('\n')).not.toContain('MISMATCH');
  });

  it('flags a version below the floor', () => {
    const text = nodeFloorLines(nodeFloorStatus('22.11.0')).join('\n');
    expect(text).toContain('>= 24.2.0');
    expect(text).toContain('v22.11.0');
    expect(text).toContain('MISMATCH');
    expect(text).toContain('below the floor');
  });

  it('flags an unparseable version, quoting it', () => {
    const text = nodeFloorLines(nodeFloorStatus('garbage')).join('\n');
    expect(text).toContain('"garbage"');
    expect(text).toContain('MISMATCH');
    expect(text).toContain('could not be verified');
  });

  it('flags an absent version', () => {
    const text = nodeFloorLines(nodeFloorStatus(undefined)).join('\n');
    expect(text).toContain('(not reported)');
    expect(text).toContain('MISMATCH');
  });
});
