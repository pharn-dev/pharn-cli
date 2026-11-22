import {
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { CANCEL } from '../helpers.js';
import {
  A11Y,
  at,
  backupFiles,
  clearOutput,
  config,
  editConfig,
  exists,
  failures,
  fetched,
  fetchStub,
  installFresh,
  interactive,
  lastOutro,
  logs,
  manifestTree,
  N_PLUS_ONE,
  read,
  records,
  RELEASE_URL,
  RESOLVE_URL,
  legacyInstall,
  run,
  sealRepo,
  serveTip,
  sha256,
  SHA_V1,
  SHA_V1_LATER,
  SHA_V2,
  snapshot,
  stderr,
  stdout,
  upstream,
  useHarness,
  watchClones,
  write,
  serveRefusedDest,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { resolveAddPicker, type AddOne } from '../../src/steps/add-picker.js';
import { runStatus } from '../../src/commands/status.js';

// A pass-through `node:fs` with one hook on `openSync`, so a case can change
// the project at the instant the writer creates its first temp file — after
// every pre-flight — the way a concurrent process would.
const fsHooks = vi.hoisted(() => ({
  open: null as null | ((path: string, flags: unknown) => void),
}));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const openSync = ((path: string, flags: unknown, ...rest: unknown[]) => {
    fsHooks.open?.(String(path), flags);
    return (real.openSync as (...a: unknown[]) => number)(path, flags, ...rest);
  }) as typeof real.openSync;
  return { ...real, default: { ...real, openSync }, openSync };
});

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();
afterEach(() => {
  fsHooks.open = null;
});

// Every case seeds a real install (`init --yes`: `lib`, so only the universal
// griller `security` is selected; layout `pharn`; channel `latest`; a records
// store) and then runs the REAL `runAdd` against it. Version and layout
// mismatches come from what the stubbed network serves, never from a stub of
// the CLI's own readers.

const HINT = 'Re-run with PHARN_DEBUG=1 for full error output.';
const errors = (): string => [...logs('error'), ...stderr()].join('\n');
const warnings = (): string => logs('warn').join('\n');
const infos = (): string => logs('info').join('\n');

// A nested file under the a11y capability, so a symlinked INTERMEDIATE
// directory (`a11y/evals`) can sit between the capability root and a file the
// copy writes.
const A11Y_DIR = 'pharn/pharn-pipeline/grillers/a11y';
const A11Y_EVAL = `${A11Y_DIR}/evals/cases/basic.md`;
const shipA11yEval = (): void => {
  upstream.tree[A11Y_EVAL] = 'a11y eval upstream\n';
};
/** `a11y/evals` in the project is a symlink to a directory outside the capability. */
function plantSymlinkedEvals(): void {
  write('elsewhere/basic.md', 'BYTES OUTSIDE THE CAPABILITY\n');
  mkdirSync(at(A11Y_DIR), { recursive: true });
  symlinkSync(at('elsewhere'), at(`${A11Y_DIR}/evals`));
}

// An upstream capability whose `applies` token this pharn does not know: the
// index reports it (`unknown`), and it is not addressable.
const BACKWARDS =
  'pharn/pharn-pipeline/grillers/backwards-compat/backwards-compat.md';
const UNPARSEABLE = '---\nrole: griller\napplies: ["mobile"]\n---\nwip\n';

// A name upstream ships in BOTH roles.
function shipDupInBothRoles(): void {
  upstream.tree['pharn/pharn-pipeline/grillers/dup/dup.md'] =
    '---\nrole: griller\napplies: ["backend"]\n---\ndup griller\n';
  upstream.tree['pharn/pharn-review/dup/dup.md'] =
    '---\nrole: lens\napplies: ["backend"]\n---\ndup lens\n';
}

