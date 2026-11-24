import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The code invariants of src/ are eslint rules (eslint.config.mjs). This lints
// one planted violation per rule — and each exemption — against the REAL config,
// in-process (no eslint spawn), so a rule scoped to the wrong file, or an option
// list a later config object silently replaces, fails here as well as in the
// required `Lint` job that enforces them on the real tree.

const REPO = join(import.meta.dirname, '..');
const RESTRICTED = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
  'no-restricted-properties',
]);

/** Invariant → a fragment of its message (each message names the reason). */
const REASONS = {
  childProcess: 'spawns no process',
  picocolors: 'Import colour from src/lib/color.ts',
  sha256File: 'Use contentHash',
  isTTY: 'Read isTTY only as an argument to interactiveAllowed',
  processExit: 'process.exit skips every `finally`',
  updatePrompt: "update's confirm is its only prompt",
  diffPrimitives: 'diff.ts owns no disk or hash primitive',
  executableUnitFs: 'executable-unit.ts reads no file',
  symlinkWalk: 'symlink-component walk lives in src/lib/symlink-guard.ts',
  unsafeChars: 'unsafe-character set is defined once',
  reportError: 'Report failures through src/lib/report-error.ts',
  reportEscape: 'escapes through serializeJsonReport',
  cloneProducer: 'only producer of a clone tree',
  noCpSync: 'Write install files through applyWrites',
} as const;
type Reason = keyof typeof REASONS;

const PROBE = 'src/lib/lint-probe.ts';
// The fence-lead literal capability-index.ts once carried under an exemption;
// the frontmatter port is gone, so no file is spared any more.
const DISPLACED = String.raw`const DISPLACED_LEAD_RE = /^[\s\p{Cf}]+(?=---)/u;`;

