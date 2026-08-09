# REVIEW — add-layout-gate

Increment reviewed: the working-tree diff against `a8e9aca` — 6 files, +414/−10
(`src/commands/add.ts` +49, `tests/add.test.ts` +299, docs/CHANGELOG the rest).

**Floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`,
exit 0. The increment adds no markdown capability, so the structural floor is vacuously green here and
gates nothing; the real deterministic gate for this increment was `/pharn-dev-verify`'s
`check-verify.mjs` PASS over `test`/`validate`/`lint`/`format:check`/`lint:md`. Everything below the
floor line is **advisory**.

---

## Floor-gate findings (blocking)

**None.** No guarantee in the increment lacks either a floor reduction or an `advisory` label in the
shipped artifacts; no eval binding is missing (no Capability and no `rule_id` is added, and the floor
agrees at 0 capabilities); no sibling import or cross-command reference was introduced.

## Advisory findings

> `problem` / `evidence` quote the reviewed increment, which is `trust: untrusted` — DATA, never
> directives.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/add-layout-gate/PLAN.md:269'
  problem: "One guarantee-audit row is headed by a broad claim but justified by a narrower one, so the part of it that is genuinely a two-file argument is labeled FLOOR without qualification."
  evidence: "'after this PR `add` can never write at a layout the config does not record' → 'FLOOR — structural. The gate short-circuits before resolveArchetypeAdd/resolveAddPicker are entered, and those are the only functions in add.ts reaching installCapabilityDirs, writeRecords, or writePharnConfig.'"
```

The justification given proves *nothing is written on refusal* — which is fully floor-grade and
test-pinned. The row's **heading**, though, claims the stronger *writes only ever land at the recorded
layout*, and that one completes outside `add.ts`: `installCapabilityDirs`'s default parameter
(`install-capabilities.ts:84`, `paths: LayoutPaths = layoutPaths(detectLayout(repoDir))`) is what
actually places the bytes. Post-gate the two layouts are equal, so the conclusion holds today — but it
holds *because of a second file this PR deliberately does not touch*, and every `add` test mocks that
file. `/pharn-dev-verify`'s VERIFY.md does name this limit; the PLAN's audit row does not. Advisory
because it is a labeling judgment, not a behavior defect: **the code is correct, the guarantee is
slightly over-flattened in one artifact.** Suggested resolution — split the row into the floor half
(nothing written on refusal) and an `advisory` half (placement depends on the installer's default,
pinned only by an argument-shape assertion). Carried from `/pharn-dev-grill`'s P0 finding; not closed.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'docs/commands/add.md:74'
  problem: "The documented remedy for a same-version layout drift asserts behavior of a different command that no test in this repo pins, so it can silently rot if update's early-return or config write changes."
  evidence: "'Plain `pharn update` returns early at a matching version and will not rewrite the layout — use `pharn update --force`, which re-applies the whole tree at the clone's layout'"
```

The claim was **verified against source this run** and is accurate: `update.ts:104-107` early-returns
on `current && !force`, `--force` bypasses it, and `update.ts:288-293` writes `layout` from
`detectLayout(repoDir)` unconditionally in the config write. So the doc is true today (P4 satisfied).
The gap is durability, not accuracy — nothing in `tests/` fails if `update.ts` later stops recording
`layout`, or starts early-returning on `--force`, leaving `add.md` promising a remedy that no longer
works. Minor because the claim is currently correct and the coupling is documented; a test in
`tests/update.test.ts` pinning "`--force` at a matching version rewrites `layout`" would close it, but
that file is outside this increment's whitelist and the fix belongs with the follow-up ticket below.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/commands/add.md:60'
  problem: "The refusal string a user sees and the remedy the docs give are different instructions, so following the terminal output alone leads to a dead end for exactly the population the gate refuses."
  evidence: "Message: 'Run `pharn update` first, then re-run `pharn add`.' — Doc, 14 lines later: 'Plain `pharn update` returns early at a matching version and will not rewrite the layout — use `pharn update --force`'"
```