describe('pharn add <name>: success', () => {
  it('installs one capability at the recorded layout, as manual, and the readers agree', async () => {
    await installFresh();
    const { installedAt, archetypes } = config();
    expect(await run(() => runAdd('a11y'))).toBeNull();

    expect(read(A11Y)).toContain('a11y');
    expect(exists('pharn-pipeline/grillers/a11y')).toBe(false);
    const cfg = config();
    expect(cfg.capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'a11y', role: 'griller', source: 'manual' },
    ]);
    // A partial edit: archetypes, installedAt and the version are carried.
    expect(cfg.archetypes).toEqual(archetypes);
    expect(cfg.installedAt).toBe(installedAt);
    expect(cfg.skillsVersion).toBe('1.0.0');
    const rec = records();
    expect(rec.files[A11Y]).toBe(sha256(A11Y));
    expect(rec.skillsVersion).toBe('1.0.0');
    expect(lastOutro()).toBe('✔ Added a11y (skills v1.0.0)');
    // The channel the config records (`latest`): the release, never the tip.
    expect(fetched()).toContain(RELEASE_URL);
    expect(fetched()).not.toContain(RESOLVE_URL);

    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout().at(-1) ?? '') as {
      capabilities: { count: number };
      drift: { modified: string[]; missing: string[] } | null;
    };
    expect(report.capabilities.count).toBe(2);
    expect(report.drift?.modified).toEqual([]);
    expect(report.drift?.missing).toEqual([]);
  });

  // CORE-189: the fields older CLIs wrote are out of the public type, yet an
  // old config carrying them (`modules` too) still loads, and `add` drops them.
  it('keeps loading the legacy fields an older CLI wrote, and init no longer writes modules', async () => {
    await installFresh();
    // 0.20.x was the last CLI that wrote it.
    expect(config()).not.toHaveProperty('modules');
    const legacy = {
      modules: [],
      constitution: 'minimal',
      isMultiTenant: false,
      stackAnswers: { db: 'postgres' },
      installedSkills: [{ skill: 'x', from: 'y' }],
    };
    editConfig((c) => Object.assign(c, legacy));

    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(Object.keys(config()).filter((k) => k in legacy)).toEqual([]);
    expect(await run(() => runStatus({ json: true }))).toBeNull();
  });

  // pharn-install.json declares each capability name once, so a name in both
  // roles never reaches the address resolver: the manifest refuses the tree.
  it('a name upstream ships in both roles is refused by its pharn-install.json, writing nothing', async () => {
    await installFresh();
    shipDupInBothRoles();
    const before = snapshot();

    expect(await run(() => runAdd('lens:dup'))).toBe(1);
    expect(errors()).toContain('declares capability "dup" twice');
    expect(snapshot()).toEqual(before);
  });

  it('is a no-op for a capability already installed: nothing written', async () => {
    await installFresh();
    const before = snapshot();
    expect(await run(() => runAdd('griller:security'))).toBeNull();
    expect(lastOutro()).toBe('security is already installed.');
    expect(snapshot()).toEqual(before);
  });

  it('follows the tip of main when the config records no channel', async () => {
    await installFresh({ ref: 'main' });
    fetchStub.mockClear();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(fetched()).toContain(RESOLVE_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    expect(read(A11Y)).toContain('a11y');
  });

  it('refreshes commit but never skillsVersion on a same-version commit, and re-stamps the store with it', async () => {
    await installFresh();
    serveTip(SHA_V1_LATER, '1.0.0');
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(config()).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1_LATER,
    });
    expect(records()).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1_LATER,
    });
  });

  it('installs at a pendingSkillsVersion, keeping the config’s own version and commit', async () => {
    await installFresh();
    editConfig((c) => {
      c.pendingSkillsVersion = '1.1.0';
    });
    serveTip(SHA_V2, '1.1.0');
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(config()).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1,
      pendingSkillsVersion: '1.1.0',
    });
    expect(records()).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    expect(records().files[A11Y]).toBe(sha256(A11Y));
  });

  it('warns about an upstream capability it cannot parse and still installs the rest', async () => {
    upstream.tree[BACKWARDS] = UNPARSEABLE;
    await installFresh();
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(warnings()).toContain('backwards-compat');
    expect(read(A11Y)).toContain('a11y');
  });

  it('a MIN_CLI that is not a version warns and does not block the install', async () => {
    await installFresh();
    upstream.tree.MIN_CLI = 'not-a-version\n';
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(warnings()).toContain('MIN_CLI in the fetched repo is not a valid');
    expect(read(A11Y)).toContain('a11y');
  });

  it('extends no records store it cannot use: absent stays absent, corrupt stays byte-identical', async () => {
    await installFresh();
    rmSync(at('pharn.records.json'));
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(exists('pharn.records.json')).toBe(false);

    write('pharn.records.json', 'not json{');
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    expect(read('pharn.records.json')).toBe('not json{');
    expect(config().capabilities.map((c) => c.name)).toEqual([
      'security',
      'a11y',
      'n-plus-one',
    ]);
  });
});