/** [case, file the snippet is linted as, snippet, the reasons that must fire]. */
const CASES: [string, string, string, Reason[]][] = [
  [
    'node:child_process',
    PROBE,
    "import { execFileSync } from 'node:child_process';",
    ['childProcess'],
  ],
  [
    'child_process',
    PROBE,
    "import { spawn } from 'child_process';",
    ['childProcess'],
  ],
  // no-restricted-imports sees only static declarations; a literal dynamic
  // import() is caught by no-restricted-syntax instead.
  [
    'dynamic node:child_process',
    PROBE,
    "const cp = await import('node:child_process');",
    ['childProcess'],
  ],
  [
    'dynamic child_process',
    PROBE,
    "const cp = await import('child_process');",
    ['childProcess'],
  ],
  // A file with its own syntax bans keeps the src-wide dynamic-import ban.
  [
    'dynamic child_process in symlink-guard.ts',
    'src/lib/symlink-guard.ts',
    "const cp = await import('node:child_process');",
    ['childProcess'],
  ],
  ['picocolors', PROBE, "import pc from 'picocolors';", ['picocolors']],
  [
    'dynamic picocolors',
    PROBE,
    "const pc = await import('picocolors');",
    ['picocolors'],
  ],
  [
    'picocolors in color.ts',
    'src/lib/color.ts',
    "import pc from 'picocolors';",
    [],
  ],
  [
    'dynamic picocolors in color.ts',
    'src/lib/color.ts',
    "const pc = await import('picocolors');",
    [],
  ],
  [
    'sha256File',
    PROBE,
    "import { sha256File } from './hash.js';",
    ['sha256File'],
  ],
  ['contentHash', PROBE, "import { contentHash } from './hash.js';", []],
  // The declared-digest check pharn-install.json verification uses (CORE-194).
  [
    'matchesRawSha256',
    PROBE,
    "import { matchesRawSha256 } from './hash.js';",
    [],
  ],
  ['bare isTTY', PROBE, 'const tty = process.stdout.isTTY;', ['isTTY']],
  [
    'isTTY inside interactiveAllowed',
    'src/commands/lint-probe.ts',
    'interactiveAllowed({ stdinIsTTY: process.stdin.isTTY, stdoutIsTTY: process.stdout.isTTY });',
    [],
  ],
  [
    'isTTY read by the predicate itself',
    'src/lib/capability-picker.ts',
    'const t = process.stdin.isTTY;',
    ['isTTY'],
  ],
  ['process.exit', PROBE, 'process.exit(1);', ['processExit']],
  [
    'process.exit in the allowlisted fatal-signal handler',
    'src/lib/fatal-signal.ts',
    'process.exit(1);',
    [],
  ],
  [
    'process.exit in a command (commands throw a CliError)',
    'src/commands/update.ts',
    'process.exit(1);',
    ['processExit'],
  ],
  [
    'process.exit in the entry point (its refusals throw a CliError)',
    'src/index.ts',
    'process.exit(1);',
    ['processExit'],
  ],
  [
    'a second prompt in update.ts',
    'src/commands/update.ts',
    "import { select } from '@clack/prompts';",
    ['updatePrompt'],
  ],
  [
    'the confirm in update.ts',
    'src/commands/update.ts',
    "import { confirm } from '@clack/prompts';",
    [],
  ],
  [
    'any prompt in update-render.ts',
    'src/lib/update-render.ts',
    "import { confirm } from '@clack/prompts';",
    ['updatePrompt'],
  ],
  [
    'fs in diff.ts',
    'src/lib/diff.ts',
    "import { readFileSync } from 'node:fs';",
    ['diffPrimitives'],
  ],
  // A file-specific ban must not replace the src-wide ones (flat config does
  // not merge a rule's options across config objects).
  [
    'fs + picocolors in diff.ts',
    'src/lib/diff.ts',
    "import { readFileSync } from 'node:fs';\nimport pc from 'picocolors';",
    ['diffPrimitives', 'picocolors'],
  ],
  [
    'crypto in diff.ts',
    'src/lib/diff.ts',
    "import { createHash } from 'node:crypto';",
    ['diffPrimitives'],
  ],
  [
    'fs in executable-unit.ts',
    'src/lib/executable-unit.ts',
    "import { statSync } from 'node:fs';",
    ['executableUnitFs'],
  ],
  [
    'a forked walk',
    PROBE,
    "let current = '';\ncurrent = current ? `${current}/x` : 'x';",
    ['symlinkWalk'],
  ],
  [
    'the walk in symlink-guard.ts',
    'src/lib/symlink-guard.ts',
    "let current = '';\ncurrent = current ? `${current}/x` : 'x';",
    [],
  ],
  [
    'a control range regex',
    PROBE,
    String.raw`const re = /[\x00-\x1f]/u;`,
    ['unsafeChars'],
  ],
  [
    'a control range RegExp string',
    PROBE,
    String.raw`const re = new RegExp('[\\x7f-\\x9f]');`,
    ['unsafeChars'],
  ],
  [
    'a \\u{NN} range',
    PROBE,
    String.raw`const re = /[\u{0}-\u{1f}]/u;`,
    ['unsafeChars'],
  ],
  ['a Cf class', PROBE, String.raw`const re = /[\p{Cf}]/u;`, ['unsafeChars']],
  ['a Cc class', PROBE, String.raw`const re = /[\p{Cc}]/u;`, ['unsafeChars']],
  [
    'DISPLACED_LEAD_RE in capability-index.ts',
    'src/lib/capability-index.ts',
    DISPLACED,
    ['unsafeChars'],
  ],
  [
    'DISPLACED_LEAD_RE elsewhere is still a Cf class',
    'src/lib/capability-index.ts',
    String.raw`const re = /^[\s\p{Cf}]+/u;`,
    ['unsafeChars'],
  ],
  [
    'a control range in terminal-safe.ts',
    'src/lib/terminal-safe.ts',
    String.raw`const re = /[\x00-\x1f]/u;`,
    [],
  ],
  ['log.error', PROBE, "log.error('x');", ['reportError']],
  [
    'process.env.PHARN_DEBUG',
    PROBE,
    'if (process.env.PHARN_DEBUG) console.error(1);',
    ['reportError'],
  ],
  [
    'the PHARN_DEBUG hint',
    PROBE,
    "const hint = 'Re-run with PHARN_DEBUG=1 for details';",
    ['reportError'],
  ],
  [
    'log.error in report-error.ts',
    'src/lib/report-error.ts',
    "log.error('x');",
    [],
  ],
  [
    'escapeUnsafe in a report module',
    'src/lib/status-report.ts',
    "import { escapeUnsafe } from './terminal-safe.js';",
    ['reportEscape'],
  ],
  [
    'escapeUnsafe in json-report.ts',
    'src/lib/json-report.ts',
    "import { escapeUnsafe } from './terminal-safe.js';",
    [],
  ],
  ['mkdtempSync', PROBE, "fs.mkdtempSync('/tmp/x');", ['cloneProducer']],
  ['extractTarGz', PROBE, 'extractTarGz(buf, dir, limits);', ['cloneProducer']],
  [
    'mkdtempSync in repo.ts',
    'src/lib/repo.ts',
    "fs.mkdtempSync('/tmp/x');",
    [],
  ],
  ['cpSync', PROBE, "import { cpSync } from 'node:fs';", ['noCpSync']],
  ['fs.cpSync', PROBE, 'fs.cpSync(a, b, { recursive: true });', ['noCpSync']],
  [
    'promises cp',
    PROBE,
    "import { cp } from 'node:fs/promises';",
    ['noCpSync'],
  ],
  [
    'outside src/',
    'tests/lint-probe.test.ts',
    "import { spawn } from 'node:child_process';\nprocess.exit(1);",
    [],
  ],
];

describe('the src/ invariants are lint rules', () => {
  it('each planted violation fires with its reason; each exemption stays silent', async () => {
    const eslint = new ESLint({ cwd: REPO });
    const fired: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [name, file, code, reasons] of CASES) {
      const [result] = await eslint.lintText(`${code}\n`, { filePath: file });
      fired[name] = result!.messages
        .filter((m) => m.fatal || RESTRICTED.has(m.ruleId ?? ''))
        .map((m) => {
          if (m.fatal) return `parse error: ${m.message}`;
          const reason = (Object.keys(REASONS) as Reason[]).find((r) =>
            m.message.includes(REASONS[r]),
          );
          return reason ?? `unknown: ${m.message}`;
        })
        .filter((r, i, all) => all.indexOf(r) === i)
        .sort();
      expected[name] = [...reasons].sort();
    }
    expect(fired).toEqual(expected);
  }, 60_000);
});
