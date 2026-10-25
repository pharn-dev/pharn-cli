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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import { codeloadArchive } from './support/tar-fixture.js';

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
// and the two small GitHub answers the `main` channel asks for; the commands
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
const RESOLVE_URL = `https://api.github.com/repos/${REPO}/commits/main`;
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/SKILLS_VERSION`;
const tarballUrl = (sha: string): string =>
  `https://codeload.github.com/${REPO}/tar.gz/${sha}`;

const SHA_V1 = '1'.repeat(40);
const SHA_V2 = '2'.repeat(40);

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

/** What the stubbed network serves: the tip of `main`. */
let tip: { sha: string; tree: Record<string, string> };

function serveTip(sha: string, version: string): void {
  tip = { sha, tree: upstreamTree(version) };
}

const fetchStub = vi.fn(async (input: unknown): Promise<Response> => {
  const url = String(input);
  // The bare-id media type fetchCommitSha asks for (F-21), not the commit object.
  if (url === RESOLVE_URL) return new Response(tip.sha);
  if (url === VERSION_URL) return new Response(tip.tree.SKILLS_VERSION);
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
const STATE_FILES = ['pharn.config.json', 'pharn.records.json'];

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
    expect(left.filter((f) => !f.startsWith('pharn/.backup/'))).toEqual([
      '.claude/settings.json',
      CONSTITUTION,
    ]);
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(existsSync(at('pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(at('.claude/commands'))).toBe(false);
    expect(existsSync(at(REPO_DIR))).toBe(true);
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
  tip = { sha, tree: upstreamTree7(version) };
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

  it('previews, then retires the root footprint, and status is clean right after', async () => {
    await oldInstallWithUserData();
    serveTip7(SHA_V2, '7.0.0');

    stdout = [];
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    const preview = JSON.parse(stdout[0] ?? '') as MigrationJson;
    expect(preview.plan?.rootMigration).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'delete' },
        { rel: 'LIMITS.md', action: 'delete' },
      ],
      moves: [
        { from: 'memory-bank/', to: 'pharn/memory-bank/', action: 'move' },
        {
          from: 'pharn.spec-template.md',
          to: 'pharn/spec-template.md',
          action: 'move',
        },
      ],
      scratchNotice: true,
      gitignoreHints: ['pharn/.run/', 'pharn/.backup/'],
    });
    // The preview counts what the moves back up, as the real run will.
    expect(
      (JSON.parse(stdout[0] ?? '') as { plan: { backups: string[] } }).plan
        .backups,
    ).toEqual(
      expect.arrayContaining([
        'memory-bank/lessons-learned.md',
        'pharn.spec-template.md',
      ]),
    );
    // The preview wrote nothing.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(true);
    expect(existsSync(at('memory-bank'))).toBe(true);

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // Named BEFORE it is applied (the confirm's note, printed under --yes too),
    // then reported after.
    const migrationNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
      .map(([body]) => String(body));
    expect(migrationNotes).toHaveLength(2);
    expect(migrationNotes[0]).toContain('WOULD DELETE THREAT-MODEL.md');
    expect(migrationNotes[0]).toContain('WOULD MOVE memory-bank/');
    expect(migrationNotes[1]).toContain('deleted THREAT-MODEL.md');

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

    // The user's data: moved, never merged, and backed up first.
    expect(existsSync(at('memory-bank'))).toBe(false);
    expect(read('pharn/memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(existsSync(at('pharn.spec-template.md'))).toBe(false);
    expect(read('pharn/spec-template.md')).toBe('template\n');
    const backed = projectFiles().filter((f) => f.startsWith('pharn/.backup/'));
    expect(
      backed.map((f) => f.replace(/^pharn\/\.backup\/[^/]+\//, '')),
    ).toEqual(['memory-bank/lessons-learned.md', 'pharn.spec-template.md']);
    // The scratch dir and the user's .gitignore are only noticed.
    expect(read('.pharn/writes-scope.json')).toBe('{}\n');
    expect(read('.gitignore')).toBe('node_modules\n.pharn/\n.pharn-backup\n');

    // Nothing of pharn's at the root but .claude/, pharn/ and the JSON files;
    // `.gitignore` and `.pharn/` are the user's and pharn-oss's.
    expect(rootEntries()).toEqual([
      '.claude',
      '.gitignore',
      '.pharn',
      'pharn',
      'pharn.config.json',
      'pharn.records.json',
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

  it('keeps an edited root doc as an orphan, refuses a move onto existing data, and exits 1', async () => {
    await oldInstallWithUserData();
    writeFileSync(at('LIMITS.md'), 'my limits\n');
    mkdirSync(at('pharn/memory-bank'));
    writeFileSync(at('pharn/memory-bank/other.md'), 'other\n');
    serveTip7(SHA_V2, '7.0.0');

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBe(1);

    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(read('LIMITS.md')).toBe('my limits\n');
    // Kept docs keep their record: still a listed orphan.
    expect(records().files['LIMITS.md']).toBeDefined();
    // Never merged: both trees untouched.
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(readdirSync(at('pharn/memory-bank'))).toEqual(['other.md']);
    // The template's destination was free, so that move still happened.
    expect(read('pharn/spec-template.md')).toBe('template\n');
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

  it('re-opens the same-version return for user data still at the root of a 7.x install', async () => {
    serveTip7(SHA_V1, '7.0.0');
    await init();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('pharn/memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('memory-bank'))).toBe(false);
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
    expect(rootEntries()).toEqual(['.claude', 'pharn']);
  });
});
