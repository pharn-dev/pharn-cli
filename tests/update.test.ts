import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const fetchRemoteSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/skills-version.js')
  >('../src/lib/skills-version.js');
  return { ...actual, fetchRemoteSkillsVersion };
});

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const loadArchetypeConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/pharn-config.js')
  >('../src/lib/pharn-config.js');
  return { ...actual, loadArchetypeConfigOrExit };
});

const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');
const { readRecords, writeRecords, RECORDS_FILE } =
  await import('../src/lib/install-records.js');
const { sha256File } = await import('../src/lib/hash.js');
const { BACKUP_DIR } = await import('../src/lib/backup.js');
const { readPharnConfig } = await import('../src/lib/pharn-config.js');

// ---------------------------------------------------------------------------
// Real-filesystem fixture: a fake clone + a real project root. The command's
// network + index resolution are mocked; every FILE decision is exercised for
// real, because "was this byte overwritten?" is the whole feature and a mock
// cannot answer it.
// ---------------------------------------------------------------------------

const CAP = { name: 'a11y', role: 'griller' as const };

// Files the fake clone ships (flat layout), and thus the install manifest.
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';
const HOOK = '.claude/hooks/set-writes-scope.cjs';

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function scaffoldClone(repo: string, version: string, marker: string): void {
  write(join(repo, 'SKILLS_VERSION'), `${version}\n`);
  write(join(repo, CAP_FILE), `a11y ${marker}`);
  write(join(repo, DOC), `constitution ${marker}`);
  write(join(repo, HOOK), `hook ${marker}`);
  write(join(repo, '.claude/commands/pharn-plan.md'), `plan ${marker}`);
}

function baseConfig(over: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [CAP],
    layout: 'flat',
    ...over,
  };
}

