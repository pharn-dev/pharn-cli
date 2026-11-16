import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// ---------------------------------------------------------------------------
// Code invariants of src/ — each one an eslint rule whose message names its
// reason. They apply to src/**/*.ts only: tests and scripts legitimately spawn
// processes, hash raw bytes and read files. tests/lint-rules.test.ts lints a
// planted violation (and each exemption) against THIS config, in-process.
//
// Declared once, as data. Flat config does not merge a rule's options across
// config objects — a later object that sets `no-restricted-imports` for a file
// REPLACES the earlier one — so `invariantConfigs` gives every file exactly one
// object per rule, carrying its full option list: one for src/**/*.ts, then one
// for each file an entry exempts (`except`) or targets alone (`only`).
//
// What an AST rule cannot see, a text scan could not either: a dynamic
// `import(name)`, `globalThis['process']`, a regex built at run time. Those stay
// named residuals, not claims.
// ---------------------------------------------------------------------------

const SRC = 'src/**/*.ts';

const PROMPT_APIS = [
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
];

const NODE_FS = ['node:fs', 'fs', 'node:fs/promises', 'fs/promises'];

/** `{name, message}` path entries for several module specifiers. */
const modules = (names, message, extra = {}) =>
  names.map((name) => ({ name, message, ...extra }));

// The old CONTROL_RANGE / CATEGORY_CLASS spellings, matched on the literal's
// raw source (one or two backslashes: a regex literal or a RegExp string).
const CONTROL_RANGE = String.raw`/\\{1,2}(?:x[0-9a-f]{2}|u00[0-9a-f]{2}|u\{[0-9a-f]{1,2}\})-\\{1,2}(?:x|u00|u\{)/i`;
const CATEGORY_CLASS = String.raw`/\[[^\]\n]*\\{1,2}p\{C[cf]\}/`;
// capability-index.ts's literal port of pharn-oss's fence rule — not a
// sanitizer. Spared by its exact spelling, so the exemption cannot widen.
const DISPLACED_LEAD_RAW = String.raw`/^[\s\p{Cf}]+(?=---)/u`;

const MSG = {
  childProcess:
    'src/ spawns no process: removing the only git caller removed the attacker-controlled .git/config (core.fsmonitor, hooks) RCE surface, and the CLI never executes a file it installs (THREAT-MODEL §1).',
  picocolors:
    "Import colour from src/lib/color.ts: one picocolors instance, decided by the same stream check @clack/prompts makes, so pharn's text and clack's chrome are never coloured differently (F-28).",
  sha256File:
    'Use contentHash: every drift and records comparison must use the CRLF-folding hash, or two sides of a comparison mix schemes (F-16). sha256File is the raw byte hash, for byte pins in tests only.',
  isTTY:
    "Read isTTY only as an argument to interactiveAllowed({...}) (src/lib/capability-picker.ts): one predicate decides 'interactive', so no caller can check only stdout and let a pipe through.",
  processExit:
    'process.exit skips every `finally` (the temp clone, the project lock): throw a CliError (src/lib/cli-error.ts) and let runCli in src/index.ts report it and set process.exitCode. Only src/lib/fatal-signal.ts may call it.',
  updatePrompt:
    "update's confirm is its only prompt: `update --yes` skips exactly that confirm, so any other prompt would block a piped `--yes` run.",
  diffPrimitives:
    'diff.ts owns no disk or hash primitive: it reads through apply-update.ts and hash.ts, so the status drift check and the update decision can never disagree.',
  executableUnitFs:
    'isExecutableUnitPath is a path-only membership test: executable-unit.ts reads no file.',
  rootMigrationRename:
    "root-migration.ts never moves user data (CORE-158): a path's type is no proof it is PHARN's (memory-bank/ is also Cline's), so the note only hints.",
  symlinkWalk:
    'The symlink-component walk lives in src/lib/symlink-guard.ts: call findSymlinkComponent(Or) instead of forking it. (This matches the one spelling the forks used, `current = current ? … : …`, not every respelling.)',
  unsafeChars:
    'The unsafe-character set is defined once, in src/lib/terminal-safe.ts: use terminalSafe, hasUnsafeChars, escapeUnsafe or assertSafeString instead of a second control-range or \\p{Cf}/\\p{Cc} class.',
  reportError:
    'Report failures through src/lib/report-error.ts (logError, reportFatal, …): the one place that turns an error into output and decides the PHARN_DEBUG dump and hint.',
  reportEscape:
    'A --json report escapes through serializeJsonReport (src/lib/json-report.ts), never its own escapeUnsafe call: one serializer, one escape.',
  cloneProducer:
    'fetchRepo (src/lib/repo.ts) is the only producer of a clone tree: clone-side readers skip symlink checks because of that invariant (CORE-173).',
  noCpSync:
    "Write install files through applyWrites (src/lib/apply-update.ts), never fs.cp/cpSync: a recursive copy follows a symlinked destination directory and, unfiltered, writes into a hard-linked file's inode.",
};

