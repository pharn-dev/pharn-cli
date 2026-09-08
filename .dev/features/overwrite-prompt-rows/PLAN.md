# PLAN — overwrite-prompt-rows (`docs/reference/pharn-config.md` documents a prompt that no longer exists)

- spec_content_hash: dd15ddd94a44ce6c90c0644955e8ded1a70255d0cc03c5b21181f5caedafbbc7 # fix #4
- increment: rewrite the "Overwrite behavior" rows so they describe `confirmWriteTargets` (the real
  init prompt) instead of the deleted `confirmOverwriteIfExists`, and — optional half, taken —
  restore the useful `skillsVersion` display the deleted prompt had, inside `confirmWriteTargets`,
  behind a reader that can never fail the run.
- layer(s): user docs (`docs/**`) + one CLI stage (`src/steps/overwrite-check.ts`)
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Discovery (P6 — read live this run)

HEAD `977aa38` (`build: add the npm run dev script both contributor docs already document (#143)`),
working tree clean, `package.json` version `0.4.0`. Baseline gates on the untouched merge-base
(measured at `977aa38` in a separate detached checkout, all six green):

| Gate                             | Result                                        |
| -------------------------------- | --------------------------------------------- |
| `npm test`                       | exit 0 — 51 test files, **1056 tests** passed |
| `npm run lint`                   | exit 0                                        |
| `npm run typecheck`              | exit 0                                        |
| `npm run format:check`           | exit 0                                        |
| `npm run lint:md`                | exit 0 — 0 issues, 23 files linted            |
| `node .dev/floor/validate.mjs .` | exit 0                                        |

### The defect, quoted from disk

`docs/reference/pharn-config.md:158-168`, read this run:

```markdown
## Overwrite behavior

| Command          | Existing `pharn.config.json` | Prompt                                               | If declined             |
| ---------------- | ---------------------------- | ---------------------------------------------------- | ----------------------- |
| `init`           | present                      | "Overwrite existing pharn.config.json?" (default no) | Cancel install (exit 0) |
| `add` / `update` | required (archetype)         | none — updated in place                              | n/a                     |

For the files PHARN installs (as opposed to this config), `update` never overwrites one you have
edited unless you pass `--force` — see the [update decision table](../commands/update.md#the-decision-table).

`init` shows the previous `skillsVersion` before asking.
```

A repo-wide search for the literal `Overwrite existing` (excluding `node_modules` and VCS metadata)
returns **exactly one line**: `docs/reference/pharn-config.md:162`. The string exists nowhere in
`src/` or `tests/`. `grep -c skillsVersion src/commands/init.ts src/steps/overwrite-check.ts` returns
**0 and 0**: nothing in the init path reads a previous `skillsVersion`. Both spec claims reproduce
exactly.

### The live prompt, quoted from disk

`src/steps/overwrite-check.ts:45-55` — **byte-identical to the spec's quote**, and `MAX_LISTED = 10`
is at `:29`, also exact:

```ts
  if (conflicts.length === 0) return true; // zero friction — nothing to overwrite

  const shown = conflicts.slice(0, MAX_LISTED);
  const more = conflicts.length - shown.length;
  const list = shown.map((p) => `  • ${p}`).join('\n');
  const tail = more > 0 ? `\n  …and ${more} more` : '';
  return confirmWarning(
    `PHARN installs into your existing project. These paths already exist and may be overwritten:\n${list}${tail}`,
    'Continue and overwrite?',
    false,
  );
```

The "If declined" column is still correct: `src/commands/init.ts:105` initialises
`outcome = 'cancelled'`, `:134` gates the install on `await confirmWriteTargets(...)`, and `:160`
runs `if (outcome === 'cancelled') cancelAndExit();` — `cancelAndExit` is `process.exit(0)`
(`src/lib/confirm.ts:3-8`). A Ctrl+C at the prompt is also exit 0 (`confirm.ts:39`).

### Spec anchors that did NOT match live state (reported, not blocking)

| Spec claim                                                    | Live                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `docs/reference/pharn-config.md:148-158`, table at `:150-153`  | section starts `:158`; table `:160-163`                       |
| the `skillsVersion` sentence at `:158`                         | `:168`                                                        |
| `docs/commands/init.md:105` describes the real flow            | `:105` is **blank**; the accurate paragraph is `:123`          |
| `src/commands/init.ts:88-97` leaves `outcome` at `'cancelled'` | `outcome` declared `:105`; the gated install is `:131-141`     |
| `init.ts:112` calls `cancelAndExit()`                          | `:160`                                                        |
| `conflictingWriteTargets`, `install-manifest.ts:138-157`       | `:220-239`                                                    |
| tests: "zero-conflict no-prompt case (lines 90-94)"            | zero-conflict case is `:78-85`; `:87-94` is the settings-only  |

Every **substantive** claim held; only the line numbers had drifted (uniformly about +10 in the doc,
and the two source files had grown). `src/steps/overwrite-check.ts` and
`tests/overwrite-check.test.ts:105` matched to the line.

### `docs/commands/init.md:123` — the accurate text this fix mirrors

