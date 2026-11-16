import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, expect, vi, type Mock } from 'vitest';
import * as clack from '@clack/prompts';
import {
  ProcessExit,
  restoreNodeVersion,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from '../helpers.js';
import { codeloadArchive } from './tar-fixture.js';
import { runInit } from '../../src/commands/init.js';
import { CliError } from '../../src/lib/cli-error.js';
import { reportCliError } from '../../src/lib/report-error.js';

// ---------------------------------------------------------------------------
// The command-suite harness (CORE-190). Every suite under tests/commands/ runs
// the REAL `run<Command>()` against a real temp project. Nothing from src/ is
// mocked. Two boundaries are replaced:
//
//   - the network, at the one place it leaves the process — the global
//     `fetch` — by `fetchStub`, which serves a real gzipped codeload tarball
//     (tar-fixture.ts) of `upstream.tree` and the small GitHub answers each
//     channel asks for (the latest release and its tag's commit for `latest`,
//     the tip's commit and its SKILLS_VERSION for `main`);
//   - the terminal, by the clack stub (clack-stub.ts), which each suite
//     installs with its own one-line `vi.mock` (vi.mock is per file).
//
// Assertions read real files, pharn.config.json, pharn.records.json, the exit
// code, what reached stdout/stderr and what was handed to clack.
// ---------------------------------------------------------------------------

export const REPO = 'pharn-dev/pharn-oss';
export const RESOLVE_URL = `https://api.github.com/repos/${REPO}/commits/refs/heads/main`;
export const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const tagCommitUrl = (tag: string): string =>
  `https://api.github.com/repos/${REPO}/commits/refs/tags/${tag}`;
export const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/SKILLS_VERSION`;
export const tarballUrl = (sha: string): string =>
  `https://codeload.github.com/${REPO}/tar.gz/${sha}`;

export const SHA_V1 = '1'.repeat(40);
export const SHA_V2 = '2'.repeat(40);
export const SHA_V3 = '4'.repeat(40);
// The same 1.0.0 at a later commit — what a torn `add` stamps the store with.
export const SHA_V1_LATER = '3'.repeat(40);

/** pharn-oss's own `models` block, which init copies verbatim. */
export const UPSTREAM_MODELS = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'high' },
  },
};

export const HOOK_SETTINGS = JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write',
        hooks: [{ type: 'command', command: 'node .claude/hooks/guard.cjs' }],
      },
    ],
  },
});

export function capability(
  role: string,
  applies: string,
  body: string,
): string {
  return `---\nname: x\nrole: ${role}\napplies: ${applies}\n---\n${body}\n`;
}

// The `pharn/` layout paths pharn-oss ships today.
export const SECURITY = 'pharn/pharn-pipeline/grillers/security/security.md';
export const A11Y = 'pharn/pharn-pipeline/grillers/a11y/a11y.md';
export const N_PLUS_ONE = 'pharn/pharn-review/n-plus-one/n-plus-one.md';
export const CONSTITUTION = 'pharn/CONSTITUTION.md';
export const FLOOR = 'pharn/floor/validate.mjs';
export const PLAN_COMMAND = '.claude/commands/pharn-plan.md';
export const HOOK = '.claude/hooks/guard.cjs';
export const SETTINGS = '.claude/settings.json';
// The review lens agent pharn-oss ships from 6.64.0 on (CORE-272).
export const AGENT = '.claude/agents/pharn-review-lens.md';

// The flat layout (a pre-`pharn/` pharn-oss).
export const FLAT = {
  security: 'pharn-pipeline/grillers/security/security.md',
  a11y: 'pharn-pipeline/grillers/a11y/a11y.md',
  nPlusOne: 'pharn-review/n-plus-one/n-plus-one.md',
  constitution: 'CONSTITUTION.md',
  floor: '.dev/floor/validate.mjs',
  license: 'PHARN-LICENSE',
} as const;

export type Tree = Record<string, string>;

/**
 * pharn-oss at `version`, in the `pharn/` layout it ships today, with every
 * product surface the install declares — so a clean install reports nothing
 * absent upstream — plus the dev-only files the install must leave behind.
 */
export function upstreamTree(version: string): Tree {
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
    [FLOOR]: 'export {};\n',
    'pharn/floor/validate.test.mjs': 'dev only\n',
    [SECURITY]: capability('griller', '["universal"]', `security ${version}`),
    [A11Y]: capability('griller', '["ssr", "spa"]', 'a11y'),
    [N_PLUS_ONE]: capability('lens', '["backend"]', 'n-plus-one'),
    [PLAN_COMMAND]: 'plan\n',
    '.claude/commands/pharn-dev-plan.md': 'dev only\n',
    [AGENT]: `review lens agent ${version}\n`,
    '.claude/agents/pharn-dev-reviewer.md': 'dev only\n',
    [HOOK]: 'module.exports = {};\n',
    [SETTINGS]: HOOK_SETTINGS,
  };
}

