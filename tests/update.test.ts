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
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
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

  // --- fatal-error reporting (FABLE 4.6 + 5.2) -------------------------------
  //
  // The hint used to print at exactly two of update's fatal exits and at none of
  // the exception-derived ones - so the first network failure a user meets, the
  // one they paste into an issue, offered no next step at all. It now rides on a
  // single axis: an exception was passed to the reporter.
  describe('fatal-error reporting', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => delete process.env.PHARN_DEBUG);
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    const errored = (): string =>
      vi
        .mocked(prompts.log.error)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
    const informed = (): string =>
      vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    it('prints the PHARN_DEBUG hint when the version check throws, on stderr', async () => {
      await installed();
      fetchRemoteSkillsVersion.mockRejectedValueOnce(
        new Error('Could not reach raw.githubusercontent.com: fetch failed'),
      );

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('Could not reach');
      expect(informed()).toContain('PHARN_DEBUG');
      // The stream, proven at a real call site and not only at the helper's
      // definition: the vi.fn() mock would swallow a missing option silently.
      expect(vi.mocked(prompts.log.error).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
      expect(vi.mocked(prompts.log.info).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
    });

    it('prints the hint when the clone throws', async () => {
      await installed();
      fetchRepo.mockRejectedValueOnce(new Error('degit exploded'));

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('degit exploded');
      expect(informed()).toContain('PHARN_DEBUG');
    });

    // The other half of the axis: a curated refusal has no stack to dump, so
    // offering PHARN_DEBUG there would be a lie.
    it('prints NO hint for the non-TTY refusal', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('interactive terminal');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });

    it('prints NO hint for the MIN_CLI policy refusal', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('too old');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });

    it('dumps the error instead of the hint under PHARN_DEBUG=1', async () => {
      process.env.PHARN_DEBUG = '1';
      const errSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await installed();
      const boom = new Error('degit exploded');
      fetchRepo.mockRejectedValueOnce(boom);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errSpy).toHaveBeenCalledWith(boom);
      expect(informed()).not.toContain('PHARN_DEBUG');
      errSpy.mockRestore();
    });
  });

  // --- the degit proxy notice (wiring) ---------------------------------------
  //
  // update clones, so the notice fires; the early-return "already up to date"
  // path does not clone and must stay silent.
  describe('proxy notice', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('warns before the clone', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      let warnedBeforeFetch = false;
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return { dir: repo, sha: 'a'.repeat(40), cleanup };
      });

      await runUpdate();

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('may be routed');
    });

    // No clone on the up-to-date early return, so no transport to describe.
    it('says nothing when update returns early without cloning', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.1.0' });

      await runUpdate();

      expect(fetchRepo).not.toHaveBeenCalled();
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('may be routed');
    });

    it('says nothing when no proxy variable is set', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', undefined);
      await installed({ skillsVersion: '1.0.0' });

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('may be routed');
    });
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
      const clackPromptApis = [
        'autocomplete',
        'autocompleteMultiselect',
        'confirm',
        'date',
        'groupMultiselect',
        'multiline',
        'multiselect',
        'password',
        'path',
        'select',
        'selectKey',
        'text',
      ] as const;
      const prompted = [
        ...src.matchAll(
          new RegExp(`\\bawait (${clackPromptApis.join('|')})\\(`, 'g'),
        ),
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
      unknown: [],
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
      parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
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

  // -------------------------------------------------------------------------
  // FORWARD COMPATIBILITY — a capability the fetch boundary could not PARSE.
  //
  // Two things must hold at once, and they pull in opposite directions:
  //   * the config entry SURVIVES (update never deletes, and a transient upstream
  //     grammar break must not silently drop a user's capability), and
  //   * NOT ONE BYTE of its clone directory is written (the manifest is update's
  //     only write source, so leaving it in would copy an arbitrary WIP upstream
  //     directory into the project — the exact fail-open this contract prevents).
  //
  // The fixture ships a POPULATED unparseable directory in the clone on purpose:
  // an empty one would make the manifest contribute nothing regardless of the
  // fix, so the test would pass for the wrong reason (GRILL.md F5).
  // -------------------------------------------------------------------------
  describe('unparseable upstream capability (frozen)', () => {
    const FROZEN = { name: 'backwards-compat', role: 'griller' as const };
    const FROZEN_FILE =
      'pharn-pipeline/grillers/backwards-compat/backwards-compat.md';
    const FROZEN_EXTRA =
      'pharn-pipeline/grillers/backwards-compat/evals/cases/one.md';

    // A real, file-bearing directory in the clone that the parse refused.
    function frozenUpstream(): void {
      write(join(repo, FROZEN_FILE), 'WIP upstream content');
      write(join(repo, FROZEN_EXTRA), 'WIP eval case');
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: FROZEN.name,
            role: FROZEN.role,
            subtree: 'pharn-pipeline/grillers',
            reason: 'Capability "backwards-compat" has invalid role "auditor"',
          },
        ],
      });
    }

    const capNote = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'CAPABILITIES')?.[0];

    it('writes ZERO files under it while KEEPING its pharn.config.json entry', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      // Nothing under the unparseable dir was copied into the project.
      expect(existsSync(join(proj, FROZEN_FILE))).toBe(false);
      expect(existsSync(join(proj, FROZEN_EXTRA))).toBe(false);
      // ...and it was not recorded either (recorded is not the same as copied).
      expect(records()?.[FROZEN_FILE]).toBeUndefined();
      // The entry survives, verbatim.
      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
        { ...FROZEN, source: 'auto' },
      ]);
    });

    // Its records must SURVIVE. planUpdate keys nextRecords by the manifest, and
    // a frozen capability is deliberately absent from it — so without an explicit
    // carry-over its entries would be pruned as "no longer installed". They are
    // not: nothing under it was touched, so the recorded hashes are still true.
    // Losing them would make the next run (once upstream parses again) read every
    // one of those files as `unrecorded` and skip it — a transient upstream break
    // turned into a --force.
    it('KEEPS the records of an already-installed frozen capability', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      // The capability WAS installed at v1, so the project holds its bytes and
      // the store holds their hashes.
      const INSTALLED_FILE = FROZEN_FILE;
      write(join(proj, INSTALLED_FILE), 'installed at v1');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [INSTALLED_FILE]: sha256File(join(proj, INSTALLED_FILE)),
        },
      });
      const before = records()![INSTALLED_FILE];
      frozenUpstream();

      await runUpdate();

      // Untouched on disk...
      expect(body(INSTALLED_FILE)).toBe('installed at v1');
      // ...and still recorded, at the same hash.
      expect(records()?.[INSTALLED_FILE]).toBe(before);
    });

    it('reports it as KEPT — never dropped-unselected, never dropped-gone', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      expect(capNote()).toContain('griller:backwards-compat');
      expect(capNote()).toContain('KEPT');
      expect(capNote()).not.toContain('REMOVED');
    });

    it('names the skipped capability with its reason (no silent skips, P5)', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('backwards-compat');
      expect(warned).toContain('invalid role');
    });

    // THE UNWEDGING PROPERTY. `add`'s versionGate refuses on ANY
    // readSkillsVersion(clone) !== config.skillsVersion, so if an unparseable dir
    // on main made every update withhold the bump, the config would never reach
    // the upstream version and every `pharn add` would be refused FOREVER — the
    // very wedge this whole contract removes. A frozen capability contributes no
    // expected file, hence no FILE-level skip, hence no withholding.
    it('still bumps skillsVersion/commit when nothing at FILE level was skipped', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      const written = readPharnConfig(proj)!;
      expect(written.skillsVersion).toBe('1.1.0');
      expect(written.commit).toBe('a'.repeat(40));
      // The withheld-bump warning must NOT have fired.
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).not.toContain('still recorded as skills');
    });
  });

  // -------------------------------------------------------------------------
  // The MIN_CLI handshake, at the command level.
  // -------------------------------------------------------------------------
  describe('MIN_CLI gate', () => {
    it('refuses a too-old CLI: exit 1, clone cleaned up, NOTHING written', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');
      const before = body(CAP_FILE);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(cleanup).toHaveBeenCalled();
      expect(body(CAP_FILE)).toBe(before);
      // Not "the config still says 1.0.0" — NO config was written at all: the
      // refusal fires before applyUpdate, so the whole write phase never runs.
      expect(readPharnConfig(proj)).toBeNull();
      const errored = vi
        .mocked(prompts.log.error)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(errored).toContain('too old');
      expect(errored).toContain('99.0.0');
    });

    it('a GARBAGE MIN_CLI does NOT exit 1 — it warns and updates normally', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), 'not-a-version\n');

      await runUpdate();

      expect(body(CAP_FILE)).toBe('a11y v2');
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('MIN_CLI');
    });

    it('a satisfied MIN_CLI is silent and updates normally', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '0.0.1\n');

      await runUpdate();

      expect(body(CAP_FILE)).toBe('a11y v2');
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).not.toContain('MIN_CLI');
    });
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

  // A symlinked PARENT directory — `.claude/hooks` pointed into a dotfiles repo
  // is the shape users actually have. The leaf-only classifier read straight
  // through it, planned a write, and then the write-side walk threw: exit 1,
  // partial writes, no config, and the identical abort on every re-run. It is now
  // the per-file skip the `unreadable` terminal was designed to produce.
  it('SKIPS a file under a symlinked PARENT instead of aborting the run', async () => {
    await installed();
    const outside = join(tmp.path(), 'dotfiles-hooks');
    mkdirSync(outside, { recursive: true });
    rmSync(join(proj, '.claude/hooks'), { recursive: true, force: true });
    symlinkSync(outside, join(proj, '.claude/hooks'));

    await expect(runUpdate()).resolves.toBeUndefined();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNREADABLE');
    expect(skipNote).toContain(HOOK);
    // Not one byte went THROUGH the link.
    expect(readdirSync(outside)).toEqual([]);
    // ...while every other file upgraded normally.
    expect(body(CAP_FILE)).toBe('a11y v2');
    // ...and the bump is withheld, because something was skipped: the recorded
    // version stays true and the next run still has work.
    expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
    expect(cleanup).toHaveBeenCalled();
  });

  // The advice a skip report prints must name an action that can actually
  // succeed. `--force` overrides exactly the three record-based buckets
  // (`skipOrForce`); `unreadable` is decided BEFORE the decision table and
  // `force` is not an input to that branch — so prescribing `--force` when every
  // skip is `unreadable` sends the user round a loop that produces a
  // byte-identical run forever, while the withheld version bump keeps
  // `pharn status --strict` red with no command that clears it.
  describe('advice for skips --force cannot clear', () => {
    const skipNote = () =>
      vi.mocked(prompts.note).mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    const withheldWarning = () =>
      vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .find((m) => m.includes('still recorded as skills v'));

    // A regular file where a directory belongs: CAP_FILE's destination cannot be
    // inspected at all, which is the only way into the `unreadable` bucket.
    const makeUnreadable = () => {
      rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });
      write(join(proj, 'pharn-pipeline'), 'a FILE where a directory belongs');
    };

    it('does NOT prescribe --force when every skip is unreadable', async () => {
      await installed();
      makeUnreadable();

      await expect(runUpdate()).resolves.toBeUndefined();

      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      expect(skipped).toContain('Inspect each path by hand');
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
    });

    it('says the same under --force, which changes nothing for these paths', async () => {
      await installed();
      makeUnreadable();

      // Still a skip and still exit 0 — `--force` cannot reach this bucket...
      await expect(runUpdate({ force: true })).resolves.toBeUndefined();

      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
      // ...and the bump stays withheld, so the recorded version stays true.
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
    });

    it('KEEPS the --force advice when a forceable bucket is skipped too', async () => {
      await installed();
      makeUnreadable();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate();

      const skipped = skipNote();
      expect(skipped).toContain('MODIFIED');
      expect(skipped).toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      // Fixed at the source, never by map iteration order (P5).
      expect(skipped!.indexOf('Re-run with --force')).toBeLessThan(
        skipped!.indexOf('--force cannot clear'),
      );
      expect(withheldWarning()).toContain('or re-run with --force');
    });

    // The invariant the whole wording leans on: under `--force` the three
    // record-based buckets all become writes, so `unreadable` is the only label
    // that can still reach the skip report — a forced run can therefore never
    // honestly prescribe `--force`.
    it('drops the --force advice on a FORCED run that also had a modified file', async () => {
      await installed();
      makeUnreadable();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      // The modified file was overwritten; only the unreadable path survives.
      expect(body(DOC)).toBe('constitution v2');
      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('MODIFIED');
      expect(skipped).not.toContain('Re-run with --force');
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
    });
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
    // ...then make ONE of them unwritable, so applyWrites succeeds on the earlier
    // files and throws on this one.
    //
    // The mechanism has to survive the classifier: a symlinked PARENT (what this
    // used to use) is now an `unreadable` SKIP and never reaches applyWrites at
    // all. A read-only DEST FILE does — readDiskState still hashes it, so the
    // plan is unchanged (row 3, `updated`, a planned write) and copyFileSync is
    // what fails, mid-loop.
    //
    // ORDER IS LOAD-BEARING: the chmod comes AFTER the writes above and AFTER
    // writeRecords hashed those bytes, or the fixture itself would fail EACCES
    // and the test would pass for the wrong reason.
    chmodSync(join(proj, HOOK), 0o444);

    try {
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    } finally {
      // Restored inside the test, not in an afterEach: useTmpDir's rmSync
      // suppresses ENOENT, not EACCES, and this must hold even if the assertion
      // above throws. (Inert for uid 0 — this suite must not run as root.)
      chmodSync(join(proj, HOOK), 0o644);
    }

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
    // A DIFFERENT mechanism from the test above, and it has to be: with the store
    // deleted every PRESENT file is `unverifiable` and skipped (row 6), so a
    // read-only dest file would leave plan.writes EMPTY and the run would resolve.
    // The hook must stay ABSENT — row 1, `restored`, the one row that survives a
    // deleted store — and its PARENT must be what refuses the write. A read-only
    // directory does exactly that: applyWrites' mkdirSync({recursive:true}) is a
    // no-op on an existing directory, and the copyFileSync after it fails EACCES.
    const hooks = join(proj, '.claude/hooks');
    rmSync(hooks, { recursive: true, force: true });
    mkdirSync(hooks);
    chmodSync(hooks, 0o555);

    try {
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(readRecords(proj)).toEqual({ kind: 'absent' });
    } finally {
      chmodSync(hooks, 0o755);
    }
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
      // The fixed pharn-core surface (seam-resolver + its evals).
      write(
        join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'),
        'resolver v2',
      );
      write(
        join(repo, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
        'case v2',
      );
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

    // pharn-core is a FIXED surface, not a capability, so it reaches the project
    // only through the install manifest. A project that predates the surface has
    // none of its files — they classify `missing → restore` (row 1: nothing local
    // to protect), so a version-bumping update installs the seam-resolver the
    // copied /pharn-build command cites. Note the bound this does NOT cover: a
    // project already at the latest skillsVersion early-returns before any of
    // this (src/commands/update.ts) and needs --force — see docs/commands/update.md.
    it('RESTORES a missing pharn/pharn-core (fixed surface, missing → restore)', async () => {
      await installed(); // v1.0.0 tree; no pharn/pharn-core anywhere
      pharnClone(); // v1.1.0 clone that ships it
      expect(existsSync(join(proj, 'pharn/pharn-core'))).toBe(false);

      await runUpdate();

      expect(body('pharn/pharn-core/seam-resolver/seam-resolver.md')).toBe(
        'resolver v2',
      );
      expect(
        body('pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
      ).toBe('case v2');
      // Restored files are recorded, so the next run can tell pharn's bytes from
      // the user's edits (an unrecorded file would skip as `unrecorded` forever).
      expect(records()).toHaveProperty(
        'pharn/pharn-core/seam-resolver/seam-resolver.md',
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

    // The mirror direction: a project recorded `pharn` meeting a flat clone — which
    // is the default fixture, since scaffoldClone writes the flat tree. The field
    // has always been direction-agnostic; the report used to test only for 'flat'
    // and dropped this case on the floor, silently abandoning the whole pharn/ tree
    // (contracts, floor, docs, every capability) — strictly more than the other
    // direction leaves behind.
    //
    // Scope, honestly: this pins the RENDERER branch, not a migration end-to-end. A
    // real pharn→flat migration restores the flat paths (they do not exist yet)
    // whereas here they are present at v1 and upgrade; the branch fires either way,
    // because it keys off `written.length > 0` and not off which action wrote them.
    it('warns that the abandoned pharn/ tree is no longer managed', async () => {
      await installed({ layout: 'pharn' });
      // A real pharn/ tree for the warning to be about. It sits outside the flat
      // manifest, so update neither reads nor touches it — and detectLayout reads
      // the CLONE, so this cannot change which layout is resolved.
      write(
        join(proj, 'pharn/pharn-contracts/finding-shape.md'),
        'contract v1',
      );

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('pharn/ tree');
      // The other direction's message must NOT fire: this pins the branch that ran,
      // not merely that some warning appeared.
      expect(warned).not.toContain('moved to the pharn/ layout');
      // update never deletes, so the abandoned tree is still there — hence the warning.
      expect(body('pharn/pharn-contracts/finding-shape.md')).toBe(
        'contract v1',
      );
      expect(readPharnConfig(proj)!.layout).toBe('flat');
    });
  });
});
