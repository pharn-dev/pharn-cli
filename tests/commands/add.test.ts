import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  A11Y,
  at,
  config,
  installFresh,
  read,
  records,
  run,
  sha256,
  stdout,
  useHarness,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runStatus } from '../../src/commands/status.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

/** The slice of the `status --json` report these cases read. */
interface StatusJson {
  schemaVersion: number;
  version: { installed: string; latest: string; outdated: boolean };
  archetypes: string[];
  capabilities: { count: number };
  layout: { recorded: string; upstream: string | null };
  drift: {
    modified: string[];
    missing: string[];
    absentUpstream: unknown[];
  } | null;
  hooks: { status: string; missing: unknown[] } | null;
  strict: { failed: boolean };
}

describe('pharn add, end to end', () => {
  it('add <name> installs one capability at the recorded layout, as manual', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();

    expect(read(A11Y)).toContain('a11y');
    expect(existsSync(at('pharn-pipeline/grillers/a11y'))).toBe(false);
    const cfg = config();
    expect(cfg.capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'a11y', role: 'griller', source: 'manual' },
    ]);
    // `add` refreshes nothing it did not write: same version, same stamp.
    expect(cfg.skillsVersion).toBe('1.0.0');
    const rec = records();
    expect(rec.files[A11Y]).toBe(sha256(A11Y));
    expect(rec.skillsVersion).toBe('1.0.0');

    // The readers agree: status sees the capability, and drift is clean.
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout().at(-1) ?? '') as StatusJson;
    expect(report.capabilities.count).toBe(2);
    expect(report.drift?.modified).toEqual([]);
    expect(report.drift?.missing).toEqual([]);
  });
});
