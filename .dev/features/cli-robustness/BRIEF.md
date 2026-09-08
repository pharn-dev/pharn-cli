# BRIEF — PR 4, CLI robustness (recorded from the /pharn-dev-ship invocation)

Recorded SUMMARY of the four briefs the human supplied in the `/pharn-dev-ship` invocation. Not
verbatim — the verbatim text lives in the session transcript; this file is the stable artifact the
PLAN's `spec_content_hash` chains to. No `SPEC.md` exists for this increment: it was specified in
full by the human, exactly as the `skills-version-timeout-and-cap` increment was.

## 4.05 — Hard-fail on unknown flags and extra positionals

- Location: `src/index.ts:37`. Severity medium.
- `main()` configures minimist with no `unknown` handler and never inspects `argv._.length`, so
  `status --sctrict` silently disarms the drift gate, `update --froce --yes` runs un-forced,
  `add a11y extra` drops a positional, and `pharn --hepl` falls through to a real `init`.
- Fix: collect every unknown DASHED arg in a minimist `unknown` callback (positionals return
  `true`), and reject before the `--version` / `--help` short-circuits with `console.error` +
  USAGE + `exit(1)`. Add a per-command positional-arity check beside the dispatch switch:
  `init`/`update`/`list`/`status` take no positional past the command; `add`/`remove`/`rm` take
  at most one.
- Untrusted argv text is echoed `JSON.stringify`-escaped (mirrors `seam-config.ts:67`).
- Invariants: errors to stderr only; refuse before any network call; no new `isTTY` read; flag
  semantics byte-identical (`--archetype` no-op, `--no-drift`, `update --yes`/`--force`,
  `remove --yes` passthrough kept — `4.07` owns that contract); minimist stays.
- Acceptance: tests first; new exit-1 cases for `status --sctrict`, `update --froce --yes`,
  `status -x`, `add a11y extra`, `--hepl`, `--help --bogus`, `--version --bogus`; regressions
  green; `npm run check`; `docs/troubleshooting.md` exit-code row + a section beside
  `## Unknown command`; `npm run lint:md`; CHANGELOG entry.

## 5.2a — Stop numeric positionals crashing add/remove

- Location: `src/index.ts:73`. Severity low.
- minimist coerces numeric-looking positionals, so `pharn add 123` hands `123` (a number) to
  `parseCapabilityArg`, which calls `.includes` on it → raw `TypeError` stack.
- Fix: add `string: ['_']` to the same minimist options object. Do NOT coerce at the dispatch
  sites (`String(argv._[1])` would turn bare `add`/`remove` into the literal `"undefined"` and
  defeat the interactive-picker branches).
- Invariants: bare `add`/`remove` still reach the picker; `default: { drift: true }` stays;
  `--archetype` and `-h`/`-v`/`-y` keep parsing; no command behavior changes; errors stay stderr.
- Acceptance: `setArgv('add','123')` → `runAdd('123')` (string); `setArgv('remove','7')` →
  `runRemove('7', {yes:false})`; existing dispatch tests unchanged; `npm run check`.

## 4.06 — Wrap transport errors with the host; print the PHARN_DEBUG hint everywhere

- Locations: `src/lib/skills-version.ts`, `src/commands/{init,update,add,status}.ts`. Severity medium.
- (1) The `fetch` rejection propagates raw: offline yields `⚠ fetch failed` with the real
  `getaddrinfo ENOTFOUND raw.githubusercontent.com` unprinted in `err.cause`; the 8s abort yields
  `⚠ This operation was aborted`. Neither names a host or a next step.
- (2) `Re-run with PHARN_DEBUG=1 for full error output.` appears at exactly two fatal exits while
  eight exception-derived ones print nothing.
- Fix (post-4.01 recipe, which HAS landed): wrap the two NETWORK-ORIGIN phases only — a local
  `rethrowUnreachable(err): never` applied to the fetch expression AND to the body-read loop's
  rejection — leaving the three deliberate throws (`fetch failed (404)`, `too large`,
  `assertSafeString`) outside any wrapping catch. Set `{ cause: err }`.
- Fix: one shared reporter (`src/lib/report-error.ts`) — `reportFatal(message, err?)` dumps `err`
  under `PHARN_DEBUG` and otherwise prints the hint ONLY when an `err` was passed. Passing the
  error is the single axis that keeps the hint off curated refusals (bad argument, version/layout
  gate, non-TTY). Fold `status.ts`'s `reportError` into it.
- Keep the exit-after-`repo.cleanup()` ordering: store the caught error, derive the message at the
  exit site; never move a `process.exit` into a `catch`.
- Invariants: the three network guards; `ManifestValidationError` identity; cleanup before exit;
  `fetchCommitSha` stays silent-null; `list --json` stdout purity; exit codes unchanged.
- Acceptance: tests first across `skills-version`/`update`/`status`/`add`/`init`; optional
  structural pin that the `Re-run with PHARN_DEBUG=1` literal lives in exactly one `src/**` file;
  `npm run check`; `docs/troubleshooting.md` updated; `npm run lint:md`.

## 5.2b — Route fatal error messages to stderr

- Location: `src/lib/pharn-config.ts:134` and ~22 sites. Severity low.
- `@clack/prompts` `log.error` writes to `process.stdout`, so `pharn update --yes > out 2> err`
  leaves the failure in the wrong file.
- Fix: the SAME shared module (`report-error.ts`) exports `logError(message)` calling
  `log.error(message, { output: process.stderr })`; convert every site. Send the PHARN_DEBUG hint
  to stderr with its error.
- Traps: `tests/list.test.ts` asserts exact args on `log.error`; every command test mocks clack's
  `log`, so at least one test must assert the `{ output: process.stderr }` argument.
- Invariants: `list --json` keeps its plain `console.error` branch; exit codes unchanged; cleanup
  before exit; `cancelAndExit` stays `log.info` on stdout at exit 0; TTY gates keep their shape;
  `LEGACY_CONFIG_MESSAGE` stays single-sourced.
- Acceptance: `tests/list.test.ts` exact-args updated; a `pharn-config` case asserts the stream; a
  command-level case asserts it too; structural pin — no `log.error(` in `src/**` outside the
  helper; `npm run check`; a "Streams" note in `docs/troubleshooting.md`; `npm run lint:md`.

## Explicitly out of scope (named by the briefs)

- `4.07` — the `remove --yes` contract question (its passthrough is kept, marked with a comment).
- Per-command flag scoping (offered as optional; declined to keep the diff reviewable).
- Repo-wide relocation of `note`/`outro`/`log.info`/`log.warn`/spinner output.
- A new argv parser, `stopEarly`, or `'--'` handling.
