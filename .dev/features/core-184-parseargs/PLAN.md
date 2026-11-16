# PLAN — CORE-184: argument parsing on `util.parseArgs`; `--json` implies `--dry-run`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: replace minimist (two parses) and the four hand-kept tables in `src/index.ts` with one
  `util.parseArgs({ strict: false, allowPositionals: true, tokens: true })` plus a token check against the
  command/option help tables, exported as a pure function; `--json` (init/update) implies `--dry-run`, `--compact`
  implies `--json`; `REQUIRED_WITH` and minimist go.
- layer(s): CLI dispatch (`src/index.ts`), one new `src/lib/` module, tests, user docs, package manifest
- constitution_refs: [P0, P1, P3, P4, P5, P7]
- branch: przemek/core-184-c55-argument-parsing-on-utilparseargs-json
- epic: CORE-154 (C5). Siblings editing `src/index.ts` in parallel: C5.1 (CliError + one top-level catch),
  C5.6 (lazy `await import()` of commands). This plan keeps `main()`'s dispatch `switch` shape so both rebase
  as a small conflict.

## Live state (read this run)

- `src/index.ts` 594 lines: help data (`COMMANDS`, `OPTIONS`), then `MAX_POSITIONALS`, `ALLOWED_FLAGS`,
  `REQUIRED_WITH`, `STRING_FLAGS`, `ALIASES`, two minimist parses (`main` + `unsupportedFlags`), dispatch.
- `OPTIONS[].uses[].commands` already lists, per option, exactly the commands of the `ALLOWED_FLAGS` row
  (checked by hand: init/update/list/status/uninstall rows all match), so the allowlist is derivable from the
  help table. `COMMANDS[].args` is present exactly for the two commands with arity 2 (`add`, `remove`).
- `tests/index.test.ts` 1,399 lines, 116 `it`/`it.each` declarations, `vi.mock`s every command module.
- `runInit`/`runUpdate` keep their own `json && !dryRun` / `compact && !json` guards for direct callers;
  untouched (the parser now always hands them a consistent triple).
- minimist referenced in: package.json (`minimist`, `@types/minimist`), package-lock.json,
  `scripts/build.mjs` (`external`), `SECURITY.md` ("three runtime dependencies"), `docs/architecture.md`
  (Dispatch section), src/index.ts. Node `v24.13.1` locally; floor 24.2.0 has `parseArgs` tokens.
- parseArgs probes (this run): bundles yield one token per letter sharing `index` (so `args[index]` names
  `-xz` once); a bare string option yields a token with no `value`; `--ref --yes` consumes `--yes` as the
  value (strict:false); `values` has a null prototype; positionals stay strings (`add 123`).

## Design

- **New `src/lib/cli-args.ts`** (pure, no I/O, no `process`): the help data (`COMMANDS`, `OPTIONS`,
  `ENVIRONMENT`, `USAGE`, per-command page) moved verbatim from index.ts, plus
  `export function parseCliArgs(args: readonly string[]): ParsedArgs` and `USAGE_POINTER`.
  `ParsedArgs = { kind: 'refuse'; message } | { kind: 'print'; text } | { kind: 'run'; invocation }`, where
  `invocation` is a discriminated union per command carrying exactly the object each `run<Command>` takes.
- The ONE table: `OPTIONS` gains `value?: true` (string options) and its `key` becomes the long name
  (`no-drift`, not `drift`); the parseArgs `options` config, the per-command allowlist (from `uses`), the
  global set (`uses` with no commands), the short aliases and the string set are all derived from it.
  `COMMANDS` arity derives from `args` (`args` → 2 positionals incl. the command word, else 1). Lookups are
  `Map`s / `.find` over literals, never object indexing by argv.
- `no-drift` is its own boolean (no `allowNegative`), so `--no-dry-run`, `--no-yes`, `--no-ref`,
  `--no-archetype`, `--drift` are now `Unknown option`.
- Check order (each refusal: one stderr line + `Run \`pharn --help\` for usage.`, exit 1; offenders are
  `args[token.index]`, de-duplicated and `JSON.stringify`-escaped, as today):
  1. `Unknown option` — token name not in OPTIONS (global, before the command is known);
  2. ``Unsupported option for `<cmd>` `` — known command (name or alias literal from COMMANDS), option not in
     its `uses` and not global;
  3. NEW `Option takes no value` — inline value on a boolean (`--json=false`, `--dry-run=false`);
  4. NEW `Repeated option` — `--ref` / `--archetype` given twice (parseArgs keeps the last silently);
  5. `Invalid value for --ref (…)` / `Invalid value for --archetype (…)` — unchanged messages; a bare flag
     names `""` as today;
  6. `--version` → print version; `--help` → page / full text (unchanged rules);
  7. `Unknown command: <cmd>` (unchanged text); 8. `Unexpected argument` (arity).