describe('pharn add <name>: refusals (exit 1, nothing written)', () => {
  interface Refusal {
    name: string;
    /** Runs after `init --yes`, before the snapshot. */
    setup: () => void;
    arg: string;
    error: string[];
    notError?: string[];
    /** A caught exception earns the PHARN_DEBUG hint; a curated refusal not. */
    hint?: boolean;
    /** Whether the run got as far as downloading the tarball. */
    download: boolean;
  }

  const rows: Refusal[] = [
    {
      name: 'an unknown name, listing the valid addresses',
      setup: () => undefined,
      arg: 'bogus',
      error: [
        'Unknown capability "bogus". Valid capabilities:\n  griller:a11y\n  griller:security\n  lens:n-plus-one',
      ],
      download: true,
    },
    {
      name: 'an invalid role prefix, before any network call',
      setup: () => undefined,
      arg: 'bogus:x',
      error: ['Unknown role "bogus". Use griller:<name> or lens:<name>.'],
      download: false,
    },
    {
      name: 'a capability upstream ships but this CLI cannot parse',
      setup: () => {
        upstream.tree[BACKWARDS] = UNPARSEABLE;
      },
      arg: 'backwards-compat',
      error: ['Unknown capability "backwards-compat"'],
      download: true,
    },
    {
      name: 'a clone at a newer version: names update, --dry-run and both ways out',
      setup: () => serveTip(SHA_V2, '2.0.0'),
      arg: 'a11y',
      error: [
        'Skills version mismatch: pharn.config.json records v1.0.0, but the fetched',
        'is at v2.0.0',
        'Run `pharn update` to move it to v2.0.0',
        '`pharn update --dry-run`',
        'revert those files',
        '`pharn update --force`',
        'then re-run `pharn add`',
      ],
      download: true,
    },
    {
      name: 'the version gate fires before the already-installed no-op',
      setup: () => serveTip(SHA_V2, '2.0.0'),
      arg: 'security',
      error: ['Skills version mismatch'],
      download: true,
    },
    {
      name: 'a third version beside a pending one, named as partial',
      setup: () => {
        editConfig((c) => {
          c.pendingSkillsVersion = '1.1.0';
        });
        serveTip(SHA_V2, '1.2.0');
      },
      arg: 'a11y',
      error: [
        'records v1.0.0 (partly at v1.1.0)',
        'is at v1.2.0',
        '`pharn update --dry-run`',
        '`pharn update --force`',
      ],
      download: true,
    },
    {
      name: 'an install ahead of the latest release: names --ref main, not update',
      setup: () => serveTip(SHA_V2, '0.9.0'),
      arg: 'a11y',
      error: [
        'Your install (skills v1.0.0) is ahead of the latest verified',
        '(v0.9.0)',
        '`pharn update --ref main`',
      ],
      notError: ['Run `pharn update` to move it'],
      download: true,
    },
    {
      name: 'main moved back below the install: names --force, not update first',
      setup: () => {
        editConfig((c) => {
          delete c.ref;
        });
        serveTip(SHA_V2, '0.9.0');
      },
      arg: 'a11y',
      error: [
        'is newer than',
        'main (v0.9.0) — pharn-oss main has moved back',
        '`pharn update --force` to downgrade to v0.9.0',
      ],
      notError: ['Run `pharn update` to move it'],
      download: true,
    },
    {
      // v0.21.0: no layout gate — a flat install is refused at load with
      // "re-run `pharn init`", before any download.
      name: 'a clone at another layout (flat project, pharn clone)',
      setup: () => legacyInstall('flat'),
      arg: 'a11y',
      error: [
        'This project is installed at the flat layout',
        'removed in v0.21.0',
        'Re-run `pharn init`',
      ],
      notError: ['Install layout mismatch'],
      download: false,
    },
    {
      name: 'an absent layout field reads as flat, so a pharn clone is refused',
      setup: () =>
        editConfig((c) => {
          delete (c as { layout?: string }).layout;
        }),
      arg: 'a11y',
      error: ['This project is installed at the flat layout', 'pharn init'],
      download: false,
    },
    {
      name: 'version AND layout mismatch: the version refusal wins',
      setup: () => {
        legacyInstall('flat');
        serveTip(SHA_V2, '2.0.0');
      },
      arg: 'a11y',
      // v0.21.0: the flat config is refused at load, before the version gate.
      error: ['This project is installed at the flat layout'],
      notError: ['Skills version mismatch', 'Install layout mismatch'],
      download: false,
    },
    {
      name: 'a CLI older than MIN_CLI, which wins over the version gate',
      setup: () => {
        serveTip(SHA_V2, '2.0.0');
        upstream.tree.MIN_CLI = '99.0.0\n';
      },
      arg: 'a11y',
      error: [
        'This pharn is too old',
        'v99.0.0 or newer',
        'Nothing was written.',
      ],
      notError: ['Skills version mismatch'],
      download: true,
    },
    {
      name: 'a SKILLS_VERSION it cannot read (an exception: the hint)',
      setup: () => {
        editConfig((c) => {
          delete c.ref;
        });
        upstream.tree.SKILLS_VERSION = 'not a version\n';
      },
      arg: 'a11y',
      // pharn-install.json's skillsVersion is the tree's, held to VERSION_RE.
      error: ['invalid skillsVersion "not a version"'],
      hint: true,
      download: true,
    },
    {
      name: 'a pharn-oss older than 7.21.0 (no pharn-install.json)',
      setup: () => serveTip(SHA_V1, '1.0.0', { seal: false }),
      arg: 'a11y',
      error: [
        'The fetched pharn-oss (SKILLS_VERSION 1.0.0) ships no pharn-install.json, so it is older than 7.21.0',
        '`--ref main`',
        'Nothing was written.',
      ],
      hint: true,
      download: true,
    },
    {
      name: 'a failed download (an exception: the hint)',
      setup: () => {
        failures.tarball = 'throw';
      },
      arg: 'a11y',
      error: ['⚠'],
      hint: true,
      download: true,
    },
    {
      name: 'a legacy (pre-archetype) config, before any network call',
      setup: () =>
        write(
          'pharn.config.json',
          JSON.stringify({ skillsVersion: '1.0.0', modules: [] }),
        ),
      arg: 'a11y',
      error: ['legacy module layout', 'Re-run `pharn init`'],
      download: false,
    },
  ];

  it.each(rows)('$name', async (row) => {
    vi.stubEnv('PHARN_DEBUG', undefined);
    await installFresh();
    row.setup();
    const before = snapshot();
    clearOutput();
    fetchStub.mockClear();

    expect(await run(() => runAdd(row.arg))).toBe(1);

    expect(snapshot()).toEqual(before);
    for (const text of row.error) expect(errors()).toContain(text);
    for (const text of row.notError ?? []) expect(errors()).not.toContain(text);
    expect(infos().includes(HINT)).toBe(row.hint === true);
    expect(fetched().some((u) => u.startsWith('https://codeload.'))).toBe(
      row.download,
    );
    if (!row.download) expect(fetched()).toEqual([]);
    expect(lastOutro()).not.toContain('already installed');
  });

  // C8.3: the named and the picker paths both fetch first, so both refuse a
  // pharn-oss without pharn-install.json before anything is asked or written.
  it.each<[string, string | undefined]>([
    ['pharn add a11y', 'a11y'],
    ['the picker', undefined],
  ])(
    '%s refuses a pharn-oss older than 7.21.0, leaving no clone',
    async (_l, arg) => {
      await installFresh();
      serveTip(SHA_V1, '1.0.0', { seal: false });
      const clones = watchClones();
      const before = snapshot();
      clearOutput();
      if (arg === undefined) setTTY();
      expect(await run(() => runAdd(arg))).toBe(1);
      expect(errors()).toContain('ships no pharn-install.json');
      expect(errors()).toContain('older than 7.21.0');
      expect(clack.groupMultiselect).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
      expect(clones()).toEqual([]);
    },
  );
});

