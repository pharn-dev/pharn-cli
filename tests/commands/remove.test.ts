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
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { CANCEL, snapshotTree } from '../helpers.js';
import {
  at,
  backupFiles,
  config,
  exists,
  installFresh,
  interactive,
  logs,
  lastOutro,
  proj,
  read,
  records,
  run,
  SECURITY,
  SHA_V1,
  snapshot,
  useHarness,
  write,
} from '../support/harness.js';
import type { PharnConfig } from '../../src/types.js';
import { LEGACY_CONFIG_MESSAGE } from '../../src/lib/pharn-config.js';
import {
  readRecords,
  RECORDS_FILE,
  writeRecords,
} from '../../src/lib/install-records.js';
import { contentHash } from '../../src/lib/hash.js';
import { LOCK_FILE } from '../../src/lib/project-lock.js';
import { runAdd } from '../../src/commands/add.js';
import { runRemove } from '../../src/commands/remove.js';
import { CliError } from '../../src/lib/cli-error.js';
import { reportCliError } from '../../src/lib/report-error.js';

// A pass-through `node:fs` with ONE hook: run a callback right after the
// project lock file is created. On the named path that is the only moment
// between remove's early symlink walk and the one it repeats under the lock,
// so it is how a test swaps a parent for a link "while the run holds the lock"
// without reaching into src/.
const fsHooks = vi.hoisted(() => ({
  afterLockCreate: null as null | (() => void),
}));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const openSync = ((path: string, flags: string, mode?: number) => {
    const fd = real.openSync(path, flags, mode);
    if (flags === 'wx' && String(path).endsWith(`${sep}pharn${sep}.lock`)) {
      const hook = fsHooks.afterLockCreate;
      fsHooks.afterLockCreate = null;
      hook?.();
    }
    return fd;
  }) as typeof real.openSync;
  return { ...real, default: { ...real, openSync }, openSync };
});

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

type Cap = { name: string; role: 'griller' | 'lens'; source?: string };

const INSTALLED_AT = '2026-07-07T00:00:00.000Z';

