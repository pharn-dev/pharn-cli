# GRILL — contributing-six-gates (advisory; gates nothing)

## F1 — "one local command equals CI" is the claim most likely to become false (P0)

**Problem.** The whole justification for touching `package.json` is that a contributor should be able
to reproduce CI locally. After this change `npm run check` still differs from CI in **two** ways:
it runs `test`, not `test:coverage` (so coverage thresholds are not enforced locally), and it does
not run `build`. If the docs say "this is what CI runs" — the exact sin being fixed in
`CONTRIBUTING.md` — the fix reintroduces the bug one line down.

**Reduction.** Both divergences get an explicit pin in the new test, so they are recorded decisions
rather than gaps. Every doc sentence must say "everything except `build`, and without coverage
thresholds" rather than "exactly what CI runs". **This is the single most important thing to get
right in this increment.**

## F2 — the gate-script list now exists in three places (duplication)

**Problem.** `tests/ci-workflow.test.ts` has `EXPECTED_GATES`; `tests/dev-script.test.ts` (landed last
increment) has `CI_GATE_SCRIPTS`; this adds a third consumer. Three copies drift.

**Reduction.** None taken here, and the reason is scope: `5.6d` is the prompt that revisits the
ruleset pins and is the right place to consolidate. Consolidating now would edit
`tests/ci-workflow.test.ts`, which this increment's `## Files` deliberately excludes. Recorded so
`5.6d` inherits it rather than rediscovering it.

## F3 — `prepublishOnly` silently becomes stricter (knock-on, must be stated)

**Problem.** `package.json:49` is `"prepublishOnly": "npm run check"`. Adding `lint:md` means a
release now fails on a markdownlint error in `docs/`. That is defensible — a release with broken docs
is a bad release — but it is a **publish-path behavior change** hidden inside a docs PR.

**Reduction.** Named in the PR body and the CHANGELOG. Not worked around: the alternative (a separate
`check:local`) would give contributors two aggregates and re-open the "which one is CI?" confusion
this increment exists to close.

## F4 — the module-era prose is three separate claims, only one of which is about modules (precision)

**Problem.** Treating `:3`, `:9`, `:30` as one "remove the word modules" edit would miss that `:9`
names two deleted *mechanisms* (the init step pipeline, dependency resolution) and `:30` names a
deleted *command surface* (the wizard). Each needs its live replacement, not a deletion.

**Reduction.** `:9` reuses `docs/contributing.md:77`'s existing phrasing verbatim (P4 — cite, do not
invent a second description of the architecture). `:30` uses `CLAUDE.md`'s own rule wording ("when
changing behavior"). `:3` says what the CLI installs today (capabilities).

## F5 — the `test-app/` pickup is optional; taking it is cheap but widens the diff (scope)

**Observation.** The spec permits folding in the `test-app/` → `test-*/` wording fix. It is two lines
in two files already open in this change, and leaving it means a third PR touches the same two
paragraphs. Taken.

## Verdict

**Advisory: proceed.** F1 is the one that decides whether this increment is honest; it constrains the
doc wording, not the code.