describe('pharn add <name>: the user’s bytes in the capability directory', () => {
  it('backs up an edited leftover file before overwriting it; identical and extra files are left alone', async () => {
    shipA11yEval();
    await installFresh();
    // A leftover a11y directory (an older pharn, or the user) with an edit, an
    // untouched copy, and a file of the user's own.
    write(A11Y, 'MY EDIT\n');
    write(A11Y_EVAL, 'a11y eval upstream\n');
    write(`${A11Y_DIR}/MY-NOTES.md`, 'my notes\n');
    // No `.gitignore` covering pharn/.backup/, so the notice advises it.
    rmSync(at('.gitignore'));

    expect(await run(() => runAdd('a11y'))).toBeNull();

    // Only the drifted file is saved, at its mirrored path, and named.
    expect(backupFiles()).toEqual([A11Y]);
    const [dir] = readdirSync(at('pharn/.backup'));
    expect(read(join('pharn/.backup', dir!, A11Y))).toBe('MY EDIT\n');
    expect(infos()).toContain(`Backed up 1 file(s) to pharn/.backup/${dir!}`);
    expect(infos()).toContain(
      'pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.',
    );
    // The add happened; the user's own file survives and is never recorded.
    expect(read(A11Y)).toContain('a11y');
    expect(read(`${A11Y_DIR}/MY-NOTES.md`)).toBe('my notes\n');
    const keys = Object.keys(records().files).filter((k) =>
      k.startsWith(`${A11Y_DIR}/`),
    );
    expect(keys.sort()).toEqual([A11Y, A11Y_EVAL].sort());
  });

  it('makes no backup when the leftover files are byte-identical to upstream', async () => {
    await installFresh();
    write(A11Y, upstream.tree[A11Y]!);
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(exists('pharn/.backup')).toBe(false);
    expect(infos()).not.toContain('Backed up');
  });

  it('refuses rather than copy through a symlinked directory, naming it', async () => {
    shipA11yEval();
    await installFresh();
    plantSymlinkedEvals();
    const before = snapshot();

    expect(await run(() => runAdd('a11y'))).toBe(1);

    expect(snapshot()).toEqual(before);
    expect(read('elsewhere/basic.md')).toBe('BYTES OUTSIDE THE CAPABILITY\n');
    expect(errors()).toContain(
      `Refusing to add a11y: \`${A11Y_DIR}/evals\` in your project is a symlink`,
    );
  });

  it('aborts with the edit intact when the backup cannot be written', async () => {
    await installFresh();
    write(A11Y, 'MY EDIT\n');
    write('elsewhere.md', 'x\n');
    symlinkSync(at('elsewhere.md'), at('pharn/.backup'));
    const cfg = read('pharn.config.json');
    const rec = read('pharn.records.json');

    expect(await run(() => runAdd('a11y'))).toBe(1);

    expect(read(A11Y)).toBe('MY EDIT\n');
    expect(read('pharn.config.json')).toBe(cfg);
    expect(read('pharn.records.json')).toBe(rec);
    expect(read('elsewhere.md')).toBe('x\n');
  });

  // A write failing part-way names the files that landed and writes no records
  // and no config, so the next run treats them as unrecorded.
  // Root-proof: once the first file is being written, a non-empty DIRECTORY
  // appears at the eval's path, so that file's atomic rename fails.
  it('a write failing part-way names what landed; config and records unchanged', async () => {
    shipA11yEval();
    await installFresh();
    const cfg = read('pharn.config.json');
    const rec = read('pharn.records.json');
    let planted = false;
    fsHooks.open = (path, flags) => {
      if (!planted && flags === 'wx' && path.endsWith('.tmp')) {
        planted = true;
        mkdirSync(at(`${A11Y_EVAL}/in-the-way`), { recursive: true });
      }
    };

    expect(await run(() => runAdd('a11y'))).toBe(1);
    fsHooks.open = null;

    expect(planted).toBe(true);
    expect(errors()).toContain(
      `1 file was written before the failure; no records or config were written:\n  ${A11Y}`,
    );
    expect(errors()).toContain(`Failed to write ${A11Y_EVAL}`);
    expect(read('pharn.config.json')).toBe(cfg);
    expect(read('pharn.records.json')).toBe(rec);
  });
});

