import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreTTY,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
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
const assertConfigUnchanged = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  assertConfigUnchanged,
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

// remove.ts imports NO repo/network module — capability removal is a pure
// filesystem delete (drop the config entry + rm the isolated dir), so "no clone,
// no network" is now STRUCTURAL, not just an assertion. layout / capability-address
// / capability-picker / safeJoin run for real.
const { runRemove } = await import('../src/commands/remove.js');
const prompts = await import('@clack/prompts');
// NOT mocked — the record store runs for real against the test cwd, so every
// assertion below is about bytes that actually landed on disk.
const { readRecords, writeRecords, RECORDS_FILE } =
  await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');

function write(path: string, content = 'x'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
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
    // The project root has to EXIST, not merely be a path: a real cwd always
    // does, and `remove` now takes a lock file in it. Previously only the
    // capability-writing tests created it as a side effect of `write()`.
    mkdirSync(proj, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
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

  // F-23: `installedAt` is the time of the install / last update. A remove is
  // a partial edit, so it carries the recorded time through — it used to stamp
  // the moment of the remove.
  it('keeps installedAt unchanged', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

    await runRemove('a11y');

    expect(lastWritten().capabilities).toEqual([]);
    expect(lastWritten().installedAt).toBe('2026-07-07T00:00:00.000Z');
  });

  // F-38: a NAMED remove of something that is not installed is an error, like
  // `pharn add bogus` — a script that removes the wrong name must not read
  // success. Nothing is written, and the removable capabilities are listed.
  it('exits(1), writing nothing, for a capability that is not installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );

    await expect(runRemove('ghost')).rejects.toMatchObject(new ProcessExit(1));

    const [msg, opts] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
    expect(msg).toContain('"ghost" is not an installed capability.');
    expect(msg).toContain('Installed: griller:a11y.');
    expect(msg).toContain('Nothing was removed.');
    expect(opts).toEqual({ output: process.stderr });
    expect(prompts.outro).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('exits(1) naming that nothing is installed when the config lists none', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig([]));

    await expect(runRemove('ghost')).rejects.toMatchObject(new ProcessExit(1));

    expect(
      String(vi.mocked(prompts.log.error).mock.calls.at(-1)![0]),
    ).toContain('No capabilities are installed.');
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

  // --- PHARN-01: a hand-edited capability name must never steer the delete ------

  // Every path under the project, so "nothing was deleted" is a whole-tree claim.
  function snapshot(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        out.push(relative(root, p));
        if (e.isDirectory()) walk(p);
      }
    };
    walk(root);
    return out.sort();
  }

  function seedProject(): void {
    write(join(proj, '.git/HEAD'), 'ref: refs/heads/main');
    write(join(proj, 'src/index.ts'), 'code');
    write(join(proj, 'pharn/pharn-review/a11y/a11y.md'), 'A');
    write(join(proj, 'pharn/pharn-review/a11y-extended/x.md'), 'X');
  }

  it.each([['../..'], ['../../src'], ['..'], ['.']])(
    'the REAL config loader refuses name %j: exit 1, tree unchanged, no writes',
    async (name) => {
      const actual = await vi.importActual<
        typeof import('../src/lib/pharn-config.js')
      >('../src/lib/pharn-config.js');
      loadArchetypeConfigOrExit.mockImplementationOnce(
        actual.loadArchetypeConfigOrExit,
      );
      seedProject();
      writeFileSync(
        join(proj, 'pharn.config.json'),
        JSON.stringify(
          archConfig([{ name, role: 'lens' }], { layout: 'pharn' }),
        ),
      );
      const before = snapshot(proj);

      await expect(runRemove(name)).rejects.toMatchObject(new ProcessExit(1));

      expect(snapshot(proj)).toEqual(before);
      expect(writePharnConfig).not.toHaveBeenCalled();
    },
  );

  it.each([['../..'], ['../../src'], ['..'], ['.']])(
    'the delete itself refuses name %j even if ingest were bypassed (defense in depth)',
    async (name) => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name, role: 'lens' }], { layout: 'pharn' }),
      );
      seedProject();
      const before = snapshot(proj);

      await expect(runRemove(name)).rejects.toThrow(/Refusing path/);

      expect(snapshot(proj)).toEqual(before);
      expect(writePharnConfig).not.toHaveBeenCalled();
    },
  );

  it('the defense-in-depth refusal also holds on the picker path', async () => {
    setTTY(true, true);
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: '../..', role: 'lens' }], { layout: 'pharn' }),
    );
    seedProject();
    const before = snapshot(proj);
    vi.mocked(prompts.groupMultiselect).mockResolvedValueOnce(['lens:../..']);
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);

    await expect(runRemove(undefined)).rejects.toThrow(/Refusing path/);

    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    expect(snapshot(proj)).toEqual(before);
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('a valid name still deletes only <subtree>/<name> (prefix sibling intact)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig(
        [
          { name: 'a11y', role: 'lens' },
          { name: 'a11y-extended', role: 'lens' },
        ],
        { layout: 'pharn' },
      ),
    );
    seedProject();

    await runRemove('a11y');

    expect(existsSync(join(proj, 'pharn/pharn-review/a11y'))).toBe(false);
    expect(
      existsSync(join(proj, 'pharn/pharn-review/a11y-extended/x.md')),
    ).toBe(true);
    expect(existsSync(join(proj, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(proj, '.git/HEAD'))).toBe(true);
  });

  // --- PHARN-02: never delete through a symlinked project directory -----------

  it.each([['pharn'], ['pharn/pharn-review'], ['pharn/pharn-review/a11y']])(
    'refuses (exit 1) when %s is a symlink out of the project; outside files survive',
    async (link) => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'lens' }], { layout: 'pharn' }),
      );
      const shared = join(tmp.path(), 'shared');
      // The shared tree mirrors what `link` points at.
      const target = join(shared, 'x');
      const rest = relative(link, 'pharn/pharn-review/a11y');
      write(join(target, rest, 'NOTES.md'), 'USER NOTES');
      mkdirSync(join(proj, link, '..'), { recursive: true });
      symlinkSync(target, join(proj, link));
      const before = snapshot(shared);

      await expect(runRemove('a11y')).rejects.toMatchObject(new ProcessExit(1));

      expect(snapshot(shared)).toEqual(before);
      expect(writePharnConfig).not.toHaveBeenCalled();
      expect(
        vi.mocked(prompts.log.error).mock.calls.map(String).join(),
      ).toContain(`${link} is a symbolic link`);
    },
  );

  it('picker: one unsafe pick refuses the WHOLE selection before the confirm', async () => {
    setTTY(true, true);
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'lens' },
        { name: 'a11y', role: 'griller' },
      ]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'SAFE');
    const shared = join(tmp.path(), 'shared');
    write(join(shared, 'a11y/NOTES.md'), 'USER NOTES');
    symlinkSync(shared, join(proj, 'pharn-review'));
    vi.mocked(prompts.groupMultiselect).mockResolvedValueOnce([
      'griller:a11y',
      'lens:a11y',
    ]);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    expect(existsSync(join(shared, 'a11y/NOTES.md'))).toBe(true);
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
    // F-23: the picker's one config write keeps `installedAt` too.
    expect(lastWritten().installedAt).toBe('2026-07-07T00:00:00.000Z');
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
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(CANCEL as never);

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

  // --- the `--yes` contract: `remove` does not have one ----------------------
  //
  // Three surfaces used to disagree about whether `remove` confirms: the
  // picker's confirm (unconditional), a `_opts.yes` parameter `runRemove`
  // accepted and never read, and two doc sentences asserting "capability
  // removal has no confirmation prompt to skip". The parameter is gone; these
  // pin the contract that replaced it — per PATH, which is what the false
  // sentences flattened.

  it('runRemove declares exactly one parameter — no `yes` option survives', () => {
    const src = readFileSync(
      new URL('../src/commands/remove.ts', import.meta.url),
      'utf8',
    );
    const params = /export async function runRemove\(([\s\S]*?)\):/.exec(
      src,
    )?.[1];
    // Asserted BEFORE the negative one: a regex that stops matching (a rename,
    // a reformat) must fail loudly rather than pass on an absent capture (P5).
    expect(params).toBeDefined();
    expect(params).not.toMatch(/yes/);
    expect(params!.split(',').filter((p) => p.trim() !== '')).toHaveLength(1);
  });

  it('the NAMED path never confirms — there is nothing for a flag to skip', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');

    await runRemove('a11y');

    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(false);
  });

  it("the PICKER's one confirm is unconditional and defaults to No", async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(['griller:a11y']);
    vi.mocked(prompts.confirm).mockResolvedValue(true);

    await runRemove(undefined);

    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prompts.confirm).mock.calls[0]![0]).toMatchObject({
      initialValue: false,
    });
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
        // F-09: it must not promise the NEXT update. At the version already
        // installed, update early-returns before it can re-resolve the
        // archetypes (pinned in tests/update.test.ts), so the warning names
        // when it really comes back — and that a same-version run does not.
        expect(warnings()).not.toContain('the next `pharn update` will');
        expect(warnings()).toContain('a new pharn-oss version');
        expect(warnings()).toContain(
          'may answer "Already up to date" and leave it removed',
        );
        expect(warnings()).toContain(
          '`pharn update --force` reinstalls it now',
        );
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

  // -------------------------------------------------------------------------
  // Record-store pruning (real filesystem). `remove` must drop the removed
  // capability's entries from pharn.records.json — otherwise it is the one write
  // path that leaves records describing bytes that are gone, and they linger
  // until the next `update` prunes them via its manifest.
  //
  // The prune is a key-PREFIX filter over the store, never a filesystem walk: a
  // walk of the DEST dir finds nothing once it is gone — true both after the
  // delete and, on the "already gone" path, before it. The `already gone` case
  // below is what settles that design.
  //
  // Stores are seeded through the REAL writeRecords (as tests/add.test.ts's
  // `runAdd — pharn.records.json` block does) and asserted by reading the real
  // bytes: writeRecords sorts its keys, so whole-file byte equality is meaningful.
  // -------------------------------------------------------------------------
  describe('pharn.records.json pruning', () => {
    const A11Y = 'pharn-pipeline/grillers/a11y/a11y.md';
    const A11Y_NESTED = 'pharn-pipeline/grillers/a11y/evals/cases/basic.md';
    // The prefix neighbour: identical up to the directory separator.
    const EXTENDED = 'pharn-pipeline/grillers/a11y-extended/a11y-extended.md';
    const LENS = 'pharn-review/n-plus-one/n-plus-one.md';
    // A non-capability key: `remove` must never touch the trusted docs' records.
    const DOC = 'CONSTITUTION.md';

    // Write each path with distinct bytes, then record the hashes that actually
    // landed — never a hash the test invented.
    async function seedStore(rels: string[]): Promise<void> {
      const files: Record<string, string> = {};
      for (const rel of rels) {
        write(join(proj, rel), `${rel} bytes`);
        files[rel] = contentHash(join(proj, rel));
      }
      await writeRecords(proj, {
        skillsVersion: '1.0.0', // matches archConfig()
        commit: 'old',
        files,
      });
    }

    const storeBytes = (): string =>
      readFileSync(join(proj, RECORDS_FILE), 'utf8');

    const store = () => {
      const read = readRecords(proj);
      return read.kind === 'ok' ? read.store : null;
    };

    it('drops every record under the removed capability and no other', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ]),
      );
      await seedStore([A11Y, A11Y_NESTED, LENS, DOC]);
      const survivors = {
        [LENS]: contentHash(join(proj, LENS)),
        [DOC]: contentHash(join(proj, DOC)),
      };

      await runRemove('a11y');

      // Nested keys go too — the prefix covers the whole subtree, not just the
      // capability's top-level file.
      expect(store()!.files).toEqual(survivors);
    });

    it('the trailing slash is load-bearing: removing a11y keeps a11y-extended', async () => {
      // Both are grillers under the same parent, so the ONLY thing separating
      // their keys is the `/` after the capability name. A prune built on
      // `key.startsWith(relDir)` without it passes every other test in this file
      // and fails exactly here.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller' },
          { name: 'a11y-extended', role: 'griller' },
        ]),
      );
      await seedStore([A11Y, EXTENDED]);
      const extendedHash = contentHash(join(proj, EXTENDED));

      await runRemove('a11y');

      expect(store()!.files).toEqual({ [EXTENDED]: extendedHash });
      // And its files were never in the blast radius either.
      expect(
        existsSync(join(proj, 'pharn-pipeline/grillers/a11y-extended')),
      ).toBe(true);
    });

    it('leaves the skillsVersion/commit stamp exactly where it was', async () => {
      // `remove` advances neither, so the store must be re-written against the
      // pair the config still holds — a moved stamp would make the very next
      // `update` read this store as written for another state and ignore it.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      await seedStore([A11Y, DOC]);

      await runRemove('a11y');

      expect(store()!.skillsVersion).toBe('1.0.0');
      expect(store()!.commit).toBe('old');
      expect(store()!.schemaVersion).toBe(1);
    });

    it('does NOT mint a store when none exists — absent stays absent', async () => {
      // Minting a partial store would claim knowledge of files this run never
      // hashed, relabelling the whole install for the next `update`.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      write(join(proj, A11Y), 'A');

      await runRemove('a11y');

      expect(readRecords(proj)).toEqual({ kind: 'absent' });
      expect(existsSync(join(proj, RECORDS_FILE))).toBe(false);
      // The removal itself still happened.
      expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(
        false,
      );
    });

    it('does NOT rewrite a corrupt store', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      write(join(proj, A11Y), 'A');
      writeFileSync(join(proj, RECORDS_FILE), 'not json{');

      await runRemove('a11y');

      expect(storeBytes()).toBe('not json{');
    });

    it('leaves a stale-stamped store byte-identical while the removal itself completes', async () => {
      // The two concerns are independent: a store this run may not touch must not
      // stop the removal, and a completed removal must not bless the store. A test
      // asserting only the first half would pass on a `remove` that had silently
      // stopped removing.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller', source: 'auto' }]),
      );
      await seedStore([A11Y, DOC]);
      // Hand-skew the stamp — the store now describes another install state.
      const skewed = JSON.parse(storeBytes()) as { skillsVersion: string };
      skewed.skillsVersion = '9.9.9';
      writeFileSync(
        join(proj, RECORDS_FILE),
        `${JSON.stringify(skewed, null, 2)}\n`,
      );
      const before = storeBytes();

      await runRemove('a11y');

      expect(storeBytes()).toBe(before);
      expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y'))).toBe(
        false,
      );
      expect(lastWritten().capabilities).toEqual([]);
      expect(
        vi
          .mocked(prompts.log.warn)
          .mock.calls.map((c) => String(c[0]))
          .join('\n'),
      ).toContain('pharn update');
    });

    it('prunes the records even when the capability files were already gone', async () => {
      // THE case the prefix design exists for: with the directory absent there is
      // nothing on disk to enumerate, before the delete or after it — a walk-based
      // prune would see [] and leave the stale keys forever.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      await seedStore([A11Y, A11Y_NESTED, DOC]);
      const docHash = contentHash(join(proj, DOC));
      // Delete the files behind pharn's back, leaving only the records.
      rmSync(join(proj, 'pharn-pipeline/grillers/a11y'), {
        recursive: true,
        force: true,
      });

      await runRemove('a11y');

      expect(store()!.files).toEqual({ [DOC]: docHash });
      expect(lastWritten().capabilities).toEqual([]);
      expect(String(vi.mocked(prompts.outro).mock.calls[0]![0])).toContain(
        'already gone',
      );
    });

    it('writes nothing when the capability has no records', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ]),
      );
      write(join(proj, A11Y), 'A');
      // Seeded COMPACT (still schema-valid, so readRecords accepts it). Any write
      // at all re-emits the store through writeRecords' 2-space + trailing-newline
      // serialization, so the bytes change — which is what makes "skipped the
      // write" observable rather than indistinguishable from "wrote an identical
      // map".
      write(join(proj, LENS), 'N');
      writeFileSync(
        join(proj, RECORDS_FILE),
        JSON.stringify({
          schemaVersion: 1,
          skillsVersion: '1.0.0',
          commit: 'old',
          files: { [LENS]: contentHash(join(proj, LENS)) },
        }),
      );
      const before = storeBytes();

      await runRemove('a11y');

      expect(storeBytes()).toBe(before);
      expect(lastWritten().capabilities).toEqual([
        { name: 'n-plus-one', role: 'lens' },
      ]);
    });

    it('the picker prunes every pick in one store write', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ]),
      );
      await seedStore([A11Y, A11Y_NESTED, LENS, DOC]);
      const docHash = contentHash(join(proj, DOC));
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue([
        'griller:a11y',
        'lens:n-plus-one',
      ]);
      vi.mocked(prompts.confirm).mockResolvedValue(true);

      await runRemove(undefined);

      expect(store()!.files).toEqual({ [DOC]: docHash });
    });

    it('leaves the store untouched when the picker confirm is declined', async () => {
      // The negative path: the prune must sit BELOW the confirm, not above it.
      // Nothing was removed, so nothing may be pruned.
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      await seedStore([A11Y, DOC]);
      const before = storeBytes();
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue(['griller:a11y']);
      vi.mocked(prompts.confirm).mockResolvedValue(false);

      await expect(runRemove(undefined)).rejects.toMatchObject(
        new ProcessExit(0),
      );

      expect(storeBytes()).toBe(before);
    });

    it('leaves the store untouched for a capability that is not installed', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'griller' }]),
      );
      await seedStore([A11Y, DOC]);
      const before = storeBytes();

      await expect(runRemove('ghost')).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(storeBytes()).toBe(before);
      expect(writePharnConfig).not.toHaveBeenCalled();
    });
  });

  // --- F-01: never delete a file pharn cannot prove is its own -----------------
  //
  // `remove` deletes the WHOLE capability directory. Anything in it that is not
  // provably pharn-written-and-unchanged (a usable `pharn.records.json` holding
  // its key at its current hash) is copied to `.pharn-backup/<ts>/` FIRST.
  describe('backup before delete', () => {
    const DIR = 'pharn/pharn-review/a11y';
    const PERSONA = `${DIR}/a11y.md`;
    const CASE = `${DIR}/evals/cases/basic.md`;
    const USER = `${DIR}/notes/USER.md`;

    // Record the hashes of what actually landed, stamped for archConfig().
    async function seedRecorded(rels: string[]): Promise<void> {
      const files: Record<string, string> = {};
      for (const rel of rels) {
        write(join(proj, rel), `${rel} pharn bytes`);
        files[rel] = contentHash(join(proj, rel));
      }
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: 'old',
        files,
      });
    }

    function backupDirs(): string[] {
      const root = join(proj, '.pharn-backup');
      return existsSync(root) ? readdirSync(root).sort() : [];
    }

    // Every file under the ONE backup directory, relative to it.
    function backedUp(): string[] {
      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      return snapshotFiles(join(proj, '.pharn-backup', dirs[0]!));
    }

    function backupBytes(rel: string): string {
      return readFileSync(
        join(proj, '.pharn-backup', backupDirs()[0]!, rel),
        'utf8',
      );
    }

    function snapshotFiles(root: string): string[] {
      const out: string[] = [];
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else out.push(relative(root, p));
        }
      };
      walk(root);
      return out.sort();
    }

    const infoLines = (): string =>
      vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    function lensConfig(extra: { name: string; role: 'lens' }[] = []): void {
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([{ name: 'a11y', role: 'lens' }, ...extra], {
          layout: 'pharn',
        }),
      );
    }

    it('a user file inside the dir is backed up, byte-identical, before the dir is deleted', async () => {
      lensConfig();
      await seedRecorded([PERSONA, CASE]);
      write(join(proj, USER), 'MY NOTES — not pharn');

      await runRemove('a11y');

      expect(existsSync(join(proj, DIR))).toBe(false);
      expect(backedUp()).toEqual([USER]);
      expect(backupBytes(USER)).toBe('MY NOTES — not pharn');
      expect(infoLines()).toMatch(
        /^Backed up 1 file\(s\) to \.pharn-backup\/\d{8}-\d{6} before removing\.$/m,
      );
      // F-40: the same .gitignore advice `update`'s backup notice carries.
      expect(infoLines()).toContain(
        '.pharn-backup/ is not gitignored — add it to .gitignore or delete it once you are happy.',
      );
      expect(lastWritten().capabilities).toEqual([]);
    });

    it('an edited recorded file is backed up; an unchanged one beside it is not', async () => {
      lensConfig();
      await seedRecorded([PERSONA, CASE]);
      write(join(proj, PERSONA), 'my edit to the persona');

      await runRemove('a11y');

      expect(backedUp()).toEqual([PERSONA]);
      expect(backupBytes(PERSONA)).toBe('my edit to the persona');
      expect(existsSync(join(proj, DIR))).toBe(false);
    });

    it('nothing to back up → no .pharn-backup directory and no notice', async () => {
      lensConfig();
      await seedRecorded([PERSONA, CASE]);

      await runRemove('a11y');

      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      expect(infoLines()).not.toContain('Backed up');
      expect(existsSync(join(proj, DIR))).toBe(false);
    });

    it('recorded files re-checked-out with CRLF line endings are not backed up (F-16)', async () => {
      lensConfig();
      // pharn wrote (and recorded) LF bytes; a core.autocrlf=true checkout then
      // turned them into CRLF.
      const files: Record<string, string> = {};
      for (const rel of [PERSONA, CASE]) {
        write(join(proj, rel), `${rel}\npharn bytes\n`);
        files[rel] = contentHash(join(proj, rel));
        write(join(proj, rel), `${rel}\r\npharn bytes\r\n`);
      }
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: 'old',
        files,
      });

      await runRemove('a11y');

      expect(existsSync(join(proj, DIR))).toBe(false);
      expect(backupDirs()).toEqual([]);
      expect(infoLines()).not.toMatch(/Backed up/);
    });

    it('no record store → every file in the dir is backed up', async () => {
      lensConfig();
      write(join(proj, PERSONA), 'P');
      write(join(proj, CASE), 'C');

      await runRemove('a11y');

      expect(backedUp()).toEqual([PERSONA, CASE]);
      expect(infoLines()).toContain('Backed up 2 file(s)');
    });

    it('a store stamped for another install state proves nothing → every file is backed up', async () => {
      lensConfig();
      await seedRecorded([PERSONA, CASE]);
      const raw = JSON.parse(
        readFileSync(join(proj, RECORDS_FILE), 'utf8'),
      ) as { commit: string };
      raw.commit = 'someone-else';
      writeFileSync(join(proj, RECORDS_FILE), JSON.stringify(raw));

      await runRemove('a11y');

      expect(backedUp()).toEqual([PERSONA, CASE]);
    });

    it.each([
      ['.pharn-backup is a symlink', 'symlink'],
      ['a scanned file cannot be read', 'unreadable'],
    ])(
      'backup failure (%s) → exit 1, NOTHING deleted, no config or records write',
      async (_label, kind) => {
        if (kind === 'unreadable' && process.getuid?.() === 0) return;
        lensConfig();
        await seedRecorded([PERSONA, CASE]);
        write(join(proj, USER), 'MY NOTES');
        if (kind === 'symlink') {
          const elsewhere = join(tmp.path(), 'elsewhere');
          mkdirSync(elsewhere, { recursive: true });
          symlinkSync(elsewhere, join(proj, '.pharn-backup'));
        } else {
          // A recorded file that cannot be read cannot be proven unchanged.
          chmodSync(join(proj, PERSONA), 0o000);
        }
        const recordsBefore = readFileSync(join(proj, RECORDS_FILE), 'utf8');

        try {
          await expect(runRemove('a11y')).rejects.toMatchObject(
            new ProcessExit(1),
          );
        } finally {
          if (kind === 'unreadable') {
            chmodSync(join(proj, PERSONA), 0o600);
          }
        }

        expect(existsSync(join(proj, USER))).toBe(true);
        expect(existsSync(join(proj, PERSONA))).toBe(true);
        expect(existsSync(join(proj, CASE))).toBe(true);
        expect(writePharnConfig).not.toHaveBeenCalled();
        expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(
          recordsBefore,
        );
        const errors = vi
          .mocked(prompts.log.error)
          .mock.calls.map((c) => String(c[0]))
          .join('\n');
        expect(errors).toContain('Nothing was removed');
        expect(errors).toContain('a11y');
        // The lock was released on the way out.
        expect(existsSync(join(proj, '.pharn.lock'))).toBe(false);
      },
    );

    it('an already-gone dir backs up nothing (and still removes the entry)', async () => {
      lensConfig();

      await runRemove('a11y');

      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      expect(lastWritten().capabilities).toEqual([]);
    });

    it('picker: ONE backup for the whole selection, created after the confirm', async () => {
      const LENS = 'pharn/pharn-review/n-plus-one';
      lensConfig([{ name: 'n-plus-one', role: 'lens' }]);
      await seedRecorded([PERSONA, `${LENS}/n-plus-one.md`]);
      write(join(proj, USER), 'mine A');
      write(join(proj, `${LENS}/MINE.md`), 'mine N');
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue([
        'lens:a11y',
        'lens:n-plus-one',
      ]);
      vi.mocked(prompts.confirm).mockImplementation(async () => {
        // The backup must not exist while the human is still being asked.
        expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
        return true;
      });

      await runRemove(undefined);

      expect(backedUp()).toEqual([USER, `${LENS}/MINE.md`].sort());
      expect(backupBytes(`${LENS}/MINE.md`)).toBe('mine N');
      expect(existsSync(join(proj, DIR))).toBe(false);
      expect(existsSync(join(proj, LENS))).toBe(false);
      expect(infoLines()).toContain('Backed up 2 file(s)');
    });

    it('picker: declining the confirm writes no backup', async () => {
      lensConfig();
      write(join(proj, USER), 'mine');
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue(['lens:a11y']);
      vi.mocked(prompts.confirm).mockResolvedValue(false);

      await expect(runRemove(undefined)).rejects.toMatchObject(
        new ProcessExit(0),
      );

      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      expect(existsSync(join(proj, USER))).toBe(true);
    });

    it('picker: a backup failure deletes NONE of the selection', async () => {
      const LENS = 'pharn/pharn-review/n-plus-one';
      lensConfig([{ name: 'n-plus-one', role: 'lens' }]);
      write(join(proj, USER), 'mine A');
      write(join(proj, `${LENS}/n.md`), 'N');
      const elsewhere = join(tmp.path(), 'elsewhere');
      mkdirSync(elsewhere, { recursive: true });
      symlinkSync(elsewhere, join(proj, '.pharn-backup'));
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue([
        'lens:a11y',
        'lens:n-plus-one',
      ]);
      vi.mocked(prompts.confirm).mockResolvedValue(true);

      await expect(runRemove(undefined)).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(existsSync(join(proj, USER))).toBe(true);
      expect(existsSync(join(proj, `${LENS}/n.md`))).toBe(true);
      expect(writePharnConfig).not.toHaveBeenCalled();
    });

    it.skipIf(process.platform === 'win32')(
      'a symlink inside the dir is removed as a link; its target is untouched and not backed up',
      async () => {
        lensConfig();
        await seedRecorded([PERSONA]);
        const outside = join(tmp.path(), 'outside.md');
        writeFileSync(outside, 'outside bytes');
        symlinkSync(outside, join(proj, DIR, 'link.md'));

        await runRemove('a11y');

        expect(existsSync(join(proj, DIR))).toBe(false);
        expect(readFileSync(outside, 'utf8')).toBe('outside bytes');
        expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      },
    );
  });
});