describe('runUpdate (drift-safe)', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';
  let cleanup = vi.fn();

  // Install the "v1.0.0" tree into the project and record it, i.e. exactly what
  // `pharn init` leaves behind. Then point the clone at "v1.1.0".
  async function installed(
    over: Partial<PharnConfig> = {},
  ): Promise<PharnConfig> {
    const old = join(tmp.path(), 'old-clone');
    scaffoldClone(old, '1.0.0', 'v1');
    for (const rel of [CAP_FILE, DOC, HOOK, '.claude/commands/pharn-plan.md']) {
      write(join(proj, rel), readFileSync(join(old, rel), 'utf8'));
    }
    const config = baseConfig(over);
    await writeRecords(proj, {
      skillsVersion: config.skillsVersion,
      commit: config.commit,
      files: {
        [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
        [DOC]: sha256File(join(proj, DOC)),
        [HOOK]: sha256File(join(proj, HOOK)),
        ['.claude/commands/pharn-plan.md']: sha256File(
          join(proj, '.claude/commands/pharn-plan.md'),
        ),
      },
    });
    loadArchetypeConfigOrExit.mockReturnValue(config);
    return config;
  }

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    repo = join(tmp.path(), 'repo');
    mkdirSync(proj, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    cleanup = vi.fn();

    scaffoldClone(repo, '1.1.0', 'v2');
    fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    parseCapabilityIndex.mockReturnValue({ capabilities: [] });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [],
    });
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    loadArchetypeConfigOrExit.mockReturnValue(baseConfig());
  });
  afterEach(() => vi.clearAllMocks());

  const records = () => {
    const read = readRecords(proj);
    return read.kind === 'ok' ? read.store.files : null;
  };
  const body = (rel: string) => readFileSync(join(proj, rel), 'utf8');
  const backupDirs = () =>
    existsSync(join(proj, BACKUP_DIR))
      ? readdirSync(join(proj, BACKUP_DIR))
      : [];

  it('aborts before any fetch when the config is not an archetype install', async () => {
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('reports already up to date without cloning', async () => {
    await installed({ skillsVersion: '1.1.0' });
    await runUpdate();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Already up to date (skills v1.1.0).',
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('cancels when declined — no clone, nothing written', async () => {
    await installed();
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(body(DOC)).toBe('constitution v1');
  });

  it('upgrades every pristine file and refreshes its record', async () => {
    await installed();

    await runUpdate();

    expect(body(CAP_FILE)).toBe('a11y v2');
    expect(body(DOC)).toBe('constitution v2');
    expect(records()?.[DOC]).toBe(sha256File(join(repo, DOC)));
    // A complete run advances the recorded version + commit.
    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.1.0');
    expect(config.commit).toBe('a'.repeat(40));
    expect(cleanup).toHaveBeenCalled();
  });

  it('re-resolves the RECORDED archetypes against the fresh index', async () => {
    await installed();
    await runUpdate();
    expect(resolveCapabilities).toHaveBeenCalledWith(['ssr'], {
      capabilities: [],
    });
  });

  it('SKIPS a file the user modified, leaves its bytes alone, and exits 0', async () => {
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await expect(runUpdate()).resolves.toBeUndefined();

    expect(body(DOC)).toBe('MY LOCAL EDIT');
    // Its record still describes what pharn wrote, not the user's bytes.
    expect(records()?.[DOC]).not.toBe(sha256File(join(proj, DOC)));
    // Everything else still upgraded.
    expect(body(CAP_FILE)).toBe('a11y v2');
  });

  it('labels a modified skip and groups it under MODIFIED in the report', async () => {
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');
    await runUpdate();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('MODIFIED');
    expect(skipNote).toContain(DOC);
    expect(skipNote).toContain('--force');
  });

  it('WITHHOLDS the version bump when anything was skipped, so the next run still has work', async () => {
    // Without this, the same-version early-return would strand the skipped file
    // forever on the very run that reported it.
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await runUpdate();

    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.0.0');
    expect(config.commit).toBeNull();
    // The store's stamp matches the config it sits beside, so it stays usable.
    const read = readRecords(proj);
    expect(read.kind === 'ok' && read.store.skillsVersion).toBe('1.0.0');
  });

  it('RESTORES a deleted file, recreating its parent directories', async () => {
    await installed();
    rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });

    await runUpdate();

    expect(body(CAP_FILE)).toBe('a11y v2');
  });

  it('treats a pre-upgrade install (no record store) as unverifiable and skips', async () => {
    await installed();
    rmSync(join(proj, RECORDS_FILE), { force: true });
    write(join(proj, DOC), 'user bytes');

    await runUpdate();

    // Every file that DIFFERS is skipped; nothing is overwritten.
    expect(body(DOC)).toBe('user bytes');
    expect(body(CAP_FILE)).toBe('a11y v1');
    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNVERIFIABLE');
  });

  it('reports a corrupt record store BY NAME rather than blaming a legacy install', async () => {
    await installed();
    writeFileSync(join(proj, RECORDS_FILE), 'not json{');

    await runUpdate();

    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).toContain(RECORDS_FILE);
  });

  it('ignores a store whose stamp disagrees with the config (a downgrade round-trip)', async () => {
    await installed();
    await writeRecords(proj, {
      skillsVersion: '0.9.0', // written for a different install state
      commit: null,
      files: { [DOC]: sha256File(join(proj, DOC)) },
    });

    await runUpdate();

    // Fails CLOSED: the stale store is not trusted, so nothing is overwritten.
    expect(body(DOC)).toBe('constitution v1');
  });

  describe('--force', () => {
    it('backs the file up BEFORE overwriting, and the backup holds the pre-overwrite bytes', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      expect(readFileSync(join(proj, BACKUP_DIR, dirs[0]!, DOC), 'utf8')).toBe(
        'MY LOCAL EDIT',
      );
      expect(body(DOC)).toBe('constitution v2');
      expect(records()?.[DOC]).toBe(sha256File(join(repo, DOC)));
    });

    it('a forced run with nothing left to skip advances the version', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      await runUpdate({ force: true });
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    it("prints the backup directory — the user's only pointer to their bytes", async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      await runUpdate({ force: true });
      const info = vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(info).toContain(BACKUP_DIR);
    });

    it('creates NO backup when nothing needed one', async () => {
      await installed();
      await runUpdate({ force: true });
      expect(backupDirs()).toEqual([]);
    });

    it('bypasses the same-version early-return, so it is usable at the current version', async () => {
      // status tells the user --force overwrites their edits; that has to be
      // true when they are already on the latest version.
      await installed({ skillsVersion: '1.1.0' });
      scaffoldClone(repo, '1.1.0', 'v2');
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      expect(body(DOC)).toBe('constitution v2');
      expect(backupDirs()).toHaveLength(1);
    });

    it('aborts without touching any original when the backup cannot be written', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      // A plain file at .pharn-backup makes the backup mkdir fail.
      write(join(proj, BACKUP_DIR), 'not a directory');

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(body(CAP_FILE)).toBe('a11y v1');
      expect(cleanup).toHaveBeenCalled();
    });
  });

  it('never DELETES a project file that upstream no longer ships', async () => {
    await installed();
    write(join(proj, 'pharn-pipeline/grillers/a11y/legacy.md'), 'mine');

    await runUpdate();

    expect(body('pharn-pipeline/grillers/a11y/legacy.md')).toBe('mine');
  });

  it('never writes .claude/settings.json (user-owned, excluded from the manifest)', async () => {
    await installed();
    write(join(repo, '.claude/settings.json'), '{"upstream":true}');
    write(join(proj, '.claude/settings.json'), '{"mine":true}');

    await runUpdate();

    expect(body('.claude/settings.json')).toBe('{"mine":true}');
  });

  it('records the layout detected in the CLONE, so the config stops disagreeing with the bytes', async () => {
    await installed();
    await runUpdate();
    expect(readPharnConfig(proj)!.layout).toBe('flat');
  });

  // A destination that cannot even be inspected must not crash the run: lstat's
  // `throwIfNoEntry:false` suppresses ENOENT only, so a path whose PARENT is a
  // regular file raises ENOTDIR.
  it('reports an uninspectable destination as a skip instead of crashing', async () => {
    await installed();
    rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });
    write(join(proj, 'pharn-pipeline'), 'a FILE where a directory belongs');

    await expect(runUpdate()).resolves.toBeUndefined();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNREADABLE');
    expect(cleanup).toHaveBeenCalled();
  });

  // The replacement for the whole-dir copy's "no partial installs" property: if
  // the loop dies part-way, the files pharn DID write must still be recorded —
  // an unrecorded pharn write reads as the user's edit on the next run and is
  // then skipped forever.
  it('records the files it already wrote when the apply throws mid-loop', async () => {
    await installed();
    // Make every file differ so they are all planned writes...
    for (const rel of [CAP_FILE, DOC, HOOK]) write(join(proj, rel), 'stale v0');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: {
        [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
        [DOC]: sha256File(join(proj, DOC)),
        [HOOK]: sha256File(join(proj, HOOK)),
        ['.claude/commands/pharn-plan.md']: sha256File(
          join(proj, '.claude/commands/pharn-plan.md'),
        ),
      },
    });
    // ...then make ONE of them unwritable by symlinking its parent, so applyWrites
    // succeeds on the earlier files and throws on this one.
    rmSync(join(proj, '.claude/hooks'), { recursive: true, force: true });
    mkdirSync(join(tmp.path(), 'elsewhere'), { recursive: true });
    symlinkSync(join(tmp.path(), 'elsewhere'), join(proj, '.claude/hooks'));

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    // The manifest writes capabilities and commands BEFORE hooks, so those
    // landed; the hook write is the one that threw.
    const store = records();
    expect(body(CAP_FILE)).toBe('a11y v2');
    expect(store?.[CAP_FILE]).toBe(sha256File(join(proj, CAP_FILE)));
    // The failing one is not claimed as written.
    expect(store?.[HOOK]).not.toBe(sha256File(join(repo, HOOK)));
    // The config was never written, so the store is stamped with the config's
    // UNCHANGED values and the two still agree — the next run can use it.
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    const read = readRecords(proj);
    expect(read.kind === 'ok' && read.store.skillsVersion).toBe('1.0.0');
    expect(cleanup).toHaveBeenCalled();
  });

  it('does NOT mint a record store on a partial failure when there was no baseline', async () => {
    // Minting from a handful of paths would flip the rest of the install from the
    // honest `unverifiable` to a false `unrecorded` (the rule `add` also follows).
    await installed();
    rmSync(join(proj, RECORDS_FILE), { force: true });
    rmSync(join(proj, '.claude/hooks'), { recursive: true, force: true });
    mkdirSync(join(tmp.path(), 'elsewhere2'), { recursive: true });
    symlinkSync(join(tmp.path(), 'elsewhere2'), join(proj, '.claude/hooks'));

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    expect(readRecords(proj)).toEqual({ kind: 'absent' });
  });

  it('records hashes read back from the DEST, not carried over from the clone', async () => {
    await installed();
    await runUpdate();
    // Equal here because the copy behaved — the point is that the value is
    // obtained by re-reading disk, so it cannot disagree with what landed.
    expect(records()?.[DOC]).toBe(sha256File(join(proj, DOC)));
  });

  it('writes the records BEFORE the config, so a failed config write still leaves records describing disk', async () => {
    // Asserted by consequence rather than by spying: make the config write fail
    // (a directory where the file belongs → EISDIR) and check the records landed
    // anyway. Config-first would have left the records stale instead — which is
    // the failure mode that makes pharn's own bytes look like the user's edits.
    await installed();
    rmSync(join(proj, 'pharn.config.json'), { force: true });
    mkdirSync(join(proj, 'pharn.config.json'), { recursive: true });

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    expect(records()?.[DOC]).toBe(sha256File(join(proj, DOC)));
    expect(cleanup).toHaveBeenCalled();
  });

  describe('layout migration (the (d) fix)', () => {
    // A project recorded `flat` meeting a `pharn`-layout clone: the copy has
    // always landed at the clone's paths, but the config used to keep saying
    // `flat`, leaving status/remove/list addressing a tree the files left.
    function pharnClone(): void {
      rmSync(repo, { recursive: true, force: true });
      write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
      write(
        join(repo, 'pharn/pharn-contracts/finding-shape.md'),
        'contract v2',
      );
      write(
        join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'),
        'a11y v2',
      );
      write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
      write(join(repo, '.claude/commands/pharn-plan.md'), 'plan v2');
    }

    it("records the CLONE's layout, not the stale one from the config", async () => {
      await installed(); // config.layout === 'flat'
      pharnClone();

      await runUpdate();

      expect(readPharnConfig(proj)!.layout).toBe('pharn');
      expect(body('pharn/pharn-pipeline/grillers/a11y/a11y.md')).toBe(
        'a11y v2',
      );
    });

    it('warns that the abandoned flat tree is no longer managed', async () => {
      await installed();
      pharnClone();

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('pharn/ layout');
      // update never deletes, so the old copies are still there — hence the warning.
      expect(body(CAP_FILE)).toBe('a11y v1');
    });
  });
});
