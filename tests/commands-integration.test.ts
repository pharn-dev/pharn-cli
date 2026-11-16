import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as prettier from 'prettier';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import { codeloadArchive } from './support/tar-fixture.js';
import { PHARN_VERSION } from '../src/version.js';

// ---------------------------------------------------------------------------
// One UNMOCKED happy path per command (F-36).
//
// The command suites mock the seams between modules — install-capabilities,
// install-manifest, pharn-config, the fetch — so each suite proves its command
// against a stand-in, and a bug that lives BETWEEN two modules (the layout-gate
// class: `add` copying at one layout while `remove`/`status` address another)
// passes every one of them. Here nothing from src/ is mocked. The network is
// replaced at the one place it leaves the process — the global `fetch` — by a
// stub serving a real gzipped codeload tarball (tests/support/tar-fixture.ts)
// and the small GitHub answers each channel asks for — the latest release and
// its tag's commit (the default `latest` channel), the tip's commit and its
// SKILLS_VERSION (`--ref main`); the commands
// run against a real temp project, and the assertions read the real files,
// pharn.config.json and pharn.records.json.
//
// The only other stand-in is @clack/prompts, which is terminal UI: its output
// is silenced, and its two prompts THROW, because every path here is a
// non-interactive one (`--yes`, a named `add`/`remove`, `status --json`) and a
// prompt reached would be a bug, not an answer to supply.
// ---------------------------------------------------------------------------

vi.mock('@clack/prompts', () => {
  const prompt = (): never => {
    throw new Error('a non-interactive path reached a prompt');
  };
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    cancel: vi.fn(),
    spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    confirm: vi.fn(prompt),
    select: vi.fn(prompt),
    groupMultiselect: vi.fn(prompt),
    isCancel: () => false,
  };
});

const clack = await import('@clack/prompts');
const { runInit } = await import('../src/commands/init.js');
const { runAdd } = await import('../src/commands/add.js');
const { runUpdate } = await import('../src/commands/update.js');
const { runRemove } = await import('../src/commands/remove.js');
const { runStatus } = await import('../src/commands/status.js');
const { runUninstall } = await import('../src/commands/uninstall.js');

const REPO = 'pharn-dev/pharn-oss';
// Both resolves ask for a FULL ref (CORE-169): a same-named tag or branch
// cannot answer for the other.
const RESOLVE_URL = `https://api.github.com/repos/${REPO}/commits/refs/heads/main`;
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const tagCommitUrl = (tag: string): string =>
  `https://api.github.com/repos/${REPO}/commits/refs/tags/${tag}`;
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/SKILLS_VERSION`;
const tarballUrl = (sha: string): string =>
  `https://codeload.github.com/${REPO}/tar.gz/${sha}`;

const SHA_V1 = '1'.repeat(40);
const SHA_V2 = '2'.repeat(40);
// The same 1.0.0 at a later commit — what a torn `add` stamps the store with.
const SHA_V1_LATER = '3'.repeat(40);

// pharn-oss's own `models` block, which init copies verbatim.
const UPSTREAM_MODELS = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'high' },
  },
};

const HOOK_SETTINGS = JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write',
        hooks: [{ type: 'command', command: 'node .claude/hooks/guard.cjs' }],
      },
    ],
  },
});

function capability(role: string, applies: string, body: string): string {
  return `---\nname: x\nrole: ${role}\napplies: ${applies}\n---\n${body}\n`;
}

const SECURITY = 'pharn/pharn-pipeline/grillers/security/security.md';
const A11Y = 'pharn/pharn-pipeline/grillers/a11y/a11y.md';
const N_PLUS_ONE = 'pharn/pharn-review/n-plus-one/n-plus-one.md';
const CONSTITUTION = 'pharn/CONSTITUTION.md';
const PLAN_COMMAND = '.claude/commands/pharn-plan.md';

/**
 * pharn-oss at `version`, in the `pharn/` layout it ships today, with every
 * product surface the install declares — so a clean install reports nothing
 * absent upstream — plus the dev-only files the install must leave behind.
 */
function upstreamTree(version: string): Record<string, string> {
  return {
    SKILLS_VERSION: `${version}\n`,
    LICENSE: 'Apache-2.0\n',
    'pharn.config.json': JSON.stringify({ models: UPSTREAM_MODELS }),
    [CONSTITUTION]: `constitution ${version}\n`,
    'pharn/ARCHITECTURE.md': 'architecture\n',
    'THREAT-MODEL.md': 'threat model\n',
    'LIMITS.md': 'limits\n',
    'pharn/features/README.md': 'features\n',
    'pharn/pharn-contracts/finding-shape.md': 'finding shape\n',
    'pharn/pharn-core/seam-resolver/SKILL.md': 'seam resolver\n',
    'pharn/floor/validate.mjs': 'export {};\n',
    'pharn/floor/validate.test.mjs': 'dev only\n',
    [SECURITY]: capability('griller', '["universal"]', `security ${version}`),
    [A11Y]: capability('griller', '["ssr", "spa"]', 'a11y'),
    [N_PLUS_ONE]: capability('lens', '["backend"]', 'n-plus-one'),
    [PLAN_COMMAND]: 'plan\n',
    '.claude/commands/pharn-dev-plan.md': 'dev only\n',
    '.claude/hooks/guard.cjs': 'module.exports = {};\n',
    '.claude/settings.json': HOOK_SETTINGS,
  };
}

/**
 * What the stubbed network serves: the tip of `main` and — unless
 * `published` is false — a verified release AT that tip (tag `v<version>`), as
 * pharn-oss's release workflow cuts one once the tip's checks pass. So the
 * default channel and `--ref main` see the same bytes, and each test reads one
 * upstream state whichever channel its install follows.
 */
let tip: {
  sha: string;
  version: string;
  tree: Record<string, string>;
  published: boolean;
};

function serveTip(sha: string, version: string, published = true): void {
  tip = { sha, version, tree: upstreamTree(version), published };
}

const fetchStub = vi.fn(async (input: unknown): Promise<Response> => {
  const url = String(input);
  // The bare-id media type fetchCommitSha asks for (F-21), not the commit object.
  if (url === RESOLVE_URL) return new Response(tip.sha);
  if (url === VERSION_URL) return new Response(tip.tree.SKILLS_VERSION);
  if (url === RELEASE_URL) {
    return tip.published
      ? Response.json({
          tag_name: `v${tip.version}`,
          draft: false,
          prerelease: false,
        })
      : new Response('{"message":"Not Found"}', { status: 404 });
  }
  if (tip.published && url === tagCommitUrl(`v${tip.version}`)) {
    return new Response(tip.sha);
  }
  if (url === tarballUrl(tip.sha)) {
    return new Response(new Uint8Array(codeloadArchive(tip.sha, tip.tree)));
  }
  throw new Error(`unexpected fetch: ${url}`);
});

const tmp = useTmpDir();
stubProcessExit();
let proj = '';
let stdout: string[] = [];

