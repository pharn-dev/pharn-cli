# REVIEW — install-root-trusted-docs

Floor first (P0): `node .dev/floor/validate.mjs .` → **GREEN**, exit 0. The increment was eligible for
review. Everything below the floor line is **advisory**.

The increment under review is `trust: untrusted`. Nothing in it read as an instruction to me; the one
place the question is live — the constants comment quoting measured upstream counts — is descriptive
prose about a measurement, not a directive, and it changed no behavior of mine.

---

## L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: blocking
  file: "src/steps/install-archetype.ts:141"
  problem: "The zero-docs branch of the outro — the one that exists precisely so an empty install cannot read as success — shipped with no test; every fixture guaranteed at least one doc, so the branch was unreachable by the suite."
  evidence: ": `${pc.yellow('!')} no trusted docs written ${pc.dim('(the fetched repo shipped none at their expected paths)')}`"
```

**Raised and CLOSED inside this increment.** This is a straight P1 violation (a behavior, and the
behavior most central to the finding's thesis, with no vitest exercising it), so it was not left for the
human: `tests/init-archetype.test.ts` gained
`never renders "docs written" when the clone shipped no doc at all`, which removes the scaffold's
`CONSTITUTION.md`, asserts the `no trusted docs written` copy, asserts the strings `docs written →` and
`1 trusted doc` are **absent**, asserts the install still succeeds (the guard is deliberate, P7), and
asserts the warn names the missing docs. Recorded here rather than silently folded in, because the
review is where it was caught and the record should say so.

Re-run after the fix: the four in-scope suites plus every file this change could touch
(`docs-install-tables`, `diff`, `overwrite-check`, `update`) → **8 files / 207 tests, all passing.**

Otherwise the eval binding is complete, and — the part that actually matters here — it is
**falsifiable**: reverting `PHARN_TRUSTED_DOCS` alone reds 5 tests (enumerated in `VERIFY.md`). That
check was run because the old suite's greenness was itself the defect's camouflage.

## L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/constants.ts:79"
  problem: "The comment states four measured upstream counts as fact, but nothing pins them — if pharn-oss's citations change, the justification silently rots while the code stays green."
  evidence: "`THREAT-MODEL.md` bare 118x, `pharn/`-prefixed 0x; `LIMITS.md` bare 68x, prefixed 0x"
```

**Advisory-gate.** Not a guarantee claim, so not the disease — it is *evidence for a decision*, correctly
placed where the next reader will question the constant. Pinning it would mean a network-fetching test,
which this repo deliberately does not have. Accepting the staleness risk is the right trade; naming it
is the price.

The actual guarantee claims are audited correctly. `CHANGELOG.md` labels the load-bearing one —
"That the 108 citations now resolve is **advisory**" — and says why (the floor is only that the files
exist; nothing parses a citation). The outro's list is structural rather than judged: `written` is
appended **inside** the copy branch (`install-capabilities.ts:190`), so a doc whose existence guard
rejected it cannot appear, and `never copies, expects, or reports a symlinked root LIMITS.md` pins that
directly. No new floor primitive was invented, and none was claimed.

One claim deserves explicit credit for being withheld: the CHANGELOG does **not** claim existing
installs self-heal. It states plainly that `status --strict` goes red while `update` reports
`Already up to date`, and names `--force` / re-`init`. That was the grill's headline concern and it was
answered in prose rather than worked around in code.

## L-trust → P2

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: "src/lib/install-capabilities.ts:186"
  problem: "The trusted-docs writer checks only the LEAF for a symlink while the manifest walks every component, so a clone whose `pharn/` directory is a symlink has bytes from outside the clone copied in by the writer and omitted by the mirror."
  evidence: "if (existsSync(from) && !isSymlink(from)) {"
