import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { githubArchive } from './support/tar-fixture.js';

// fetchRepo's temp clone is multi-megabyte and the clone/copy phases are the
// longest prompt-free windows in the CLI. Disposal hung entirely off a `finally`
// in each caller — which Node does not run on `process.exit`, and which a signal
// never reaches at all.
//
// Two failure shapes, both verified before the fix:
//
//   1. Ctrl-C during a spinner is NOT a signal. @clack/core's block() raw-modes
//      stdin, so it arrives as a keypress and clack calls process.exit(0). The
//      `finally` never runs, the clone leaks, and — worse — the interrupted run
//      REPORTS SUCCESS.
//   2. Piped/non-TTY with a spinner up, @clack/prompts registers its own SIGINT
//      listener that only prints, so the signal is swallowed and the process
//      runs on.
//
// Both contradict docs/commands/init.md: "The temp clone is always cleaned up
// (even on cancel or error)."

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALID_SHA = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

// Each test gets a FRESH module instance. The handlers install once per module
// (that is the property under test), so sharing one instance would make every
// case after the first observe "already installed" and quietly assert nothing.
// The listeners a test installs are removed in afterEach so they cannot
// accumulate across the file.
async function freshRepo(): Promise<typeof import('../src/lib/repo.js')> {
  vi.resetModules();
  return import('../src/lib/repo.js');
}

/** A Response-alike whose body streams `bytes`. */
function tarResponse(bytes: Buffer): unknown {
  return {
    ok: true,
    status: 200,
    body: (async function* () {
      yield bytes;
    })(),
  };
}

describe('temp-clone cleanup handlers', () => {
  let sandbox = '';
  const realTmp = {
    TMPDIR: process.env.TMPDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pharn-sig-sandbox-'));
    process.env.TMPDIR = sandbox;
    process.env.TEMP = sandbox;
    process.env.TMP = sandbox;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://api.github.com')
          ? { ok: true, json: async () => ({ sha: VALID_SHA }) }
          : tarResponse(githubArchive(VALID_SHA)),
      ),
    );
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(realTmp)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(sandbox, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  /** The `exit` listeners a fresh module instance added, for cleanup + assertion. */
  function addedExitListeners(before: readonly unknown[]): Array<() => void> {
    return process
      .listeners('exit')
      .filter((l) => !before.includes(l)) as Array<() => void>;
  }

  let installed: Array<() => void> = [];
  afterEach(() => {
    for (const l of installed) process.removeListener('exit', l);
    installed = [];
  });

  it('registers an `exit` handler that removes a live clone', async () => {
    const before = process.listeners('exit');
    const { fetchRepo } = await freshRepo();
    const repo = await fetchRepo();
    installed = addedExitListeners(before);

    expect(installed).toHaveLength(1);
    expect(existsSync(repo.dir)).toBe(true);

    // Invoked directly rather than by exiting the runner. The handler is
    // synchronous rmSync precisely because an `exit` listener may not await.
    installed[0]!();
    expect(existsSync(repo.dir)).toBe(false);
  });

  it('installs its handlers once, not once per fetch', async () => {
    // `pharn update` calls fetchRepo more than once in a run, and a listener per
    // call would eventually trip MaxListenersExceededWarning.
    const before = process.listeners('exit');
    const { fetchRepo } = await freshRepo();

    const a = await fetchRepo();
    const afterFirst = addedExitListeners(before).length;
    const b = await fetchRepo();
    installed = addedExitListeners(before);

    expect(afterFirst).toBe(1);
    expect(installed).toHaveLength(1);

    a.cleanup();
    b.cleanup();
  });

  it('forgets a clone once cleanup() has disposed of it', async () => {
    const before = process.listeners('exit');
    const { fetchRepo } = await freshRepo();
    const repo = await fetchRepo();
    installed = addedExitListeners(before);

    repo.cleanup();
    expect(existsSync(repo.dir)).toBe(false);

    // The registry must not keep a disposed dir: a later handler run would
    // otherwise rm a path this process no longer owns. mkdtemp names collide
    // only by chance, and "only by chance" is not a guard.
    expect(() => installed[0]!()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The signal path, in a real child process.
//
// This cannot be done in-process: the handler re-raises the signal, which would
// kill the test runner. And the bug being fixed is precisely the EXIT CODE — an
// interrupted run reported success — so a test that does not observe the exit
// status is not testing the defect.
// ---------------------------------------------------------------------------

describe('SIGINT during a clone', () => {
  const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  let scriptDir = '';

  beforeEach(() => {
    scriptDir = mkdtempSync(join(tmpdir(), 'pharn-sigtest-'));
  });
  afterEach(() => rmSync(scriptDir, { recursive: true, force: true }));

  it('removes the clone and exits 130 instead of reporting success', () => {
    const script = join(scriptDir, 'probe.mts');
    writeFileSync(
      script,
      `
import { githubArchive } from ${JSON.stringify(join(repoRoot, 'tests/support/tar-fixture.ts'))};
import { fetchRepo } from ${JSON.stringify(join(repoRoot, 'src/lib/repo.ts'))};

const SHA = ${JSON.stringify(VALID_SHA)};
globalThis.fetch = (async (url) => {
  if (String(url).startsWith('https://api.github.com')) {
    return { ok: true, json: async () => ({ sha: SHA }) };
  }
  const bytes = githubArchive(SHA);
  return {
    ok: true,
    status: 200,
    body: (async function* () { yield bytes; })(),
  };
}) as unknown as typeof fetch;

const repo = await fetchRepo();
console.log('DIR=' + repo.dir);

// A listener that only prints — exactly what @clack/prompts installs while a
// spinner is up, and the reason an unhandled SIGINT was previously swallowed.
process.on('SIGINT', () => console.log('CLACK-LIKE-LISTENER-RAN'));

process.kill(process.pid, 'SIGINT');
setTimeout(() => console.log('SURVIVED-THE-SIGNAL'), 1500);
`,
      'utf8',
    );

    const run = spawnSync(process.execPath, [tsx, script], {
      encoding: 'utf8',
      timeout: 30_000,
      cwd: repoRoot,
    });

    const dir = /DIR=(.+)/.exec(run.stdout)?.[1]?.trim();
    expect(dir, `no DIR in stdout:\n${run.stdout}\n${run.stderr}`).toBeTruthy();

    // The clone is gone even though no `finally` ran in that process.
    expect(existsSync(dir!)).toBe(false);

    // The signal was not swallowed by the print-only listener...
    expect(run.stdout).not.toContain('SURVIVED-THE-SIGNAL');

    // ...and the run is honest about how it ended. This is the actual defect:
    // before the fix an interrupted install exited 0 and looked successful to
    // any calling script. 130 = 128 + SIGINT, or the signal itself when the
    // platform reports it that way.
    expect(run.signal === 'SIGINT' || run.status === 130).toBe(true);
  }, 40_000);
});
