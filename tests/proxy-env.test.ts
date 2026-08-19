import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  MEASURED_DEGIT_VERSIONS,
  detectProxyNotice,
  resolveDegitProxyRead,
} from '../src/lib/proxy-env.js';

// The unit under test is the truth table in src/lib/proxy-env.ts, which encodes
// one measured fact: degit's constructor reads `process.env.https_proxy`
// unconditionally, and that LOWERCASE name is the only proxy variable anywhere
// in its bundle — verified across every published version in the declared
// ^3.6.1 range. Node's process.env is case-insensitive on win32 and
// case-sensitive everywhere else, so the same environment means opposite things
// on the two platform families; that is why the detector takes `env` and
// `platform` as PARAMETERS. Nothing here reads process.*, so the win32 rows run
// on the ubuntu-only CI runner.

const PROXY = 'http://proxy.internal:3128';

describe('detectProxyNotice - the truth table', () => {
  // Row 1 — nothing set. Silence is the complete answer, not a degraded one.
  it('returns null when no spelling is set', () => {
    expect(detectProxyNotice({}, 'linux')).toBeNull();
    expect(detectProxyNotice({}, 'win32')).toBeNull();
  });

  it('treats an empty string as unset (empty is not a proxy setting)', () => {
    expect(detectProxyNotice({ https_proxy: '' }, 'linux')).toBeNull();
    expect(detectProxyNotice({ HTTPS_PROXY: '' }, 'linux')).toBeNull();
    expect(detectProxyNotice({ HTTPS_PROXY: '' }, 'win32')).toBeNull();
  });

  // Row 2 — the headline case: the common spelling, silently ignored on POSIX.
  it('flags HTTPS_PROXY as ignored on linux when https_proxy is unset', () => {
    expect(detectProxyNotice({ HTTPS_PROXY: PROXY }, 'linux')).toEqual({
      kind: 'ignored',
      name: 'HTTPS_PROXY',
    });
  });

  // Platform-FAMILY-wide, not linux-only — a darwin developer hits it too.
  it('flags HTTPS_PROXY as ignored on darwin too', () => {
    expect(detectProxyNotice({ HTTPS_PROXY: PROXY }, 'darwin')).toEqual({
      kind: 'ignored',
      name: 'HTTPS_PROXY',
    });
  });

  // The casing hole: any variant degit will not read must be reported, not just
  // the canonical uppercase one — and the notice names the variable ACTUALLY
  // found, so the advice points at the user's real environment.
  it('flags an arbitrary casing as ignored on POSIX, naming it', () => {
    expect(detectProxyNotice({ HtTpS_PrOxY: PROXY }, 'linux')).toEqual({
      kind: 'ignored',
      name: 'HtTpS_PrOxY',
    });
  });

  // Determinism (P5): with several variants set the answer must not depend on
  // env insertion order. HTTPS_PROXY wins; otherwise lexicographic.
  it('prefers HTTPS_PROXY when several variants are set, whatever the order', () => {
    const a = detectProxyNotice(
      { Https_Proxy: PROXY, HTTPS_PROXY: PROXY, hTTPS_PROXY: PROXY },
      'linux',
    );
    const b = detectProxyNotice(
      { hTTPS_PROXY: PROXY, HTTPS_PROXY: PROXY, Https_Proxy: PROXY },
      'linux',
    );

    expect(a).toEqual({ kind: 'ignored', name: 'HTTPS_PROXY' });
    expect(b).toEqual(a);
  });

  it('falls back to a deterministic pick when HTTPS_PROXY is absent', () => {
    const a = detectProxyNotice(
      { Https_Proxy: PROXY, hTTPS_proxy: PROXY },
      'linux',
    );
    const b = detectProxyNotice(
      { hTTPS_proxy: PROXY, Https_Proxy: PROXY },
      'linux',
    );

    expect(a).toEqual(b);
    expect(a?.kind).toBe('ignored');
  });

  // Row 3 — the FALSE-WARNING regression. On win32 process.env is
  // case-insensitive, so degit's lowercase read DOES resolve HTTPS_PROXY: that
  // user is proxied, and telling them otherwise would be worse than silence.
  it('reports HTTPS_PROXY as ACTIVE on win32, never ignored', () => {
    const notice = detectProxyNotice({ HTTPS_PROXY: PROXY }, 'win32');

    expect(notice).toEqual({ kind: 'active', value: PROXY });
    expect(notice?.kind).not.toBe('ignored');
  });

  it('resolves an arbitrary casing on win32 as active', () => {
    expect(detectProxyNotice({ HtTpS_PrOxY: PROXY }, 'win32')).toEqual({
      kind: 'active',
      value: PROXY,
    });
  });

  // Row 4 — the other direction: an interposed clone pharn never declared.
  it('reports a lowercase https_proxy as active', () => {
    expect(detectProxyNotice({ https_proxy: PROXY }, 'linux')).toEqual({
      kind: 'active',
      value: PROXY,
    });
  });

  // Row 5 — both set. A user who set BOTH spellings IS proxied; warning that
  // their setting is ignored would be a false alarm.
  it('reports active (never ignored) when both spellings are set', () => {
    const notice = detectProxyNotice(
      { https_proxy: PROXY, HTTPS_PROXY: PROXY },
      'linux',
    );

    expect(notice).toEqual({ kind: 'active', value: PROXY });
    expect(notice?.kind).not.toBe('ignored');
  });

  // The lowercase value wins even when the two disagree — it is the one degit
  // actually reads, so it is the one worth naming.
  it('reports the lowercase value when the two spellings disagree', () => {
    expect(
      detectProxyNotice(
        { https_proxy: PROXY, HTTPS_PROXY: 'http://other:8080' },
        'linux',
      ),
    ).toEqual({ kind: 'active', value: PROXY });
  });

  // An unrelated variable that merely CONTAINS the name must not match.
  it('ignores variables that are not exactly the proxy name', () => {
    expect(
      detectProxyNotice(
        { MY_HTTPS_PROXY: PROXY, https_proxy_url: PROXY },
        'linux',
      ),
    ).toBeNull();
  });
});

