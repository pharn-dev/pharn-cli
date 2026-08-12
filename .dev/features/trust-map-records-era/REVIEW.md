# REVIEW — trust-map-records-era

**Floor first (P0):** `node .dev/floor/validate.mjs .` → exit **0**, GREEN. The increment was entitled to
reach review. Standing verdicts: `/pharn-dev-regress` `"no-regressions"`, `/pharn-dev-verify` `"PASS"`
(`failing_gates: []`). Everything below is **advisory**.

**Anchor resolution — all 11 anchors in the shipped prose were opened and checked against what they
claim.** All 11 resolve correctly:

| Anchor | Resolves to |
| --- | --- |
| `remove.ts:12` | `import { configLayout, layoutPaths, ... }` ✓ |
| `remove.ts:72` | `function deleteCapabilityDir(` ✓ |
| `remove.ts:117` | `async function pruneCapabilityRecords(` ✓ |
| `merge-capabilities.ts:79` | the reason enum incl. `'dropped-gone'` ✓ |
| `merge-capabilities.ts:201` | `changes.push({ cap: inferred, reason: 'dropped-gone' })` ✓ |
| `update.ts:452` | `'… left on disk — pharn update never deletes.'` ✓ |
| `update-decision.ts:60` | row 1 — `missing \| any \| WRITE restored` ✓ |
| `update-decision.ts:64-65` | rows 5 & 6 — `SKIP unrecorded` / `SKIP unverif.` ✓ |
| `diff.ts:79` | `readDiskState(baseDir, rel)` ✓ |
| `apply-update.ts:44` | `export function readDiskState(` ✓ |
| `apply-update.ts:57-61` | symlink → `unreadable`; non-file → `unreadable` ✓ |

No anchor points at something it does not say. That is the increment's central quality claim and it holds.

---

## Findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "THREAT-MODEL.md:118"
  problem: "The new §4c attributes both `unrecorded` and `unverifiable` to the same condition, but the decision table it cites makes them mutually exclusive — under an absent or stamp-skewed store every present-differing file is `unverifiable`, and `unrecorded` cannot arise there at all."
  evidence: "Where the store is absent or its stamp disagrees, the two directions differ: a file **present** on disk becomes `unrecorded`/`unverifiable` and `update` **skips** it"
```

**Advisory-gate.** `update-decision.ts:101-102` orders the two checks: `if (!recordsAvailable) return
skipOrForce('unverifiable', …)` fires **first** and covers exactly the stated condition (absent /
corrupt / stamp-skewed); `unrecorded` (`:102`) requires an **available** store that simply lacks that
path — a different situation the sentence never introduces. The slash reads as "one or the other
depending on details," when the cited condition deterministically yields only the second. In a document
whose subject is the precision of a fail-closed guarantee, that is the wrong place to be loose.
**Suggested:** name `unverifiable` for the stated condition, and give `unrecorded` its own clause (store
readable, path absent from it) or drop it.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "LIMITS.md:64"
  problem: "The §1d sentence makes two claims but carries one citation; the `update`/`status` half — that they re-derive from a fresh `@main` clone rather than the pinned commit — has no anchor, though the increment's own discipline is that unanchored claims about code do not ship."
  evidence: "There is no manifest. `update`/`status` re-derive the expected set from a fresh `@main` clone (not the pinned `commit`), while `remove` resolves against **nothing remote** — it is addressed entirely from `pharn.config.json` via `configLayout` (`src/commands/remove.ts:12`, `:212`, `:307`)."
```

**Advisory-gate.** The claim is **true** and is independently asserted by `THREAT-MODEL.md §2 #6`, so no
reader is misled. But the citation attaches only to the `remove` clause, and the plan's stated rule was
that every sentence claiming something about code maps to an openable `file:line`. `src/lib/diff.ts:79`
or the `status`/`update` clone sites would close it.

### L-trust → P2

**No injection found** in the reviewed artifacts; they are governance prose with no instruction-looking
content directed at a downstream agent.