> After you choose **install**, `init` checks which of its **actual write targets** … already exist
> in your project. If any do, it lists them (capped at 10, then "…and N more") and asks you to
> confirm before overwriting — default **no**. If none do, there is no prompt (zero friction).
> `.claude/settings.json` is never overwritten, so it is excluded from the check.

### The optional enhancement's trap, verified in the reader itself

`src/lib/pharn-config.ts:73-114` — `readPharnConfig` returns `null` for absent/malformed/wrong-shape,
but the `models`/`seam`/`capabilities[].source` validators sit **outside** that try, so a bad
hand-edit throws `ModelRoutingError` / `SeamConfigError` / `CapabilitySourceError` and propagates by
design (its own doc comment: _"never swallowed into the 'run init' lie"_). `init` has no
`loadArchetypeConfigOrExit` and no recovery around the summary stage, so an unguarded
`readPharnConfig` inside `confirmWriteTargets` would throw into `init.ts`'s
`catch (err) { failure = { err } }`, then `reportFatal`, then `process.exit(1)`. **A user whose
config is broken would be unable to run the one command that repairs it.** The enhancement therefore
does not use `readPharnConfig` at all.

## Files

- `src/steps/overwrite-check.ts` — one new local `recordedSkillsVersion` reader plus one interpolated
  clause in the existing warning string. Layer: CLI init stage (one verb, unchanged).
- `tests/overwrite-check.test.ts` — five new cases in the existing `describe`. Layer: spec (P1).
- `docs/reference/pharn-config.md` — the "Overwrite behavior" section rewritten (the required fix).
- `docs/commands/init.md` — one clause at `:123` so the two docs cannot contradict (P4).
- `CHANGELOG.md` — one `### Fixed` entry under `## [Unreleased]`.

No new source files. `lib/install-manifest.ts` (`conflictingWriteTargets`, the cap, the expected-path
set), `lib/pharn-config.ts`, `commands/init.ts`, and `lib/confirm.ts` are **untouched**.

## The change (the one axis)

`confirmWriteTargets` gains a cosmetic prefix, computed **after** the zero-conflict early return:

```text
if (conflicts.length === 0) return true;     // UNCHANGED — still the first statement
...
version := conflicts.includes(PHARN_CONFIG_FILE) ? recordedSkillsVersion(cwd) : null
head    := version === null
             ? 'PHARN installs into your existing project.'
             : 'PHARN installs into your existing project (currently at skills v<version>).'
```

`recordedSkillsVersion(cwd)` reads the ONE scalar it displays and treats **every** failure as "no
version to show":

```ts
function recordedSkillsVersion(cwd: string): string | null {
  try {
    const raw = readFileSync(safeJoin(cwd, PHARN_CONFIG_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = (parsed as { skillsVersion?: unknown }).skillsVersion;
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}
```

Four properties make it safe, each pinned by a test below: it is **not** `readPharnConfig` (so no
named validator error can reach `init`); every throw is caught (missing file, EISDIR, EACCES,
truncated JSON, a JSON scalar at top level); the value is filtered through the existing `VERSION_RE`
allowlist (`lib/validate.ts:10`) before it is interpolated into a terminal string, so an
escape-sequence hand-edit is dropped rather than printed; and the read is `safeJoin`-contained under
the project root even though `PHARN_CONFIG_FILE` is a compile-time constant. Zero network: the number
shown is the local config's, never upstream's.

### Why the read is placed after the early return, not before

The `conflicts.length === 0` return is the zero-friction invariant (P5: a membership test over a
deterministic set). Reading the config above it would make a conflict-free install do filesystem work
it does not need, and would put a failure mode on a path that currently has none. Placed after, a
conflict-free project reaches no new code at all — pinned by the two pre-existing silence tests.

## Evals to write (P1)

All in `tests/overwrite-check.test.ts`, inside the existing `describe('confirmWriteTargets')`.

| # | Property                                                             | Test                                                                                                                                             |
| - | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | the recorded version is shown when the config is among the conflicts  | `names the recorded skillsVersion` — write a config with `"skillsVersion":"2.3.4"`; the warning contains `skills v2.3.4`                            |
| 2 | **a corrupt config still prompts and does not abort**                 | `renders the prompt on an UNPARSEABLE pharn.config.json` — truncated JSON; resolves `false`, warning still contains the pinned text, no `skills v`  |
| 3 | **a config `readPharnConfig` would THROW on still works**             | `survives a config readPharnConfig would REJECT` — valid JSON plus a poisoned `models` block; asserts (a) `readPharnConfig` really throws on that exact file, (b) the prompt renders and the version is still shown |
| 4 | a non-conforming `skillsVersion` is dropped, not printed              | `drops a skillsVersion that is not a plain version string` — a value carrying an ANSI escape; prompt renders, no `skills v` in the warning          |
| 5 | no config, no version clause                                          | `shows no version when pharn.config.json is not among the conflicts` — CONSTITUTION.md-only conflict; warning has no `skills v`                     |
| 6 | zero-conflict silence is unchanged                                    | the two **pre-existing** tests (`:78-85`, `:87-94`) — untouched; they are the proof the banner did not turn a conflict-free install into a prompting one |
| 7 | every pre-existing assertion still holds                              | the other five pre-existing cases (warning text, declined `false`, Ctrl+C `ProcessExit(0)`, the cap, the `pharn/` layout) — untouched               |