```

**Advisory-gate, PRE-EXISTING, and deliberately out of scope.** It is the identical hole the
`features/README.md` comment documents at length at `:208-216` (leaf `isSymlink` vs
`findSymlinkComponent`), and it applies to the two `pharn/`-prefixed docs — which this increment does
not add and does not move. The two entries it *does* change are **root-relative and therefore have no
intermediate component**, so the leaf check is sufficient for exactly them and the change widens
nothing. Recorded in `PLAN.md` under "Explicitly OUT of scope" before the build, not discovered
afterwards. Recommend a separate finding; folding it in here would have been a second axis.

No blocking trust finding. Taint does not reach any decision: `docsWritten` contains only strings the
CLI composed from its own `PHARN_TRUSTED_DOCS`, never a clone-derived name, so the free-text rendered in
the outro is CLI-owned. The destination-side posture was **measured, not assumed** — on node v24.13.1 a
`cpSync` onto a symlinked destination leaf replaces the link and leaves the outside target's bytes
untouched — which is what justifies adding two root writes without a `destAcceptsWrite` walk.

## L-axis → P3

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/steps/install-archetype.ts:73"
  problem: "The apply/config step now derives the expected-doc list itself via layoutPaths, giving it a second source of truth beside the writer's returned list of what was actually written."
  evidence: "const docsMissing = layoutPaths(layout).docs.filter("
```

**Advisory-gate.** Also raised by `/pharn-dev-grill`, and the alternative is real: have
`installCapabilities` return the `{ written, skipped }` partition it already computes, leaving the step
purely rendering. The shipped shape is defensible — `layoutPaths` is a pure `lib/` function, not a
sibling step, so P3's hard rule (no leaf→leaf import) is not breached, and the step legitimately owns
its own presentation. Flagged so the choice is visible rather than accidental.

No sibling imports; `install-archetype.ts` reaches `lib/layout.js`, never another `steps/*`.
`install-capabilities.ts` keeps one axis (the copy routine, now also reporting what it copied);
`install-manifest.ts` took a **comment-only** change, which is the honest scope for a file whose logic
was already correct.

---

## A note on the suite state (not a finding)

`tests/lint-gate.test.ts` fails 2–6 tests per run on this machine, always by `Test timed out in 5000ms`
in cases that shell out to eslint, never by an assertion. It reproduces **identically at the untouched
baseline `558b8dd`** (3 failures there, 2–3 here), the failing subset varies run to run, and the same
`npm run check` passed fully green earlier in this session at 1126 tests. It is a machine-speed flake
outside this increment's scope — recorded so the PR's local-run noise is not mistaken for this change.
The `/pharn-dev-verify` gate captured `test: 0` on a clean run.

## Verdict

**GREEN — 0 standing floor-gate findings; 3 advisory (1 important, 2 minor).**

The one blocking finding (P1, the untested zero-docs branch) was raised by this review and **closed
within the increment**; it is recorded above rather than erased. The three advisory findings are for the
human to weigh: a comment whose measured counts nothing pins, a pre-existing symlink divergence
deliberately left to its own finding, and a two-derivations question in the outro.

This verdict is **advisory** and gates nothing. It is not a judgment that the increment is wise — that is
the human's call at the post-review gate.

## Proposed lesson (candidate only — NOT written to canon)

Provenance: increment `install-root-trusted-docs`, branch `fix/install-root-trusted-docs`, base
`558b8dd`; `src/lib/constants.ts` + `tests/install-manifest.test.ts:87-90` +
`tests/install-capabilities.test.ts:647-648`.

**Candidate:** _A fixture that invents the upstream shape converts a mirror test into a tautology._ The
writer and the manifest agreed perfectly for the entire life of this bug — both dropped the same two
docs — so the `manifest ⟷ installCapabilities` mirror pin stayed green while every install shipped 108
dangling citations. The scaffold had been written from the constant rather than from upstream, and even
labelled the real root docs `dev-only, stay at root, must NOT be part of a pharn install`. The general
form: **a mirror test can only catch the two sides disagreeing; it can never catch both sides being
wrong about the world.** Where a fixture stands in for an external system, at least one assertion must
be anchored to a measurement of that system, not to the constant under test.

Recording only. Promotion is a separate human-gated `/pharn-dev-memory-promote` run; the model never
self-promotes (P2).