- Implications: `init`: `dryRun = --dry-run || --json`; `update`: `json = --json || --compact`,
  `dryRun = --dry-run || json`. So `pharn --json` → `init --dry-run --json`; `pharn update --compact` →
  `--dry-run --json --compact`. `REQUIRED_WITH` and the `Incomplete option for` refusal are removed.
- **`src/index.ts`** keeps `main()` (reads `process.argv.slice(2)`, prints refuse/print results, exits 1 on
  refuse) and the unchanged dispatch `switch` over `invocation.command` calling `run<Command>`; no minimist.
- Help text: only the `--json` (init, update) and `--compact` (update) lines change, e.g.
  `update: emit the plan as one JSON object (implies --dry-run)` and
  `update: with --json, omit the unchanged files from the plan's file list (implies --json)`.

## Files

- `src/lib/cli-args.ts` — NEW: help data + tables + pure `parseCliArgs` + `USAGE_POINTER` — lib
- `src/index.ts` — main + dispatch only; imports `parseCliArgs`; minimist and the four tables removed — dispatch
- `tests/cli-args.test.ts` — NEW: the pure parser, table-driven (no mocks): every refusal case, implications,
  aliases, `--`, numeric positional, escaping, precedence, per-command help rows, full-text help — test
- `tests/index.test.ts` — rewritten, much shorter: `main()` behaviour only (each command receives the parsed
  options; a refusal prints exactly the line + pointer on stderr, nothing on stdout, exit 1, no command ran;
  `--help`/`--version` print and run nothing; unknown command) — test
- `tests/dist-smoke.test.ts` — one added case: the bundle refuses `pharn --no-dry-run` with `Unknown option`
  (proves the bundled parser runs with minimist gone; open question 5) — test
- `package.json` — drop `minimist`, `@types/minimist` — manifest
- `package-lock.json` — regenerated with `npm install --package-lock-only --ignore-scripts` (shared
  node_modules untouched) — manifest
- `scripts/build.mjs` — drop `'minimist'` from `external` — build
- `CLAUDE.md` — Conventions "Options are per command" paragraph and Module-map `src/index.ts` line (+ new
  `cli-args` in the map) — repo docs
- `docs/architecture.md` — "Dispatch and options" section rewritten for parseArgs/the one table — docs
- `docs/commands/update.md` — options paragraph (lines 17-22): `--json` implies `--dry-run`, `--compact` implies
  `--json` — docs
