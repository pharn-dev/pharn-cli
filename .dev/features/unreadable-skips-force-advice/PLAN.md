# PLAN — stop prescribing `--force` for unreadable skips it cannot clear

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: make `reportOutcome`'s `--force` advice conditional on a forceable skip bucket, add an unreadable-specific line mirroring `pharn status`'s wording, and drop the `--force` clause from the withheld-version warning when every remaining skip is `unreadable`.
- layer(s): pharn-cli product code (`src/commands/` — the `update` verb's report), no PHARN capability layer touched
- constitution_refs: [P1, P3, P4, P5, P7]

## Increment in one paragraph

`planUpdate` classifies an unhashable destination as `unreadable` **before** the decision table, and
`force` is not an input to that branch (`src/lib/update-decision.ts:218-233`) — deliberate, and
documented as such. But `reportOutcome` prints "Re-run with `--force` to overwrite" unconditionally
(`src/commands/update.ts:368-373`), and `unreadable` counts toward `versionWithheld`
(`src/commands/update.ts:279`), so the withheld-version warning repeats the same dead prescription
(`src/commands/update.ts:402-406`). A user whose only skip is `unreadable` is told to run a command
that produces a byte-identical outcome forever. This increment changes **the report only**.

Derivable invariant that makes the fix crisp: under `--force` all three record-based buckets become
writes (`skipOrForce`, `update-decision.ts:122-139`), so **on a forced run the only label that can
appear in `plan.skipped` is `unreadable`** — the `--force` advice is guaranteed wrong there.

## Files

- `tests/update.test.ts` — three cases (below), written FIRST — layer: test/spec (P1)
- `src/commands/update.ts` — `reportOutcome` only (lines ~353-417): partition `plan.skipped`, gate the
  advice line, add the unreadable line, branch the withheld warning — layer: `commands/` (one verb, P3)

Explicitly NOT touched: `src/lib/update-decision.ts` (`planUpdate`, `decideFileAction`, `skipOrForce`),
`src/lib/apply-update.ts` (`applyWrites`), `src/commands/status.ts`, `skipHeading`'s default arm
(already status's heading verbatim), and `docs/commands/update.md` (already true — see Docs below).

## Exact wording (decided here so build does not improvise)

In `reportOutcome`, computed once from `plan.skipped`:

```ts
const forceable = plan.skipped.some((g) => g.label !== 'unreadable');
const hasUnreadable = plan.skipped.some((g) => g.label === 'unreadable');
```

SKIPPED note, after the groups, in this fixed order (P5 — order is source order, never map order):

1. when `forceable` — the existing line, unchanged:
   `Re-run with --force to overwrite (skipped files are backed up to ${BACKUP_DIR}/ first).`
2. when `hasUnreadable` — three dimmed lines; lines 2-3 are **byte-identical** to
   `src/commands/status.ts:202-204` so the two reports stay recognisably one product:
   - `--force cannot clear the UNREADABLE paths above.`
   - `Inspect each path by hand — a directory, a symlink, or an`
   - `unreadable file sits where pharn expects a regular file.`

Withheld-version warning: unchanged when `forceable`; when `!forceable`, the same sentence without the
`--force` clause — `… — resolve them to finish the upgrade.`

`SKIP_ORDER` already places `unreadable` last, so the group it refers to is the one immediately above;
naming the bucket (`the UNREADABLE paths above`) keeps the sentence unambiguous in the mixed case too,
where the forceable advice sits between the earlier groups and this line.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not ingested by this increment (no finding is emitted); cited
  only to record that the change is outside the finding pipeline.
- No `pharn-contracts` schema changes. The `pharn.config.json` schema (this CLI's contract, P3) is
  untouched.

## Evals to write (P1)

All in `tests/update.test.ts`, alongside the existing skip-report cases:

- unreadable-only, unforced (extends/neighbours `reports an uninspectable destination as a skip
  instead of crashing`, `tests/update.test.ts:1198`) → SKIPPED note has **no** `Re-run with --force`
  prescription, **does** contain `Inspect each path by hand`, and the withheld warning does **not**
  contain `--force`.
- unreadable-only, `runUpdate({ force: true })` → same three assertions, plus the run resolves (no
  `ProcessExit`) and `pharn.config.json` `skillsVersion` is still `1.0.0` (bump still withheld).
- mixed buckets (one locally-modified file **and** one unreadable path) → the `Re-run with --force`
  advice IS present, the unreadable line IS present, and the withheld warning KEEPS its `--force`
  clause.

## Guarantee audit (P0)

- "`--force` overrides `modified`/`unrecorded`/`unverifiable` and never `unreadable`" → **floor**:
  enum/membership in `skipOrForce` + the pre-table `disk.kind === 'unreadable'` branch, unchanged by
  this increment and pinned by existing tests.
- "the withheld-bump rule still holds — anything skipped withholds the version" → **floor**:
  `versionWithheld = plan.counts.skipped > 0`, unchanged; pinned by the new forced-run test asserting
  `skillsVersion` stays `1.0.0`.
- "report output is deterministic" → **floor**: `SKIP_ORDER` fixes group order; the two new lines are
  emitted at fixed source positions from two boolean membership tests over `plan.skipped` — no map
  iteration order, no clock, no classification.
- "the advice a user reads now names an action that can actually succeed" → **advisory**. This is a
  wording/usefulness claim about human-readable prose; nothing on the floor verifies that a sentence
  is helpful. The floor backstop is only that the strings are pinned by the three tests above.

## Trust audit (P2)

No untrusted artifact is ingested by this increment. The `rel` paths rendered in the note come from
the install manifest (already `safeJoin`-contained upstream of `reportOutcome`) and are printed, never
executed. Taint surface is unchanged.

## Determinism audit (P5)

Both new branches are membership tests over a known label set (`g.label !== 'unreadable'` and its
complement) — not a classification, not a heuristic. There is no fallback that guesses: a skip group
whose label is none of the four would fall into `forceable` and print the existing advice, which is
the status quo for an unknown label, and `skipHeading`'s default arm already renders it as
`UNREADABLE`. No new skip label is introduced.

## Docs (P4)

`docs/commands/update.md:132-133` already states the behaviour truthfully ("reported as `unreadable`
and skipped — including under `--force`"), verified by reading it this run. **Correction to the source
prompt:** it cited `docs/commands/update.md:89-91`; that range is the *unreadable upstream capability*
section, a different subject. No doc change is planned; if any root or `docs/` markdown is touched
during build, `npm run lint:md` runs.

## Open questions (HALT) — RESOLVED at the plan gate (human, this run)

1. **The acceptance criteria contradict themselves on one assertion.** The source prompt asks the
   unreadable-only test to assert the SKIPPED note "does **not** contain `--force`", while the same
   prompt's suggested wording for the new line is "`--force` cannot clear these…" — which contains
   `--force`. Both cannot hold. **RESOLVED: keep `--force cannot clear …`** (it is the whole
   informational point for someone who just ran `--force`) and assert the absence of the
   *prescription* — `not.toContain('Re-run with --force')` — rather than the bare substring.
2. Lead-in phrasing for the unreadable line. **RESOLVED: `--force cannot clear the UNREADABLE paths
   above.`** — unambiguous in the mixed case, where the forceable advice sits between the earlier
   groups and this line.
