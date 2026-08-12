# REGRESSION — ci-matrix-required-checks

**Base:** `4b8a0be0c4cbb1e84c93cf0ae47ffd3324c205b9` (working tree is dirty → `base = HEAD`, per the
deterministic base rule: `git status --porcelain` non-empty).

This stage ran **twice**. Run 1 stopped the pipeline with `"verdict": "regressions"`; the human
widened the approved plan's `## Files`, the cause was fixed, and run 2 is clean. Both are recorded —
the first run is the interesting one and deleting it would make this report a worse record than the
run it describes.

---

## Run 2 (current — the verdict that stands)

**Inside (the changed scope)** — 5 paths, exactly the amended plan's `## Files`, `escaped: []`:

```text
.github/workflows/ci.yml
CLAUDE.md
docs/contributing.md
tests/ci-workflow.test.ts
.dev/floor/check-run-pins.test.mjs
```

**Outside gates:** **45** test files — one fewer than run 1, because `check-run-pins.test.mjs` is now
*inside* the feature and correctly stops being an outside gate — plus whole-repo `validate`.
**0 committed eval pairs** exist in this repo today, so `outside_eval_pairs` is empty and no
`structural:*` gate runs.

**Style gates skipped** by the deterministic config-touch rule: `inside` touches none of
`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`, so a style
flip over the byte-identical outside files is provably impossible. Absent from **both** result maps,
so the gate sets match.

### Gate results (exit codes, base → head)

| gate       | base | head | outcome |
| ---------- | ---- | ---- | ------- |
| `tests`    | 0    | 0    | OK      |
| `validate` | 0    | 0    | OK      |

Reported counts, checked on both sides: base `pass 704 fail 0`, head `pass 704 fail 0`.

`regressions[]`: **empty** · `pre_existing[]`: **empty** (nothing was already red at the baseline).

### Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
`check-regress.mjs verdict` exit **0**, `"verdict": "no-regressions"`.

---

## Run 1 (superseded — a real regression, and a false green before it)

### The scoping note

The first `scope` call passed the raw working-tree diff as `--changed`, which with `base = HEAD` also
sweeps in the pipeline's own stage artifacts — `.pharn/writes-scope.json` (always-writable hook
scratch per `enforce-writes-scope.cjs`), `PLAN.md` (written by `/pharn-dev-plan` under its own scope),
and `GRILL.md` (likewise `/pharn-dev-grill`). That call exited 1 with three blocking fix-#7 findings.
It was **not** a scope breach: `/pharn-dev-build` was pinned to its `## Files` and the hook would have
denied anything else. Re-run with `--changed` limited to the build's product diff — matching the prior
increment's convention (`remove-prunes-records`, whose `inside` is likewise exactly its `## Files`) —
`scope` exits **0** with `escaped: []`. Recorded rather than silently re-run, because deciding the
partition is **advisory orchestration**, not floor.

### The invalid capture (P6)

The first base/head capture recorded `tests: 1` on **both** sides, which `check-regress.mjs` correctly
read as `pre_existing` → `no-regressions`. That reading was true of the numbers and false of the
world: **both** runs had failed to run any test at all.

Cause: the capture built the file list into a shell variable and expanded it unquoted —
`node --test $TESTS_ARR`. **zsh does not word-split an unquoted parameter expansion** (it *does* split
an unquoted command substitution), so all 46 paths arrived as a single argument and `node --test`
exited 1 with `Could not find '<the whole list> '` and no TAP summary. Identical breakage on both
sides produced a matched pair of 1s — a false green that looked exactly like a real one.

The capture now (a) expands `$(…)` inline so zsh splits it, and (b) **asserts a TAP summary line is
present on each side** before writing the results map, so a run that executed nothing can no longer be
recorded as a result. Corrected run-1 numbers: base exit `0` (`pass 748 fail 0`), head exit `1`
(`pass 747 fail 1`) → `"verdict": "regressions"`, `regressions[]: ["tests"]`.

### The regression it exposed

```text
.dev/floor/check-run-pins.test.mjs:365
✖ ★ the live repo has NO floating install in any workflow run: line
  AssertionError: Expected values to be strictly equal:  7 !== 2
  at check-run-pins.test.mjs:373  →  assert.equal(d.skipped, 2)
```

`d.skipped` counts **lockfile installs** (`npm ci`) — the exempt, non-floating kind — across every
workflow. Base: 1 in `ci.yml` + 1 in `publish.yml` = 2. Head: 6 in `ci.yml` (one per gate job) + 1 in
`publish.yml` = 7. Confirmed causally, not inferred: stashing only `.github/workflows/ci.yml` returned
that file to **44 pass / 0 fail**.

Two things the failure was **not**, both checked rather than assumed: `d.violations` was still `[]`, so
**no floating install was introduced** — every added line is `npm ci`, pinned by the lockfile; and
`d.files` still enumerated every workflow, so nothing dropped out of the scan. What tripped is the
deliberate exact-count tripwire behaving exactly as designed — its own comment reads *"If this number
changes, a lockfile install was added or removed on purpose."*

### Resolution

The fix was the one number, and the file was outside the approved `## Files`, so the fix-#7 hook denied
the write — correctly, fail-closed. Widening an approved plan's scope is a human decision, so the
pipeline stopped and asked. The human approved the amendment; `PLAN.md` `## Files` now carries
`.dev/floor/check-run-pins.test.mjs` with the reason, the assertion reads `7` with a comment naming
the new arithmetic, the writes-scope was re-set **from the amended plan** (never bypassed), and the
floor is GREEN again (748/748, `validate` 0, `npm run check` 0).

---

## Honest residual (P7)

`/pharn-dev-regress` catches exactly what its suite catches — nothing more. The claim is
"deterministically-detectable breakage outside the feature is caught", **not** "nothing broke".
Choosing the base, partitioning inside/outside, and running the suite are **advisory orchestration**;
only the exit-code comparison is a guarantee. Run 1 is a live demonstration that bad orchestration can
feed a sound comparator a false green — the comparator was never wrong about the ints it was given.