/** A real archetype pharn.config.json, as an earlier install left it. */
function seedConfig(caps: Cap[], extra: Partial<PharnConfig> = {}): void {
  write(
    'pharn.config.json',
    `${JSON.stringify(
      {
        pharnVersion: '0.2.0',
        skillsVersion: '1.0.0',
        repo: 'pharn-dev/pharn-oss',
        commit: SHA_V1,
        modules: [],
        installedAt: INSTALLED_AT,
        archetypes: ['ssr'],
        capabilities: caps,
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Write each path with distinct bytes, then record the hashes that actually
 * landed (never a hash the test invented), stamped with the config's pair.
 */
async function seedStore(rels: string[]): Promise<void> {
  const files: Record<string, string> = {};
  for (const rel of rels) {
    if (!exists(rel)) write(rel, `${rel} pharn bytes`);
    files[rel] = contentHash(at(rel));
  }
  await writeRecords(proj(), { skillsVersion: '1.0.0', commit: SHA_V1, files });
}

const store = () => {
  const r = readRecords(proj());
  return r.kind === 'ok' ? r.store : null;
};
const storeBytes = (): string => read(RECORDS_FILE);
const errors = (): string => logs('error').join('\n');
const warnings = (): string => logs('warn').join('\n');
const outside = (name: string): string => join(proj(), '..', name);
/** Every path under a directory outside the project. */
const tree = (dir: string): string[] => snapshotTree(dir);

const FLAT_A11Y = 'pharn-pipeline/grillers/a11y/a11y.md';
const FLAT_LENS = 'pharn-review/n-plus-one/n-plus-one.md';

describe('pharn remove <name>', () => {
  it('remove <name> deletes that capability, its config entry and its records', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(exists('pharn/pharn-pipeline/grillers/a11y')).toBe(false);
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
    ]);
    const keys = Object.keys(records().files);
    expect(keys.filter((k) => k.includes('/a11y/'))).toEqual([]);
    expect(keys).toContain(SECURITY);
    // Every file was pharn's and unchanged, so nothing needed saving.
    expect(exists('pharn/.backup')).toBe(false);
    expect(exists(LOCK_FILE)).toBe(false);
  });

  it.each([
    {
      layout: 'flat' as const,
      arg: 'a11y',
      dir: 'pharn-pipeline/grillers/a11y',
      kept: FLAT_LENS,
    },
    {
      layout: 'pharn' as const,
      arg: 'lens:n-plus-one',
      dir: 'pharn/pharn-review/n-plus-one',
      kept: 'pharn/pharn-pipeline/grillers/a11y/a11y.md',
    },
  ])(
    'deletes only that directory at the recorded $layout layout, never asking',
    async ({ layout, arg, dir, kept }) => {
      const [gone] = arg === 'a11y' ? ['a11y'] : ['n-plus-one'];
      seedConfig(
        [
          { name: 'a11y', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ],
        layout === 'pharn' ? { layout } : {},
      );
      write(`${dir}/${gone}.md`, 'X');
      write(kept, 'K');

      // The NAMED path never confirms (the stub's confirm would throw).
      expect(await run(() => runRemove(arg))).toBeNull();

      expect(exists(dir)).toBe(false);
      expect(read(kept)).toBe('K');
      const cfg = config();
      expect(cfg.capabilities).toEqual(
        gone === 'a11y'
          ? [{ name: 'n-plus-one', role: 'lens' }]
          : [{ name: 'a11y', role: 'griller' }],
      );
      // A partial edit: archetypes and the first install's date carried (F-23).
      expect(cfg.archetypes).toEqual(['ssr']);
      expect(cfg.installedAt).toBe(INSTALLED_AT);
      expect(lastOutro()).toContain(`Removed ${gone}`);
    },
  );

  it('drops the config entry even when the capability dir is already gone', async () => {
    seedConfig([{ name: 'a11y', role: 'griller' }]);
    expect(await run(() => runRemove('a11y'))).toBeNull();
    expect(config().capabilities).toEqual([]);
    expect(lastOutro()).toContain('already gone');
  });

  it('a valid name deletes only <subtree>/<name>: the prefix sibling and the project survive', async () => {
    seedConfig(
      [
        { name: 'a11y', role: 'lens' },
        { name: 'a11y-extended', role: 'lens' },
      ],
      { layout: 'pharn' },
    );
    write('src/index.ts', 'code');
    write('pharn/pharn-review/a11y/a11y.md', 'A');
    write('pharn/pharn-review/a11y-extended/x.md', 'X');

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(exists('pharn/pharn-review/a11y')).toBe(false);
    expect(read('pharn/pharn-review/a11y-extended/x.md')).toBe('X');
    expect(read('src/index.ts')).toBe('code');
    expect(exists('.git')).toBe(true);
  });

  // F-38: a named remove of something not installed is an error, like
  // `pharn add bogus`. Every refusal here exits 1 and writes nothing.
  describe('refusals: exit 1, the whole project unchanged', () => {
    it.each([
      {
        label: 'a capability that is not installed',
        caps: [{ name: 'a11y', role: 'griller' }] as Cap[],
        arg: 'ghost',
        says: [
          '"ghost" is not an installed capability.',
          'Installed: griller:a11y.',
          'Nothing was removed.',
        ],
      },
      {
        label: 'any name when nothing is installed',
        caps: [] as Cap[],
        arg: 'ghost',
        says: ['No capabilities are installed.'],
      },
      {
        label: 'a name installed in both roles (ambiguous)',
        caps: [
          { name: 'dup', role: 'griller' },
          { name: 'dup', role: 'lens' },
        ] as Cap[],
        arg: 'dup',
        says: ['dup'],
      },
      {
        label: 'an invalid role prefix',
        caps: [{ name: 'a11y', role: 'griller' }] as Cap[],
        arg: 'bogus:a11y',
        says: ['bogus'],
      },
    ])('$label', async ({ caps, arg, says }) => {
      seedConfig(caps);
      write(FLAT_A11Y, 'A');
      await seedStore([FLAT_A11Y]);
      const before = snapshot();

      expect(await run(() => runRemove(arg))).toBe(1);

      expect(snapshot()).toEqual(before);
      for (const s of says) expect(errors()).toContain(s);
      expect(vi.mocked(clack.log.error).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
      expect(clack.outro).not.toHaveBeenCalled();
    });

    it.each([
      ['no config', null, 'No pharn.config.json found'],
      [
        'a legacy (module) config',
        { skillsVersion: '0.68.0', modules: [{ name: 'pharn-core' }] },
        LEGACY_CONFIG_MESSAGE,
      ],
    ] as const)('%s', async (_label, cfg, says) => {
      if (cfg) write('pharn.config.json', JSON.stringify(cfg));
      const before = snapshot();
      expect(await run(() => runRemove('a11y'))).toBe(1);
      expect(snapshot()).toEqual(before);
      expect(errors()).toContain(says);
    });

    // PHARN-01: a hand-edited capability name must never steer the delete.
    // The config loader refuses it at ingest, before anything is addressed.
    it.each([['../..'], ['../../src'], ['..'], ['.']])(
      'a config entry named %j',
      async (name) => {
        seedConfig([{ name, role: 'lens' }], { layout: 'pharn' });
        write('src/index.ts', 'code');
        write('pharn/pharn-review/a11y/a11y.md', 'A');
        const before = snapshot();

        expect(await run(() => runRemove(name))).toBe(1);

        expect(snapshot()).toEqual(before);
      },
    );
  });

  // PHARN-02: never delete through a symlinked project directory.
  it.each([['pharn'], ['pharn/pharn-review'], ['pharn/pharn-review/a11y']])(
    'refuses (exit 1) when %s is a symlink out of the project; outside files survive',
    async (link) => {
      seedConfig([{ name: 'a11y', role: 'lens' }], { layout: 'pharn' });
      const target = outside('shared/x');
      const rest = relative(link, 'pharn/pharn-review/a11y');
      mkdirSync(join(target, rest), { recursive: true });
      writeFileSync(join(target, rest, 'NOTES.md'), 'USER NOTES');
      mkdirSync(join(at(link), '..'), { recursive: true });
      symlinkSync(target, at(link));
      const before = tree(outside('shared'));
      const cfg = read('pharn.config.json');

      expect(await run(() => runRemove('a11y'))).toBe(1);

      expect(tree(outside('shared'))).toEqual(before);
      expect(read('pharn.config.json')).toBe(cfg);
      expect(errors()).toContain(`${link} is a symbolic link`);
    },
  );

  // F-20: the symlink walk is repeated UNDER the lock. A parent swapped for a
  // link after the early walk is still refused, nothing is deleted, and the
  // lock is released.
  it('a parent swapped to a symlink after the early check is refused under the lock', async () => {
    seedConfig([{ name: 'a11y', role: 'lens' }], { layout: 'pharn' });
    write('pharn/pharn-review/a11y/a11y.md', 'PHARN');
    const shared = outside('shared');
    mkdirSync(join(shared, 'a11y'), { recursive: true });
    writeFileSync(join(shared, 'a11y/NOTES.md'), 'USER NOTES');
    fsHooks.afterLockCreate = () => {
      rmSync(at('pharn/pharn-review'), { recursive: true });
      symlinkSync(shared, at('pharn/pharn-review'));
    };
    const before = tree(shared);
    const cfg = read('pharn.config.json');

    expect(await run(() => runRemove('a11y'))).toBe(1);

    expect(fsHooks.afterLockCreate).toBeNull();
    expect(tree(shared)).toEqual(before);
    expect(read('pharn.config.json')).toBe(cfg);
    expect(exists(LOCK_FILE)).toBe(false);
    expect(exists('pharn/.backup')).toBe(false);
    expect(errors()).toContain('pharn/pharn-review is a symbolic link');
  });

  // `remove` has no --yes, and needs none on this path: there is no prompt.
  it('the auto re-add warning is derived from the stored source alone', async () => {
    seedConfig([
      { name: 'a11y', role: 'griller', source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
      { name: 'legacy', role: 'lens' },
    ]);
    write(FLAT_A11Y, 'A');
    write(FLAT_LENS, 'N');
    write('pharn-review/legacy/legacy.md', 'L');

    expect(await run(() => runRemove('a11y'))).toBeNull();
    // F-09: it names when the capability really comes back — not the next
    // update, which may early-return at the same version.
    expect(warnings()).toContain('a11y');
    expect(warnings()).not.toContain('the next `pharn update` will');
    expect(warnings()).toContain('a new pharn-oss version');
    expect(warnings()).toContain(
      'may answer "Already up to date" and leave it removed',
    );
    expect(warnings()).toContain('`pharn update --force` reinstalls it now');
    // Every surviving entry's `source` is untouched.
    expect(config().capabilities).toEqual([
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
      { name: 'legacy', role: 'lens' },
    ]);

    // A manual entry, and an ABSENT source (legacy — never read as auto):
    // silence, since a false warning is worse than none.
    for (const name of ['n-plus-one', 'legacy']) {
      vi.mocked(clack.log.warn).mockClear();
      expect(await run(() => runRemove(name))).toBeNull();
      expect(warnings()).not.toContain('pharn update');
    }
  });
});

describe('pharn remove (the picker)', () => {
  function seedTwo(layout?: 'pharn'): void {
    seedConfig(
      [
        { name: 'a11y', role: 'griller', source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ],
      layout ? { layout } : {},
    );
    write(FLAT_A11Y, 'A');
    write(FLAT_LENS, 'N');
  }

  it('multi-selects, confirms once (default No), deletes each pick and writes the config once', async () => {
    seedTwo();
    interactive({
      groupMultiselect: [['griller:a11y', 'lens:n-plus-one']],
      confirm: [true],
    });

    expect(await run(() => runRemove(undefined))).toBeNull();

    expect(exists('pharn-pipeline/grillers/a11y')).toBe(false);
    expect(exists('pharn-review/n-plus-one')).toBe(false);
    expect(config().capabilities).toEqual([]);
    expect(config().installedAt).toBe(INSTALLED_AT);
    expect(clack.confirm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(clack.confirm).mock.calls[0]![0]).toMatchObject({
      initialValue: false,
    });
    // One warning, naming only the auto pick.
    expect(warnings()).toContain('a11y');
    expect(warnings()).not.toContain('n-plus-one');
  });

  it.each([
    ['cancelled at the multi-select', [CANCEL], [], 0, null],
    [
      'an empty selection',
      [[]],
      [],
      null,
      'Nothing selected. No capabilities were removed.',
    ],
    ['the confirm declined', [['griller:a11y']], [false], 0, null],
    ['the confirm cancelled', [['griller:a11y']], [CANCEL], 0, null],
  ] as const)(
    '%s: removes nothing and writes nothing',
    async (_label, picks, confirms, code, outro) => {
      seedTwo();
      await seedStore([FLAT_A11Y, FLAT_LENS]);
      const before = snapshot();
      interactive({
        groupMultiselect: [...picks],
        confirm: [...confirms],
      });

      expect(await run(() => runRemove(undefined))).toBe(code);

      expect(snapshot()).toEqual(before);
      if (outro) expect(lastOutro()).toBe(outro);
    },
  );

  it('off a TTY: exit 1 without prompting', async () => {
    seedTwo();
    const before = snapshot();
    expect(await run(() => runRemove(undefined))).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(clack.groupMultiselect).not.toHaveBeenCalled();
  });

  it('reports nothing installed without prompting, even off a TTY', async () => {
    seedConfig([]);
    expect(await run(() => runRemove(undefined))).toBeNull();
    expect(lastOutro()).toBe('No capabilities are installed.');
  });

  it('one unsafe pick refuses the WHOLE selection before the confirm', async () => {
    seedConfig([
      { name: 'a11y', role: 'lens' },
      { name: 'a11y', role: 'griller' },
    ]);
    write(FLAT_A11Y, 'SAFE');
    const shared = outside('shared');
    mkdirSync(join(shared, 'a11y'), { recursive: true });
    writeFileSync(join(shared, 'a11y/NOTES.md'), 'USER NOTES');
    symlinkSync(shared, at('pharn-review'));
    // No confirm is scripted: reaching it would fail the test.
    interactive({ groupMultiselect: [['griller:a11y', 'lens:a11y']] });

    expect(await run(() => runRemove(undefined))).toBe(1);

    expect(read(FLAT_A11Y)).toBe('SAFE');
    expect(existsSync(join(shared, 'a11y/NOTES.md'))).toBe(true);
    expect(config().capabilities).toHaveLength(2);
  });

  it('a parent swapped to a symlink while the confirm is open is refused under the lock', async () => {
    seedTwo();
    const shared = outside('shared');
    mkdirSync(join(shared, 'n-plus-one'), { recursive: true });
    writeFileSync(join(shared, 'n-plus-one/NOTES.md'), 'USER NOTES');
    interactive({ groupMultiselect: [['griller:a11y', 'lens:n-plus-one']] });
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      rmSync(at('pharn-review'), { recursive: true });
      symlinkSync(shared, at('pharn-review'));
      return true;
    });
    const before = tree(shared);

    expect(await run(() => runRemove(undefined))).toBe(1);

    expect(tree(shared)).toEqual(before);
    // The WHOLE selection is refused: the safe pick is not deleted either.
    expect(read(FLAT_A11Y)).toBe('A');
    expect(config().capabilities).toHaveLength(2);
    expect(exists(LOCK_FILE)).toBe(false);
    expect(errors()).toContain('pharn-review is a symbolic link');
  });
});

// The prune is a key-PREFIX filter over the store, never a walk of the
// directory (which is empty before AND after on the "already gone" path).
describe('pharn remove prunes pharn.records.json', () => {
  const NESTED = 'pharn-pipeline/grillers/a11y/evals/cases/basic.md';
  // The prefix neighbour: identical up to the directory separator.
  const EXTENDED = 'pharn-pipeline/grillers/a11y-extended/a11y-extended.md';
  const DOC = 'CONSTITUTION.md';

  function seedCaps(...extra: Cap[]): void {
    seedConfig([{ name: 'a11y', role: 'griller', source: 'auto' }, ...extra]);
  }

  it('drops every record under the removed capability — nested ones too — and no other, keeping the stamp', async () => {
    seedCaps(
      { name: 'n-plus-one', role: 'lens' },
      { name: 'a11y-extended', role: 'griller' },
    );
    await seedStore([FLAT_A11Y, NESTED, FLAT_LENS, EXTENDED, DOC]);
    const survivors = Object.fromEntries(
      [FLAT_LENS, EXTENDED, DOC].map((rel) => [rel, contentHash(at(rel))]),
    );

    expect(await run(() => runRemove('a11y'))).toBeNull();

    // The trailing slash is load-bearing: a11y-extended keeps its record
    // and its files.
    expect(store()!.files).toEqual(survivors);
    expect(exists('pharn-pipeline/grillers/a11y-extended')).toBe(true);
    // `remove` advances neither half of the stamp.
    expect(store()).toMatchObject({
      schemaVersion: 1,
      skillsVersion: '1.0.0',
      commit: SHA_V1,
    });
  });

  it('prunes the records even when the capability files were already gone', async () => {
    seedCaps();
    await seedStore([FLAT_A11Y, NESTED, DOC]);
    const docHash = contentHash(at(DOC));
    rmSync(at('pharn-pipeline/grillers/a11y'), { recursive: true });

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(store()!.files).toEqual({ [DOC]: docHash });
    expect(config().capabilities).toEqual([]);
    expect(lastOutro()).toContain('already gone');
  });

  // CORE-161: the stamp does not gate, so a store stamped for another install
  // state is still pharn's to prune — re-stamped with the config's pair.
  it('prunes a stale-stamped store, re-stamped with the config pair', async () => {
    seedCaps();
    await seedStore([FLAT_A11Y, DOC]);
    const docHash = contentHash(at(DOC));
    const skewed = JSON.parse(storeBytes()) as { skillsVersion: string };
    skewed.skillsVersion = '9.9.9';
    write(RECORDS_FILE, `${JSON.stringify(skewed, null, 2)}\n`);

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(store()).toMatchObject({
      skillsVersion: '1.0.0',
      files: { [DOC]: docHash },
    });
    expect(exists('pharn-pipeline/grillers/a11y')).toBe(false);
    expect(warnings()).toContain('pharn update');
  });

  it.each([
    ['absent stays absent — never minted', null],
    ['a corrupt store is never rewritten', 'not json{'],
  ])('%s', async (_label, bytes) => {
    seedCaps();
    write(FLAT_A11Y, 'A');
    if (bytes) write(RECORDS_FILE, bytes);

    expect(await run(() => runRemove('a11y'))).toBeNull();

    if (bytes) expect(storeBytes()).toBe(bytes);
    else expect(readRecords(proj())).toEqual({ kind: 'absent' });
    // The removal itself still happened.
    expect(exists('pharn-pipeline/grillers/a11y')).toBe(false);
  });

  it('writes nothing when the capability has no records', async () => {
    seedCaps({ name: 'n-plus-one', role: 'lens' });
    write(FLAT_A11Y, 'A');
    write(FLAT_LENS, 'N');
    // Seeded COMPACT: any write would re-emit it 2-space indented, so equal
    // bytes prove the write was skipped.
    write(
      RECORDS_FILE,
      JSON.stringify({
        schemaVersion: 1,
        skillsVersion: '1.0.0',
        commit: SHA_V1,
        files: { [FLAT_LENS]: contentHash(at(FLAT_LENS)) },
      }),
    );
    const before = storeBytes();

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(storeBytes()).toBe(before);
    expect(config().capabilities).toEqual([
      { name: 'n-plus-one', role: 'lens' },
    ]);
  });

  it('the picker prunes every pick in one store write', async () => {
    seedCaps({ name: 'n-plus-one', role: 'lens' });
    await seedStore([FLAT_A11Y, NESTED, FLAT_LENS, DOC]);
    const docHash = contentHash(at(DOC));
    interactive({
      groupMultiselect: [['griller:a11y', 'lens:n-plus-one']],
      confirm: [true],
    });

    expect(await run(() => runRemove(undefined))).toBeNull();

    expect(store()!.files).toEqual({ [DOC]: docHash });
  });
});

// F-01: `remove` deletes the WHOLE capability directory. Anything in it pharn
// cannot prove it wrote unchanged (a usable store holding its key at its
// current hash) is copied to pharn/.backup/<ts>/ FIRST.
describe('pharn remove backs up before it deletes', () => {
  const DIR = 'pharn/pharn-review/a11y';
  const PERSONA = `${DIR}/a11y.md`;
  const CASE = `${DIR}/evals/cases/basic.md`;
  const USER = `${DIR}/notes/USER.md`;
  const LENS = 'pharn/pharn-review/n-plus-one';
  const infos = (): string =>
    vi
      .mocked(clack.log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  function lensConfig(...extra: Cap[]): void {
    seedConfig([{ name: 'a11y', role: 'lens' }, ...extra], { layout: 'pharn' });
  }

  it('a user file and an edited recorded file are backed up byte-identical; an unchanged one is not', async () => {
    lensConfig();
    await seedStore([PERSONA, CASE]);
    write(USER, 'MY NOTES — not pharn');
    write(PERSONA, 'my edit to the persona');

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(exists(DIR)).toBe(false);
    expect(backupFiles().sort()).toEqual([PERSONA, USER].sort());
    const ts = readdirSync(at('pharn/.backup'))[0]!;
    expect(read(`pharn/.backup/${ts}/${USER}`)).toBe('MY NOTES — not pharn');
    expect(read(`pharn/.backup/${ts}/${PERSONA}`)).toBe(
      'my edit to the persona',
    );
    expect(infos()).toMatch(
      /^Backed up 2 file\(s\) to pharn\/\.backup\/\d{8}-\d{6} before removing\.$/m,
    );
    // F-40: the same .gitignore advice every backup notice carries.
    expect(infos()).toContain(
      'pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.',
    );
    expect(config().capabilities).toEqual([]);
  });

  it.each([
    ['every file is recorded and unchanged', 'lf'],
    ['recorded files were re-checked-out with CRLF (F-16)', 'crlf'],
    ['the store is stamped for another install state (CORE-161)', 'stale'],
    ['the directory is already gone', 'gone'],
  ])('%s → no backup and no notice', async (_label, kind) => {
    lensConfig();
    if (kind === 'crlf') {
      // pharn wrote (and recorded) LF; a core.autocrlf=true checkout made CRLF.
      for (const rel of [PERSONA, CASE]) write(rel, `${rel}\npharn bytes\n`);
      await seedStore([PERSONA, CASE]);
      for (const rel of [PERSONA, CASE])
        write(rel, `${rel}\r\npharn bytes\r\n`);
    } else if (kind !== 'gone') {
      await seedStore([PERSONA, CASE]);
    }
    if (kind === 'stale') {
      const raw = JSON.parse(storeBytes()) as { commit: string };
      raw.commit = '9'.repeat(40);
      write(RECORDS_FILE, JSON.stringify(raw));
    }

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(exists(DIR)).toBe(false);
    expect(exists('pharn/.backup')).toBe(false);
    expect(infos()).not.toContain('Backed up');
    expect(config().capabilities).toEqual([]);
  });

  it('no record store → every file in the dir is backed up', async () => {
    lensConfig();
    write(PERSONA, 'P');
    write(CASE, 'C');

    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(backupFiles().sort()).toEqual([CASE, PERSONA].sort());
    expect(infos()).toContain('Backed up 2 file(s)');
  });

  it.skipIf(process.platform === 'win32')(
    'a symlink inside the dir is removed as a link; its target is untouched and not backed up',
    async () => {
      lensConfig();
      await seedStore([PERSONA]);
      const target = outside('outside.md');
      writeFileSync(target, 'outside bytes');
      symlinkSync(target, at(`${DIR}/link.md`));

      expect(await run(() => runRemove('a11y'))).toBeNull();

      expect(exists(DIR)).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe('outside bytes');
      expect(exists('pharn/.backup')).toBe(false);
    },
  );

  it.each([
    ['pharn/.backup is a symlink', 'symlink'],
    ['a scanned file cannot be read', 'unreadable'],
  ])(
    'a backup failure (%s) → exit 1, NOTHING deleted, config and records unchanged',
    async (_label, kind) => {
      if (kind === 'unreadable' && process.getuid?.() === 0) return;
      lensConfig();
      await seedStore([PERSONA, CASE]);
      write(USER, 'MY NOTES');
      if (kind === 'symlink') {
        mkdirSync(outside('elsewhere'));
        symlinkSync(outside('elsewhere'), at('pharn/.backup'));
      } else {
        // A recorded file that cannot be read cannot be proven unchanged.
        chmodSync(at(PERSONA), 0o000);
      }
      const recordsBefore = storeBytes();
      const configBefore = read('pharn.config.json');

      try {
        expect(await run(() => runRemove('a11y'))).toBe(1);
      } finally {
        if (kind === 'unreadable') chmodSync(at(PERSONA), 0o600);
      }

      for (const rel of [USER, PERSONA, CASE]) expect(exists(rel)).toBe(true);
      expect(read('pharn.config.json')).toBe(configBefore);
      expect(storeBytes()).toBe(recordsBefore);
      expect(errors()).toContain('Nothing was removed');
      expect(errors()).toContain('a11y');
      expect(exists(LOCK_FILE)).toBe(false);
    },
  );

  it('picker: ONE backup for the whole selection, created after the confirm', async () => {
    lensConfig({ name: 'n-plus-one', role: 'lens' });
    await seedStore([PERSONA, `${LENS}/n-plus-one.md`]);
    write(USER, 'mine A');
    write(`${LENS}/MINE.md`, 'mine N');
    interactive({ groupMultiselect: [['lens:a11y', 'lens:n-plus-one']] });
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      // The backup must not exist while the human is still being asked.
      expect(exists('pharn/.backup')).toBe(false);
      return true;
    });

    expect(await run(() => runRemove(undefined))).toBeNull();

    expect(backupFiles().sort()).toEqual([USER, `${LENS}/MINE.md`].sort());
    expect(exists(DIR)).toBe(false);
    expect(exists(LENS)).toBe(false);
    expect(infos()).toContain('Backed up 2 file(s)');
  });

  it('picker: a backup failure deletes NONE of the selection', async () => {
    lensConfig({ name: 'n-plus-one', role: 'lens' });
    write(USER, 'mine A');
    write(`${LENS}/n.md`, 'N');
    mkdirSync(outside('elsewhere'));
    symlinkSync(outside('elsewhere'), at('pharn/.backup'));
    const configBefore = read('pharn.config.json');
    interactive({
      groupMultiselect: [['lens:a11y', 'lens:n-plus-one']],
      confirm: [true],
    });

    expect(await run(() => runRemove(undefined))).toBe(1);

    expect(exists(USER)).toBe(true);
    expect(exists(`${LENS}/n.md`)).toBe(true);
    expect(read('pharn.config.json')).toBe(configBefore);
  });
});

// THE ONE EXIT POINT: remove never exits and never prints its own ending. A
// refusal and a cancel reject with a CliError carrying the exit code, and the
// line the user sees comes out once, from the top-level reporter.
describe('pharn remove ends through a CliError', () => {
  const thrown = (p: Promise<void>): Promise<unknown> =>
    p.then(
      () => null,
      (err: unknown) => err,
    );

  it('a refusal (not installed): CliError exit 1, its one error line printed by reportCliError', async () => {
    seedConfig([{ name: 'a11y', role: 'griller' }]);
    const before = snapshot();
    const err = await thrown(runRemove('bogus'));
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ exitCode: 1 });
    expect(logs('error')).toEqual([]);
    expect(reportCliError(err)).toBe(1);
    expect(logs('error')).toEqual([
      '"bogus" is not an installed capability. Installed: griller:a11y. Nothing was removed.',
    ]);
    expect(snapshot()).toEqual(before);
  });

  it('a cancel (the multi-select cancelled): CliError exit 0, one "Cancelled" line', async () => {
    seedConfig([{ name: 'a11y', role: 'griller' }]);
    interactive({ groupMultiselect: [CANCEL] });
    const err = await thrown(runRemove(undefined));
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ exitCode: 0 });
    const cancelled = (): string[] =>
      logs('info').filter((l) => l.includes('Cancelled. Nothing was changed.'));
    expect(cancelled()).toEqual([]);
    expect(reportCliError(err)).toBe(0);
    expect(cancelled()).toHaveLength(1);
  });
});
