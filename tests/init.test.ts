import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { CapabilityIndex } from '../src/types.js';

// Archetype is now the DEFAULT (and only) init flow. runInit() drives it with no
// module catalog / manifest fetch. These are command-level control-flow tests
// with the archetype deps mocked; the fixture install e2e lives in
// tests/init-archetype.test.ts (the engine, unchanged by this increment).

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

const runGitPrereq = vi.fn();
vi.mock('../src/steps/prereqs.js', () => ({ runGitPrereq }));

const detectArchetypesFromProject = vi.fn(() => ({ archetypes: ['ssr'] }));
vi.mock('../src/lib/detect-archetype.js', () => ({
  detectArchetypesFromProject,
}));

const cleanup = vi.fn();
const fetchRepo = vi.fn(async () => ({
  dir: '/fake/repo',
  sha: 'sha123',
  cleanup,
}));
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const parseCapabilityIndex = vi.fn((): CapabilityIndex => ({
  capabilities: [],
  unknown: [],
}));
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn(() => ({ selected: [], skipped: [] }));
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

// The MIN_CLI handshake. Its own decision table is pinned in
// tests/min-cli-gate.test.ts; here we pin the WIRING — that init consults it,
// that a refusal stops the flow before any prompt or write, and that a warning
// does not.
const minCliGate = vi.fn(
  (): { refusal: string | null; warning: string | null } => ({
    refusal: null,
    warning: null,
  }),
);
vi.mock('../src/lib/min-cli-gate.js', () => ({ minCliGate }));

const runArchetypeSummary = vi.fn(
  async (): Promise<'install' | 'cancel'> => 'install',
);
vi.mock('../src/steps/archetype-summary.js', () => ({ runArchetypeSummary }));

const runInstallArchetype = vi.fn(async () => undefined);
// The install manifest init computes ONCE per run and hands to both the prompt
// and the install; the records baseline the prompt labels files by.
const installManifest = vi.fn(() => new Map<string, string>());
const reinstallBaseline = vi.fn(() => null);
vi.mock('../src/steps/install-archetype.js', () => ({
  runInstallArchetype,
  installManifest,
  reinstallBaseline,
}));

// The pre-install write-target conflict check (steps/overwrite-check.ts). Default:
// no conflicts → true → install proceeds; overridden per-test to exercise decline.
const confirmWriteTargets = vi.fn(async () => 'proceed' as string);
vi.mock('../src/steps/overwrite-check.js', () => ({ confirmWriteTargets }));

const { runInit } = await import('../src/commands/init.js');
const { log } = await import('@clack/prompts');

