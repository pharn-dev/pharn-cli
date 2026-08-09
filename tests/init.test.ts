import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, restoreTTY, setTTY, stubProcessExit } from './helpers.js';

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

const parseCapabilityIndex = vi.fn(() => ({ capabilities: [] }));
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn(() => ({ selected: [], skipped: [] }));
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const runArchetypeSummary = vi.fn(
  async (): Promise<'install' | 'cancel'> => 'install',
);
vi.mock('../src/steps/archetype-summary.js', () => ({ runArchetypeSummary }));

const runInstallArchetype = vi.fn(async () => undefined);
vi.mock('../src/steps/install-archetype.js', () => ({ runInstallArchetype }));

// The pre-install write-target conflict check (steps/overwrite-check.ts). Default:
// no conflicts → true → install proceeds; overridden per-test to exercise decline.
const confirmWriteTargets = vi.fn(async () => true);
vi.mock('../src/steps/overwrite-check.js', () => ({ confirmWriteTargets }));

const { runInit } = await import('../src/commands/init.js');
const { log } = await import('@clack/prompts');

describe('runInit (archetype default)', () => {
  stubProcessExit();
  // init now refuses to prompt into a dead stream, and the vitest runner reports
  // isTTY as undefined — so the flow tests must open the gate. The non-TTY
  // refusals below close it explicitly.
  beforeEach(() => setTTY(true, true));
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  it('drives the archetype flow and installs — no module/manifest fetch', async () => {
    runArchetypeSummary.mockResolvedValue('install');
    confirmWriteTargets.mockResolvedValue(true);

    await runInit();

    expect(runGitPrereq).toHaveBeenCalledTimes(1);
    // The archetype pipeline is taken: detect → fetch → index → resolve → summary.
    expect(detectArchetypesFromProject).toHaveBeenCalledTimes(1);
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(parseCapabilityIndex).toHaveBeenCalledWith('/fake/repo');
    expect(resolveCapabilities).toHaveBeenCalledTimes(1);
    expect(runArchetypeSummary).toHaveBeenCalledTimes(1);
    // The write-target conflict check gates the install (repo dir, cwd, selection).
    expect(confirmWriteTargets).toHaveBeenCalledWith(
      '/fake/repo',
      expect.any(String),
      { selected: [], skipped: [] },
    );
    // Install ran with the pinned SHA; the temp clone was cleaned up.
    expect(runInstallArchetype).toHaveBeenCalledTimes(1);
    expect(runInstallArchetype).toHaveBeenCalledWith(
      '/fake/repo',
      expect.any(String),
      ['ssr'],
      { selected: [], skipped: [] },
      'sha123',
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
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
    confirmWriteTargets.mockResolvedValue(false);

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(runInstallArchetype).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) when PHARN cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

    expect(runInstallArchetype).not.toHaveBeenCalled();
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
      // no ~/.degit tarball is paid for on the way to doing nothing.
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
});
