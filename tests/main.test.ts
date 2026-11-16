import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { PHARN_VERSION } from '../src/version.js';
import {
  exists,
  fetched,
  fetchStub,
  installFresh,
  jsonOut,
  clearOutput,
  run,
  serveTip,
  SHA_V2,
  snapshot,
  stderr,
  stdout,
  useHarness,
} from './support/harness.js';

// `main(argv)` end to end: the real parse, the real dispatch and the real
// commands on a temp project. Only the network (`fetch`) and the terminal
// (clack) are replaced, as in tests/commands/. Every parse shape is in
// tests/cli-args.test.ts; this suite proves `main` wires each outcome through.
vi.mock('@clack/prompts', async () =>
  (await import('./support/clack-stub.js')).clackStub(),
);

useHarness();

/** Run `pharn <args>`; a `process.exit` surfaces as its code (a return as null). */
const pharn = (...args: string[]): Promise<number | null> =>
  run(() => main(args));

/** Install 1.0.0, then publish 2.0.0, and forget the seeding run's output. */
async function installedWithUpdate(): Promise<void> {
  await installFresh();
  serveTip(SHA_V2, '2.0.0');
  clearOutput();
  fetchStub.mockClear();
}

describe('main', () => {
  it('prints the version for --version and touches nothing', async () => {
    const before = snapshot();
    expect(await pharn('--version')).toBeNull();
    expect(stdout()).toEqual([PHARN_VERSION]);
    expect(stderr()).toEqual([]);
    expect(fetched()).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  it('refuses an unknown option with one line and the pointer, exit 1, before any command runs', async () => {
    const before = snapshot();
    expect(await pharn('status', '--sctrict')).toBe(1);
    expect(stderr()).toEqual([
      'Unknown option: "--sctrict"',
      'Run `pharn --help` for usage.',
    ]);
    expect(stdout()).toEqual([]);
    expect(fetched()).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  it('refuses an option the command does not take, even after an install', async () => {
    await installFresh();
    clearOutput();
    expect(await pharn('list', '--strict')).toBe(1);
    expect(stderr()).toEqual([
      'Unsupported option for `list`: "--strict"',
      'Run `pharn --help` for usage.',
    ]);
    expect(stdout()).toEqual([]);
  });

  it('runs `update --json` as the JSON dry run: one plan object, nothing written', async () => {
    await installedWithUpdate();
    const before = snapshot();
    expect(await pharn('update', '--json')).toBeNull();
    const report = jsonOut<{ status: string; compact?: boolean }>();
    expect(report.status).toBe('planned');
    expect(report).not.toHaveProperty('compact');
    expect(snapshot()).toEqual(before);
  });

  it('runs `update --compact` as `--dry-run --json --compact`', async () => {
    await installedWithUpdate();
    const before = snapshot();
    expect(await pharn('update', '--compact')).toBeNull();
    expect(jsonOut<{ compact?: boolean }>().compact).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it('runs a bare `pharn --json` as `init --dry-run --json`: a plan, no install', async () => {
    expect(await pharn('--json')).toBeNull();
    expect(jsonOut<{ schemaVersion: number }>().schemaVersion).toBe(1);
    expect(exists('pharn.config.json')).toBe(false);
  });

  it('dispatches `list --json` and `status --no-drift --json` to their commands', async () => {
    await installFresh();
    clearOutput();
    expect(await pharn('list', '--json')).toBeNull();
    expect(jsonOut<{ archetypes: string[] }>().archetypes).toEqual(['lib']);
    clearOutput();
    expect(await pharn('status', '--no-drift', '--json')).toBeNull();
    expect(jsonOut<{ drift: unknown }>().drift).toBeNull();
  });
});
