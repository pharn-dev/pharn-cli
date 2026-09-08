# PLAN — CLI robustness: reject argv pharn does not understand, and tell the truth on stderr when it fails

- spec_content_hash: da89fdb462f6e0d806688881c1e833f16524b2c6fc2349db036a0a584e3a0ed1 # fix #4 — over BRIEF.md; no SPEC.md exists (human-specified increment, as with `skills-version-timeout-and-cap`)
- increment: Four bundled fixes at the CLI's two outer boundaries. **argv in** (`src/index.ts`):
  hard-fail on an unknown option or an unexpected positional, and stop minimist coercing a numeric
  positional into a `number`. **errors out** (`src/lib/report-error.ts` + every command): one shared
  fatal reporter that writes error-level output to **stderr**, prints the `PHARN_DEBUG` hint at every
  exception-derived fatal exit (and at no curated refusal), and one wrap at the
  `fetchRemoteSkillsVersion` transport boundary so an offline run names the host it could not reach.
- layer(s): the argv boundary (`src/index.ts`), a new shared output surface (`src/lib/report-error.ts`),
  the lightweight fetch boundary (`src/lib/skills-version.ts`), and the ~22 error call sites in
  `src/commands/*` + `src/lib/pharn-config.ts`.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Discovery (live state, read this run — P6)

Verified in `/Users/pgalarowicz/Projects/pharn-cli`, clean tree, branched off `main` @ `0c3ee34`,
`package.json` version `0.4.0`:

- **`src/index.ts:36-54`** — the minimist options declare `boolean`, `default: { drift: true }` and
  `alias`, with **no `unknown` handler and no `string`**. The dispatch (`:66-96`) reads `argv._[0]`
  and `argv._[1]` and never inspects `argv._.length`.
- Re-measured against the installed **minimist@1.2.8** with this repo's exact options plus the
  proposed `unknown` + `string: ['_']` (run this session, all 20 argv shapes):
  - `status --sctrict` → handler sees `--sctrict`; `strict` stays `false`.
  - `update --froce -y` → handler sees `--froce`; `force` stays `false`, `yes` is `true`.
  - `status -x` → handler sees `-x` (the whole token, not the letter).
  - `--hepl` → handler sees `--hepl`; `help` is `false`, so it would fall through to `init`.
  - `--help --bogus` / `--version --bogus` → `help`/`version` are **true** and the handler still sees
    `--bogus` — which is exactly why the gate must sit BEFORE the two short-circuits.
  - `add a11y extra` → handler NOT called for the three positionals' rejection path; `_` is
    `['add','a11y','extra']`. Positional arity is therefore a post-parse `_.length` check, not the
    handler's job.
  - `status --no-drift`, `init --archetype`, `remove a11y --yes`, `update --yes --force`, `-y`,
    `list --json`, bare, `bogus`, `rm lens:n-plus-one` → handler NOT called, parse unchanged.
  - `add 123` → `_` is `['add', 123]` (a **number**) today; `['add','123']` with `string: ['_']`.
- **`src/lib/capability-address.ts:16-17`** — `parseCapabilityArg` calls `arg.includes(':')`, which a
  number does not have; the `TypeError` escapes to the entry-point catch at `src/index.ts:110-113`.
- **`log.error` call sites**, by grep this run — 24 of them: `src/lib/pharn-config.ts:134,140,205`;
  `src/commands/init.ts:47,94,143,147`; `src/commands/update.ts:86,129,197,236,241`;
  `src/commands/add.ts:139,159,197,224,246,278,386`; `src/commands/remove.ts:184,205,267`;
  `src/commands/status.ts:237`; `src/commands/list.ts:98`. (The briefs' line numbers predate the
  MIN_CLI gate; these are the live ones.)
- **`PHARN_DEBUG`** — the hint literal `'Re-run with PHARN_DEBUG=1 for full error output.'` appears at
  exactly **two** sites (`init.ts:149`, `update.ts:243`); nine `console.error(err)` dumps exist
  (`init.ts:95,134`; `update.ts:130,198,228`; `add.ts:160,187,247,268`; `status.ts:238`).
- **`@clack/prompts@1.7.0`** — `log.message` defaults `output` to `process.stdout`
  (`dist/index.mjs`), and `LogMessageOptions.output?: Writable` is typed
  (`dist/index.d.mts`), so `{ output: process.stderr }` needs no cast.
