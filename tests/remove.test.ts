import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  select: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
}));

const loadArchetypeConfigOrExit = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

// remove.ts imports NO repo/network module — capability removal is a pure
// filesystem delete (drop the config entry + rm the isolated dir), so "no clone,
// no network" is now STRUCTURAL, not just an assertion. layout / capability-address
// / safeJoin run for real.
const { runRemove } = await import('../src/commands/remove.js');
const prompts = await import('@clack/prompts');

function write(path: string, content = 'x'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function archConfig(
  caps: { name: string; role: 'griller' | 'lens' }[],
  extra: Partial<PharnConfig> = {},
): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: caps,
    ...extra,
  };
}

function lastWritten(): PharnConfig {
  return writePharnConfig.mock.calls[0]![1] as PharnConfig;
}

const tmp = useTmpDir();
let proj = '';

describe('runRemove (archetype)', () => {
  stubProcessExit();
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
  });
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when the config load rejects (e.g. a legacy config)', async () => {
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runRemove('a11y')).rejects.toMatchObject(new ProcessExit(1));
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('deletes a capability dir from a FLAT install and drops it (siblings untouched)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');

    await runRemove('a11y');

    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(
      existsSync(join(proj, 'pharn-review/n-plus-one/n-plus-one.md')),
    ).toBe(true);
    expect(lastWritten().capabilities).toEqual([
      { name: 'n-plus-one', role: 'lens' },
    ]);
  });

  it('deletes from a PHARN-layout install (pharn/pharn-review/<name>)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'n-plus-one', role: 'lens' }], { layout: 'pharn' }),
    );
    write(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N');

    await runRemove('lens:n-plus-one');

    expect(existsSync(join(proj, 'pharn/pharn-review/n-plus-one'))).toBe(false);
    expect(lastWritten().capabilities).toEqual([]);
  });

  it('resolves role:name and leaves archetypes untouched', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'n-plus-one', role: 'lens' }]),
    );
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');

    await runRemove('lens:n-plus-one');

    expect(existsSync(join(proj, 'pharn-review/n-plus-one'))).toBe(false);
    expect(lastWritten().archetypes).toEqual(['ssr']);
    expect(lastWritten().capabilities).toEqual([]);
  });

  it('drops the config entry even when the capability dir is already gone', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    // Nothing on disk — still drops the entry.
    await runRemove('a11y');
    expect(lastWritten().capabilities).toEqual([]);
  });

  it('is a no-op (no write) for a capability that is not installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );

    await runRemove('ghost');

    expect(prompts.outro).toHaveBeenCalledWith('Nothing was removed.');
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('exits(1) on a name installed in both roles (ambiguous)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'dup', role: 'griller' },
        { name: 'dup', role: 'lens' },
      ]),
    );

    await expect(runRemove('dup')).rejects.toMatchObject(new ProcessExit(1));
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('exits(1) on an invalid role prefix', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    await expect(runRemove('bogus:a11y')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('no-arg picker selects from installed capabilities', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    vi.mocked(prompts.select).mockResolvedValue('griller:a11y');

    await runRemove(undefined);

    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(lastWritten().capabilities).toEqual([]);
  });

  it('no-arg picker reports nothing when no capabilities are installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig([]));

    await runRemove(undefined);

    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'No capabilities are installed.',
    );
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('no-arg picker cancels cleanly (no write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(0),
    );
    expect(writePharnConfig).not.toHaveBeenCalled();
  });
});