const reportModules = readdirSync(new URL('./src/lib/', import.meta.url))
  .filter((f) => f.endsWith('.ts') && f.includes('report'))
  .map((f) => `src/lib/${f}`);

// The only file that may call process.exit: the fatal-signal handler, whose
// re-raise fallback must end the process. Everything else, the entry point's
// argv refusals included, throws a CliError (src/lib/cli-error.ts), which
// `runCli` (src/index.ts) turns into process.exitCode once.
const PROCESS_EXIT_ALLOWLIST = ['src/lib/fatal-signal.ts'];

/**
 * One entry per invariant. `rule` is the eslint rule, `kind` the option slot
 * (`paths` / `patterns` for no-restricted-imports, `syntax` / `property` for the
 * other two), `only` limits it to the listed files, `except` exempts files.
 */
const INVARIANTS = [
  ...modules(['child_process', 'node:child_process'], MSG.childProcess).map(
    (entry) => ({ rule: 'no-restricted-imports', kind: 'paths', entry }),
  ),
  {
    rule: 'no-restricted-imports',
    kind: 'paths',
    entry: { name: 'picocolors', message: MSG.picocolors },
    except: ['src/lib/color.ts'],
  },
  {
    rule: 'no-restricted-imports',
    kind: 'patterns',
    entry: {
      group: ['**/hash.js'],
      importNames: ['sha256File'],
      message: MSG.sha256File,
    },
  },
  {
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: {
      selector:
        "MemberExpression[property.name='isTTY']:not(CallExpression[callee.name='interactiveAllowed'] MemberExpression)",
      message: MSG.isTTY,
    },
  },
  {
    rule: 'no-restricted-properties',
    kind: 'property',
    entry: { object: 'process', property: 'exit', message: MSG.processExit },
    except: PROCESS_EXIT_ALLOWLIST,
  },
  {
    rule: 'no-restricted-imports',
    kind: 'paths',
    entry: {
      name: '@clack/prompts',
      importNames: PROMPT_APIS.filter((api) => api !== 'confirm'),
      message: MSG.updatePrompt,
    },
    only: ['src/commands/update.ts'],
  },
  {
    rule: 'no-restricted-imports',
    kind: 'paths',
    entry: {
      name: '@clack/prompts',
      importNames: PROMPT_APIS,
      message: MSG.updatePrompt,
    },
    only: ['src/lib/update-render.ts'],
  },
  ...modules(
    ['node:fs', 'fs', 'node:crypto', 'crypto'],
    MSG.diffPrimitives,
  ).map((entry) => ({
    rule: 'no-restricted-imports',
    kind: 'paths',
    entry,
    only: ['src/lib/diff.ts'],
  })),
  ...modules(NODE_FS, MSG.executableUnitFs).map((entry) => ({
    rule: 'no-restricted-imports',
    kind: 'paths',
    entry,
    only: ['src/lib/executable-unit.ts'],
  })),
  {
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: {
      selector: 'Identifier[name=/^rename(Sync)?$/]',
      message: MSG.rootMigrationRename,
    },
    only: ['src/lib/root-migration.ts'],
  },
  {
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: {
      selector:
        "AssignmentExpression[left.name='current'][right.type='ConditionalExpression']",
      message: MSG.symlinkWalk,
    },
    except: ['src/lib/symlink-guard.ts'],
  },
  ...[
    `Literal[raw=${CONTROL_RANGE}]`,
    `TemplateElement[value.raw=${CONTROL_RANGE}]`,
    `Literal[raw=${CATEGORY_CLASS}]:not([raw='${DISPLACED_LEAD_RAW.replaceAll('\\', '\\\\')}'])`,
    `TemplateElement[value.raw=${CATEGORY_CLASS}]`,
  ].map((selector) => ({
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: { selector, message: MSG.unsafeChars },
    except: ['src/lib/terminal-safe.ts'],
  })),
  ...[
    "CallExpression[callee.object.name='log'][callee.property.name='error']",
    "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='PHARN_DEBUG']",
    'Literal[value=/Re-run with PHARN_DEBUG/]',
    'TemplateElement[value.raw=/Re-run with PHARN_DEBUG/]',
  ].map((selector) => ({
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: { selector, message: MSG.reportError },
    except: ['src/lib/report-error.ts'],
  })),
  {
    rule: 'no-restricted-imports',
    kind: 'patterns',
    entry: {
      group: ['**/terminal-safe.js'],
      importNames: ['escapeUnsafe'],
      message: MSG.reportEscape,
    },
    only: reportModules.filter((f) => f !== 'src/lib/json-report.ts'),
  },
  {
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: {
      selector:
        'CallExpression:matches([callee.name=/^(extractTarGz|extractTar|mkdtempSync|mkdtemp)$/], [callee.property.name=/^(extractTarGz|extractTar|mkdtempSync|mkdtemp)$/])',
      message: MSG.cloneProducer,
    },
    except: ['src/lib/repo.ts', 'src/lib/tar-extract.ts'],
  },
  {
    rule: 'no-restricted-syntax',
    kind: 'syntax',
    entry: {
      selector:
        "Identifier[name='cpSync'], ImportSpecifier[imported.name='cp']",
      message: MSG.noCpSync,
    },
  },
];