describe('detectProxyNotice - purity', () => {
  afterEach(() => vi.unstubAllEnvs());

  // The injected record is the ONLY input. If the detector reached for the real
  // process.env this would come back `active` instead of null.
  it('reads the injected record, never process.env', () => {
    vi.stubEnv('https_proxy', PROXY);

    expect(detectProxyNotice({}, 'linux')).toBeNull();
    expect(detectProxyNotice({}, 'win32')).toBeNull();
  });
});

describe('MEASURED_DEGIT_VERSIONS', () => {
  // The floor under the confident wording. Every published version in the
  // ^3.6.1 range package.json declares was swept; all nine read only the
  // lowercase name. Extending this set requires MEASURING, never assuming.
  it('covers every published version in the declared ^3.6.1 range', () => {
    expect([...MEASURED_DEGIT_VERSIONS].sort()).toEqual([
      '3.6.1',
      '3.6.2',
      '3.6.3',
      '3.6.4',
      '3.6.5',
      '3.6.6',
      '3.7.0',
      '3.7.1',
      '3.8.0',
    ]);
  });

  it('does not contain a version nobody measured', () => {
    expect(MEASURED_DEGIT_VERSIONS.has('3.9.0')).toBe(false);
    expect(MEASURED_DEGIT_VERSIONS.has('4.0.0')).toBe(false);
  });
});

// The claim under MEASURED_DEGIT_VERSIONS is a property of the DEPENDENCY,
// established by a manual sweep. This block re-verifies it on every run against
// whatever degit is actually installed, so the set cannot quietly drift from the
// thing it describes: if a future degit changes the read, this goes RED and
// someone must re-measure rather than discovering it from a user's bug report.
describe('the installed degit still behaves as MEASURED_DEGIT_VERSIONS claims', () => {
  const distDir = fileURLToPath(
    new URL('../node_modules/degit/dist/', import.meta.url),
  );
  const chunks = () =>
    readdirSync(distDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(distDir, f), 'utf8'));

  it('ships a dist/ to inspect (a packaging change must not pass vacuously)', () => {
    expect(chunks().length).toBeGreaterThan(0);
  });

  it('reads exactly one proxy env name, and it is lowercase https_proxy', () => {
    const names = new Set<string>();
    for (const src of chunks()) {
      for (const m of src.matchAll(
        /https?_proxy|HTTPS?_PROXY|no_proxy|NO_PROXY|ALL_PROXY|all_proxy/g,
      )) {
        names.add(m[0]);
      }
    }

    expect([...names]).toEqual(['https_proxy']);
  });

  it('assigns the proxy unconditionally in its constructor', () => {
    const found = chunks().some((src) =>
      /this\.proxy\s*=\s*process\.env\.https_proxy/.test(src),
    );

    expect(found).toBe(true);
  });

  // The PROXY event is verbose-gated, so an emitter listener would observe
  // nothing on pharn's path — this is what rules out "observe degit instead of
  // reading the env" as a design.
  it('gates its PROXY event behind verbose', () => {
    const found = chunks().some((src) =>
      /verboseInfo\([a-zA-Z_$]\)\{this\.verbose&&this\.info\([a-zA-Z_$]\)\}/.test(
        src,
      ),
    );

    expect(found).toBe(true);
  });

  // If the installed version is one pharn measured, the above IS the measurement
  // holding. If it is not, the code hedges instead — so this test documents
  // which of the two states CI is currently in.
  it('either matches a measured version, or the notice hedges', () => {
    const read = resolveDegitProxyRead();

    expect(read.measured).toBe(
      read.version !== null && MEASURED_DEGIT_VERSIONS.has(read.version),
    );
  });
});

describe('resolveDegitProxyRead', () => {
  // Reads the degit actually installed. In this repo the lockfile pins one of
  // the measured versions, so this asserts the wiring end-to-end rather than
  // a hardcoded string.
  it('reads the installed degit version and classifies it', () => {
    const read = resolveDegitProxyRead();

    expect(read.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(read.measured).toBe(MEASURED_DEGIT_VERSIONS.has(read.version!));
  });

  // The gate is real: `measured` is set membership, not a constant true.
  it('derives measured from set membership', () => {
    const read = resolveDegitProxyRead();

    expect(read.measured).toBe(
      read.version !== null && MEASURED_DEGIT_VERSIONS.has(read.version),
    );
  });
});