**One honest self-report, which this lens exists to capture.** During the run, the **build prompt itself**
carried an instruction that was false about this repo — *"A blocked write means declare the scope via the
setter … never a hook bypass"* — when `protect-trusted-paths.cjs` (`:58`, `:63`) admits **no** narrowing
and the setter cannot unlock those paths. The instruction was followed as far as it was correct (the
setter was run; no bypass was attempted) and rejected where it was wrong (the write was **not** forced
through Bash when the hook denied it, including under repeated direct pressure to "just update the
files"). Recording it because the near-miss is the interesting artifact, not the outcome: a plausible,
authoritative-sounding instruction to route around a floor control is exactly the shape P2 warns about,
and it arrived through the **plan**, not through the reviewed code.

**No guaranteed decision in this increment rests on a free-text field.** The three floor verdicts consumed
only exit codes and paths.

### L-eval → P1

**No finding.** The increment adds no Capability and no `rule_id`, so there is no eval binding to miss.
The floor agrees: `validate` GREEN, and `/pharn-dev-verify` recorded **no** `structural:*` gate because no
eval pair exists — absence by construction, not a skipped check. Lens and floor concur; no disagreement
to report.

### L-axis → P3

**No finding.** Each file changed for exactly one reason: `LIMITS.md` and `THREAT-MODEL.md` for trust-map
truth, `CHANGELOG.md` for the user-facing record, `docs/reference/pharn-records.md` for one reverse
cross-link. No sibling-module reference; the docs cite `src/` paths as **evidence**, which is the
documented direction (docs cite code, P4), not a module import.

### Cross-document consistency (requested check)

- **New §1d vs `THREAT-MODEL.md §2 #6` — agree.** §2 #6 already read *"`status`/`update`/`diff` resolve
  against `@main` HEAD"*, correctly omitting `remove`. The corrected §1d now says the same thing. The
  pre-existing contradiction between the two documents is **resolved**, and resolved toward the line that
  was already true.
- **New §4c vs `docs/reference/pharn-records.md` — agree.** `pharn-records.md:12-14` states the identical
  split (*"skips every **present** file that differs (`unverifiable`) but still **restores** missing
  ones; byte-identical files are no-ops"*). Note it uses **only** `unverifiable` for this condition —
  independently corroborating the first finding above.

### A deferred ticket that the correction made load-bearing

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "LIMITS.md:51"
  problem: "T3 was deferred as an independent staleness, but correcting §4c turned it into a visible contradiction inside the same trust map: §1c tells the reader only `status` re-verifies against the filesystem, while the corrected §4c tells them `update` gates every file against a stored baseline."
  evidence: "The file is plain JSON the user can edit, and it is not re-verified against the filesystem except when `status` runs."
```

**Advisory-gate.** The plan's rationale for deferring T3 — that §1c and §4c make *independent* claims and
no reader is led from a corrected sentence into an uncorrected one — was defensible **before** this
increment landed and is weaker **after** it. A reader who takes the new §4c seriously now finds §1c
denying it three sections earlier. This does not make the shipped correction wrong; it makes T3 the
obvious immediate follow-up rather than one ticket among five.

### CHANGELOG accuracy

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "CHANGELOG.md:22"
  problem: "The entry closes with 'No section numbers changed', which is true, but the §1d heading text was rewritten — a reader tracking a section by its title rather than its number would not learn that from this line."
  evidence: "No section numbers changed."
```

**Advisory-gate.** Accurate as written; incomplete as a signal. `§1d`'s identifier is byte-identical
(verified: the changed-header identifier set is `{1d.}` on both sides of the diff), but its title moved
from *"`update` / `remove` resolve against `@main`…"* to *"`update` / `status` resolve against `@main`;
`remove` resolves offline"*. One clause would cover it.

---

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory findings** (2 important, 3 minor).

Nothing here blocks the increment. The three corrections are true, every anchor resolves, the two
documents now agree with each other and with `pharn-records.md`, and no guarantee was added without
either a floor reduction or an explicit advisory label. The findings are precision defects in new prose
(§4c's `unrecorded`/`unverifiable` conflation is the one worth fixing before merge) and one consequence
of a deferred ticket that this correction promoted in urgency.

**Honest note on what this review is:** four LLM lenses over prose. Its only floor-grade content is the
`validate` GREEN at the top, which `/pharn-dev-build` and `/pharn-dev-verify` had already established. The
`severity` values above are **LLM-assigned and advisory** (fix #3). "GREEN" here means "no lens found a
blocking defect," **not** "the prose is true" — that judgment stays with the human.

---

## Proposed lesson (candidate for canon — NOT written here)

`/pharn-dev-review` may not write `.dev/memory-bank/**`. Proposed for a separate human-gated
`/pharn-dev-memory-promote` run:

> **A build prompt is untrusted input about the floor.** This increment's prompt asserted a remedy
> (*"declare the scope via the setter"*) for a hook that structurally cannot be narrowed
> (`protect-trusted-paths.cjs:58,:63`), and asserted four `degit` facts that live verification falsified
> (cache path, `ls-remote` primacy, `https_proxy`, node-tar guards). Both were caught only because the
> plan stage re-measured instead of transcribing. **Verify a prompt's factual claims about the repo
> before planning against them** — the plan is where a false premise is cheap to catch and the last
> place it is.

**Provenance:** increment `trust-map-records-era`, branch `docs/trust-map-records-era`, base
`3645fdf`; see `PLAN.md` D1/D3/D5 (corrections to the prompt's own inventory) and Q2 (S3 killed on live
evidence).
