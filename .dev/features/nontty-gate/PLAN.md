# PLAN — non-TTY `init`/`update` hard-fail + a real `--yes` for `update`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: When interaction is impossible, `pharn init` and `pharn update` refuse with exit 1 before any network call instead of silently cancelling with exit 0, and `pharn update` gains a real `--yes` that skips its confirm and nothing else.
- layer(s): pharn-cli `commands/` (init, update) + `index.ts` dispatch — no new lib, no new file
- constitution_refs: [P1, P3, P4, P5, P6, P7]

## Verified base state (P6 — read live this run)

- HEAD `74a6b40` on `main`, working tree clean. Baseline `npm run check` → **0**, `npm run lint:md` → **0**.
- Three PR markers present in `src/commands/add.ts`: `versionGate` (`:74`), `layoutGate` (`:106`),
  `source: 'manual'` (`:332`, `:402`). **#77 is on main** — no HALT condition triggered.
- `src/commands/update.ts`: `runUpdate(opts: { force?: boolean } = {})` `:52`; `loadArchetypeConfigOrExit`
  `:56`; `runArchetypeUpdate(config, cwd, opts.force ?? false)` `:57`. `fetchRemoteSkillsVersion()` is the
  **first statement** of `runArchetypeUpdate` (`:89`). Confirm at `:129-135`, route
  `isCancel(ok) || ok !== true → cancelAndExit()` — verified.
- `src/commands/init.ts`: `runInit()` = `showBanner()` `:15` → `intro('init wizard')` `:16` →
  `runGitPrereq()` `:18` → `await runInitArchetype()` `:25`. `fetchRepo()` at `:42`, `runArchetypeSummary`
  at `:59` — **fetch precedes the first prompt**, confirming the wasted-clone half of the bug.
  `runInit` takes **no** parameters today.
- `src/lib/capability-picker.ts:110`: `interactiveAllowed(streams: { stdinIsTTY?: boolean; stdoutIsTTY?: boolean }): boolean`
  — exported, pure. Call-site pattern (identical in `add.ts:194` and `remove.ts:173`):
  `!interactiveAllowed({ stdinIsTTY: process.stdin.isTTY, stdoutIsTTY: process.stdout.isTTY })` →
  `log.error(<usage message>)` → `process.exit(1)`.
- `src/index.ts`: minimist booleans include `yes` `:41`, alias `y: 'yes'` `:52` — **already parsed**.
  Update dispatch `:79`. `USAGE` Options block `:26-33`, `--force` documented `:28`.
- **Brief correction (live state):** the brief lists `tests/init-archetype.test.ts` as possible churn. It
  is **not** — that file never imports or calls `runInit`; it is the install-engine fixture e2e
  (`describe('archetype install (fixture e2e)')`, 3 tests). It is **dropped from the may-edit list**.

## Files

- `src/commands/update.ts` — TTY gate in `runUpdate` between config load and `runArchetypeUpdate`; `opts` gains `yes?: boolean`; `yes` threaded to the confirm branch — layer `commands/`
- `src/commands/init.ts` — TTY gate in `runInit` between `runGitPrereq()` and `runInitArchetype()` — layer `commands/`
- `src/index.ts` — update dispatch gains `yes: Boolean(argv.yes)`; `USAGE` documents `--yes`/`-y` — layer entry
- `tests/helpers.ts` — one new export `setTTY` (existing exports untouched) — layer tests
- `tests/update.test.ts` — `setTTY(true, true)` in the shared `beforeEach`; new gate/`--yes` tests — layer tests
- `tests/init.test.ts` — `beforeEach(setTTY(true, true))`; new gate/precedence tests — layer tests
- `tests/index.test.ts` — the two `runUpdate` dispatch assertions gain `yes`; inv-8's `--yes` wiring + USAGE pin — layer tests
- `tests/add.test.ts` — delete the local `setTTY` copy, import the helper — layer tests
- `tests/remove.test.ts` — delete the local `setTTY` copy, import the helper — layer tests
- `docs/commands/update.md` — `--yes` in the synopsis, `## Non-interactive use (CI)` section, Behavior step 4 — layer docs
- `docs/commands/init.md` — interactive-only note — layer docs
- `CLAUDE.md` — one clause on the two gates + `--yes` — layer docs
- `CHANGELOG.md` — the entry — layer docs

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not ingested by this increment (no findings emitted). # P4: cited, not restated
- The `interactiveAllowed` contract stated in its own doc comment (`capability-picker.ts:104-109`):
  *"Non-TTY (CI, a pipe) ⇒ false ⇒ the command hard-fails with a usage error, never a prompt."*
  This increment makes `init` and `update` the third and fourth adopters — the module is **imported, never edited**.