RED-first: tests 1, 3 and 4 fail on the unmodified tree (nothing reads the config), which is the
required failing run recorded in `REGRESSION.md` and the PR body. Tests 2 and 5 pass at baseline and
are **regression pins**, not new-behavior proofs — labelled as such rather than counted as evidence.

## Guarantee audit (P0)

| Claim                                                                  | Reduction                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "the doc no longer names a prompt that does not exist"                  | **FLOOR — string membership.** The literal `Overwrite existing` must not appear anywhere under `docs/`, `src/` or `tests/`. Deterministic, re-runnable, quoted in the PR. Two files deliberately still carry it and are excluded by name, not by accident: `CHANGELOG.md` (which reports the deletion) and this feature's own `PLAN.md` (which quotes the defect as evidence). Both are historical records, neither is read as current behavior. |
| "a corrupt `pharn.config.json` cannot make `init` abort at this prompt" | **FLOOR for the reader, ADVISORY for `init` as a whole.** Tests 2 and 3 prove `confirmWriteTargets` returns normally on unparseable JSON and on the one input class that makes `readPharnConfig` throw. They do **not** prove `init` is corrupt-config-safe end to end: `runInitArchetype` is not exercised here, and the other stages are unchanged and unaudited by this increment. Stated, not sold. |
| "every read failure is treated as no-version"                           | **PARTLY FLOOR.** The `try`/`catch` is total for anything `readFileSync`/`JSON.parse` throws, and the tests cover unparseable, absent, and wrong-value-type. A test cannot enumerate every filesystem errno (EACCES, EIO, a FIFO at that path); those rest on the code shape — one `try` around the whole body, one `return null` in the catch — which is an argument, not a measurement. |
| "no control characters reach the terminal from the config"              | **FLOOR — regex allowlist.** `VERSION_RE` is anchored and character-classed; test 4 pins one escape-sequence case. The allowlist, not the test, is the guarantee.                                                                                          |
| "a conflict-free install is unchanged"                                  | **FLOOR — structural.** The new code is entirely below the zero-conflict return; the two pre-existing silence tests assert `confirm` and `log.warn` were never called.                                                                                     |
| "zero network"                                                          | **FLOOR — structural.** The stage imports `node:fs`, `confirm`, `install-manifest`, `layout`, `validate`. No fetch, no child process; `skills-version.ts`'s remote reader is not imported.                                                                  |
| "the version shown is the one that is about to be overwritten"          | **ADVISORY.** It is the version the local config records. If the config is stale relative to what is actually on disk (a partial `update` that withheld its bump, a hand-edit), the number is stale too. `status` reconciles those; this line is an orientation aid, not an audit. |
| "the rewritten rows match the code"                                     | **ADVISORY.** No test compares prose to behavior. The reduction is that both docs now quote the same literals the code contains (`Continue and overwrite?`, the cap of 10, `…and N more`), and those literals are themselves pinned by tests — so doc drift would have to survive a matching test edit. |

## Trust audit (P2)

Two inputs. The **conflict set** comes from the untrusted clone and is unchanged by this increment —
still produced by `conflictingWriteTargets` under `safeJoin`, still displayed as data. The **new**
input is the project's own `pharn.config.json`: local and user-owned, but still untrusted as a
string, because it reaches a terminal warning. It is reduced to one field, that field is filtered
through `VERSION_RE` before interpolation, and the path is `safeJoin`-contained. Nothing from the
file is executed, spawned, imported, or sent anywhere; a non-conforming value is dropped, not escaped
or truncated.

## Determinism audit (P5)

Two new branches, both membership tests: `conflicts.includes(PHARN_CONFIG_FILE)` over a set the stage
already computed, and `VERSION_RE.test(v)` over an anchored allowlist. Both fall back to `null`, and
the warning is then byte-for-byte the pre-existing string. There is no third outcome and no guess.
The prompt's own decision (`confirmWarning(..., false)`) is untouched: default No, Ctrl+C exits 0.

## Out of scope (P7)

- `conflictingWriteTargets`' contents, the `MAX_LISTED = 10` cap, and `lib/install-manifest.ts` —
  untouched. Adding `pharn.records.json` to the conflict set is a separate, unverified observation.
- `add` / `update` overwrite semantics and the update decision table — untouched.
- The `models` block documentation in the same file — a different finding, already shipped as #142.
- No `--yes` for `init`, and no second TTY check: this prompt is the destructive overwrite
  confirmation and `init`'s TTY gate stays the shared `interactiveAllowed` predicate.
- `readPharnConfig`'s propagate-on-bad-block behavior is **not** changed; this increment routes
  around it locally rather than weakening it for every caller.
- No CLI flag, no new config field, no schema change — the config is read, never written, here.