describe('pharn add (no argument): the picker', () => {
  // The step itself, over a clone written from the served tree: the command's
  // write-time check (`beforeWrite`) runs once, after the multi-select and
  // before the first pick writes — and only when something was picked.
  it('resolveAddPicker runs beforeWrite between the multi-select and the first pick', async () => {
    const clone = join(at('..'), 'picker-clone');
    for (const [rel, body] of Object.entries(upstream.tree)) {
      mkdirSync(join(clone, rel, '..'), { recursive: true });
      writeFileSync(join(clone, rel), body);
    }
    sealRepo(clone);
    const order: string[] = [];
    const addOne: AddOne = async (_r, _s, _c, _w, parsed) => {
      order.push(`add ${parsed.name}`);
      return { kind: 'noop', name: parsed.name };
    };
    const cfg = { skillsVersion: '1.0.0', commit: null, capabilities: [] };
    vi.mocked(clack.groupMultiselect).mockImplementationOnce(async () => {
      order.push('picked');
      return ['griller:a11y', 'lens:n-plus-one'];
    });
    await expect(
      resolveAddPicker(clone, null, cfg as never, at(''), addOne, () => {
        order.push('beforeWrite');
      }),
    ).resolves.toEqual({ kind: 'installed', added: [], failed: [] });
    expect(order).toEqual([
      'picked',
      'beforeWrite',
      'add a11y',
      'add n-plus-one',
    ]);

    // A refusal from beforeWrite aborts before any pick; nothing picked → no call.
    order.length = 0;
    vi.mocked(clack.groupMultiselect).mockResolvedValueOnce(['griller:a11y']);
    await expect(
      resolveAddPicker(clone, null, cfg as never, at(''), addOne, () => {
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    vi.mocked(clack.groupMultiselect).mockResolvedValueOnce([]);
    const never = vi.fn();
    await expect(
      resolveAddPicker(clone, null, cfg as never, at(''), addOne, never),
    ).resolves.toEqual({ kind: 'none' });
    expect(never).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it('off a TTY refuses before any network call and never prompts', async () => {
    await installFresh();
    fetchStub.mockClear();
    clearOutput();
    expect(await run(() => runAdd(undefined))).toBe(1);
    expect(errors()).toContain('Specify a capability (e.g. `pharn add a11y`');
    expect(fetched()).toEqual([]);
    expect(clack.groupMultiselect).not.toHaveBeenCalled();
  });

  it('installs every pick, tagged manual and recorded, warning once about an unparseable capability', async () => {
    upstream.tree[BACKWARDS] = UNPARSEABLE;
    await installFresh();
    clearOutput();
    interactive({ groupMultiselect: [['griller:a11y', 'lens:n-plus-one']] });

    expect(await run(() => runAdd(undefined))).toBeNull();

    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'a11y', role: 'griller', source: 'manual' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
    ]);
    expect(records().files[A11Y]).toBe(sha256(A11Y));
    expect(records().files[N_PLUS_ONE]).toBe(sha256(N_PLUS_ONE));
    expect(lastOutro()).toBe('✔ Added 2 capabilities.');
    expect(
      logs('warn').filter((m) => m.includes('backwards-compat')),
    ).toHaveLength(1);
  });

  it('offers every capability when the config lists none installed', async () => {
    await installFresh();
    editConfig((c) => {
      c.capabilities = [];
    });
    clearOutput();
    interactive({ groupMultiselect: [['griller:security']] });
    expect(await run(() => runAdd(undefined))).toBeNull();
    expect(infos()).not.toContain('Installed (');
    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'manual' },
    ]);
  });

  it.each([
    {
      name: 'a cancel exits 0',
      answer: CANCEL,
      code: 0,
      outro: undefined,
    },
    {
      name: 'an empty selection adds nothing',
      answer: [],
      code: null,
      outro: 'Nothing selected. No capabilities were added.',
    },
  ])('$name and writes nothing', async ({ answer, code, outro }) => {
    await installFresh();
    const before = snapshot();
    clearOutput();
    interactive({ groupMultiselect: [answer] });
    expect(await run(() => runAdd(undefined))).toBe(code);
    expect(snapshot()).toEqual(before);
    if (outro) expect(lastOutro()).toBe(outro);
  });

  it('says everything is installed, without prompting, when nothing is left to add', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    setTTY();
    expect(await run(() => runAdd(undefined))).toBeNull();
    expect(lastOutro()).toBe(
      'All available capabilities are already installed.',
    );
    expect(clack.groupMultiselect).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'the version gate',
      setup: () => serveTip(SHA_V2, '2.0.0'),
      error: 'Skills version mismatch',
      hint: false,
    },
    {
      name: 'the version gate, ahead of the all-installed outcome',
      setup: () => {
        editConfig((c) => {
          c.capabilities.push(
            { name: 'a11y', role: 'griller' },
            { name: 'n-plus-one', role: 'lens' },
          );
        });
        serveTip(SHA_V2, '2.0.0');
      },
      error: 'Skills version mismatch',
      hint: false,
    },
    {
      name: 'the layout gate',
      setup: () => legacyInstall('flat'),
      // v0.21.0: refused at load with "re-run `pharn init`".
      error: 'This project is installed at the flat layout',
      hint: false,
    },
    {
      name: 'a failed download',
      setup: () => {
        failures.tarball = 'throw';
      },
      error: '⚠',
      hint: true,
    },
  ])(
    'refuses on $name before the multi-select renders',
    async ({ setup, error, hint }) => {
      vi.stubEnv('PHARN_DEBUG', undefined);
      await installFresh();
      setup();
      const before = snapshot();
      clearOutput();
      setTTY();
      expect(await run(() => runAdd(undefined))).toBe(1);
      expect(clack.groupMultiselect).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
      expect(errors()).toContain(error);
      expect(infos().includes(HINT)).toBe(hint);
    },
  );

  it('names a refused pick in its outro and exits 1; the other pick still lands', async () => {
    shipA11yEval();
    await installFresh();
    plantSymlinkedEvals();
    interactive({ groupMultiselect: [['griller:a11y', 'lens:n-plus-one']] });

    expect(await run(() => runAdd(undefined))).toBe(1);

    expect(read(N_PLUS_ONE)).toContain('n-plus-one');
    expect(config().capabilities.map((c) => c.name)).toEqual([
      'security',
      'n-plus-one',
    ]);
    expect(read('elsewhere/basic.md')).toBe('BYTES OUTSIDE THE CAPABILITY\n');
    expect(lastOutro()).toBe('Added 1 capability; 1 failed: griller:a11y.');
  });

  it('says nothing was added when every pick fails, and exits 1', async () => {
    shipA11yEval();
    await installFresh();
    plantSymlinkedEvals();
    const cfg = read('pharn.config.json');
    interactive({ groupMultiselect: [['griller:a11y']] });

    expect(await run(() => runAdd(undefined))).toBe(1);

    expect(read('pharn.config.json')).toBe(cfg);
    expect(lastOutro()).toBe(
      'No capabilities were added; 1 failed: griller:a11y.',
    );
  });

  it('backs up the edits of every pick that overwrites them, one directory per pick', async () => {
    await installFresh();
    write(A11Y, 'MY GRILLER EDIT\n');
    write(N_PLUS_ONE, 'MY LENS EDIT\n');
    clearOutput();
    interactive({ groupMultiselect: [['griller:a11y', 'lens:n-plus-one']] });

    expect(await run(() => runAdd(undefined))).toBeNull();

    const roots = readdirSync(at('pharn/.backup')).sort();
    expect(roots).toHaveLength(2);
    const saved = roots.map((r) => {
      const rel = exists(join('pharn/.backup', r, A11Y)) ? A11Y : N_PLUS_ONE;
      return read(join('pharn/.backup', r, rel));
    });
    expect(saved.sort()).toEqual(['MY GRILLER EDIT\n', 'MY LENS EDIT\n']);
    for (const r of roots) expect(infos()).toContain(r);
    expect(read(A11Y)).toContain('a11y');
    expect(read(N_PLUS_ONE)).toContain('n-plus-one');
  });
});