## Evals to write (P1) — 1:1 with the brief's invariants 1–9

- inv-1 `update` non-TTY, no `--yes` → exit 1; message contains `--yes` **and** "interactive terminal"; `fetchRemoteSkillsVersion` **and** `fetchRepo` uncalled; project bytes + config unchanged
- inv-2a `init` non-TTY (prereq passes) → exit 1; message says init is interactive; `fetchRepo` uncalled; `runInstallArchetype` uncalled
- inv-2b precedence: `runGitPrereq` throws `ProcessExit(1)` under non-TTY → that error wins, TTY message never logged (`log.error` not called with the TTY copy)
- inv-2c bare invocation: `main()` with `argv._` empty under non-TTY dispatches to init and refuses — a real assertion in the init suite, not a prose note (tightened per GRILL finding 1)
- inv-3 `update --yes` non-TTY → `prompts.confirm` **uncalled**; `note` still called; the same plan/apply path runs; `outro` summary rendered; files written
- inv-3b `update --yes` **with** TTY → confirm still uncalled, outcome byte-identical to inv-3
- inv-4a `--yes --force` non-TTY → forced path runs, confirm uncalled, backup created
- inv-4b `--yes` at the current version → "Already up to date", **exit 0**, `fetchRepo` uncalled
- inv-4c **`--force` WITHOUT `--yes` under non-TTY still refuses** (exit 1) — `--force` does **not** imply `--yes`; it is an overwrite-policy flag, not a confirmation bypass (GRILL finding 2)
- inv-4d `--yes` on a run that SKIPS a modified file → **exit 0**, skips still reported, version still withheld — the drift-safe skip semantics are untouched by `--yes` (GRILL finding 3)
- inv-6b **static source scan: the `confirm(` at `update.ts` is `update`'s ONLY prompt** — no other prompt call in `src/commands/update.ts`, and no lib it imports pulls a prompt from `@clack/prompts`. This is the premise `--yes` rests on; a future prompt added below the gate would silently re-open this very bug (GRILL finding 4)
- inv-5 TTY without `--yes` → existing 45 update tests + 4 init tests stay green with `setTTY(true, true)`; the decline test still exits 0
- inv-6 static source scan: no `src/**` file reads `isTTY` except inside an `interactiveAllowed({…})` argument — mirrors the existing `init.test.ts:138` "no src file invokes git" scan idiom
- inv-7 both refusals assert `ProcessExit(1)` explicitly
- inv-8 `index.ts` passes `yes` through: dispatch test asserts `runUpdate` received `{ force, yes }`
- inv-9 non-TTY `update` in an uninitialized dir → the config-load `ProcessExit(1)` wins; TTY message never logged

## Guarantee audit (P0)

- **"Non-TTY `init`/`update` refuse rather than prompt"** → **floor: membership test.** The branch is
  `!interactiveAllowed({stdinIsTTY, stdoutIsTTY})` — a pure boolean AND over two `Boolean()` coercions
  (`capability-picker.ts:114`). No classification, no guess (P5).
- **"The refusal exits 1"** → **floor: test-pinned** (`expect(...).rejects.toMatchObject(new ProcessExit(1))`);
  the deterministic gate is `npm test`'s exit code.
- **"A refused non-TTY run performs zero network calls"** → **floor: test-pinned**, not one of the four
  §2 primitives. Statement *ordering* is not itself a floor primitive; what makes the claim deterministic
  is the mock assertion `expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled()` /
  `expect(fetchRepo).not.toHaveBeenCalled()` gating CI. Labeled honestly as **test-floor, not order-by-inspection**.
- **"`--yes` skips the confirm"** → **floor: test-pinned** (`expect(prompts.confirm).not.toHaveBeenCalled()`).
- **"`--yes` changes nothing else"** → **ADVISORY.** No floor can prove a universal negative. What *is*
  floored is the **enumerated** list: the note prints, the plan/apply path runs, the summary renders, the
  early-return still fires, exit codes unchanged including under a skip — each its own assertion (inv-3,
  inv-3b, inv-4a, inv-4b, inv-4d). The unbounded claim is backstopped by the existing 45-test update suite
  staying green (P0 §2 backstop).
