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
import { fileURLToPath } from 'node:url';
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
    // `update` now refuses to prompt into a dead stream, and the vitest runner
    // reports isTTY as undefined — so every test that expects to REACH the
    // confirm must open the gate. The non-TTY refusals below close it explicitly.
    setTTY(true, true);
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

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

  // --- non-interactive honesty: the TTY gate + the real --yes ----------------
  //
  // The bug this closes: off a TTY the confirm above cancelled on stream end and
  // routed through cancelAndExit's exit(0) — `echo "" | pharn update` reported
  // success having updated nothing. A pipeline that "passes" having done nothing
  // is the worst failure shape for automation, so the refusal is exit 1.
  describe('non-interactive (TTY gate + --yes)', () => {
    it('refuses in a NON-TTY, before any network call, and writes nothing', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      // Zero network: the refusal precedes even the lightweight version check.
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('constitution v1');
      // A completed update writes pharn.config.json into the project; its
      // absence is the proof that this run wrote nothing at all.
      expect(readPharnConfig(proj)).toBeNull();
    });

    it('names BOTH ways out — an interactive terminal and --yes', async () => {
      await installed();
      setTTY(false, false);
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      const [msg] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
      expect(msg).toContain('--yes');
      expect(msg).toContain('interactive terminal');
    });

    it('refuses when only ONE stream is a TTY (both must be)', async () => {
      await installed();
      setTTY(true, false);
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    });

    // inv-9: the config error is the ACTIONABLE one, so it must win. A user in an
    // uninitialized directory needs "run pharn init", not a TTY lecture about a
    // prompt they would never have reached.
    it('lets the config error win over the TTY message in an uninitialized dir', async () => {
      setTTY(false, false);
      loadArchetypeConfigOrExit.mockImplementationOnce(() => {
        throw new ProcessExit(1);
      });

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(prompts.log.error).not.toHaveBeenCalled();
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    });

    it('--yes runs the FULL update in a non-TTY without ever calling confirm', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(prompts.confirm).not.toHaveBeenCalled();
      // Byte-equivalent to the interactive happy path: the note still printed,
      // the files landed, the version advanced, the summary rendered.
      expect(prompts.note).toHaveBeenCalled();
      expect(body(CAP_FILE)).toBe('a11y v2');
      expect(body(DOC)).toBe('constitution v2');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      expect(prompts.outro).toHaveBeenCalled();
    });

    it('--yes behaves identically WITH a TTY — it means "do not ask", not "non-interactive"', async () => {
      await installed();
      setTTY(true, true);

      await runUpdate({ yes: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('constitution v2');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    // inv-4c: `--force` is an overwrite POLICY, not a confirmation bypass. The
    // shortcut "force implies yes" is the tempting mis-implementation, and it
    // would silently auto-confirm the most destructive run pharn offers.
    it('--force WITHOUT --yes still refuses in a non-TTY', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(backupDirs()).toEqual([]);
    });

    it('--yes --force composes: the forced path runs unprompted and backs up', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await runUpdate({ force: true, yes: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      expect(readFileSync(join(proj, BACKUP_DIR, dirs[0]!, DOC), 'utf8')).toBe(
        'MY LOCAL EDIT',
      );
      expect(body(DOC)).toBe('constitution v2');
    });

    it('--yes at the current version early-returns "Already up to date", exit 0', async () => {
      await installed({ skillsVersion: '1.1.0' });
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // inv-4d: --yes must not touch the drift-safe skip semantics. A skip is a
    // decision the user asked for, so it stays exit 0 and still withholds the
    // version bump — `pharn status --strict` remains the CI drift gate.
    it('--yes leaves the skip semantics alone: exit 0, version still withheld', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
      expect(body(CAP_FILE)).toBe('a11y v2');
    });

    // inv-6b: the premise --yes rests on. `--yes` is sold as a COMPLETE bypass of
    // update's interactivity, which is only true while the confirm is update's
    // ONLY prompt. A future prompt added below the gate would silently re-open
    // the very bug this increment closes, and nothing else would catch it.
    it('the confirm is update.ts ONLY prompt (the premise --yes rests on)', () => {
      const here = fileURLToPath(import.meta.url);
      const src = readFileSync(
        join(here, '..', '..', 'src', 'commands', 'update.ts'),
        'utf8',
      );
      const prompted = [
        ...src.matchAll(/\bawait (confirm|select|text|groupMultiselect)\(/g),
      ].map((m) => m[1]);
      expect(prompted).toEqual(['confirm']);
    });
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

  it('re-resolves the RECORDED archetypes against the fresh index, and UNIONS the result with the manual entries', async () => {
    // This test used to pin only the re-resolve call — which was true of the
    // wholesale-replace bug too. The re-resolve still happens; what it now also
    // pins is that the resolved set does NOT become the config verbatim.
    await installed({
      capabilities: [
        CAP,
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ],
    });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [{ name: 'n-plus-one', role: 'lens', reason: 'not for ssr' }],
    });

    await runUpdate();

    expect(resolveCapabilities).toHaveBeenCalledWith(['ssr'], {
      capabilities: [],
    });
    expect(readPharnConfig(proj)!.capabilities).toEqual([
      { ...CAP, source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Capability membership: the union, the report, and the acceptance scenario.
  // Before this, `update` replaced `capabilities` wholesale — deleting manual
  // adds and resurrecting removals, both in total silence.
  // -------------------------------------------------------------------------
  describe('capability membership', () => {
    const MANUAL_FILE = 'pharn-review/n-plus-one/n-plus-one.md';

    // Add a lens to the CLONE (so it is in the install manifest) and, when
    // `inProject`, to the project + its records — i.e. what `pharn add` leaves.
    async function withManualLens(inProject: boolean): Promise<void> {
      write(join(repo, MANUAL_FILE), 'n-plus-one v2');
      if (!inProject) return;
      write(join(proj, MANUAL_FILE), 'n-plus-one v1');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [MANUAL_FILE]: sha256File(join(proj, MANUAL_FILE)),
        },
      });
    }

    // The resolver selects a11y only; n-plus-one exists upstream but is not
    // selected for these archetypes (exactly the live `lens:n-plus-one` case).
    function selectsA11yOnly(): void {
      resolveCapabilities.mockReturnValue({
        selected: [{ ...CAP, matched: ['ssr'] }],
        skipped: [
          { name: 'n-plus-one', role: 'lens', reason: 'applies to [backend]' },
        ],
      });
    }

    const capNote = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'CAPABILITIES')?.[0];

    // ACCEPTANCE (the reported e2e, inverted): a LEGACY manual entry — no
    // `source`, because it predates the field — must survive the first
    // post-upgrade update, with its files upgraded and its records intact.
    it('preserves a LEGACY (source-less) manual entry, upgrades its files, and keeps its records', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
      });
      await withManualLens(true);
      selectsA11yOnly();

      await runUpdate();

      // Still in the config — now explicitly tagged as the user's.
      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ]);
      // First-class in the manifest: its bytes upgraded like any other file...
      expect(body(MANUAL_FILE)).toBe('n-plus-one v2');
      // ...and its record survived rather than being pruned.
      expect(records()?.[MANUAL_FILE]).toBe(
        sha256File(join(repo, MANUAL_FILE)),
      );
      // And the preservation was NAMED, not silent.
      expect(capNote()).toContain('lens:n-plus-one');
      expect(capNote()).toContain('KEPT');
    });

    it('is IDEMPOTENT — a second run leaves capabilities byte-stable and reports no membership change', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
      });
      await withManualLens(true);
      selectsA11yOnly();
      await runUpdate();
      const afterFirst = readPharnConfig(proj)!.capabilities;

      // A plain second run would early-return on the version gate, so bypass it
      // the way the rest of this suite does.
      vi.clearAllMocks();
      selectsA11yOnly();
      fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
      parseCapabilityIndex.mockReturnValue({ capabilities: [] });
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);

      await runUpdate({ force: true });

      expect(readPharnConfig(proj)!.capabilities).toEqual(afterFirst);
      expect(capNote()).toBeUndefined();
    });

    it('prints NOTHING about capabilities when membership is unchanged', async () => {
      await installed();
      await runUpdate();
      expect(capNote()).toBeUndefined();
    });

    it('NAMES a newly-selected capability — which is how a resurrected removal becomes visible', async () => {
      // The user removed a universal capability; the resolver selects it again.
      // Tombstones are out of scope, so this is REPORTED, not prevented.
      await installed({ capabilities: [] });
      await runUpdate();

      expect(capNote()).toContain('ADDED');
      expect(capNote()).toContain('griller:a11y');
    });

    // The dropped capability MUST exist in the CLONE, and its file MUST be
    // recorded, or this test proves nothing: with no source dir, addDir bails
    // (install-manifest.ts:117) and the file sits outside the manifest whether
    // the merge drops the entry or keeps it — so the byte/record assertions
    // would pass even with row 5 inverted. Seeding the clone makes them causal:
    // KEEP puts the file in the manifest, upgrades it to 'stale v2' and
    // refreshes its record; DROP leaves it at v1 with its record pruned.
    const STALE_FILE = 'pharn-review/stale/stale.md';

    it('DROPS an auto capability the archetypes no longer select: named, files left at their old bytes, record PRUNED', async () => {
      await installed({
        capabilities: [CAP, { name: 'stale', role: 'lens', source: 'auto' }],
      });
      write(join(repo, STALE_FILE), 'stale v2'); // upstream still ships it
      write(join(proj, STALE_FILE), 'stale v1'); // and it is installed here
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [STALE_FILE]: sha256File(join(proj, STALE_FILE)),
        },
      });
      selectsA11yOnly();

      await runUpdate();

      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
      ]);
      expect(capNote()).toContain('lens:stale');
      // It left the manifest: NOT upgraded to the clone's bytes, never deleted.
      expect(body(STALE_FILE)).toBe('stale v1');
      // nextRecords is keyed by the manifest just applied, so a path no longer
      // installed is pruned rather than accumulating forever
      // (lib/update-decision.ts). Files outliving their record is exactly why a
      // returning capability later reads as `unrecorded`.
      expect(records()?.[STALE_FILE]).toBeUndefined();
    });

    // Membership answers "which capabilities does this project have" (the
    // archetypes decide); the version answers "are its BYTES complete". They are
    // deliberately decoupled — withholding membership too would strand a phantom
    // entry forever for anyone whose tree carries a single local edit.
    it('still writes the merged membership when a skip WITHHOLDS the version bump', async () => {
      await installed({ capabilities: [] });
      write(join(proj, DOC), 'MY LOCAL EDIT'); // forces a `modified` skip

      await runUpdate();

      const config = readPharnConfig(proj)!;
      // The version is held back...
      expect(config.skillsVersion).toBe('1.0.0');
      expect(config.commit).toBeNull();
      // ...but the membership change still landed, and was reported.
      expect(config.capabilities).toEqual([{ ...CAP, source: 'auto' }]);
      expect(capNote()).toContain('griller:a11y');
    });

    // The trap: the install manifest SILENTLY contributes zero paths for a
    // missing capability dir, so without the index-membership filter this entry
    // would live in the config forever as a phantom and nothing would ever say so.
    it('DROPS a manual entry whose capability is gone upstream — named, contributing zero manifest paths, files left alone', async () => {
      await installed({
        capabilities: [CAP, { name: 'gone', role: 'lens', source: 'manual' }],
      });
      write(join(proj, 'pharn-review/gone/gone.md'), 'my bytes');
      // Selection knows nothing of `gone` — it is in neither selected nor skipped.
      resolveCapabilities.mockReturnValue({
        selected: [{ ...CAP, matched: ['ssr'] }],
        skipped: [],
      });

      await expect(runUpdate()).resolves.toBeUndefined();

      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
      ]);
      expect(capNote()).toContain('lens:gone');
      expect(capNote()).toContain('no longer exists upstream');
      // Zero manifest paths ⇒ its file was never a write target, and never deleted.
      expect(body('pharn-review/gone/gone.md')).toBe('my bytes');
    });

    it('SKIPS a manual capability file the user edited, with the standard report', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [
          CAP,
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ],
      });
      await withManualLens(true);
      write(join(proj, MANUAL_FILE), 'MY LOCAL EDIT');
      selectsA11yOnly();

      await runUpdate();

      expect(body(MANUAL_FILE)).toBe('MY LOCAL EDIT');
      const skipNote = vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
      expect(skipNote).toContain('MODIFIED');
      expect(skipNote).toContain(MANUAL_FILE);
    });

    it('RESTORES a manual capability file the user deleted', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [
          CAP,
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ],
      });
      await withManualLens(false);
      selectsA11yOnly();

      await runUpdate();

      expect(body(MANUAL_FILE)).toBe('n-plus-one v2');
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
