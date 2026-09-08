# GRILL — cli-robustness (ADVISORY — surfaces concerns; gates nothing)

Interrogation of `.dev/features/cli-robustness/PLAN.md` before `/pharn-dev-build`. Every finding
below is **advisory** (`pharn-contracts/finding-shape.md`): `severity` is LLM-assigned and no finding
here can flip a floor verdict. `spec_content_hash` chain: no `SPEC.md` exists (human-specified
increment), so `check-plan-spec-agree.mjs` is **not applicable** — recorded rather than faked.

Verdict: **proceed** (no blocking finding). Six findings folded into the plan before build.

---

## F1 — Two output functions, not one: the `⚠` prefix is NOT uniform today

- severity: high (advisory) · file: `src/lib/report-error.ts` (to be written)
- problem: The plan says "convert every `log.error` site to the shared helper", but the 24 live sites
  split into two shapes. Nine print `⚠ ${message}`; **fifteen do not** — `pharn-config.ts:134,140,205`,
  `init.ts:47`, `update.ts:86`, `add.ts:139,224`, `remove.ts:184,205,267`, `list.ts:98`. A single
  `reportFatal` that always prefixes would silently add `⚠` to the "No pharn.config.json found"
  message and to every TTY refusal — a wording change the brief explicitly forbids ("Do not reword any
  error message").
- resolution folded in: **two** exports. `logError(message)` writes the line verbatim to stderr;
  `reportFatal(message, err?)` is `logError('⚠ ' + message)` plus the debug/hint. Every conversion is
  then a mechanical, message-preserving choice of one or the other, checkable by diffing the rendered
  strings.

## F2 — `add.ts:386` is NOT a fatal exit, and `reportFatal` would lie about it

- severity: medium (advisory) · file: `src/commands/add.ts:386`
- problem: The per-pick defensive branch inside `resolveAddPicker` logs `⚠ ${result.message}` and
  **continues the loop** — no exit. Routing it through a function named `reportFatal` misnames it, and
  if a future edit made that function pass an `err`, the loop would start printing a PHARN_DEBUG hint
  mid-picker for a curated "unknown capability" message.
- resolution folded in: that one site uses `logError(\`⚠ ${result.message}\`)` with a comment saying
  why. Output is byte-identical; the name stops lying.

## F3 — The `PHARN_DEBUG` hint is `log.info`, and one existing test depends on that

- severity: medium (advisory) · file: `tests/init.test.ts:378`
- problem: `tests/init.test.ts:378` asserts that a MIN_CLI **policy refusal** leaves `PHARN_DEBUG` out
  of the `log.info` calls. If the hint is moved to `log.error`, that assertion passes for the wrong
  reason — it would keep passing even if the hint started printing on every refusal, because it would
  no longer be looking at the channel the hint uses.
- resolution folded in: the hint stays `log.info`, gaining only `{ output: process.stderr }` (5.2b
  says the hint travels with its error). The existing assertion keeps testing exactly what it was
  written to test, and a new positive case pins that the hint IS emitted on the exception path.

## F4 — `tests/list.test.ts:89` is an exact-args assertion and MUST be updated first

- severity: medium (advisory) · file: `tests/list.test.ts:89`
- problem: `expect(prompts.log.error).toHaveBeenCalledWith(LEGACY)` fails the moment a second argument
  appears. Every other `log.error` assertion in the suite reads `c[0]` or `map(String)` and survives
  (re-checked this run across `init` / `update` / `add` / `status` / `pharn-config`), so this is the
  **only** pre-existing assertion the stream change breaks — which is worth knowing precisely, because
  a green suite after the change would otherwise be indistinguishable from an untested one.
- resolution folded in: it is updated to `toHaveBeenCalledWith(LEGACY, { output: process.stderr })`,
  which turns the trap into the required proof that the option actually reaches the call.

## F5 — Wrapping `reader.read()` must not swallow the cap refusal

- severity: high (advisory) · file: `src/lib/skills-version.ts`
- problem: 4.06's post-4.01 recipe says to apply the wrap to "the stream-read loop's rejection". A
  `try { for(;;){...} } catch` around the loop would re-label the deliberate
  `SKILLS_VERSION too large (n bytes)` throw as a transport failure and falsify
  `tests/skills-version.test.ts`'s two cap cases.
- resolution folded in: the wrap is attached **to the expression** — `await reader.read().catch(unreachable)`
  — so it covers the read's own rejection and nothing that is thrown after it resolves. Same for the
  connect phase: `await fetch(url, {...}).catch(unreachable)`, leaving the `!res.ok` throw, the
  `content-length` throw and `assertSafeString` outside every wrapping catch. A test asserts the 404
  message is NOT re-labelled.

## F6 — An unknown COMMAND must not be pre-empted by the arity gate

- severity: medium (advisory) · file: `src/index.ts`
- problem: If the arity check defaulted an unknown command to "0 extra positionals", `pharn bogus x`
  would print "Unexpected argument" instead of "Unknown command: bogus" — a strictly less useful
  message, and it would silently change the existing test at `tests/index.test.ts:190`.
- resolution folded in: the arity table is a `Record<string, number>` and a command absent from it gets
  **no** arity check (`noUncheckedIndexedAccess` makes the lookup `number | undefined`, so the guard is
  forced to be written). The unknown-command hard-fail keeps winning.

---

## Untested axes named, not closed (P0 honesty)

- **The `--help --bogus` / `--version --bogus` behavior change is real user-visible breakage** for
  anyone who today relies on `pharn --version` tolerating junk. It is in the brief's acceptance list,
  so it is intended — but it is a behavior change, not a pure hardening, and the CHANGELOG must say so.
- **The structural pin is text-matching.** "No `log.error(` outside the helper" would not catch
  `const e = log.error; e(msg)` or a renamed import. It reduces a class of regressions; it does not
  eliminate it (same honest scope `tests/init.test.ts:283` already carries for the `isTTY` pin).
- **"the hint prints at every exception-derived fatal exit" is advisory.** Nothing on the floor forces
  a future `catch` to pass its error to the reporter. The single-literal pin makes a second hand-rolled
  copy visible; it cannot make an omission visible.
- **`pharn init --force` still parses and is ignored.** Per-command flag scoping was offered as
  optional by brief 4.05 and is declined here to keep the diff reviewable; named as a limit rather
  than half-shipped (P7).
