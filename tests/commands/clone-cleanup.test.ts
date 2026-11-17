import { chmodSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CANCEL } from '../helpers.js';
import {
  SECURITY,
  SHA_V2,
  at,
  fetched,
  installFresh,
  interactive,
  printed,
  run,
  serveTip,
  upstream,
  useHarness,
  watchClones,
  write,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runStatus } from '../../src/commands/status.js';
import { runUpdate } from '../../src/commands/update.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

// ---------------------------------------------------------------------------
// The temp clone is removed on EVERY path out of a clone-owning command: a
// refusal, a THROWN failure, a cancel and a `--strict` verdict all end the run
// by throwing a CliError, which unwinds through the clone's `finally` before
// `runCli` prints it. (`init` has the same table in init.test.ts.) TMPDIR is
// pointed at a private directory AFTER the install, so only the command under
// test's clone can appear there.
// ---------------------------------------------------------------------------

const HINT = 'Re-run with PHARN_DEBUG=1 for full error output.';
const asRoot = process.getuid?.() === 0;
const SECURITY_DIR = 'pharn/pharn-pipeline/grillers/security';
const GRILLERS_DIR = 'pharn/pharn-pipeline/grillers';
const tarballs = (): number =>
  fetched().filter((url) => url.startsWith('https://codeload.')).length;

// A newer upstream, so `update` has something to apply (and to confirm).
const bump = (): void => serveTip(SHA_V2, '1.1.0');
// A CLI too old for the fetched content: every command's MIN_CLI refusal.
const tooOld = (): void => {
  upstream.tree.MIN_CLI = '99.0.0\n';
};
// A pharn-oss without pharn-install.json (older than 7.21.0): the download
// lands, then the fetch THROWS before any command reads the tree. Every later
// read goes through that verified manifest, so this is the throw left after
// the download.
const manifestLess = (): void => {
  upstream.seal = false;
};

interface Case {
  name: string;
  setup?: () => void;
  // Undone in a finally (a chmod), so a failing case cannot strand the dir.
  restore?: () => void;
  command: () => Promise<void>;
  code: number;
  hint?: boolean;
  skip?: boolean;
}

const cases: Case[] = [
  {
    name: 'add <name>: a MIN_CLI refusal',
    setup: tooOld,
    command: () => runAdd('a11y'),
    code: 1,
    hint: false,
  },
  {
    name: 'add <name>: a copy that throws (unwritable destination)',
    setup: () => chmodSync(at(GRILLERS_DIR), 0o555),
    restore: () => chmodSync(at(GRILLERS_DIR), 0o755),
    command: () => runAdd('a11y'),
    code: 1,
    hint: true,
    skip: asRoot,
  },
  {
    name: 'add (picker): a cancelled multi-select',
    setup: () => interactive({ groupMultiselect: [CANCEL] }),
    command: () => runAdd(undefined),
    code: 0,
  },
  {
    name: 'update --yes: a MIN_CLI refusal',
    setup: () => {
      bump();
      tooOld();
    },
    command: () => runUpdate({ yes: true }),
    code: 1,
    hint: false,
  },
  {
    name: 'update --yes: a write that throws (unwritable destination)',
    setup: () => {
      bump();
      chmodSync(at(SECURITY_DIR), 0o555);
    },
    restore: () => chmodSync(at(SECURITY_DIR), 0o755),
    command: () => runUpdate({ yes: true }),
    code: 1,
    hint: true,
    skip: asRoot,
  },
  {
    name: 'update: a declined confirm',
    setup: () => {
      bump();
      interactive({ confirm: [false] });
    },
    command: () => runUpdate(),
    code: 0,
  },
  {
    name: 'update --dry-run --json: a fetch refused for a missing pharn-install.json',
    setup: () => {
      bump();
      manifestLess();
    },
    command: () => runUpdate({ dryRun: true, json: true }),
    code: 1,
    hint: true,
  },
  {
    name: 'status: a fetch refused for a missing pharn-install.json',
    setup: manifestLess,
    command: () => runStatus({ drift: true }),
    code: 1,
    hint: true,
  },
  {
    name: 'status --strict: a drifted file (the verdict, already reported)',
    setup: () => write(SECURITY, 'edited by hand\n'),
    command: () => runStatus({ strict: true, drift: true }),
    code: 1,
    hint: false,
  },
];

describe('the temp clone is removed on every exit path', () => {
  it.each(cases)('$name', async (c) => {
    if (c.skip) return;
    await installFresh();
    const clones = watchClones();
    const before = tarballs();
    c.setup?.();
    try {
      expect(await run(c.command)).toBe(c.code);
    } finally {
      c.restore?.();
    }
    // The command did download a clone, and nothing of it is left.
    expect(tarballs()).toBe(before + 1);
    expect(clones()).toEqual([]);
    if (c.hint !== undefined) expect(printed().includes(HINT)).toBe(c.hint);
  });
});