/** The entries that apply to `file` (null = an ordinary src file). */
function appliesTo(entry, file) {
  if (entry.only) return file !== null && entry.only.includes(file);
  return file === null || !(entry.except ?? []).includes(file);
}

/** One rule's full setting for `file`, from the entries that apply to it. */
function ruleSetting(rule, file) {
  const entries = INVARIANTS.filter(
    (e) => e.rule === rule && appliesTo(e, file),
  );
  if (entries.length === 0) return 'off';
  const of = (kind) =>
    entries.filter((e) => e.kind === kind).map((e) => e.entry);
  if (rule === 'no-restricted-imports')
    return ['error', { paths: of('paths'), patterns: of('patterns') }];
  return ['error', ...entries.map((e) => e.entry)];
}

function invariantConfigs() {
  const rules = [...new Set(INVARIANTS.map((e) => e.rule))];
  const special = [
    ...new Set(
      INVARIANTS.flatMap((e) => [...(e.only ?? []), ...(e.except ?? [])]),
    ),
  ].sort();
  const forFile = (file) =>
    Object.fromEntries(rules.map((rule) => [rule, ruleSetting(rule, file)]));
  return [
    { files: [SRC], rules: forFile(null) },
    ...special.map((file) => ({ files: [file], rules: forFile(file) })),
  ];
}

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // The whole repo is ESM Node ("type": "module"), so `nodeBuiltin` — Node minus
      // the CJS-only names — is the accurate platform, and `__dirname`/`require` in
      // an .mjs still trips no-undef. (Plain `globals.node` would declare those five
      // CJS names as available, silently passing a real ESM runtime crash.) This is
      // what covers scripts/*.mjs: typescript-eslint turns no-undef off for TS, so
      // before this the plain-JS surface had no platform declared at all.
      globals: globals.nodeBuiltin,
    },
    rules: {
      // Severity is `error`, not `warn`: `npm run lint` runs --max-warnings 0, so a
      // warning already fails the gate. Warnings are not a tier here, and the config
      // should not advertise a softness the gate does not have.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  ...invariantConfigs(),
);