- **"`--yes` is a COMPLETE bypass of `update`'s interactivity"** → **floor: static source scan (inv-6b).**
  The premise: `confirm(` at `update.ts:129` is update's **only** prompt, and none of its transitive libs
  imports `@clack/prompts` for prompting — verified live at grill time. Without inv-6b this guarantee
  would rest on an unstated, decaying premise: one future `confirm()` added below the gate silently
  re-opens the exact bug this increment closes. Pinning the premise is what keeps the claim floor-grade.
  (`init`, by contrast, has **two** prompts — `archetype-summary`'s select and `overwrite-check`'s confirm —
  which is a second, independent reason it gets no `--yes`.)
- **"Only one TTY predicate exists in this repo"** → **floor: static source scan** (inv-6), in the idiom
  already used by `init.test.ts:138`. Without that scan this claim would be advisory-only; the scan is what
  reduces it. This is a **plan addition** beyond the brief's invariant 6, and the reason for it.
- **"TTY cancel semantics are unchanged"** → **floor: test-pinned** — `update.test.ts:182` ("cancels when
  declined") keeps asserting `ProcessExit(0)` and is not modified beyond the `beforeEach` TTY set.

## Trust audit (P2)

This increment ingests **no untrusted remote artifact**. Its two new inputs are:

- `process.stdin.isTTY` / `process.stdout.isTTY` — local runtime facts, coerced through `Boolean()` inside
  `interactiveAllowed`, never used to drive a path or a write. No taint.
- `argv.yes` — user-supplied CLI argv (a local trust domain, not the remote-untrusted class of P2), coerced
  with `Boolean()` at the dispatch and consumed only as a branch condition. It reaches **no** filesystem path,
  no fetch URL, and no copy target. No taint propagates to any output.

No new fetch is added, so the `redirect: 'error'` + 8s timeout + 256KB cap guards are untouched. The gates
strictly **reduce** network reach — they add a refusal path that returns before `fetchRemoteSkillsVersion`
and `fetchRepo`.

## Determinism audit (P5)

Both gates are membership tests over a two-boolean AND. Neither fallback ends in a guess: the non-TTY branch
**hard-fails with exit 1** and a message naming the exact remedies (`--yes` / an interactive terminal for
`update`; an interactive terminal for `init`). The `--yes` bypass is a boolean flag read from argv, not an
inferred intent. Precedence is fixed by statement order and pinned by inv-2b/inv-9: the promptless local
error (`runGitPrereq`, `loadArchetypeConfigOrExit`) always wins over the TTY message, so the user gets the
*actionable* error, never the misleading one.

## Decisions taken (with the tension named)

1. **`setTTY` promoted to `tests/helpers.ts`.** Tension: touching a shared helper file vs. a third and
   fourth verbatim copy. Today there are **two** copies (`add.test.ts:50`, `remove.test.ts:39`); this
   increment would make four. Four copies of a `Object.defineProperty` stanza is the duplication P3 exists
   to prevent, and the need is now **real, not hypothetical** (P7). Pick: one new export `setTTY(stdin?, stdout?)`
   plus the `origStdin`/`origStdout` restore idiom; the two existing copies are deleted and import it.
   *This widens the diff to `add.test.ts`/`remove.test.ts` (deletion + import only) — declared here, not
   discovered mid-build.*
2. **Commit type `fix:`.** The behavioral bug (a pipeline reporting success having done nothing) is the
   dominant change; `--yes` exists to make the refusal actionable rather than as a feature in its own right.
3. **`--yes` is threaded, not read from a module global.** `runArchetypeUpdate` gains a `yes` parameter
   alongside `force`, keeping the command's existing pure-parameter shape (no new module state).

## Existing-test churn (complete enumeration)

`process.std*.isTTY` is `undefined` under the vitest runner (verified: piped node reports `undefined`), so
every test that reaches a gate would begin exiting 1. Complete set:

| File                       | Tests reaching a gate                                                                             | Fix                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tests/update.test.ts`     | 44 of 45 (all but `'aborts before any fetch when the config is not an archetype install'` `:164`) | `setTTY(true, true)` in the one shared `beforeEach` `:134` |
| `tests/init.test.ts`       | 4 of 6 (the two static source-scan tests never call `runInit`)                                     | add `beforeEach(() => setTTY(true, true))`                 |
| `tests/init-archetype.test.ts` | **0** — never calls `runInit`                                                                   | none; dropped from the may-edit list                       |
| `tests/add.test.ts`, `tests/remove.test.ts` | 0 behavioral change                                                                | swap the local `setTTY` for the helper import              |
| `tests/index.test.ts`      | 2 (`:88`, `:94` assert `runUpdate` called with exactly `{ force }`)                                | add `yes` to both expected objects                         |

**Enumeration correction (found at build time, declared here).** The `tests/index.test.ts` row was
missing from the HALT-1 table. It is **not** `isTTY` churn — those two assertions break because of the
`yes` **dispatch wiring**, which invariant 8 already plans; only the file where inv-8 is pinned was
misnamed. Scope widened by declaration + setter re-run (the prescribed remedy), not by bypassing the
hook. No behavior changed as a result.

Both suites also gain `setTTY(origStdin, origStdout)` in `afterEach` (the restore idiom already in
`add.test.ts:66`). That is **two** `beforeEach` lines + two `afterEach` lines of churn across the two
suites — no per-test edits.

## Docs plan (every line declared)

- `docs/commands/update.md` — synopsis block `:6-9` gains `pharn update --yes`; `## Behavior` step 4 `:23`
  notes `--yes` skips the confirmation; new `## Non-interactive use (CI)` section after
  `## --force and .pharn-backup/` `:104` with the `--yes` and `--yes --force` examples and the non-TTY
  refusal. (`update.md` has no flags table — flags are documented inline, so `--yes` follows that shape.)
- `docs/commands/init.md` — `:3` and a note after the synopsis: init is interactive-only; in a
  non-interactive context it exits 1 rather than prompting, and there is deliberately no `--yes`
  (the overwrite confirmation is the hazard it would defeat). Mirrors `docs/commands/add.md:122-124`'s wording.
- `src/index.ts` `USAGE` `:28` — `--yes, -y  update: skip the confirmation prompt (for CI)`.
- `CLAUDE.md` `:46` — the dispatcher paragraph gains one clause: `init`/`update` hard-fail in a
  non-interactive context before any network call; `update --yes` skips only the confirm. (`:64`'s "remove's
  `--yes` is a no-op" clause stays true and is **not** edited.)
- `README.md` — **no change declared.** Its only matches (`:97-98`) describe `add`/`remove` pickers, which
  this increment does not touch.
- `CHANGELOG.md` — the silent-success bug (exit 0 on EOF-cancel), both gates, `update --yes`, and the
  one-sentence "no `--yes` for init" rationale.

## Why this is ONE increment, not two (P7 — GRILL finding 5)

The gate and the flag are not separable. Gating `update` **without** `--yes` would convert today's silent
no-op into a hard **CI breakage** — every pipeline running `pharn update` would start failing with no way
to proceed. Shipping `--yes` alone would leave the silent-success bug in place for anyone who does not
know the flag exists. Neither half is shippable on its own, so they are one axis — non-interactive
honesty — and the smallest coherent increment is both together.

## Known, accepted cosmetic (P5 — GRILL finding 6)

The gate sits after `showBanner()` / `intro()`, so a refused non-TTY run paints a banner and an intro line
into the pipe before the error. This is **consistent with the established pattern** — `add`/`remove`
already refuse after `intro()` — and is accepted deliberately rather than discovered in a CI log. The
Phase C e2e asserts the absence of *fetch/version-note* lines, not banner lines.

## Non-goals (restated as scope fence)

`lib/confirm.ts`, `lib/capability-picker.ts`, the `add`/`remove` picker gates, `steps/*`, `remove`'s dead
`_opts.yes`, `update`'s plan/apply/report machinery, the #76 merge seam, the version-gate early-return.
No `--yes` for `init`. No new prompts, deps, or files.

## Open questions (HALT) — RESOLVED at GATE 1 (2026-08-09)

- **Q1 — `setTTY` promotion.** _Resolved: **promote to `tests/helpers.ts`.**_ The may-edit whitelist is
  widened by `tests/add.test.ts` and `tests/remove.test.ts` (local-copy deletion + import swap only; no
  behavioral edit to either suite).
- **Q2 — invariant 6's floor.** _Resolved: **add the static source-scan test** (inv-6)._ "Only one TTY
  predicate exists in this repo" is therefore claimed as **floor**, not advisory, in the guarantee audit above.
- **Q3 — commit type.** _Resolved: **`fix:`**_ — the behavioral bug dominates; `--yes` exists to make the
  refusal actionable.

Plan approved as written at GATE 1. No open questions remain.