/** pharn-oss at a 7.x version: both root docs moved under pharn/. */
export function upstreamTree7(version: string): Tree {
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

/** pharn-oss at `version` in the FLAT layout (no `pharn/pharn-contracts`). */
export function flatTree(version: string): Tree {
  return {
    SKILLS_VERSION: `${version}\n`,
    LICENSE: 'Apache-2.0\n',
    'pharn.config.json': JSON.stringify({ models: UPSTREAM_MODELS }),
    [FLAT.constitution]: `constitution ${version}\n`,
    'ARCHITECTURE.md': 'architecture\n',
    'THREAT-MODEL.md': 'threat model\n',
    'LIMITS.md': 'limits\n',
    'features/README.md': 'features\n',
    'pharn-contracts/finding-shape.md': 'finding shape\n',
    [FLAT.floor]: 'export {};\n',
    '.dev/floor/validate.test.mjs': 'dev only\n',
    [FLAT.security]: capability(
      'griller',
      '["universal"]',
      `security ${version}`,
    ),
    [FLAT.a11y]: capability('griller', '["ssr", "spa"]', 'a11y'),
    [FLAT.nPlusOne]: capability('lens', '["backend"]', 'n-plus-one'),
    [PLAN_COMMAND]: 'plan\n',
    [AGENT]: `review lens agent ${version}\n`,
    [HOOK]: 'module.exports = {};\n',
    [SETTINGS]: HOOK_SETTINGS,
  };
}

/**
 * What the stubbed network serves: the tip of `main` and — unless `published`
 * is false — a verified release AT that tip (tag `v<version>`). So the default
 * channel and `--ref main` see the same bytes. Mutable in place: a test may
 * edit `upstream.tree` after `serveTip`.
 */
export const upstream: {
  sha: string;
  version: string;
  tree: Tree;
  published: boolean;
} = {
  sha: SHA_V1,
  version: '1.0.0',
  tree: upstreamTree('1.0.0'),
  published: true,
};

export function serveTip(
  sha: string,
  version: string,
  opts: { published?: boolean; tree?: Tree } = {},
): void {
  upstream.sha = sha;
  upstream.version = version;
  upstream.tree = opts.tree ?? upstreamTree(version);
  upstream.published = opts.published ?? true;
}

/** Which request kinds to fail, and how: a thrown error or an HTTP status. */
export type FetchKind = 'release' | 'tag' | 'tip' | 'version' | 'tarball';
export const failures: Partial<Record<FetchKind, 'throw' | number>> = {};

function kindOf(url: string): FetchKind | null {
  if (url === RESOLVE_URL) return 'tip';
  if (url === VERSION_URL) return 'version';
  if (url === RELEASE_URL) return 'release';
  if (url.startsWith(tagCommitUrl(''))) return 'tag';
  if (url.startsWith(tarballUrl(''))) return 'tarball';
  return null;
}

export const fetchStub = vi.fn(async (input: unknown): Promise<Response> => {
  const url = String(input);
  const kind = kindOf(url);
  const failure = kind ? failures[kind] : undefined;
  if (failure === 'throw') throw new TypeError('fetch failed');
  if (typeof failure === 'number') {
    return new Response('{"message":"stubbed failure"}', { status: failure });
  }
  // The bare-id media type the SHA resolves ask for, not the commit object.
  if (kind === 'tip') return new Response(upstream.sha);
  if (kind === 'version') return new Response(upstream.tree.SKILLS_VERSION);
  if (kind === 'release') {
    return upstream.published
      ? Response.json({
          tag_name: `v${upstream.version}`,
          draft: false,
          prerelease: false,
        })
      : new Response('{"message":"Not Found"}', { status: 404 });
  }
  if (upstream.published && url === tagCommitUrl(`v${upstream.version}`)) {
    return new Response(upstream.sha);
  }
  if (url === tarballUrl(upstream.sha)) {
    return new Response(
      new Uint8Array(codeloadArchive(upstream.sha, upstream.tree)),
    );
  }
  throw new Error(`unexpected fetch: ${url}`);
});

/** Every URL fetched since the test began (or the last `fetchStub.mockClear()`). */
export const fetched = (): string[] =>
  fetchStub.mock.calls.map(([u]) => String(u));
/** Whether a tarball was downloaded. */
export const downloaded = (): boolean =>
  fetched().some((u) => u.startsWith(tarballUrl('')));

// The repository directory init's prerequisite looks for; an empty project is
// that directory and nothing else, so detection resolves `lib`.
export const REPO_DIR = '.git';

let projectDir = '';
let stdoutLines: string[] = [];
let stderrLines: string[] = [];

/** The temp project of the running test. */
export const proj = (): string => projectDir;
/** What reached stdout via console.log, one entry per call. */
export const stdout = (): string[] => stdoutLines;
/** What reached stderr via console.error, one entry per call. */
export const stderr = (): string[] => stderrLines;
/** Forget what was printed so far (stdout, stderr and every clack call). */
export function clearOutput(): void {
  stdoutLines = [];
  stderrLines = [];
  for (const fn of clackOutputs()) fn.mockClear();
  vi.mocked(clack.spinner).mockClear();
}

function clackOutputs(): Mock[] {
  return [
    clack.intro,
    clack.outro,
    clack.note,
    clack.cancel,
    clack.log.info,
    clack.log.warn,
    clack.log.error,
    clack.log.success,
    clack.log.step,
    clack.log.message,
  ] as unknown as Mock[];
}

/**
 * Install the harness for the calling suite: a fresh project under a temp dir
 * holding only `.git`, `process.cwd()` pinned to it, `process.exit` turned into
 * a throw, `fetch` stubbed, upstream reset to 1.0.0 at SHA_V1, and console
 * output captured. Call once at the top level of a test file.
 */
export function useHarness(): void {
  const tmp = useTmpDir();
  stubProcessExit();
  beforeEach(() => {
    serveTip(SHA_V1, '1.0.0');
    for (const k of Object.keys(failures)) delete failures[k as FetchKind];
    vi.stubGlobal('fetch', fetchStub);
    projectDir = join(tmp.path(), 'proj');
    mkdirSync(join(projectDir, REPO_DIR), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
    stdoutLines = [];
    stderrLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdoutLines.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderrLines.push(args.map(String).join(' '));
    });
  });
  afterEach(() => {
    restoreTTY();
    restoreNodeVersion();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    // Drops every queued `mockResolvedValueOnce` answer and recorded call, and
    // puts each stub back on the implementation it was created with.
    vi.resetAllMocks();
    process.exitCode = undefined;
  });
}