- **4.01 HAS landed.** `fetchRemoteSkillsVersion` (`skills-version.ts:159-197`) is already ONE `try`
  covering fetch + streaming body read, with `clearTimeout` in its `finally`, and it already carries a
  `// FABLE 4.6:` marker at the read loop (`readCappedBody`). So brief 4.06's **Out-of-scope
  post-recipe** applies, not its main Fix: wrap the two network-origin phases only.
- **`tsconfig.json`** targets `ES2022`, so `new Error(msg, { cause })` is available.
- **`tests/index.test.ts`** has 19 cases and already spies `console.log`/`console.error`; the
  `ProcessExit` helper is in place. **`tests/list.test.ts:89`** asserts
  `toHaveBeenCalledWith(LEGACY)` — an exact-args match that breaks the moment a second argument
  appears. Every command test mocks `@clack/prompts` with `log: { info, warn, error }` **vi.fn()s**,
  which swallow the new option silently unless a test asserts it.
- **`tests/init.test.ts:283`** is the precedent for a source-scanning structural pin (it walks
  `src/**/*.ts` and asserts an empty offender list); `tests/init.test.ts:338` is a second.
- **`docs/troubleshooting.md`** — the exit-code table is `:5-14`, "Capabilities could not be fetched"
  is `:87-95`, the `PHARN_DEBUG` guidance sits at `:142-146`, `## Unknown command` at `:255-261`.
- **`CHANGELOG.md`** has a live `## [Unreleased]` with `### Added` / `### Fixed`.

## Files

- `tests/index.test.ts` — written FIRST (P1). Add the 4.05 refusal cases (`status --sctrict`,
  `update --froce --yes`, `status -x`, `add a11y extra`, `--hepl`, `--help --bogus`,
  `--version --bogus`), each asserting `ProcessExit(1)`, that no `run*` mock was called, and that
  `console.error` (never `console.log`) carried it; add the 5.2a dispatch cases (`add 123` →
  `'123'`, `remove 7` → `'7'`); keep all 19 existing cases byte-identical — layer: tests
- `tests/report-error.test.ts` — NEW. Unit-pin the shared reporter: `logError` passes
  `{ output: process.stderr }`; `reportFatal(msg)` with no error prints `⚠ msg` and **no** hint;
  `reportFatal(msg, err)` prints the hint (to stderr) when `PHARN_DEBUG` is unset and dumps the error
  via `console.error` when it is set; the hint literal lives in exactly one `src/**` file; no
  `log.error(` in `src/**` outside the helper — layer: tests