- `docs/commands/init.md` — options line 93-94 and JSON section 149-150 — docs
- `docs/troubleshooting.md` — exit-code table (drop the three "without" rows, add "a repeated `--ref`/`--archetype`
  or a value on an on/off option"), Streams paragraph, the per-command options table, the "valid only together"
  paragraph → implications, the `--json=false` note → refused — docs
- `docs/commands/list.md` — its "only the option name is checked, `--json=false` is still accepted" note → refused (found at verify) — docs
- `docs/commands/status.md` — "with and without `--drift`" → `--no-drift` (`--drift` is now an unknown option; found at verify) — docs
- `SECURITY.md` — "three runtime dependencies (`@clack/prompts`, `minimist`, `picocolors`)" → two — docs
- `CHANGELOG.md` — `### Changed` line under `## [Unreleased]` — docs

NOT touched: `src/commands/*` (their direct-caller guards stay), protected root docs, `.agents/skills/` (vendored
copy of the published skill; its `--dry-run --json --compact` invocation keeps working).

## Tests (rewritten / added / deleted)

- `tests/index.test.ts`: rewritten from 116 declarations to ~15 behaviour tests of `main()`; the per-flag parse
  cases move to `tests/cli-args.test.ts` as table rows (~25 `it`/`it.each`, covering every old case that still
  holds). **Deleted `it` blocks (pharn-ci TI02 will flag them):** effectively all 116 old declarations in
  `tests/index.test.ts` are removed or replaced. Cases whose behaviour is intentionally REVERSED are rewritten
  to the new behaviour, not dropped: `--dry-run=false`/`--no-dry-run` accepted → now refused; `--json=false`
  accepted → refused; every `Incomplete option for` case (update `--json`, `--compact`, init `--json`, bare
  `--json`, `--json --help`, …) → now runs as a dry run / JSON dry run; `--no-ref` "Invalid value" → "Unknown
  option"; repeated `--ref`/`--archetype` "Invalid value" → "Repeated option". Cases dropped as obsolete:
  minimist-specific mechanics (the `string: ['_']` coercion comment tests are kept as one "numeric positional
  stays a string" row; "threads exactly the flags each row grants" becomes a type-checked invocation shape).
- Every refusal the ticket lists is a row: `status --force`, `remove --yes`, `list --strict`, `add a b`,
  unknown command, `--ref tip`, `--archetype lib,ssr`, repeated/bare/`--no-ref`.
- Coverage: `cli-args.ts` exercised directly; index.ts by the dispatch tests (floors 90/85/90/90).

## Evals to write (P1)

- No capability or rule_id is added; vitest is the spec (P1). Key cases → expected:
  `["update","--json"]` → run update `{dryRun:true,json:true,compact:false}`; `["--json"]` → run init
  `{dryRun:true,json:true}`; `["update","--compact"]` → `{dryRun:true,json:true,compact:true}`;
  `["init","--compact"]` → refuse Unsupported; `["update","--json=false"]` → refuse `Option takes no value`;
  `["init","--ref","main","--ref","main"]` → refuse `Repeated option`; `["status","--no-drift"]` → drift:false;
  `["-y","update"]` → update yes:true; `["status","--help","--force"]` → refuse; `["bogus","--json"]` →
  Unknown command; `["status","-xz"]` → `Unknown option: "-xz"` once.

## Guarantee audit (P0)

- "an option a command does not take is refused, never dropped" → floor: enum membership (token name ∈ the
  command's derived option set), tested per command.
- "an untrusted command word never resolves a prototype key" → floor: `Map`/`find` over table literals; test
  `toString`.
- "offenders are escaped" → floor: `JSON.stringify` of `args[index]` (unchanged mechanism), tested with BEL/ESC.
- "`--ref`/`--archetype` values are allowlisted" → floor: `REF_CHOICES` / `parseArchetypeList` (unchanged).
- "`--json` implies `--dry-run`" → deterministic in the parser; the commands' own guards remain the backstop.
- No advisory claim is introduced.

## Trust audit (P2)

- argv is untrusted: names are checked by membership before any use; values only via the two allowlists;
  printed only through `JSON.stringify` (unchanged). The `Unknown command: <cmd>` line still echoes `cmd` raw
  (pre-existing; see open question 2).

## Open questions — RESOLVED at GATE 1 (orchestrator, for the user)

Approved. Answers: 1 → `src/lib/cli-args.ts`. 2 → escape the echoed command now through `lib/terminal-safe`
(printable input prints identically) plus one control-character test row. 3 → the proposed labels. 4 → the
proposed wording. 5 → add the dist-smoke case. The extra refusals (`--no-dry-run`, `--no-yes`, `--drift`,
`--no-archetype`) are accepted and named in the CHANGELOG **Changed** line. The TI02 deletions are accepted
provided every behaviour case survives as a row in `tests/cli-args.test.ts`; the PR body lists them under
"Test-integrity: expected findings".

The questions as asked:

1. Where does the pure parser live? **Recommended:** new `src/lib/cli-args.ts` (help data + parser), leaving
   `src/index.ts` as main + dispatch — P3 ("index.ts dispatches"), mock-free parser tests, and the smallest
   index.ts surface for C5.1/C5.6 to rebase over. Alternative: keep everything in index.ts and export from it.
2. `Unknown command: <cmd>` prints argv raw (no escaping) today. **Recommended:** leave unchanged in this PR
   (AC says "same message shape"; separate one-line fix later), or escape via `escapeUnsafe` (`bogus` prints
   identically).
3. New refusal labels. **Recommended:** `Repeated option: "--ref"` and `Option takes no value: "--json=false"`
   (same `label: "offender"` shape as the others).
4. Help wording for the changed lines. **Recommended:** `init`/`update` `--json`: "emit the plan as one JSON
   object (implies --dry-run)"; `--compact`: "omit the unchanged files from the JSON plan (implies --json)".
5. `tests/dist-smoke.test.ts` extra case (bundle refuses `--no-dry-run`). **Recommended:** add (cheap proof the
   bundle carries no minimist path); skip if you prefer no smoke change.
