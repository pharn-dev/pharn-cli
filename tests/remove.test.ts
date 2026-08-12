import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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
// NOT mocked — the record store runs for real against the test cwd, so every
// assertion below is about bytes that actually landed on disk.
const { readRecords, writeRecords, RECORDS_FILE } =
  await import('../src/lib/install-records.js');
const { sha256File } = await import('../src/lib/hash.js');

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

  // -------------------------------------------------------------------------
  // Record-store pruning (real filesystem). `remove` must drop the removed
  // capability's entries from pharn.records.json — otherwise it is the one write
  // path that leaves records describing bytes that are gone, and they linger
  // until the next `update` prunes them via its manifest.
  //
  // The prune is a key-PREFIX filter over the store, never a filesystem walk:
  // install-records' capabilityRecordPaths enumerates the DEST dir and returns []
  // once it is gone — true both after the delete and, on the "already gone" path,
  // before it. The `already gone` case below is what settles that design.
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
        files[rel] = sha256File(join(proj, rel));
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
        [LENS]: sha256File(join(proj, LENS)),
        [DOC]: sha256File(join(proj, DOC)),
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
      const extendedHash = sha256File(join(proj, EXTENDED));

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
      const docHash = sha256File(join(proj, DOC));
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
          files: { [LENS]: sha256File(join(proj, LENS)) },
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
      const docHash = sha256File(join(proj, DOC));
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

      await runRemove('ghost');

      expect(storeBytes()).toBe(before);
      expect(writePharnConfig).not.toHaveBeenCalled();
    });
  });
});
