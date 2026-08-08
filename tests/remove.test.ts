import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  groupMultiselect: vi.fn(),
  confirm: vi.fn(),
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
// / capability-picker / safeJoin run for real.
const { runRemove } = await import('../src/commands/remove.js');
const prompts = await import('@clack/prompts');

function write(path: string, content = 'x'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// process.std*.isTTY drives the bare-invocation guard; set per test, restore after.
const origStdin = process.stdin.isTTY;
const origStdout = process.stdout.isTTY;
function setTTY(stdin?: boolean, stdout?: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: stdout,
    configurable: true,
  });
}

function archConfig(
  caps: {
    name: string;
    role: 'griller' | 'lens';
    source?: 'auto' | 'manual';
  }[],
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
  afterEach(() => {
    vi.clearAllMocks();
    setTTY(origStdin, origStdout);
  });

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

  // --- bare `pharn remove` (no arg): multi-select picker / non-TTY guard -------

  it('no-arg in a TTY multi-selects, confirms, deletes each + one config write', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:n-plus-one',
    ]);
    vi.mocked(prompts.confirm).mockResolvedValue(true);

    await runRemove(undefined);

    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(existsSync(join(proj, 'pharn-review/n-plus-one'))).toBe(false);
    expect(writePharnConfig).toHaveBeenCalledTimes(1);
    expect(lastWritten().capabilities).toEqual([]);
  });

  it('no-arg in a NON-TTY exits(1) without prompting', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    setTTY(false, false);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('no-arg reports nothing when no capabilities are installed (even non-TTY)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig([]));
    setTTY(false, false);

    await runRemove(undefined);

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'No capabilities are installed.',
    );
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('no-arg picker cancels cleanly (no write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(CANCEL);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(0),
    );
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('no-arg empty selection removes nothing (no confirm, no write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([]);

    await runRemove(undefined);

    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Nothing selected. No capabilities were removed.',
    );
  });

  it('no-arg declining the confirm removes nothing (no write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(['griller:a11y']);
    vi.mocked(prompts.confirm).mockResolvedValue(false);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(0),
    );
    // Declined → the dir is left in place and no config write happens.
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(true);
    expect(writePharnConfig).not.toHaveBeenCalled();
  });
  // -------------------------------------------------------------------------
  // The re-add warning. Derived from the STORED `source` alone — `remove` has no
  // capability index and never fetches one, so this is all it could honestly say.
  // -------------------------------------------------------------------------
  describe('the auto re-add warning (offline)', () => {
    const warnings = () =>
      vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    it('WARNS when the removed entry is literally source: auto', () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller', source: 'auto' }]),
      );
      write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

      return runRemove('a11y').then(() => {
        expect(warnings()).toContain('pharn update');
        expect(warnings()).toContain('a11y');
      });
    });

    it('stays SILENT for a manual entry — the union can never re-add it', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller', source: 'manual' }]),
      );
      write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

      await runRemove('a11y');

      expect(warnings()).not.toContain('pharn update');
    });

    // The hard rule: absent means UNKNOWN, never "auto". A legacy manual add
    // given an absent-means-auto default would be told the exact opposite of the
    // truth, and a false warning is worse than silence.
    it('stays SILENT when `source` is ABSENT (legacy) — it never defaults to auto', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

      await runRemove('a11y');

      expect(warnings()).not.toContain('pharn update');
    });

    it("leaves every surviving entry's `source` untouched", async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
          { name: 'legacy', role: 'lens' },
        ]),
      );
      write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

      await runRemove('a11y');

      expect(lastWritten().capabilities).toEqual([
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
        { name: 'legacy', role: 'lens' },
      ]);
    });

    it('warns once, listing every auto pick, from the picker path too', async () => {
      setTTY(true, true);
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ]),
      );
      write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
      write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');
      vi.mocked(prompts.groupMultiselect).mockResolvedValue([
        'griller:a11y',
        'lens:n-plus-one',
      ]);
      vi.mocked(prompts.confirm).mockResolvedValue(true);

      await runRemove(undefined);

      expect(warnings()).toContain('a11y');
      expect(warnings()).not.toContain('n-plus-one');
    });
  });
});
