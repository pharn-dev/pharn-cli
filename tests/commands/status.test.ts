import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  at,
  clearOutput,
  installFresh,
  PLAN_COMMAND,
  read,
  run,
  stdout,
  useHarness,
} from '../support/harness.js';
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

describe('pharn status, end to end', () => {
  it('status --json prints one report: current, no drift, then the edit it finds', async () => {
    await installFresh();
    clearOutput();
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(stdout()).toHaveLength(1);
    const clean = JSON.parse(stdout()[0] ?? '') as StatusJson;
    expect(clean).toMatchObject({
      schemaVersion: 1,
      version: { installed: '1.0.0', latest: '1.0.0', outdated: false },
      archetypes: ['lib'],
      capabilities: { count: 1 },
      layout: { recorded: 'pharn', upstream: 'pharn' },
      drift: { modified: [], missing: [], absentUpstream: [] },
      hooks: { missing: [] },
      strict: { failed: false },
    });

    writeFileSync(at(PLAN_COMMAND), `edited\n`);
    rmSync(at('LIMITS.md'));
    clearOutput();
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const drifted = JSON.parse(stdout()[0] ?? '') as StatusJson;
    expect(drifted.drift?.modified).toEqual([PLAN_COMMAND]);
    expect(drifted.drift?.missing).toEqual(['LIMITS.md']);
    // status is read-only: nothing it reported was put back.
    expect(read(PLAN_COMMAND)).toBe(`edited\n`);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
  });
});