- `tests/skills-version.test.ts` — add the 4.06 wrap cases: a `fetch` rejection carrying a `cause`
  wraps with the host AND the cause text; a body-stream rejection (a `Response` whose stream errors —
  the shape 4.01's tests already use) wraps too; the 404 message and the `ManifestValidationError`
  identity are NOT re-wrapped — layer: tests
- `tests/update.test.ts` — the `fetchRemoteSkillsVersion` rejection path prints the hint; the non-TTY
  refusal does not; assert the stderr option at one fatal exit — layer: tests
- `tests/status.test.ts` — the folded `reportError` path prints the hint and still exits 1 — layer: tests
- `tests/add.test.ts` — a `fetchRepo` failure prints the hint; the version-gate refusal prints none — layer: tests
- `tests/init.test.ts` — the fetch-failure exit prints the hint — layer: tests
- `tests/list.test.ts` — update the exact-args assertion for the new call shape; `--json` still routes
  through plain `console.error` with stdout carrying only the object — layer: tests
- `tests/pharn-config.test.ts` — one `loadConfigOrExit` / `loadArchetypeConfigOrExit` case asserts the
  `{ output: process.stderr }` argument — layer: tests
- `src/lib/report-error.ts` — NEW, ~40 lines. `errorMessage(err)`, `logError(message)` (the ONLY
  `log.error(` in `src/**`, always `{ output: process.stderr }`), and `reportFatal(message, err?)` —
  layer: shared output surface
- `src/index.ts` — the minimist `unknown` collector + `string: ['_']`; the unknown-option gate before
  the `--version`/`--help` short-circuits; the per-command positional-arity gate beside the dispatch
  switch — layer: the argv boundary
- `src/lib/skills-version.ts` — `rethrowUnreachable(url)` applied to the fetch expression and to the
  body-read loop's rejection only — layer: the lightweight fetch boundary
- `src/lib/pharn-config.ts` — three `log.error` → `logError` — layer: config ingest
- `src/commands/init.ts` — convert four sites; carry the caught error to the deferred exit — layer: init
- `src/commands/update.ts` — convert five sites; carry the caught error to the deferred exit — layer: update
- `src/commands/add.ts` — convert seven sites; thread an optional `err` on the two `{kind:'error'}`
  outcomes so a caught exception is distinguishable from a curated gate refusal — layer: add
- `src/commands/remove.ts` — convert three sites — layer: remove
- `src/commands/status.ts` — delete the local `reportError`, call the shared reporter — layer: status
- `src/commands/list.ts` — one site; keep the `console.error` `--json` branch — layer: list
- `docs/troubleshooting.md` — a "Streams" note beside the exit-code table, an exit-code row for the
  argv refusal, a `## Unknown option or unexpected argument` section beside `## Unknown command`, the
  wrapped-message shape under "Capabilities could not be fetched", and the widened `PHARN_DEBUG`
  guidance — layer: docs
- `CHANGELOG.md` — `### Added` and `### Fixed` bullets under `## [Unreleased]` — layer: docs

Explicitly NOT touched: `src/lib/capability-address.ts`, `src/lib/confirm.ts` (`cancelAndExit` is a
graceful exit 0 and stays `log.info` on stdout), `src/lib/capability-picker.ts`, every `note` /
`outro` / `log.info` / `log.warn` / spinner call, `src/index.ts:92-93` and `:111` (already stderr),
`vitest.config.ts`, `package.json`.

## Contracts satisfied

- `CONSTITUTION.md` **P5** — the argv gate is a membership test over a collected offender list with a
  named hard-fail terminal, mirroring `assertNoUnknownKeys` (`src/lib/seam-config.ts:59-71`); it never
  guesses what the user meant and never silently drops a token.
- `CONSTITUTION.md` **P2** — argv is untrusted text: every offending token is echoed
  `JSON.stringify`-escaped, so a control-char argument is printed as data.
- `CONSTITUTION.md` **P3** — the reporter is ONE file with ONE axis ("report a fatal error to the
  user"), reached from commands, never command→command.
- `CONSTITUTION.md` **P7** — no flag's semantics move; `--archetype` stays a parsing no-op and
  `remove --yes` stays a passthrough (a comment names `4.07` as its owner).
- `ARCHITECTURE.md §2` floor primitive #3 (enum/membership) — the argv gate reduces to
  "is this token in the declared option set" and "is `_.length` within this command's arity".

## Evals to write (P1)

No PHARN capability is authored (this is CLI code), so P1 is discharged by `vitest`:

- Seven argv-refusal cases, each pinning exit 1 + no command dispatched + stderr (not stdout).
- Two numeric-positional dispatch cases that FAIL on the current code (the mocks receive numbers).
- The reporter's three axes: the stream, the hint-only-with-an-error rule, and the `PHARN_DEBUG` dump.
- Two structural pins (the source-scan shape `tests/init.test.ts:283` already uses): the hint literal
  in exactly one `src/**` file, and no `log.error(` outside the helper.
- Transport-wrap cases at both network-origin phases, plus proof the three deliberate throws are NOT
  re-labelled.
- Command-level hint presence/absence: `update`/`status`/`init`/`add` exception paths print it, the
  version-gate refusal does not.

## Guarantee audit (P0)

- **"an unknown option can never be silently ignored"** → **FLOOR**: minimist's `unknown` callback is
  invoked for every arg whose key is not declared, and the collected list gates `exit(1)` before any
  dispatch. Set membership, not classification.
- **"an unexpected positional can never be silently dropped"** → **FLOOR**: an integer compare of
  `argv._.length` against a per-command constant.
- **"a numeric capability name reaches `parseCapabilityArg` as a string"** → **FLOOR**: minimist's
  `flags.strings._` branch, verified at runtime this session against the installed 1.2.8.
- **"error-level output goes to stderr"** → **FLOOR at the call boundary** (`{ output: process.stderr }`
  is a clack API argument), **backstopped structurally** by the source-scan pin that no other `src/**`
  file calls `log.error(`. The pin is text-matching, so it is a **best-effort** backstop (it would not
  catch an aliased import) — labeled, not sold as absolute.
- **"the PHARN_DEBUG hint prints at every exception-derived fatal exit"** → **ADVISORY**: it holds by
  construction (the hint is emitted iff an `err` argument was passed) but nothing on the floor forces
  a future call site to pass one. Backstopped by the per-command tests above and the single-literal
  pin, not by a checker.
- **"an offline run names the host"** → **FLOOR-adjacent, honestly scoped**: the wrap is applied to
  exactly two expressions (the fetch and the body read). It guarantees those two rejections are
  re-labelled; it does NOT guarantee the underlying runtime produced a useful `cause`.
- **"exit codes are unchanged"** → **ADVISORY** (no checker compares them run-to-run); every converted
  site keeps its own `process.exit`, and the existing per-command tests assert the codes.
- **NOT closed:** per-command flag scoping — `pharn init --force` still parses and is ignored. Named
  as a limit here rather than half-shipped (P7); the brief offers it as optional.

## Trust audit (P2)

- **Input:** `process.argv` (untrusted user text) and `err.message` / `err.cause` from undici
  (untrusted remote-influenced text).
- **Taint propagation:** an offending argv token reaches exactly one place — a `console.error`
  template, `JSON.stringify`-escaped. It never reaches a path join, a filesystem call, a network
  call, or a branch other than "is this token in the declared set". The dispatch still reads only
  `argv._[0]` / `argv._[1]`, and `_[0]` is still matched against a closed `switch`.
- The transport wrap **adds no new sink**: the message it builds was already printed by both
  consumers; it gains the URL (a pharn constant) and the `cause` text (already printable under
  `PHARN_DEBUG`).
- **Not widened:** no allowlist is loosened, no new fetch, no new write, no new read.

## Determinism audit (P5)

- The unknown-option gate is `unknownFlags.length > 0` over a list built by a callback that branches
  only on `arg.startsWith('-')`.
- The arity gate is `argv._.length > MAX_POSITIONALS[cmd]`, and a command absent from that table gets
  **no** arity check — so an unknown command still falls to the existing `Unknown command` hard-fail
  rather than being pre-empted by a wrong-shaped arity error.
- The hint's presence is `err !== undefined` — one boolean axis, never an inspection of the message.
- Nothing added falls back to a guess: each new branch ends in a named message + `exit(1)`.

## Consequences worth naming (not open questions)

- **`pharn --help --bogus` and `pharn --version --bogus` now exit 1** instead of printing usage /
  the version. That is the behavior change the gate's placement buys, and it is in the acceptance list.
- **The `PHARN_DEBUG` dumps move** from inside each `catch` to the exit site (after
  `repo.cleanup()`), because the reporter owns them now. Ordering of console output shifts by one
  cleanup call; no exit code, no write, and no cleanup moves.
- **`add`'s `{kind:'error'}` outcome gains an optional `err` field.** Gate refusals leave it
  `undefined`, so they keep printing no hint — this is the single axis the brief names.
- **Nine `console.error(err)` sites collapse into one.** A future command that wants the dump must
  pass its error to the reporter, which is the point.

## Out of scope (explicitly not in this increment)

- `4.07` — whether `remove --yes` should DO anything. Its passthrough is preserved verbatim and
  carries a comment naming `4.07` as its owner.
- Per-command flag scoping (`pharn init --force`), offered as optional by brief 4.05.
- Moving `note` / `outro` / `log.info` / `log.warn` / spinner output off stdout.
- Rewording any error message, changing any exit code, or touching `fetchCommitSha`'s silent-null.
- Swapping minimist, adding `stopEarly` or `'--'` handling.
- Defensive coercion inside `parseCapabilityArg` — the boundary fix belongs in `index.ts`.

## Open questions (HALT)

None.

**Plan approved by the human at GATE 1: the increment was specified in full by the human in the
`/pharn-dev-ship` invocation (four briefs — task, verified problem, fix shape, invariants and
acceptance criteria each), and the same message pre-authorised the post-review decision ("create pull
request … merge pr"). Recorded honestly: GATE 2 was delegated in advance by the human, not
self-issued by the agent.**