// Every command reads the project root from the process; it is pinned to the
// temp project for the duration of a test.
const pinProjectRoot = (dir: string) =>
  vi.spyOn(process, 'cwd').mockReturnValue(dir);

// The repository directory init's prerequisite looks for; an empty project is
// that directory and nothing else, so detection resolves `lib`.
const REPO_DIR = '.git';

/** Collect what a command prints on stdout (`status --json` prints ONE line). */
function captureConsole(): void {
  stdout = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

beforeEach(() => {
  serveTip(SHA_V1, '1.0.0');
  vi.stubGlobal('fetch', fetchStub);
  proj = join(tmp.path(), 'proj');
  mkdirSync(join(proj, REPO_DIR), { recursive: true });
  pinProjectRoot(proj);
  captureConsole();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchStub.mockClear();
  process.exitCode = undefined;
});

/** Run a command; a `process.exit` surfaces as its code (a return as `null`). */
async function run(command: () => Promise<void>): Promise<number | null> {
  try {
    await command();
    return null;
  } catch (err) {
    if (err instanceof ProcessExit) return err.code ?? 0;
    throw err;
  }
}

const at = (rel: string): string => join(proj, rel);
const read = (rel: string): string => readFileSync(at(rel), 'utf8');
const sha256 = (rel: string): string =>
  createHash('sha256')
    .update(readFileSync(at(rel)))
    .digest('hex');

interface Config {
  skillsVersion: string;
  ref?: string;
  pendingSkillsVersion?: string;
  commit: string | null;
  layout: string;
  archetypes: string[];
  capabilities: { name: string; role: string; source?: string }[];
  models?: unknown;
}
interface Records {
  skillsVersion: string;
  commit: string | null;
  files: Record<string, string>;
}
const config = (): Config => JSON.parse(read('pharn.config.json')) as Config;
const records = (): Records =>
  JSON.parse(read('pharn.records.json')) as Records;

/** Every regular file under the project, relative and sorted; REPO_DIR skipped. */
function projectFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const ent of readdirSync(at(rel), { withFileTypes: true })) {
      const child = rel === '' ? ent.name : `${rel}/${ent.name}`;
      if (child === REPO_DIR) continue;
      if (ent.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk('');
  return out.sort();
}

/** `pharn init --yes` into the project, which must return normally. */
async function init(): Promise<void> {
  expect(await run(() => runInit({ yes: true }))).toBeNull();
}

/** The slice of the `status --json` report these cases read. */
interface StatusJson {
  schemaVersion: number;
  version: { installed: string; latest: string; outdated: boolean };
  archetypes: string[];
  capabilities: { count: number };
  layout: { recorded: string; upstream: string | null };
  drift: {
    modified: string[];
    missing: string[];
    absentUpstream: unknown[];
  } | null;
  hooks: { status: string; missing: unknown[] } | null;
  strict: { failed: boolean };
}

/** The files of the init in the first case, minus the two state files. */
const INSTALLED = [
  '.claude/commands/pharn-plan.md',
  '.claude/hooks/guard.cjs',
  '.claude/settings.json',
  'LIMITS.md',
  'THREAT-MODEL.md',
  'pharn/ARCHITECTURE.md',
  'pharn/CONSTITUTION.md',
  'pharn/LICENSE',
  'pharn/features/README.md',
  'pharn/floor/validate.mjs',
  'pharn/pharn-contracts/finding-shape.md',
  'pharn/pharn-core/seam-resolver/SKILL.md',
  SECURITY,
].sort();
// `.gitignore` is the user's, but a fresh install creates it with PHARN's
// entries (lib/gitignore.ts).
const STATE_FILES = ['.gitignore', 'pharn.config.json', 'pharn.records.json'];
const PHARN_GITIGNORE_BLOCK =
  '# PHARN run state and update backups (added by pharn)\npharn/.run/\npharn/.backup/\n';

describe('commands end to end, against a real project (no src/ mocks)', () => {
  it('init --yes installs the archetype selection into an empty project', async () => {
    await init();

    // The selection for `lib` (the universal griller only), every product
    // surface at the clone's `pharn/` layout, and none of the dev-only files.
    expect(projectFiles()).toEqual([...INSTALLED, ...STATE_FILES].sort());
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(read('pharn/LICENSE')).toBe('Apache-2.0\n');

    expect(config()).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1,
      layout: 'pharn',
      capabilities: [{ name: 'security', role: 'griller', source: 'auto' }],
      archetypes: ['lib'],
      models: UPSTREAM_MODELS,
    });

    // Every file pharn wrote is recorded at the hash of what landed (the
    // user-owned settings.json is not pharn's), stamped with the config pair.
    const rec = records();
    expect(rec).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    const owned = INSTALLED.filter((f) => f !== '.claude/settings.json');
    for (const rel of owned) expect(rec.files[rel], rel).toBe(sha256(rel));
  });

  // CORE-172: the settings.json a fresh init writes is the hook commands
  // Claude Code will run; init lists them, read from the clone it copied.
  it('init --yes lists the hooks of the settings.json it writes', async () => {
    vi.mocked(clack.note).mockClear();
    await init();
    const hooks = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'HOOKS')
      .map(([body]) => String(body));
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toContain(
      'Wrote .claude/settings.json from upstream. It wires 1 hook(s):',
    );
    expect(hooks[0]).toContain(
      'PreToolUse [Write]: {"type":"command","command":"node .claude/hooks/guard.cjs"}',
    );
    expect(hooks[0]).toContain(
      'Claude Code runs these commands; review `.claude/settings.json`.',
    );
    expect(read('.claude/settings.json')).toBe(HOOK_SETTINGS);
  });

  // The layout-gate class: `add` copies at the CLONE's layout, while `remove`,
  // `status` and `update` address the project at the RECORDED one. Through the
  // real modules the capability must land where the readers look.
  it('add <name> installs one capability at the recorded layout, as manual', async () => {
    await init();
    expect(await run(() => runAdd('a11y'))).toBeNull();

    expect(read(A11Y)).toContain('a11y');
    expect(existsSync(at('pharn-pipeline/grillers/a11y'))).toBe(false);
    const cfg = config();
    expect(cfg.capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'a11y', role: 'griller', source: 'manual' },
    ]);
    // `add` refreshes nothing it did not write: same version, same stamp.
    expect(cfg.skillsVersion).toBe('1.0.0');
    const rec = records();
    expect(rec.files[A11Y]).toBe(sha256(A11Y));
    expect(rec.skillsVersion).toBe('1.0.0');

    // The readers agree: status sees the capability, and drift is clean.
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout.at(-1) ?? '') as StatusJson;
    expect(report.capabilities.count).toBe(2);
    expect(report.drift?.modified).toEqual([]);
    expect(report.drift?.missing).toEqual([]);
  });

  // 0.16.0 (lib/gitignore.ts): init appends PHARN's run state and backups to
  // the user's `.gitignore` (CRLF kept, their bytes the prefix); a same-version
  // update with both lines present changes nothing; a deleted line re-opens it
  // and comes back, once.
  it('init and update keep pharn/.run/ and pharn/.backup/ in .gitignore, idempotently', async () => {
    writeFileSync(at('.gitignore'), 'node_modules\r\ndist\r\n');
    await init();
    const full =
      'node_modules\r\ndist\r\n# PHARN run state and update backups (added by pharn)\r\npharn/.run/\r\npharn/.backup/\r\n';
    expect(read('.gitignore')).toBe(full);

    const installed = read('pharn.config.json');
    const { installedAt } = JSON.parse(installed);
    expect(JSON.parse(installed)).not.toHaveProperty('updatedAt');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(full);
    // The early return: nothing re-applied, so the config was not rewritten.
    expect(read('pharn.config.json')).toBe(installed);

    writeFileSync(at('.gitignore'), full.replace('pharn/.backup/\r\n', ''));
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(
      full.replace('pharn/.backup/\r\n', '') + 'pharn/.backup/\r\n',
    );
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(
      full.replace('pharn/.backup/\r\n', '') + 'pharn/.backup/\r\n',
    );
    // The re-opened run rewrote the config: it records this CLI and the time of
    // the update, and keeps the first install's date.
    const updated = JSON.parse(read('pharn.config.json'));
    expect(updated.installedAt).toBe(installedAt);
    expect(updated.pharnVersion).toBe(PHARN_VERSION);
    expect(typeof updated.updatedAt).toBe('string');
    expect(new Date(updated.updatedAt).toISOString()).toBe(updated.updatedAt);
  });

  // 0.17.0 (lib/prettierignore.ts): in a project that uses Prettier, init
  // makes `.prettierignore` cover every file it wrote — checked with Prettier's
  // own matcher, not pharn's — a same-version update changes nothing, status
  // is quiet, and uninstall leaves the lines.
  it('init keeps a Prettier project’s check off every file pharn wrote; update, status and uninstall leave it', async () => {
    writeFileSync(at('.prettierrc'), '{}\n');
    await init();
    const written = read('.prettierignore');
    const owned = [
      ...INSTALLED.filter((f) => f !== '.claude/settings.json'),
      'pharn.config.json',
      'pharn.records.json',
    ];
    for (const rel of owned) {
      const info = await prettier.getFileInfo(at(rel), {
        ignorePath: at('.prettierignore'),
      });
      expect(info.ignored, rel).toBe(true);
    }
    // The user's own settings and files stay under their check.
    for (const rel of ['.claude/settings.json', 'src/index.ts', 'README.md'])
      expect(
        (
          await prettier.getFileInfo(at(rel), {
            ignorePath: at('.prettierignore'),
          })
        ).ignored,
        rel,
      ).toBe(false);

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(written);

    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(JSON.parse(stdout.at(-1) ?? '').prettierignore).toBeNull();

    // A deleted line comes back, once.
    writeFileSync(
      at('.prettierignore'),
      written.replace('/pharn.config.json\n', ''),
    );
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(JSON.parse(stdout.at(-1) ?? '').prettierignore).toEqual({
      action: 'append',
      entries: ['/pharn.config.json'],
    });
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(
      written.replace('/pharn.config.json\n', '') + '/pharn.config.json\n',
    );

    const before = read('.prettierignore');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(before);
  });

  it('update --yes upgrades a clean file, skips an edited one, and withholds the bump', async () => {
    await init();
    const v1Constitution = records().files[CONSTITUTION];
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);

    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();

    // The clean file is upgraded and re-recorded at what landed.
    expect(read(SECURITY)).toContain('security 2.0.0');
    const rec = records();
    expect(rec.files[SECURITY]).toBe(sha256(SECURITY));
    // The edited file is the user's: kept byte for byte, its record unchanged,
    // so the next run still reads it as `modified`.
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(rec.files[CONSTITUTION]).toBe(v1Constitution);

    // A skip withholds the version bump (the recorded version stays true) and
    // names the version every other file is already at.
    const cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.commit).toBe(SHA_V1);
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');
    expect(rec).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });

  // CORE-160: a config with no `commit` key used to load as `commit: undefined`,
  // which never equals the store's `null`, so the store was ignored and every
  // differing file read `unverifiable`; a withheld run then stamped the store
  // with `undefined`, JSON.stringify dropped the key, and the store read invalid.
  describe('a config without commit keeps the records store usable (CORE-160)', () => {
    const dropConfigCommit = (): void => {
      const cfg = config() as Partial<Config>;
      delete cfg.commit;
      writeFileSync(at('pharn.config.json'), JSON.stringify(cfg, null, 2));
    };
    const restampStore = (edit: (r: Partial<Records>) => void): void => {
      const rec = records() as Partial<Records>;
      edit(rec);
      writeFileSync(at('pharn.records.json'), JSON.stringify(rec, null, 2));
    };

    it('update uses a store stamped commit null: clean files upgrade, the withheld store keeps commit null', async () => {
      await init();
      dropConfigCommit();
      restampStore((r) => {
        r.commit = null;
      });
      writeFileSync(at(CONSTITUTION), `my own constitution\n`);

      serveTip(SHA_V2, '2.0.0');
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();

      // The store was used: the clean file is an upgrade, not `unverifiable`.
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
      const cfg = config();
      expect(cfg.skillsVersion).toBe('1.0.0');
      expect(cfg.pendingSkillsVersion).toBe('2.0.0');
      // The withheld run stamps both files with an explicit `null`, so the
      // store still reads back valid and usable next run.
      expect(cfg).toHaveProperty('commit', null);
      const rec = records();
      expect(rec).toHaveProperty('commit', null);
      expect(rec.skillsVersion).toBe('1.0.0');
      expect(rec.files[SECURITY]).toBe(sha256(SECURITY));
      expect(existsSync(at('pharn/.backup'))).toBe(false);
    });

    it('update reads a store an earlier CLI wrote with no commit key as usable', async () => {
      await init();
      dropConfigCommit();
      restampStore((r) => {
        delete r.commit;
      });

      serveTip(SHA_V2, '2.0.0');
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();

      // Every clean file upgraded, so the bump lands and nothing was skipped.
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(config()).toMatchObject({
        skillsVersion: '2.0.0',
        commit: SHA_V2,
      });
      expect(config().pendingSkillsVersion).toBeUndefined();
      expect(records()).toMatchObject({
        skillsVersion: '2.0.0',
        commit: SHA_V2,
      });
      expect(existsSync(at('pharn/.backup'))).toBe(false);
    });
  });

  // CORE-162: once a kept edit withholds the bump, every later run re-plans —
  // and a run whose plan changes nothing asks nothing and writes nothing.
  it('a second update over a kept edit asks nothing and writes nothing', async () => {
    await init();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(config().pendingSkillsVersion).toBe('2.0.0');

    const before = {
      tree: snapshotTree(proj),
      config: read('pharn.config.json'),
      records: read('pharn.records.json'),
    };
    vi.mocked(clack.note).mockClear();
    vi.mocked(clack.outro).mockClear();
    // An interactive terminal and NO --yes: the throwing confirm would fail
    // the run if it were reached.
    setTTY(true, true);
    try {
      expect(await run(() => runUpdate())).toBeNull();
    } finally {
      restoreTTY();
    }

    expect(clack.confirm).not.toHaveBeenCalled();
    expect(read('pharn.config.json')).toBe(before.config);
    expect(read('pharn.records.json')).toBe(before.records);
    expect(snapshotTree(proj)).toEqual(before.tree);
    // The kept edit is still named, and the run ends saying so.
    const skipped = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'SKIPPED')
      .map(([body]) => String(body))
      .join('\n');
    expect(skipped).toContain(CONSTITUTION);
    expect(String(vi.mocked(clack.outro).mock.calls.at(-1)?.[0])).toContain(
      'Nothing to change.',
    );
  });

  it('update --force lists every file it will overwrite before it asks, then records the run', async () => {
    await init();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    serveTip(SHA_V2, '2.0.0');
    const order: string[] = [];
    vi.mocked(clack.note).mockImplementation((body, title) => {
      order.push(`note ${String(title)}: ${String(body)}`);
    });
    vi.mocked(clack.confirm).mockImplementationOnce(() => {
      order.push('confirm');
      return Promise.resolve(true);
    });
    setTTY(true, true);
    try {
      expect(await run(() => runUpdate({ force: true }))).toBeNull();
    } finally {
      restoreTTY();
      vi.mocked(clack.note).mockReset();
    }

    const confirmAt = order.indexOf('confirm');
    const listAt = order.findIndex(
      (e) => e.startsWith('note OVERWRITE:') && e.includes(CONSTITUTION),
    );
    expect(confirmAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(-1);
    expect(listAt).toBeLessThan(confirmAt);
    expect(order[listAt]).toContain('WILL OVERWRITE (--force) — modified');
    // A run that writes still records itself.
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    const cfg = JSON.parse(read('pharn.config.json')) as {
      updatedAt?: string;
      pharnVersion?: string;
    };
    expect(typeof cfg.updatedAt).toBe('string');
    expect(cfg.pharnVersion).toBe(PHARN_VERSION);
  });

  // CORE-161, the reviewed repro: a torn `add` (records written stamped for a
  // commit the config never reached, the config write lost), then upstream
  // releases. A recorded hash proves authorship whatever the stamp, so the
  // unedited files upgrade, the edited one skips as `modified`, nothing is
  // `unrecorded` or `unverifiable` — on this run or the next — and no
  // `--force` is needed.
  it('update --yes after a torn add and an upstream bump upgrades clean files without --force', async () => {
    await init();
    const configBefore = read('pharn.config.json');
    serveTip(SHA_V1_LATER, '1.0.0');
    expect(await run(() => runAdd('a11y'))).toBeNull();
    // The torn half: the store carries the add, the config never did.
    writeFileSync(at('pharn.config.json'), configBefore);
    expect(records().commit).toBe(SHA_V1_LATER);
    expect(config().commit).toBe(SHA_V1);
    const v1Constitution = records().files[CONSTITUTION];
    writeFileSync(at(CONSTITUTION), 'my own constitution\n');

    serveTip(SHA_V2, '2.0.0');
    const skippedNotes = (): string =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'SKIPPED')
        .map(([body]) => String(body))
        .join('\n');
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();

    // Unedited files upgrade: the store still proves pharn wrote them.
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(records().files[SECURITY]).toBe(sha256(SECURITY));
    // The edited file is the user's: kept, its record carried.
    expect(read(CONSTITUTION)).toBe('my own constitution\n');
    expect(records().files[CONSTITUTION]).toBe(v1Constitution);
    const first = skippedNotes();
    expect(first).toContain('MODIFIED');
    expect(first).toContain(CONSTITUTION);
    expect(first).not.toContain('UNRECORDED');
    expect(first).not.toContain('UNVERIFIABLE');
    expect(config().pendingSkillsVersion).toBe('2.0.0');
    expect(existsSync(at('pharn/.backup'))).toBe(false);

    // The next run reads the same: still only the user's edit, never
    // `unrecorded`.
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    const second = skippedNotes();
    expect(second).toContain('MODIFIED');
    expect(second).not.toContain('UNRECORDED');
    expect(second).not.toContain('UNVERIFIABLE');
    expect(read(CONSTITUTION)).toBe('my own constitution\n');
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });

  // 0.18.0, the measured mixed-version failure: a NEW floor file beside an
  // EDITED one. The executable unit (floor + hooks + pharn-* commands) is
  // written all or none, so nothing in it lands; everything else still
  // upgrades, the bump is withheld, the version it applied is recorded as
  // pending (the only blocker is the user's edit, CORE-159), and the run exits 0.
  it('update --yes holds the whole executable unit when one floor file is edited', async () => {
    await init();
    const OLD = 'pharn/floor/validate.mjs';
    const NEW = 'pharn/floor/worktree-fingerprint.mjs';
    writeFileSync(at(OLD), 'export const mine = 1;\n');
    const before = {
      hook: read('.claude/hooks/guard.cjs'),
      command: read(PLAN_COMMAND),
      records: records(),
    };

    serveTip(SHA_V2, '2.0.0');
    tip.tree[OLD] = 'export const STATE_ROOT_SEGMENT = 1;\n';
    tip.tree[NEW] = "import { STATE_ROOT_SEGMENT } from './validate.mjs';\n";
    tip.tree['.claude/hooks/guard.cjs'] = 'module.exports = { v: 2 };\n';
    tip.tree[PLAN_COMMAND] = 'plan 2.0.0\n';
    vi.mocked(clack.note).mockClear();

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // No unit file was written: the edited one is the user's, the new one is
    // absent, and the clean hook and command stay at 1.0.0.
    expect(read(OLD)).toBe('export const mine = 1;\n');
    expect(existsSync(at(NEW))).toBe(false);
    expect(read('.claude/hooks/guard.cjs')).toBe(before.hook);
    expect(read(PLAN_COMMAND)).toBe(before.command);
    // Outside the unit, files still upgrade.
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');

    // The held files keep their old records; the new one gets none.
    const rec = records();
    expect(rec.files['.claude/hooks/guard.cjs']).toBe(
      before.records.files['.claude/hooks/guard.cjs'],
    );
    expect(rec.files[PLAN_COMMAND]).toBe(before.records.files[PLAN_COMMAND]);
    expect(NEW in rec.files).toBe(false);

    // The version is withheld. CORE-159 inverts the 0.18.0 "nothing pending":
    // the hold's only blocker is the user's edit, so 2.0.0 is recorded as
    // pending and `pharn add` keeps working.
    const cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');

    // Named before the apply (future tense) and in the report after it.
    const unitNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'EXECUTABLE UNIT')
      .map(([body]) => String(body));
    expect(unitNotes).toHaveLength(2);
    expect(unitNotes[0]).toContain('would be skipped');
    expect(unitNotes[1]).toContain('were skipped');
    for (const body of unitNotes) {
      expect(body).toContain(`modified     ${OLD}`);
      expect(body).toContain('So 3 other unit file(s)');
      expect(body).toContain('`pharn update --force`');
    }
    const skipped = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'SKIPPED')
      .map(([body]) => String(body))
      .join('\n');
    expect(skipped).toContain('HELD');
    expect(skipped).toContain(NEW);

    // --force then writes the unit whole, backing up the edited file first.
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(read(OLD)).toBe('export const STATE_ROOT_SEGMENT = 1;\n');
    expect(existsSync(at(NEW))).toBe(true);
    expect(config().skillsVersion).toBe('2.0.0');
    const backups = readdirSync(at('pharn/.backup'));
    expect(backups).toHaveLength(1);
    expect(
      readFileSync(join(at('pharn/.backup'), backups[0]!, OLD), 'utf8'),
    ).toBe('export const mine = 1;\n');
  });

  // CORE-159: a hold caused only by the user's own edit no longer locks out
  // `pharn add`. Edit a command and delete a hook, move upstream: the unit is
  // held (the hook stays missing, named), 2.0.0 is pending, and `add` installs
  // at it without touching the unit or the stamp. Reverting the edit lets the
  // next update finish: the hook comes back and the pending version clears.
  it('update --yes over a held unit records the pending version; add works; a revert finishes the upgrade', async () => {
    await init();
    const HOOK = '.claude/hooks/guard.cjs';
    const FLOOR = 'pharn/floor/validate.mjs';
    const original = read(PLAN_COMMAND);
    writeFileSync(at(PLAN_COMMAND), 'my own plan\n');
    rmSync(at(HOOK));

    serveTip(SHA_V2, '2.0.0');
    tip.tree[FLOOR] = 'export const v = 2;\n';
    tip.tree[HOOK] = 'module.exports = { v: 2 };\n';
    vi.mocked(clack.note).mockClear();

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // Held: the edit is kept, the hook is not restored, the floor stays v1.
    expect(read(PLAN_COMMAND)).toBe('my own plan\n');
    expect(existsSync(at(HOOK))).toBe(false);
    expect(read(FLOOR)).toBe('export {};\n');
    expect(read(SECURITY)).toContain('security 2.0.0');
    const unitNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'EXECUTABLE UNIT')
      .map(([body]) => String(body));
    expect(unitNotes).toHaveLength(2);
    expect(unitNotes[0]).toContain('would stay missing until the hold ends');
    expect(unitNotes[1]).toContain('stay missing until the hold ends');
    for (const body of unitNotes) {
      expect(body).toContain(`modified     ${PLAN_COMMAND}`);
      expect(body).toContain(`  ${HOOK}`);
    }
    let cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.commit).toBe(SHA_V1);
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');

    // `add` installs at the pending version, keeping the config's own stamp
    // and leaving the held unit exactly as it was.
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(read(A11Y)).toContain('a11y');
    cfg = config();
    expect(cfg.capabilities).toContainEqual({
      name: 'a11y',
      role: 'griller',
      source: 'manual',
    });
    expect(cfg).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1,
      pendingSkillsVersion: '2.0.0',
    });
    expect(records()).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    expect(records().files[A11Y]).toBe(sha256(A11Y));
    expect(read(PLAN_COMMAND)).toBe('my own plan\n');
    expect(existsSync(at(HOOK))).toBe(false);
    expect(read(FLOOR)).toBe('export {};\n');

    // Revert the edit: the next update completes and clears the pending version.
    writeFileSync(at(PLAN_COMMAND), original);
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read(HOOK)).toBe('module.exports = { v: 2 };\n');
    expect(read(FLOOR)).toBe('export const v = 2;\n');
    expect(read(A11Y)).toContain('a11y');
    cfg = config();
    expect(cfg.skillsVersion).toBe('2.0.0');
    expect(cfg.commit).toBe(SHA_V2);
    expect(cfg.pendingSkillsVersion).toBeUndefined();
    expect(records()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
  });

  it('remove <name> deletes that capability, its config entry and its records', async () => {
    await init();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(await run(() => runRemove('a11y'))).toBeNull();

    expect(existsSync(at('pharn/pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
    ]);
    const keys = Object.keys(records().files);
    expect(keys.filter((k) => k.includes('/a11y/'))).toEqual([]);
    expect(keys).toContain(SECURITY);
    // Every file was pharn's and unchanged, so nothing needed saving.
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });

  it('status --json prints one report: current, no drift, then the edit it finds', async () => {
    await init();
    stdout = [];
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(stdout).toHaveLength(1);
    const clean = JSON.parse(stdout[0] ?? '') as StatusJson;
    expect(clean).toMatchObject({
      schemaVersion: 1,
      version: { installed: '1.0.0', latest: '1.0.0', outdated: false },
      archetypes: ['lib'],
      capabilities: { count: 1 },
      layout: { recorded: 'pharn', upstream: 'pharn' },
      drift: { modified: [], missing: [], absentUpstream: [] },
      hooks: { missing: [] },
      strict: { failed: false },
    });

    writeFileSync(at(PLAN_COMMAND), `edited\n`);
    rmSync(at('LIMITS.md'));
    stdout = [];
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const drifted = JSON.parse(stdout[0] ?? '') as StatusJson;
    expect(drifted.drift?.modified).toEqual([PLAN_COMMAND]);
    expect(drifted.drift?.missing).toEqual(['LIMITS.md']);
    // status is read-only: nothing it reported was put back.
    expect(read(PLAN_COMMAND)).toBe(`edited\n`);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
  });

  // CORE-163: status used to prescribe `pharn update --force` for a missing
  // file, which also overwrites every edit. A plain update restores it (the
  // missing recorded file re-opens the same-version early return) and keeps
  // the edit, which is what the MISSING note now says.
  it('status advises a plain update for a missing file; update --yes restores it and keeps the edit', async () => {
    await init();
    const FLOOR = 'pharn/floor/validate.mjs';
    rmSync(at(PLAN_COMMAND));
    writeFileSync(at(FLOOR), 'export const mine = 1;\n');
    const edited = readFileSync(at(FLOOR));

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runStatus({}))).toBeNull();
    const drift = stripVTControlCharacters(
      String(
        vi.mocked(clack.note).mock.calls.find(([, t]) => t === 'DRIFT')?.[0],
      ),
    );
    expect(drift).toContain('MISSING (expected but absent)');
    expect(drift).toContain(PLAN_COMMAND);
    expect(drift).toContain(
      'Run `pharn update` to restore them (files you edited are kept).',
    );
    expect(drift.indexOf('`pharn update` to restore')).toBeLessThan(
      drift.indexOf('pharn update --force'),
    );

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(readFileSync(at(FLOOR)).equals(edited)).toBe(true);
    // Nothing was overwritten, so nothing was backed up.
    expect(existsSync(at('pharn/.backup'))).toBe(false);
    // The run was at the current version: no upgrade to finish.
    const warned = vi
      .mocked(clack.log.warn)
      .mock.calls.map(([m]) => stripVTControlCharacters(String(m)))
      .join('\n');
    expect(warned).toContain('already at skills v1.0.0');
    expect(warned).not.toContain('finish the upgrade');

    stdout = [];
    expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
    const after = JSON.parse(stdout[0] ?? '') as StatusJson;
    expect(after.drift?.missing).toEqual([]);
    // The kept edit is still drift, so --strict still fails on it.
    expect(after.drift?.modified).toEqual([FLOOR]);
    expect(after.strict.failed).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('uninstall --yes deletes what the records prove, keeps edits and settings', async () => {
    await init();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();

    // Left: the user-owned settings, the edited file, and the backup of the
    // config uninstall removed. Everything else pharn wrote is gone, the
    // directories it emptied included.
    const left = projectFiles();
    const backups = left.filter((f) => f.startsWith('pharn/.backup/'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^pharn\/\.backup\/[^/]+\/pharn\.config\.json$/);
    // `.gitignore` too: pharn's lines in it are harmless and stay (removing
    // a user-file line would be a rewrite).
    expect(left.filter((f) => !f.startsWith('pharn/.backup/'))).toEqual([
      '.claude/settings.json',
      '.gitignore',
      CONSTITUTION,
    ]);
    expect(read('.gitignore')).toBe(PHARN_GITIGNORE_BLOCK);
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(existsSync(at('pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(at('.claude/commands'))).toBe(false);
    expect(existsSync(at(REPO_DIR))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CORE-170: pharn.records.json is committed and hand-editable, and the note
// `update` prints when it cannot use the store quotes strings from it (a key,
// the stamp) through JSON.stringify — which escapes ESC but leaves an 8-bit
// CSI (U+009B) and a bidi override (U+202E) raw. Two setups, because only a
// STALE store re-opens update's same-version early return: an invalid one
// prints nothing until upstream moves.
// ---------------------------------------------------------------------------

describe('a hostile pharn.records.json reaches the terminal escaped', () => {
  const CSI = '\u009b';
  const RLO = '\u202e';
  const ESC = '\u001b';

  /** Everything the commands handed to clack, one string. */
  const printed = (): string =>
    [clack.note, clack.outro, clack.log.info, clack.log.warn, clack.log.error]
      .flatMap((fn) => (fn as Mock).mock.calls as unknown[][])
      .map((args) => args.map(String).join(' '))
      .join('\n');

  const clearPrinted = (): void => {
    for (const fn of [
      clack.note,
      clack.outro,
      clack.log.info,
      clack.log.warn,
      clack.log.error,
    ])
      (fn as Mock).mockClear();
  };

  const expectNoRaw = (text: string): void => {
    expect(text).not.toContain(CSI);
    expect(text).not.toContain(RLO);
    expect(text).not.toContain(ESC);
  };

  /** Rewrite the store pharn wrote, changed by `edit`. */
  const plantStore = (edit: (r: Records) => void): void => {
    const r = records();
    edit(r);
    writeFileSync(at('pharn.records.json'), JSON.stringify(r, null, 2));
  };

  // CORE-161: the stamp no longer gates the baseline, so no note quotes it —
  // a hostile stamp is never printed, raw or otherwise, even when upstream
  // moves and the run plans.
  it('a hostile stamp is never printed: update (newer upstream) names no stamp, --json carries no note', async () => {
    await init();
    plantStore((r) => {
      r.skillsVersion = `1.0.0${CSI}2J${RLO}x${ESC}[31m`;
    });
    serveTip(SHA_V2, '2.0.0');

    clearPrinted();
    expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
    expectNoRaw(printed());
    expect(printed()).not.toContain('2J');

    stdout = [];
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(stdout).toHaveLength(1);
    expectNoRaw(stdout[0]!);
    const report = JSON.parse(stdout[0]!) as {
      plan: { recordsNote: string | null };
    };
    expect(report.plan.recordsNote).toBeNull();

    clearPrinted();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expectNoRaw(printed());
    expect(printed()).not.toContain('2J');
  });

  it('a hostile key in an invalid store: update (newer upstream) and uninstall print it escaped', async () => {
    await init();
    const plant = (): void =>
      plantStore((r) => {
        r.files[`pharn/x${CSI}2J${RLO}y${ESC}[31m.md`] = 'not-a-sha256';
      });
    const shown = 'invalid hash for "pharn/x\\u009b2J\\u202ey\\u001b[31m.md"';
    // An invalid store does not re-open the same-version early return, so
    // upstream moves: the run gets far enough to print the note.
    serveTip(SHA_V2, '2.0.0');
    plant();

    clearPrinted();
    expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
    expect(printed()).toContain(shown);
    expectNoRaw(printed());

    clearPrinted();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(printed()).toContain(shown);
    expectNoRaw(printed());

    // update rewrote the store; plant the hostile one again.
    plant();
    clearPrinted();
    expect(await run(() => runUninstall({ yes: true }))).toBe(1);
    expect(printed()).toContain(shown);
    expectNoRaw(printed());
    expect(existsSync(at('pharn.config.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The root-footprint migration (lib/root-migration.ts), end to end: an install
// made from a pre-7.0 pharn-oss (THREAT-MODEL.md / LIMITS.md at the root) is
// updated against a 7.0.0 tree that keeps them under pharn/.
// ---------------------------------------------------------------------------

/** pharn-oss at a 7.x version: both docs moved under pharn/. */
function upstreamTree7(version: string): Record<string, string> {
  const {
    'THREAT-MODEL.md': threat,
    'LIMITS.md': limits,
    ...rest
  } = upstreamTree(version);
  return {
    ...rest,
    'pharn/THREAT-MODEL.md': threat!,
    'pharn/LIMITS.md': limits!,
  };
}

function serveTip7(sha: string, version: string): void {
  tip = { sha, version, tree: upstreamTree7(version), published: true };
}

/** The project root's entries, the repository directory left out. */
const rootEntries = (): string[] =>
  readdirSync(proj)
    .filter((n) => n !== REPO_DIR)
    .sort();

interface MigrationJson {
  status: string;
  plan: {
    rootMigration: {
      docs: { rel: string; action: string }[];
      moves: { from: string; to: string; action: string }[];
      scratchNotice: boolean;
      gitignoreHints: string[];
    } | null;
  } | null;
}

describe('root-footprint migration, end to end', () => {
  // A 6.x install, plus the user's data and pharn-oss's scratch at the root.
  async function oldInstallWithUserData(): Promise<void> {
    serveTip(SHA_V1, '6.9.0');
    await init();
    expect(records().files['THREAT-MODEL.md']).toBeDefined();
    expect(records().files['LIMITS.md']).toBeDefined();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/lessons-learned.md'), 'lesson\n');
    writeFileSync(at('pharn.spec-template.md'), 'template\n');
    mkdirSync(at('.pharn'));
    writeFileSync(at('.pharn/ci.yml'), 'threshold: 90\n');
    writeFileSync(at('.pharn/writes-scope.json'), '{}\n');
    writeFileSync(at('.gitignore'), 'node_modules\n.pharn/\n.pharn-backup\n');
  }

  it('previews, then retires the root docs, leaves the user data with a hint, and status is clean right after', async () => {
    await oldInstallWithUserData();
    serveTip7(SHA_V2, '7.0.0');

    stdout = [];
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    const preview = JSON.parse(stdout[0] ?? '') as MigrationJson;
    // `moves` stays in the report (schemaVersion 1) and is always empty: the
    // user data is never moved (CORE-158); the hint is text-only.
    expect(preview.plan?.rootMigration).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'delete' },
        { rel: 'LIMITS.md', action: 'delete' },
      ],
      moves: [],
      scratchNotice: true,
      gitignoreHints: ['pharn/.run/', 'pharn/.backup/'],
    });
    // Nothing of the user's data is backed up: nothing of it is touched.
    const previewBackups = (
      JSON.parse(stdout[0] ?? '') as { plan: { backups: string[] } }
    ).plan.backups;
    expect(previewBackups).not.toContain('memory-bank/lessons-learned.md');
    expect(previewBackups).not.toContain('pharn.spec-template.md');
    // The preview wrote nothing.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(true);
    expect(existsSync(at('memory-bank'))).toBe(true);

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // Named BEFORE it is applied (the confirm's note, printed under --yes too),
    // then reported after. Both carry the hint, never a move.
    const migrationNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
      .map(([body]) => String(body));
    expect(migrationNotes).toHaveLength(2);
    expect(migrationNotes[0]).toContain('WOULD DELETE THREAT-MODEL.md');
    expect(migrationNotes[1]).toContain('deleted THREAT-MODEL.md');
    for (const body of migrationNotes) {
      expect(body).not.toContain('MOVE');
      expect(body).toContain(
        "If it is PHARN's, move it: git mv memory-bank pharn/memory-bank (or mv, if git does not track it).",
      );
      expect(body).toContain(
        'git mv pharn.spec-template.md pharn/spec-template.md',
      );
    }

    // The docs: gone from the root, at pharn/, and recorded there only.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
    expect(read('pharn/THREAT-MODEL.md')).toBe('threat model\n');
    expect(read('pharn/LIMITS.md')).toBe('limits\n');
    const files = records().files;
    expect(files['THREAT-MODEL.md']).toBeUndefined();
    expect(files['LIMITS.md']).toBeUndefined();
    expect(files['pharn/THREAT-MODEL.md']).toBe(
      sha256('pharn/THREAT-MODEL.md'),
    );
    expect(files['pharn/LIMITS.md']).toBe(sha256('pharn/LIMITS.md'));
    expect(config().skillsVersion).toBe('7.0.0');

    // The user's data: left exactly where and as it was (CORE-158) — not
    // moved, not copied, not backed up.
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);
    expect(
      projectFiles().filter((f) => f.startsWith('pharn/.backup/')),
    ).toEqual([]);
    // The scratch dir is only noticed. The user's .gitignore lines are kept
    // byte for byte (the old names are hinted at, never rewritten) and pharn's
    // block is appended after them (lib/gitignore.ts).
    expect(read('.pharn/writes-scope.json')).toBe('{}\n');
    expect(read('.gitignore')).toBe(
      `node_modules\n.pharn/\n.pharn-backup\n${PHARN_GITIGNORE_BLOCK}`,
    );

    // Nothing of pharn's at the root but .claude/, pharn/ and the JSON files;
    // `.gitignore` and `.pharn/` are the user's and pharn-oss's, and
    // `memory-bank/` and the template are the user's to place.
    expect(rootEntries()).toEqual([
      '.claude',
      '.gitignore',
      '.pharn',
      'memory-bank',
      'pharn',
      'pharn.config.json',
      'pharn.records.json',
      'pharn.spec-template.md',
    ]);

    // status is clean immediately after: no drift, no orphans, --strict passes.
    stdout = [];
    expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
    const status = JSON.parse(stdout[0] ?? '') as StatusJson & {
      orphans: unknown[] | null;
    };
    expect(status.drift).toMatchObject({ modified: [], missing: [] });
    expect(status.orphans).toEqual([]);
    expect(status.strict.failed).toBe(false);
    expect(process.exitCode).toBeUndefined();

    // And the next update has nothing left to do (the same-version return).
    const before = read('pharn.records.json');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('pharn.records.json')).toBe(before);
    expect(
      fetchStub.mock.calls.some(([u]) =>
        String(u).startsWith('https://codeload'),
      ),
    ).toBe(false);
  });

  it('keeps an edited root doc as an orphan; with memory-bank/ at both places it says merge by hand and exits 0', async () => {
    await oldInstallWithUserData();
    writeFileSync(at('LIMITS.md'), 'my limits\n');
    mkdirSync(at('pharn/memory-bank'));
    writeFileSync(at('pharn/memory-bank/other.md'), 'other\n');
    serveTip7(SHA_V2, '7.0.0');

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // Both copies present is not a failure any more (CORE-158).
    expect(process.exitCode).toBeUndefined();

    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(read('LIMITS.md')).toBe('my limits\n');
    // Kept docs keep their record: still a listed orphan.
    expect(records().files['LIMITS.md']).toBeDefined();
    // Never merged: both trees untouched. The template is not moved either,
    // although its destination is free.
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(readdirSync(at('pharn/memory-bank'))).toEqual(['other.md']);
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);

    const notes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
      .map(([body]) => String(body))
      .join('\n');
    expect(notes).toContain(
      'merge it into pharn/memory-bank/ by hand, then delete memory-bank/.',
    );
    // Never a `git mv` that would nest memory-bank/ inside the existing copy.
    expect(notes).not.toContain('git mv memory-bank');
    expect(notes).toContain(
      'git mv pharn.spec-template.md pharn/spec-template.md',
    );
  });

  it('update --force leaves the user data where it is too', async () => {
    await oldInstallWithUserData();
    serveTip7(SHA_V2, '7.0.0');
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);
    // The record-proved root docs are still retired.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
  });

  it('is inert against a pre-7.0 tree: nothing moves, and the report says null', async () => {
    await oldInstallWithUserData();
    serveTip(SHA_V2, '6.9.1');
    stdout = [];
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(
      (JSON.parse(stdout[0] ?? '') as MigrationJson).plan?.rootMigration,
    ).toBeNull();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('THREAT-MODEL.md')).toBe('threat model\n');
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(records().files['THREAT-MODEL.md']).toBeDefined();
  });

  it('re-opens the same-version return for root docs an older CLI left on a 7.x install', async () => {
    // What 0.13.0 leaves after updating to 7.0.0: config and records at 7.0.0,
    // the root docs still recorded (carried as orphans), no pharn/ docs.
    serveTip(SHA_V1, '6.9.0');
    await init();
    const stamp = { skillsVersion: '7.0.0', commit: SHA_V2 };
    writeFileSync(
      at('pharn.config.json'),
      JSON.stringify({ ...config(), ...stamp }, null, 2),
    );
    writeFileSync(
      at('pharn.records.json'),
      JSON.stringify({ ...records(), ...stamp }, null, 2),
    );
    serveTip7(SHA_V2, '7.0.0');

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
    expect(records().files['pharn/LIMITS.md']).toBeDefined();
  });

  it('does NOT re-open the same-version return for user data at the root of a 7.x install', async () => {
    serveTip7(SHA_V1, '7.0.0');
    await init();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    const before = read('pharn.records.json');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    // "Already up to date": no download, nothing rewritten, nothing moved.
    expect(
      fetchStub.mock.calls.some(([u]) =>
        String(u).startsWith('https://codeload'),
      ),
    ).toBe(false);
    expect(read('pharn.records.json')).toBe(before);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
  });

  it('a plan whose only root-migration content is a user-data hint changes nothing: no write, the hint printed', async () => {
    serveTip7(SHA_V1, '7.0.0');
    await init();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    // `--force` skips the same-version early return, so the run plans; with
    // every file at upstream, the hint is all the root migration has.
    stdout = [];
    expect(
      await run(() => runUpdate({ dryRun: true, json: true, force: true })),
    ).toBeNull();
    expect(
      (JSON.parse(stdout[0] ?? '') as MigrationJson).plan?.rootMigration,
    ).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'absent' },
        { rel: 'LIMITS.md', action: 'absent' },
      ],
      moves: [],
      scratchNotice: false,
      gitignoreHints: [],
    });
    const configBefore = read('pharn.config.json');
    const recordsBefore = read('pharn.records.json');
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    // changesNothing: neither state file is rewritten (no `updatedAt`).
    expect(read('pharn.config.json')).toBe(configBefore);
    expect(read('pharn.records.json')).toBe(recordsBefore);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
        .map(([body]) => String(body))
        .join('\n'),
    ).toContain('git mv memory-bank pharn/memory-bank');
  });

  it('a first init prints no ROOT MIGRATION note, even with memory-bank/ at the root', async () => {
    serveTip7(SHA_V1, '7.0.0');
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    vi.mocked(clack.note).mockClear();
    await init();
    expect(
      vi
        .mocked(clack.note)
        .mock.calls.some(([, title]) => title === 'ROOT MIGRATION'),
    ).toBe(false);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
  });

  it('a re-run init hints at memory-bank/ and never moves it (dry run and real run)', async () => {
    serveTip7(SHA_V1, '7.0.0');
    await init();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    const migrationNotes = (): string[] =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
        .map(([body]) => String(body));
    const HINT = 'git mv memory-bank pharn/memory-bank';

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runInit({ dryRun: true }))).toBeNull();
    expect(migrationNotes().join('\n')).toContain(HINT);

    // `init --yes` refuses every re-install, so the real re-run is the
    // interactive one: a terminal, the summary answered "install" and the
    // overwrite prompt "yes" — for this one case only.
    const tty = (stream: NodeJS.ReadStream | NodeJS.WriteStream): void => {
      Object.defineProperty(stream, 'isTTY', {
        value: true,
        configurable: true,
      });
    };
    const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    tty(process.stdin);
    tty(process.stdout);
    vi.mocked(clack.select).mockResolvedValueOnce('install');
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    vi.mocked(clack.note).mockClear();
    try {
      expect(await run(() => runInit({}))).toBeNull();
    } finally {
      for (const [stream, desc] of [
        [process.stdin, stdinTTY],
        [process.stdout, stdoutTTY],
      ] as const) {
        if (desc) Object.defineProperty(stream, 'isTTY', desc);
        else delete (stream as { isTTY?: boolean }).isTTY;
      }
    }
    expect(process.exitCode).toBeUndefined();
    expect(vi.mocked(clack.select)).toHaveBeenCalled();
    expect(migrationNotes().join('\n')).toContain(HINT);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
  });

  it('points at an old root .pharn-backup/ and leaves it alone', async () => {
    await init();
    mkdirSync(at('.pharn-backup/20261001-120000'), { recursive: true });
    writeFileSync(at('.pharn-backup/20261001-120000/x.md'), 'old\n');
    serveTip(SHA_V2, '2.0.0');
    vi.mocked(clack.log.info).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(
      vi
        .mocked(clack.log.info)
        .mock.calls.some(([m]) =>
          String(m).startsWith('.pharn-backup/ holds backups'),
        ),
    ).toBe(true);
    expect(read('.pharn-backup/20261001-120000/x.md')).toBe('old\n');
  });

  it('uninstall afterwards leaves no empty pharn/, and names what it kept', async () => {
    serveTip7(SHA_V1, '7.0.0');
    await init();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(readdirSync(at('pharn'))).toEqual(['.backup']);
    expect(rootEntries()).toEqual(['.claude', '.gitignore', 'pharn']);
  });
});