describe('pharn add: the proxy notice', () => {
  const NOTICE = 'will not use it';

  it.each([
    { name: 'the named path', arg: 'a11y' as string | undefined },
    { name: 'the picker path', arg: undefined },
  ])('warns before the download on $name', async ({ arg }) => {
    await installFresh();
    if (arg === undefined) {
      editConfig((c) => {
        c.capabilities.push(
          { name: 'a11y', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        );
      });
      setTTY();
    }
    vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
    clearOutput();
    fetchStub.mockClear();
    expect(await run(() => runAdd(arg))).toBeNull();

    const warn = vi.mocked(clack.log.warn);
    const at = warn.mock.calls.findIndex(([m]) => String(m).includes(NOTICE));
    expect(at).toBeGreaterThan(-1);
    expect(warn.mock.invocationCallOrder[at]!).toBeLessThan(
      fetchStub.mock.invocationCallOrder[0]!,
    );
  });

  it('says nothing on a path that never fetches', async () => {
    await installFresh();
    vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
    write(
      'pharn.config.json',
      JSON.stringify({ skillsVersion: '1.0.0', modules: [] }),
    );
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBe(1);
    expect(warnings()).not.toContain(NOTICE);
  });

  it('says nothing when no proxy variable is set', async () => {
    await installFresh();
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(warnings()).not.toContain(NOTICE);
  });
});

/** Open the picker's interactive gate without scripting an answer. */
function setTTY(): void {
  interactive();
}

// CORE-194: `add` writes exactly the files pharn-install.json declares for the
// capability, and records them.
describe('add with pharn-install.json', () => {
  it("writes and records only the capability's declared files", async () => {
    const tree = manifestTree('7.20.0', (m) => {
      // Declared beside the markdown; an undeclared file in the same dir is
      // never written.
      m.files = m.files.filter(
        (f) => f.path !== 'pharn/pharn-pipeline/grillers/a11y/undeclared.md',
      );
    });
    tree['pharn/pharn-pipeline/grillers/a11y/undeclared.md'] = 'not in it\n';
    serveTip(SHA_V1, '7.20.0', { tree });
    await installFresh();
    expect(exists(A11Y)).toBe(false);
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(exists(A11Y)).toBe(true);
    expect(exists('pharn/pharn-pipeline/grillers/a11y/undeclared.md')).toBe(
      false,
    );
    expect(records().files[A11Y]).toBe(sha256(A11Y));
    expect(config().capabilities.map((c) => c.name)).toContain('a11y');
  });
});

describe('a release whose manifest names a path outside the outer bound', () => {
  it('add exits 1 with the same refusal and writes nothing', async () => {
    await installFresh();
    const message = serveRefusedDest(SHA_V1, '1.0.0');
    const before = snapshot();
    clearOutput();
    expect(await run(() => runAdd('a11y'))).toBe(1);
    expect(errors()).toContain(message);
    expect(snapshot()).toEqual(before);
  });
});