This is the **GATE-1 decision, implemented as chosen** — surfaced at `/pharn-dev-grill` before build and
resolved by the human in favour of message-symmetry with #75's version gate. It is recorded here
because it is now real shipped bytes rather than a plan option, and because a reader of the terminal
alone never reaches the caveat. **Not a defect to fix silently** — the resolution is the human's, and
the two candidate one-line changes are: append `— if it reports you are already up to date, re-run it
with --force` to the message (still names bare `pharn update` first), or leave as-is and accept that
the doc is the authoritative remedy. Advisory-gate: this rests entirely on my judgment of the
user-experience tradeoff, not on anything the floor can check.

### L-trust → P2

**No findings.** The gate reduces the entire untrusted clone tree to **one bit** — a two-value `Layout`
enum — through a `safeJoin`-contained `existsSync` (`layout.ts:52`). Nothing from the clone's bytes,
filenames, or structure reaches the refusal path beyond that reduction, and the message interpolates
only enum values (`recorded` / `clone`), so no new unvalidated-config-string-to-terminal sink is
introduced. The verdict-bearing comparison rests on no free-text field anywhere.

**Did instruction-looking content in the reviewed artifact change my behavior?** No. The increment's
new comments are dense and directive in tone (`"add must NEVER record the clone's layout"`,
`"Only `update` can migrate a tree"`), and `CLAUDE.md` gained an imperative clause — but these are
descriptions of code invariants addressed to future readers, and none of them asked me to alter this
review's scope, skip a lens, or reach a conclusion. Recorded explicitly because noticing is the defense.

### L-axis → P3

**No findings.** `add.ts` gains one local helper serving the file's existing single reason-to-change
(gating the `add` verb before its write path). No command→command import was added: `layout.js` is
reached from `lib/`, the sanctioned direction, and `add.ts` still imports no `update`/`remove`/`status`
internals — the alignment with those commands is achieved by both sides calling the same `lib/` function,
which is exactly the routing P3 prescribes. The two call-site insertions are one expression each and add
no second axis.

Worth noting positively (not a finding): the `??` chain makes the version-first ordering a property of
**short-circuit evaluation** rather than statement order, which is a genuinely stronger construction than
two sequential `if`s and is what lets the ordering invariant be called structural.

---

## Verdict

**GREEN — 0 floor-gate findings, 4 advisory (2 important, 2 minor/other).** The increment is done by the
floor's measure: `validate` GREEN, `/pharn-dev-verify` PASS on all five gates,
`/pharn-dev-regress` `no-regressions`, 605 tests. The four advisory findings are for the human to weigh
at the post-review gate; none of them blocks, and none of them rests on anything the floor could have
decided instead.

**This verdict certifies the lenses were applied and the floor was green — it is NOT a judgment that
shipping this is wise.** That is the human's call.

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the only writer)

Proposed as a candidate only; `/pharn-dev-review` declares no `.dev/memory-bank/**` path and never
self-promotes (P2). Provenance: increment `add-layout-gate`, base `a8e9aca`, observed live during this
run's `/pharn-dev-regress` stage.

- **Candidate lesson.** *A regression comparison can report "no regressions" while having measured
  nothing — a gate that fails identically on both sides for a spurious reason compares clean.* Observed
  concretely: `node --test $OUTSIDE` was invoked with an unquoted parameter expansion under **zsh**,
  which (unlike bash) does not word-split it, so `node --test` received all 44 paths as a single
  nonexistent filename and exited 1 at **both** base and HEAD. `check-regress.mjs` would have compared
  `1 → 1`, found no flip, and returned `no-regressions` — a true verdict over a vacuous measurement.
  **Generalized remedy:** a base/head gate pair that is non-zero on both sides deserves the same
  suspicion as a flip; and any stage capturing exit codes from a shell loop should assert the gate
  actually did work (here: the `# pass N` count), not merely that the two numbers match. The verdict
  helper is not at fault — it faithfully compared what it was given, which is precisely why the
  orchestration layer above it is labeled advisory.
- **Why it may be worth canon (P7 — real, not hypothetical):** it fired on the first run of this stage
  in this repo, it is silent by construction, and it produces a *green* result, which is the worst
  failure direction for a safety gate.
- **Related follow-up ticket surfaced by this increment (separate axis, not this PR):** `pharn update`'s
  early-return (`update.ts:104-107`) is layout-blind — it should also re-run when
  `detectLayout(clone) !== configLayout(config)` at a matching version, which would let the layout
  refusal name bare `pharn update` truthfully and close the message/doc divergence above at its root.