describe('the install channel, end to end', () => {
  const fetched = (): string[] => fetchStub.mock.calls.map(([u]) => String(u));
  const NOTICE =
    'Verified releases are now the default for new installs. This install keeps following pharn-oss main; run `pharn update --ref latest` to switch (recorded on first use).';
  const noticeCalls = (): number =>
    vi.mocked(clack.log.info).mock.calls.filter(([m]) => m === NOTICE).length;

  beforeEach(() => {
    fetchStub.mockClear();
    vi.mocked(clack.log.info).mockClear();
    vi.mocked(clack.log.error).mockClear();
  });

  it('init with no --ref installs the newest verified release and records it', async () => {
    await init();
    expect(config()).toMatchObject({
      ref: 'latest',
      skillsVersion: '1.0.0',
      commit: SHA_V1,
    });
    // The release and its tag's commit were resolved; the tip never was.
    expect(fetched()).toContain(RELEASE_URL);
    expect(fetched()).toContain(tagCommitUrl('v1.0.0'));
    expect(fetched()).not.toContain(RESOLVE_URL);
  });

  it('init with no --ref and no release refuses, names --ref main, and fetches no tarball', async () => {
    serveTip(SHA_V1, '1.0.0', false);
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(existsSync(at('pharn.config.json'))).toBe(false);
    expect(fetched().some((u) => u.startsWith('https://codeload.'))).toBe(
      false,
    );
    const errors = vi
      .mocked(clack.log.error)
      .mock.calls.map(([m]) => String(m))
      .join('\n');
    expect(errors).toContain('has published no release yet');
    expect(errors).toContain('pharn init --ref main');
  });

  it('--ref main installs the tip, records no ref, and update keeps it on main with one notice', async () => {
    expect(await run(() => runInit({ yes: true, ref: 'main' }))).toBeNull();
    expect(config().ref).toBeUndefined();
    expect(fetched()).toContain(RESOLVE_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    // init itself prints no notice.
    expect(noticeCalls()).toBe(0);

    serveTip(SHA_V2, '2.0.0');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // Followed main — not the release the stub also publishes — and said so once.
    expect(fetched()).toContain(VERSION_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    expect(config()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
    expect(config().ref).toBeUndefined();
    expect(noticeCalls()).toBe(1);

    // And status reports the recorded channel as main.
    stdout = [];
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout[0] ?? '') as {
      version: { channel: string; source: { kind: string } };
    };
    expect(report.version.channel).toBe('main');
    expect(report.version.source.kind).toBe('main');
  });
});
