import { describe, expect, it, vi } from 'vitest';
import {
  clearOutput,
  config,
  editConfig,
  exists,
  installFresh,
  interactive,
  olderCliWarnings,
  projectFiles,
  run,
  serveTip,
  SHA_V2,
  stdout,
  useHarness,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runInit } from '../../src/commands/init.js';
import { runRemove } from '../../src/commands/remove.js';
import { runStatus } from '../../src/commands/status.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { runUpdate } from '../../src/commands/update.js';
import { olderCliWarning } from '../../src/lib/older-cli.js';
import { PHARN_VERSION } from '../../src/version.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

// The older-CLI warning (lib/older-cli.ts) at every call site: a project whose
// pharn.config.json was last written by a NEWER pharn (one minor above this
// one) is still written, after one warning on stderr. Each case seeds a real
// install (`init --yes`, which stamps this CLI's version) and then edits the
// recorded `pharnVersion`.

const [major, minor] = PHARN_VERSION.split('.');
const NEWER = `${major}.${Number(minor) + 1}.0`;
const WARNING = olderCliWarning(NEWER, PHARN_VERSION);

function recordNewerCli(): void {
  editConfig((c) => {
    c.pharnVersion = NEWER;
  });
}

describe('the older-CLI warning: the writers warn once and still write', () => {
  it('the fixture: a newer pharnVersion produces a warning', () => {
    expect(WARNING).toContain(`written by pharn ${NEWER}`);
  });

  it('add: warns before installing and installs', async () => {
    await installFresh();
    recordNewerCli();
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(config().capabilities).toContainEqual({
      name: 'a11y',
      role: 'griller',
      source: 'manual',
    });
  });

  it('remove: warns and removes', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    recordNewerCli();
    clearOutput();
    expect(await run(() => runRemove('a11y'))).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(exists('pharn/pharn-pipeline/grillers/a11y')).toBe(false);
    expect(config().capabilities.map((c) => c.name)).toEqual(['security']);
  });

  it('uninstall --yes: warns and uninstalls', async () => {
    await installFresh();
    recordNewerCli();
    clearOutput();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(exists('pharn.config.json')).toBe(false);
  });

  it('update --yes: warns, writes, and stamps this CLI as the last writer', async () => {
    await installFresh();
    serveTip(SHA_V2, '2.0.0');
    recordNewerCli();
    clearOutput();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(config().skillsVersion).toBe('2.0.0');
    expect(config().pharnVersion).toBe(PHARN_VERSION);
  });

  it('a re-run init: warns about the config it replaces, before the summary, and installs', async () => {
    await installFresh();
    recordNewerCli();
    clearOutput();
    interactive({ select: ['install'], confirm: [true] });
    expect(await run(() => runInit())).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(config().pharnVersion).toBe(PHARN_VERSION);
  });

  it('no warning when the config was written by this CLI, or records no pharnVersion', async () => {
    await installFresh();
    expect(config().pharnVersion).toBe(PHARN_VERSION);
    expect(olderCliWarnings()).toEqual([]);
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(olderCliWarnings()).toEqual([]);
    editConfig((c) => {
      delete c.pharnVersion;
    });
    expect(await run(() => runRemove('a11y'))).toBeNull();
    expect(olderCliWarnings()).toEqual([]);
  });
});

describe('the older-CLI warning: readers and dry runs say it on stderr, --json stdout unchanged', () => {
  // The same run before and after the edit: stdout byte-identical, the
  // warning on stderr only.
  async function stdoutWithAndWithout(
    command: () => Promise<void>,
  ): Promise<{ before: string[]; after: string[] }> {
    await installFresh();
    clearOutput();
    expect(await run(command)).toBeNull();
    const before = [...stdout()];
    expect(olderCliWarnings()).toEqual([]);
    recordNewerCli();
    clearOutput();
    expect(await run(command)).toBeNull();
    return { before, after: [...stdout()] };
  }

  it('status --json', async () => {
    const { before, after } = await stdoutWithAndWithout(() =>
      runStatus({ json: true }),
    );
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    expect(olderCliWarnings()).toEqual([WARNING]);
  });

  it('update --dry-run --json', async () => {
    const { before, after } = await stdoutWithAndWithout(() =>
      runUpdate({ dryRun: true, json: true }),
    );
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    expect(olderCliWarnings()).toEqual([WARNING]);
  });

  it('init --dry-run --json', async () => {
    const { before, after } = await stdoutWithAndWithout(() =>
      runInit({ dryRun: true, json: true }),
    );
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    expect(olderCliWarnings()).toEqual([WARNING]);
  });

  it('status and update --dry-run in text mode warn on stderr and write nothing', async () => {
    await installFresh();
    recordNewerCli();
    const files = projectFiles();
    clearOutput();
    expect(await run(() => runStatus())).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    clearOutput();
    expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
    expect(olderCliWarnings()).toEqual([WARNING]);
    expect(projectFiles()).toEqual(files);
    expect(config().pharnVersion).toBe(NEWER);
  });
});