/**
 * Run a command as `runCli` (src/index.ts) does: a thrown CliError is printed
 * by the REAL top-level printer, `reportCliError`, and surfaces as its exit
 * code; a normal return as `null`. Any other throw is a bug and fails the test.
 * A stray `process.exit` (the stub throws ProcessExit) still surfaces as its
 * code, so a regression shows up as an assertion, not a dead worker.
 */
export async function run(
  command: () => Promise<void>,
): Promise<number | null> {
  try {
    await command();
    return null;
  } catch (err) {
    if (err instanceof ProcessExit) return err.code ?? 0;
    if (err instanceof CliError) return reportCliError(err);
    throw err;
  }
}

/**
 * Point the clone's temp dir (os.tmpdir reads TMPDIR at call time) at a
 * private directory beside the project, so a case can see the temp clone
 * removed on every exit path. Returns a reader of what is left in it.
 */
export function watchClones(): () => string[] {
  const dir = join(projectDir, '..', 'clones');
  mkdirSync(dir);
  vi.stubEnv('TMPDIR', dir);
  return () => readdirSync(dir);
}

export const at = (rel: string): string => join(projectDir, rel);
export const read = (rel: string): string => readFileSync(at(rel), 'utf8');
export const exists = (rel: string): boolean => existsSync(at(rel));
/** Write a project file, creating its parent directories. */
export function write(rel: string, content: string): void {
  mkdirSync(dirname(at(rel)), { recursive: true });
  writeFileSync(at(rel), content);
}
export const sha256 = (rel: string): string =>
  createHash('sha256')
    .update(readFileSync(at(rel)))
    .digest('hex');
/** The whole-tree snapshot of the project (tests/helpers.ts). */
export const snapshot = (): string[] => snapshotTree(projectDir);

export interface Config {
  skillsVersion: string;
  pharnVersion?: string;
  ref?: string;
  pendingSkillsVersion?: string;
  frozenCapabilities?: string[];
  commit: string | null;
  layout: string;
  archetypes: string[];
  capabilities: { name: string; role: string; source?: string }[];
  models?: unknown;
  installedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
export interface Records {
  schemaVersion?: number;
  skillsVersion: string;
  commit: string | null;
  files: Record<string, string>;
}
export const config = (): Config =>
  JSON.parse(read('pharn.config.json')) as Config;
export const records = (): Records =>
  JSON.parse(read('pharn.records.json')) as Records;
/** Rewrite pharn.config.json from the current one, changed by `edit`. */
export function editConfig(edit: (c: Config) => void): void {
  const c = config();
  edit(c);
  writeFileSync(at('pharn.config.json'), `${JSON.stringify(c, null, 2)}\n`);
}
/** Rewrite pharn.records.json from the current one, changed by `edit`. */
export function editRecords(edit: (r: Records) => void): void {
  const r = records();
  edit(r);
  writeFileSync(at('pharn.records.json'), `${JSON.stringify(r, null, 2)}\n`);
}

/** Every regular file under the project, relative and sorted; REPO_DIR skipped. */
export function projectFiles(): string[] {
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

/** The files under `pharn/.backup/<ts>/`, relative to the one backup dir. */
export function backupFiles(): string[] {
  if (!exists('pharn/.backup')) return [];
  const dirs = readdirSync(at('pharn/.backup'));
  expect(dirs).toHaveLength(1);
  const prefix = `pharn/.backup/${dirs[0]!}/`;
  return projectFiles()
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length));
}