describe('runInit (archetype default)', () => {
  stubProcessExit();
  // init now refuses to prompt into a dead stream, and the vitest runner reports
  // isTTY as undefined — so the flow tests must open the gate. The non-TTY
  // refusals below close it explicitly.
  beforeEach(() => {
    setTTY(true, true);
    minCliGate.mockReturnValue({ refusal: null, warning: null });
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  // Every `log.info` line of a run, joined — the affordance surface. Hoisted
  // to the parent describe so the fatal-error and mid-install-failure blocks
  // read one helper instead of a copy each; clearAllMocks empties it per case.
  const informed = (): string =>
    vi
      .mocked(log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  // PHARN-11: a re-run init carries the user's hand-added capabilities over
  // (still in the index, not already selected) instead of dropping them.
  describe('carrying manual capabilities over', () => {
    const tmp = useTmpDir();
    const writeConfig = (dir: string, value: unknown) =>
      writeFileSync(join(dir, 'pharn.config.json'), JSON.stringify(value));
    const baseConfig = {
      pharnVersion: '0.5.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: null,
      modules: [],
      installedAt: '2026-09-24T00:00:00.000Z',
      archetypes: ['ssr'],
    };

    beforeEach(() => {
      runArchetypeSummary.mockResolvedValue('install');
      confirmWriteTargets.mockResolvedValue('proceed');
      parseCapabilityIndex.mockReturnValue({
        capabilities: [
          { name: 'a11y', role: 'griller', applies: 'universal' },
          { name: 'path-traversal', role: 'lens', applies: ['backend'] },
        ],
        unknown: [],
      });
      resolveCapabilities.mockReturnValue({
        selected: [{ name: 'a11y', role: 'griller', matched: 'universal' }],
        skipped: [],
      } as never);
    });
    afterEach(() => {
      // Implementations survive vi.clearAllMocks — reset what this block set so
      // the rest of the file sees its defaults.
      resolveCapabilities.mockReturnValue({ selected: [], skipped: [] });
      vi.mocked(process.cwd).mockRestore();
    });

    // What runInstallArchetype received: the selection it installs and the
    // carry-over it records.
    const installed = () => {
      const call = runInstallArchetype.mock.calls[0] as unknown as [
        unknown,
        unknown,
        unknown,
        {
          selected: { name: string; role: string; matched: unknown }[];
          skipped: { name: string; role: string }[];
        },
        unknown,
        {
          manualKeys: Set<string>;
          kept: { name: string; role: string; source?: string }[];
          previousStamp: {
            skillsVersion: string;
            commit: string | null;
          } | null;
        },
      ];
      return { selection: call[3], carry: call[5] };
    };
    const warned = (): string =>
      vi
        .mocked(log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    it('installs and flags a manual entry that the index still has', async () => {
      const dir = tmp.path();
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      writeConfig(dir, {
        ...baseConfig,
        capabilities: [
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'path-traversal', role: 'lens', source: 'manual' },
          { name: 'gone-now', role: 'lens', source: 'manual' },
        ],
      });

      await runInit();

      const { selection, carry } = installed();
      expect(selection.selected.map((c) => c.name)).toEqual([
        'a11y',
        'path-traversal',
      ]);
      expect(selection.selected[1]!.matched).toBe('manual');
      expect([...carry.manualKeys]).toEqual(['lens:path-traversal']);
      expect(informed()).toContain('lens:path-traversal');
      // Row 7: gone upstream → dropped, but NAMED (never silently).
      expect(warned()).toContain('lens:gone-now');
      expect(carry.kept).toEqual([]);
    });

    // update's merge row 3: sticky manual. This used to be recorded `auto`, so a
    // later archetype change let `update` drop what the user asked for by name.
    it('keeps a manual entry manual when the archetypes ALSO select it', async () => {
      const dir = tmp.path();
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      writeConfig(dir, {
        ...baseConfig,
        capabilities: [{ name: 'a11y', role: 'griller', source: 'manual' }],
      });

      await runInit();

      const { selection, carry } = installed();
      expect([...carry.manualKeys]).toEqual(['griller:a11y']);
      // Installed once, as the archetypes selected it — not appended again.
      expect(selection.selected.map((c) => c.name)).toEqual(['a11y']);
      expect(informed()).not.toContain('you added by hand');
    });

    it('lists a carried entry once: selected as added by hand, no longer skipped', async () => {
      const dir = tmp.path();
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      resolveCapabilities.mockReturnValue({
        selected: [{ name: 'a11y', role: 'griller', matched: 'universal' }],
        skipped: [
          {
            name: 'path-traversal',
            role: 'lens',
            reason: 'applies to [backend]; detected [ssr]',
          },
        ],
      } as never);
      writeConfig(dir, {
        ...baseConfig,
        capabilities: [
          { name: 'path-traversal', role: 'lens', source: 'manual' },
        ],
      });

      await runInit();

      const { selection } = installed();
      expect(selection.selected).toContainEqual({
        name: 'path-traversal',
        role: 'lens',
        matched: 'manual',
      });
      expect(selection.skipped).toEqual([]);
    });

    // update's merge row 0: a capability the fetch could not PARSE is kept
    // verbatim, whoever added it — it used to be dropped and its files orphaned.
    it('keeps an entry upstream ships but this CLI cannot parse — manual AND auto — verbatim', async () => {
      const dir = tmp.path();
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      parseCapabilityIndex.mockReturnValue({
        capabilities: [{ name: 'a11y', role: 'griller', applies: 'universal' }],
        unknown: [
          {
            name: 'perf',
            role: 'lens',
            subtree: 'pharn-review',
            reason: 'unknown applies token',
          },
          {
            name: 'old-auto',
            role: 'griller',
            subtree: 'pharn-pipeline/grillers',
            reason: 'unknown applies token',
          },
          {
            name: 'legacy',
            role: 'griller',
            subtree: 'pharn-pipeline/grillers',
            reason: 'unknown applies token',
          },
        ],
      });
      writeConfig(dir, {
        ...baseConfig,
        commit: 'sha000',
        capabilities: [
          { name: 'perf', role: 'lens', source: 'manual' },
          { name: 'old-auto', role: 'griller', source: 'auto' },
          { name: 'legacy', role: 'griller' },
        ],
      });

      await runInit();

      const { selection, carry } = installed();
      expect(carry.kept).toEqual([
        { name: 'perf', role: 'lens', source: 'manual' },
        { name: 'old-auto', role: 'griller', source: 'auto' },
        { name: 'legacy', role: 'griller' },
      ]);
      expect(carry.previousStamp).toEqual({
        skillsVersion: '1.0.0',
        commit: 'sha000',
      });
      // Kept, not installed: nothing of theirs is in the selection.
      expect(selection.selected.map((c) => c.name)).toEqual(['a11y']);
      expect(informed()).toContain('lens:perf');
      expect(informed()).toContain('griller:old-auto');
      // Named as unreadable upstream (the unknown-capability warning), never as
      // dropped.
      expect(warned()).not.toContain('Not keeping');
    });

    it('a corrupt existing config never blocks init — nothing is carried over', async () => {
      const dir = tmp.path();
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      writeFileSync(join(dir, 'pharn.config.json'), '{ not json');

      await runInit();

      expect(runInstallArchetype).toHaveBeenCalledTimes(1);
      const { carry } = installed();
      expect([...carry.manualKeys]).toEqual([]);
      expect(carry.kept).toEqual([]);
      expect(carry.previousStamp).toBeNull();
    });

    // PHARN-03's re-check, extended to init: the carry-over was computed before
    // both prompts, so a pharn run that wrote the config meanwhile must refuse
    // the install rather than be silently overwritten by it.
    describe('the config changed while the prompts were open', () => {
      const concurrentAdd = (dir: string, before: unknown) => {
        confirmWriteTargets.mockImplementationOnce(async () => {
          writeConfig(dir, before);
          return 'proceed';
        });
      };

      it('refuses — exit 1, nothing installed — when another run rewrote it', async () => {
        const dir = tmp.path();
        vi.spyOn(process, 'cwd').mockReturnValue(dir);
        const config = {
          ...baseConfig,
          capabilities: [{ name: 'a11y', role: 'griller', source: 'auto' }],
        };
        writeConfig(dir, config);
        concurrentAdd(dir, {
          ...config,
          capabilities: [
            ...config.capabilities,
            { name: 'path-traversal', role: 'lens', source: 'manual' },
          ],
        });

        await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

        expect(runInstallArchetype).not.toHaveBeenCalled();
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(log.error).mock.calls.at(-1)![0])).toContain(
          'pharn.config.json changed while `pharn init` was running',
        );
        // The concurrent write survives untouched.
        expect(
          JSON.parse(readFileSync(join(dir, 'pharn.config.json'), 'utf8'))
            .capabilities,
        ).toHaveLength(2);
      });

      it('refuses when a config APPEARED where there was none', async () => {
        const dir = tmp.path();
        vi.spyOn(process, 'cwd').mockReturnValue(dir);
        concurrentAdd(dir, { ...baseConfig, capabilities: [] });

        await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));
        expect(runInstallArchetype).not.toHaveBeenCalled();
      });
    });
  });

  it('drives the archetype flow and installs — no module/manifest fetch', async () => {
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue('proceed');

    await runInit();

    expect(runGitPrereq).toHaveBeenCalledTimes(1);
    // The archetype pipeline is taken: detect → fetch → index → resolve → summary.
    expect(detectArchetypesFromProject).toHaveBeenCalledTimes(1);
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(parseCapabilityIndex).toHaveBeenCalledWith('/fake/repo');
    expect(resolveCapabilities).toHaveBeenCalledTimes(1);
    expect(runArchetypeSummary).toHaveBeenCalledTimes(1);
    // The manifest is built ONCE, and that same map reaches the prompt and the
    // install — neither rebuilds it.
    expect(installManifest).toHaveBeenCalledTimes(1);
    expect(installManifest).toHaveBeenCalledWith('/fake/repo', {
      selected: [],
      skipped: [],
    });
    const manifest = installManifest.mock.results[0]!.value as Map<
      string,
      string
    >;
    // The write-target conflict check gates the install (repo dir, cwd,
    // selection, and what init already knows: the manifest + the records).
    expect(confirmWriteTargets).toHaveBeenCalledWith(
      '/fake/repo',
      expect.any(String),
      { selected: [], skipped: [] },
      { manifest, records: null },
    );
    const promptContext = (
      confirmWriteTargets.mock.calls[0] as unknown as unknown[]
    )[3] as { manifest: unknown };
    expect(promptContext.manifest).toBe(manifest);
    // Install ran with the pinned SHA; the temp clone was cleaned up.
    expect(runInstallArchetype).toHaveBeenCalledTimes(1);
    expect(runInstallArchetype).toHaveBeenCalledWith(
      '/fake/repo',
      expect.any(String),
      ['ssr'],
      { selected: [], skipped: [] },
      'sha123',
      // No previous config → nothing carried over.
      expect.objectContaining({
        manualKeys: new Set(),
        kept: [],
        previousStamp: null,
      }),
      manifest,
    );
    expect((runInstallArchetype.mock.calls[0] as unknown as unknown[])[6]).toBe(
      manifest,
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('builds no manifest and reads no records when the summary is cancelled', async () => {
    runArchetypeSummary.mockResolvedValue('cancel');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(installManifest).not.toHaveBeenCalled();
    expect(reinstallBaseline).not.toHaveBeenCalled();
    expect(confirmWriteTargets).not.toHaveBeenCalled();
  });

  it('cancels from the summary without installing', async () => {
    runArchetypeSummary.mockResolvedValue('cancel');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(runInstallArchetype).not.toHaveBeenCalled();
    // Cleanup still runs in the finally, before the cancel exit.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cancels (no install) when the write-target conflict check is declined', async () => {
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue('decline');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(runInstallArchetype).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans up the clone when the user Ctrl+Cs AT the overwrite confirm', async () => {
    // The leak this fix exists for, and the one lifecycle path the suite never
    // covered. confirmWriteTargets used to process.exit(0) from inside init's
    // suspended `try`, so `finally { repo.cleanup() }` never ran and the
    // multi-megabyte clone was orphaned — reachable on ANY re-init, since an
    // existing pharn.config.json alone makes the conflict set non-empty.
    //
    // Cancel must be indistinguishable from decline to the user: same message,
    // same exit 0. The only difference is that the clone is now cleaned up.
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue('cancel');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(runInstallArchetype).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) when PHARN cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

    expect(runInstallArchetype).not.toHaveBeenCalled();
  });

  // --- fatal-error reporting (FABLE 4.6 + 5.2) -------------------------------
  //
  // The fetch failure is the one most users meet, and it printed no next step:
  // the hint lived at exactly two of init's fatal exits and this was not one.
  describe('fatal-error reporting', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => delete process.env.PHARN_DEBUG);
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    it('prints the PHARN_DEBUG hint, on stderr, when the fetch fails', async () => {
      fetchRepo.mockRejectedValueOnce(new Error('offline'));

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      const [msg, opts] = vi.mocked(log.error).mock.calls.at(-1)!;
      // The message shape the rest of the CLI now mirrors: name the host.
      expect(String(msg)).toContain('Could not reach');
      expect(String(msg)).toContain('offline');
      expect(opts).toEqual({ output: process.stderr });
      expect(informed()).toContain('PHARN_DEBUG');
    });

    it('prints NO hint for the non-TTY refusal', async () => {
      setTTY(false, false);

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      expect(informed()).not.toContain('PHARN_DEBUG');
    });
  });

  // --- mid-install failure: the catch inside the try/finally (FABLE 5.6) -----
  //
  // Everything after the fetch runs inside ONE try whose finally deletes the temp
  // clone. Its success half was pinned six ways over and its failure half not at
  // all: the boxed `failure` cause, the deferred report and the exit code were
  // every one of them unprotected, so a catch turned into a silent `return` would
  // have left the suite green while init reported success on a malformed clone.
  describe('mid-install failure (inside the try/finally)', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => {
      delete process.env.PHARN_DEBUG;
      // mockResolvedValue survives clearAllMocks, and the decline/cancel cases
      // above leave confirmWriteTargets on 'cancel'. Re-arm both here, or the
      // install branch is never entered and these cases exit 0 as a cancel.
      runArchetypeSummary.mockResolvedValue('install');
      confirmWriteTargets.mockResolvedValue('proceed');
    });
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    // THE ORDERING, not the count. init.ts's header states the invariant: every
    // process.exit happens AFTER the finally, because Node skips a finally on
    // exit. toHaveBeenCalledTimes(1) cannot see a violation of it — under
    // stubProcessExit the exit THROWS, and a throw inside the catch still
    // unwinds through the finally, so an exit hoisted up into the catch leaves
    // the count at exactly 1 with the finally never having run as one. Nor
    // would the leak show up: lib/repo.ts's exit/signal handlers reclaim the
    // clone anyway, and that backstop is explicitly not to be relied on. Which
    // is the point — the primary mechanism can stop working with nothing
    // observable to say so. The first-invocation order is what says so.
    const cleanupRanBeforeTheReport = (): boolean => {
      const cleaned = cleanup.mock.invocationCallOrder[0];
      const reported = vi.mocked(log.error).mock.invocationCallOrder[0];
      return (
        cleaned !== undefined && reported !== undefined && cleaned < reported
      );
    };

    // A malformed clone is the untrusted-input case this catch exists for:
    // lib/capability-index.ts throws ManifestValidationError from eight sites in
    // its frontmatter reader. Modelled as a plain Error — the pin is the catch,
    // not the error class, whose own cases live beside it.
    it('exits(1), installs nothing, and still cleans up on a malformed clone', async () => {
      parseCapabilityIndex.mockImplementationOnce(() => {
        throw new Error('capability index: invalid applies value');
      });

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      // The throw is at the first statement past the MIN_CLI gate, so nothing
      // downstream of it ran — no prompt, and above all no writer.
      expect(runArchetypeSummary).not.toHaveBeenCalled();
      expect(confirmWriteTargets).not.toHaveBeenCalled();
      expect(runInstallArchetype).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(cleanupRanBeforeTheReport()).toBe(true);
      // An exception earns the PHARN_DEBUG affordance (a curated refusal does
      // not — see the MIN_CLI case below). Matched loosely: the sentence is
      // report-error.ts's PHARN_DEBUG_HINT, not this test's to re-encode.
      expect(informed()).toMatch(/PHARN_DEBUG/);
    });

    // Part-way through the copy: the user is left with a partial tree, so the
    // exit code is the only signal they get. It must not be the cancel's 0.
    it('exits(1) and still cleans up when the install throws mid-copy', async () => {
      runInstallArchetype.mockRejectedValueOnce(
        new Error('EACCES: permission denied'),
      );

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      // It really did get as far as the writer — this is not the summary cancel
      // wearing a different exit code.
      expect(runInstallArchetype).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(cleanupRanBeforeTheReport()).toBe(true);
    });

    // The BOX (failure: FatalCause | null), not the bare value. `throw undefined`
    // is legal JavaScript and the exit is deferred past the finally — exactly
    // where a nullish sentinel stored bare would read as "nothing failed" and let
    // init exit 0, as a cancel, on a run that crashed and installed nothing.
    it('treats a thrown undefined as a failure, not as success', async () => {
      parseCapabilityIndex.mockImplementationOnce(() => {
        throw undefined;
      });

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      expect(runInstallArchetype).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
      // The affordance is gated on the cause box's PRESENCE, never its contents,
      // so even a thrown undefined still gets it.
      expect(informed()).toMatch(/PHARN_DEBUG/);
    });
  });

  // --- the proxy notice ------------------------------------------------------
  //
  // pharn's fetch reads NO proxy environment variable, on any platform, so a
  // configured proxy is silently unused and the only symptom is a timeout with
  // nothing pointing at the cause. The notice exists to say so. The clone path
  // once went through degit, which read `process.env.https_proxy` ITSELF and
  // only that lowercase spelling — so the notice used to classify (proxied vs.
  // ignored-because-misspelled) and to gate its confidence on a measured degit
  // version. With degit retired nothing reads any spelling, and every variant
  // gets the same warning. What is still true, and still pinned: the notice
  // fires on the `https_proxy` NAME in ANY letter-case (`HTTP_PROXY` and
  // `NO_PROXY` are ignored). These cases pin the WIRING — that init warns, and
  // warns BEFORE the fetch; the truth table itself lives in
  // tests/proxy-env.test.ts.
  describe('proxy notice', () => {
    // mockResolvedValue survives clearAllMocks, so the cancel paths asserted
    // earlier in this file would otherwise leak in and exit(0) before the
    // install. Re-arm the happy path explicitly.
    beforeEach(() => {
      runArchetypeSummary.mockResolvedValue('install');
      confirmWriteTargets.mockResolvedValue('proceed');
    });
    afterEach(() => vi.unstubAllEnvs());

    // The ordering is the point, not merely that a warn happened: a fetch that
    // FAILS because direct egress is blocked is exactly when the user most needs
    // to have been told, so the notice must precede the fetch rather than follow
    // a successful one.
    it('warns about a configured proxy BEFORE the fetch', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
      let warnedBeforeFetch = false;
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(log.warn).mock.calls.length > 0;
        return { dir: '/fake/repo', sha: 'sha123', cleanup };
      });

      await runInit();

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('HTTPS_PROXY');
      expect(warned).toContain('DIRECTLY');
    });

    // No longer platform-gated, and that IS the change: the old notice had to
    // distinguish a spelling degit read from one it did not, and win32's
    // case-insensitive process.env made the same environment behave differently
    // there. pharn's fetch reads no spelling on any platform, so every variant
    // gets the same warning.
    it('warns about a lowercase https_proxy identically', async () => {
      vi.stubEnv('HTTPS_PROXY', undefined);
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');

      await runInit();

      const warned = vi
        .mocked(log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('https_proxy');
      expect(warned).toContain('DIRECTLY');
      expect(warned).not.toContain('degit');
    });

    // Silence on the common path — the notice must not become install noise.
    it('says nothing when neither spelling is set', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', undefined);

      await runInit();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(log.warn).not.toHaveBeenCalled();
    });
  });

  // --- non-interactive honesty: the TTY gate ---------------------------------
  //
  // The bug this closes: off a TTY the archetype summary's select rendered into a
  // dead stream and cancelled through cancelAndExit's exit(0) — `echo "" | pharn
  // init` reported success having installed nothing, AFTER paying for a full
  // clone, because the fetch precedes the first prompt.
  describe('non-interactive (TTY gate)', () => {
    // This covers the bare `pharn` invocation too: index.test.ts pins that an
    // empty argv dispatches to runInit, and this pins what runInit then does.
    it('refuses in a NON-TTY, wasting no clone, and installs nothing', async () => {
      setTTY(false, false);

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      // The whole point: the refusal precedes the fetch, so no network call and
      // no tarball download is paid for on the way to doing nothing.
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(runArchetypeSummary).not.toHaveBeenCalled();
      expect(confirmWriteTargets).not.toHaveBeenCalled();
      expect(runInstallArchetype).not.toHaveBeenCalled();
    });

    it('says init is interactive and names no --yes escape hatch', async () => {
      setTTY(false, false);
      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      const [msg] = vi.mocked(log.error).mock.calls.at(-1)!;
      expect(msg).toContain('interactive terminal');
      // init deliberately has NO --yes: its second prompt is the destructive
      // overwrite confirmation, and auto-confirming that in CI is the hazard the
      // prompt exists to prevent. The message must not offer one.
      expect(msg).toMatch(/no --yes/);
    });

    it('refuses when only ONE stream is a TTY (both must be)', async () => {
      setTTY(false, true);
      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // The precedence pair. A directory with no `.git` already had a good,
    // actionable error; the gate must not have stolen it. `runGitPrereq` runs
    // first, so its exit survives byte-for-byte and the TTY message never fires.
    it('lets the git prereq error win over the TTY message', async () => {
      setTTY(false, false);
      runGitPrereq.mockImplementationOnce(() => {
        throw new ProcessExit(1);
      });

      await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

      expect(log.error).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
    });
  });

  // inv-6: this repo reads isTTY through exactly ONE predicate. The gates above
  // and the add/remove pickers all delegate to `interactiveAllowed`, so a fifth
  // caller cannot quietly invent its own (subtly different) notion of
  // "interactive" — e.g. checking only stdout, which is how a pipe sneaks past.
  it('reads isTTY through exactly one predicate (interactiveAllowed)', () => {
    const here = fileURLToPath(import.meta.url);
    const srcDir = join(here, '..', '..', 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return e.name.endsWith('.ts') ? [p] : [];
      });
    // Every isTTY mention must sit inside an `interactiveAllowed({ … })`
    // argument. capability-picker.ts is excluded because it is the predicate's
    // own home — it names the streams in its doc comment; that it never READS
    // one is asserted separately below.
    const picker = join(srcDir, 'lib', 'capability-picker.ts');
    const offenders = walk(srcDir).filter((f) => {
      if (f === picker) return false;
      const src = readFileSync(f, 'utf8');
      if (!src.includes('isTTY')) return false;
      const inCall = [
        ...src.matchAll(/interactiveAllowed\(\{[^}]*\}\)/g),
      ].reduce((n, m) => n + (m[0].match(/isTTY/g)?.length ?? 0), 0);
      return (src.match(/isTTY/g) ?? []).length !== inCall;
    });
    expect(offenders).toEqual([]);

    // The predicate stays pure: it takes the flags as arguments and never reads
    // process itself, which is what keeps the non-TTY behavior unit-testable.
    // Comments are stripped first — its doc comment legitimately NAMES the two
    // streams to document what callers must pass.
    const pickerCode = readFileSync(picker, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(pickerCode).not.toMatch(/process\.std(in|out)\.isTTY/);
  });

  // no-404 regression guard (grill #2, sharpened): a static assertion that init
  // no longer imports the module manifest — the source of the old default's 404.
  it('init.ts imports no module manifest (static no-404 guard)', () => {
    const here = fileURLToPath(import.meta.url);
    const src = readFileSync(
      join(here, '..', '..', 'src', 'commands', 'init.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"][^'"]*manifest\.js['"]/);
    expect(src).not.toContain('fetchRemoteManifest');
  });

  // RCE-surface guard (successor to the deleted fresh-check fsmonitor regression
  // tests): fresh-check.ts was the ONLY git caller, so deleting it eliminated the
  // attacker-controlled .git/config (core.fsmonitor / hooks) RCE surface. The
  // invariant shifted from "every git call is hardened" to "there are NO git calls"
  // — assert that structurally: no `src/**/*.ts` re-introduces a child_process/git
  // invocation. Any legitimate future use must update this guard consciously.
  it('no src file invokes git / child_process (RCE surface eliminated)', () => {
    const here = fileURLToPath(import.meta.url);
    const srcDir = join(here, '..', '..', 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return e.name.endsWith('.ts') ? [p] : [];
      });
    const offenders = walk(srcDir).filter((f) => {
      const src = readFileSync(f, 'utf8');
      return (
        /['"](?:node:)?child_process['"]/.test(src) ||
        src.includes('execFileSync') ||
        src.includes('core.fsmonitor')
      );
    });
    expect(offenders).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Forward compatibility: the MIN_CLI refusal and the skipped-capability warning.
  // -------------------------------------------------------------------------

  it('refuses a too-old CLI: exit 1 BEFORE the parse, no prompt, no install, clone cleaned up', async () => {
    minCliGate.mockReturnValue({
      refusal: 'This pharn is too old for the current pharn-oss.',
      warning: null,
    });

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

    // The gate sits before the index parse and before every prompt.
    expect(parseCapabilityIndex).not.toHaveBeenCalled();
    expect(runArchetypeSummary).not.toHaveBeenCalled();
    expect(runInstallArchetype).not.toHaveBeenCalled();
    // Cleanup still ran — the gate is inside the try, not after the fetch.
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.error).mock.calls.map(String).join('\n')).toContain(
      'too old',
    );
    // A policy refusal is not a crash: no PHARN_DEBUG hint.
    expect(vi.mocked(log.info).mock.calls.map(String).join('\n')).not.toContain(
      'PHARN_DEBUG',
    );
  });

  it('a MIN_CLI warning does not block the install', async () => {
    minCliGate.mockReturnValue({
      refusal: null,
      warning: 'MIN_CLI in the fetched repo is not a valid version.',
    });
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue('proceed');

    await runInit();

    expect(runInstallArchetype).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls.map(String).join('\n')).toContain(
      'MIN_CLI',
    );
  });

  it('names every skipped upstream capability BEFORE the summary the user acts on', async () => {
    parseCapabilityIndex.mockReturnValue({
      capabilities: [],
      unknown: [
        {
          name: 'backwards-compat',
          role: 'griller',
          subtree: 'pharn-pipeline/grillers',
          reason: 'missing its markdown',
        },
      ],
    });
    let warnedBeforeSummary = false;
    runArchetypeSummary.mockImplementation(async () => {
      warnedBeforeSummary = vi.mocked(log.warn).mock.calls.length > 0;
      return 'cancel';
    });

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(warnedBeforeSummary).toBe(true);
    expect(vi.mocked(log.warn).mock.calls.map(String).join('\n')).toContain(
      'backwards-compat',
    );
  });

  it('prints nothing extra when every upstream capability parsed (P5)', async () => {
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue('proceed');

    await runInit();

    expect(vi.mocked(log.warn)).not.toHaveBeenCalled();
  });
});