const text = (args: unknown[]): string =>
  stripVTControlCharacters(args.map(String).join(' '));

/** The bodies of every clack note titled `title`, colour stripped. */
export function notes(title: string): string[] {
  return vi
    .mocked(clack.note)
    .mock.calls.filter(([, t]) => t === title)
    .map(([body]) => stripVTControlCharacters(String(body)));
}
/** Every note title, in order. */
export const noteTitles = (): string[] =>
  vi.mocked(clack.note).mock.calls.map(([, t]) => String(t));
/** What went to one clack log level, one entry per call, colour stripped. */
export function logs(level: 'info' | 'warn' | 'error' | 'success'): string[] {
  // The message only: a second argument is clack's options (`{ output }`).
  return (clack.log[level] as unknown as Mock).mock.calls.map((args) =>
    text([(args as unknown[])[0]]),
  );
}
/** The last outro, colour stripped. */
export const lastOutro = (): string =>
  text((vi.mocked(clack.outro).mock.calls.at(-1) ?? []) as unknown[]);
/** Everything handed to clack plus stdout and stderr, as one string. */
export function printed(): string {
  return [
    ...clackOutputs().flatMap((fn) =>
      (fn.mock.calls as unknown[][]).map((args) => text(args)),
    ),
    ...stdoutLines,
    ...stderrLines,
  ].join('\n');
}
/** Raw (uncoloured-or-not) clack text, for escaping assertions. */
export function printedRaw(): string {
  return [
    ...clackOutputs().flatMap((fn) =>
      (fn.mock.calls as unknown[][]).map((args) => args.map(String).join(' ')),
    ),
    ...stdoutLines,
    ...stderrLines,
  ].join('\n');
}
/** The ONE JSON document a `--json` run printed on stdout. */
export function jsonOut<T = Record<string, unknown>>(): T {
  expect(stdoutLines).toHaveLength(1);
  return JSON.parse(stdoutLines[0]!) as T;
}

/** `pharn init --yes` (plus `opts`) into the project; it must return normally. */
export async function installFresh(
  opts: Parameters<typeof runInit>[0] = {},
): Promise<void> {
  expect(await run(() => runInit({ yes: true, ...opts }))).toBeNull();
}

/**
 * Open the interactive gate and script the prompts a run will reach, in order.
 * `init --yes` refuses every re-install, so a real re-run init is this one:
 * `interactive({ select: ['install'], confirm: [true] })`.
 */
export function interactive(
  answers: {
    select?: unknown[];
    confirm?: unknown[];
    groupMultiselect?: unknown[];
  } = {},
): void {
  setTTY(true, true);
  for (const a of answers.select ?? [])
    vi.mocked(clack.select).mockResolvedValueOnce(a as never);
  for (const a of answers.confirm ?? [])
    vi.mocked(clack.confirm).mockResolvedValueOnce(a as never);
  for (const a of answers.groupMultiselect ?? [])
    vi.mocked(clack.groupMultiselect).mockResolvedValueOnce(a as never);
}

/** What `init --yes` installs from `upstreamTree` for `lib`, minus the state files. */
export const INSTALLED = [
  AGENT,
  PLAN_COMMAND,
  HOOK,
  SETTINGS,
  'LIMITS.md',
  'THREAT-MODEL.md',
  'pharn/ARCHITECTURE.md',
  CONSTITUTION,
  'pharn/LICENSE',
  'pharn/features/README.md',
  FLOOR,
  'pharn/pharn-contracts/finding-shape.md',
  'pharn/pharn-core/seam-resolver/SKILL.md',
  SECURITY,
].sort();
// `.gitignore` is the user's, but a fresh install creates it with PHARN's
// entries (lib/gitignore.ts).
export const STATE_FILES = [
  '.gitignore',
  'pharn.config.json',
  'pharn.records.json',
];
export const PHARN_GITIGNORE_BLOCK =
  '# PHARN run state and update backups (added by pharn)\npharn/.run/\npharn/.backup/\n';

/** The project root's entries, the repository directory left out. */
export const rootEntries = (): string[] =>
  readdirSync(projectDir)
    .filter((n) => n !== REPO_DIR)
    .sort();
