# REVIEW — capability-source-provenance

**Increment under review is `trust: untrusted`.** No instruction-looking content in the diff, its
comments, or its docs altered this review's behavior; nothing in it was treated as a directive (P2).

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` over the repository with the increment applied (clean worktree at
`9919277` + patch): **exit 0, GREEN.** The increment was entitled to reach review. The local working
directory scores exit 1, but all 15 findings are inside gitignored `test-*/` fixture apps (0 outside),
and base is GREEN in a clean tree — see `VERIFY.md`'s disclosure. Everything below the floor is
**advisory**.

---

## Floor-gate findings (these block)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "CHANGELOG.md:55"
  problem: "The shipped user-facing text states the legacy-provenance inference as a certainty, when the increment's own plan classified that exact claim ADVISORY and required it be labeled in this file — an unlabeled non-guarantee, which is the disease P0 exists to prevent."
  evidence: "CHANGELOG.md:55 'outside it becomes `manual` — the only way it could have got there is by hand.' — but PLAN.md:235 says: 'Legacy inference recovers the user's true intent → **ADVISORY** … A legacy entry that was `auto` **and** upstream de-selected it reads as `manual` and is preserved. Labeled in `CHANGELOG.md` + `docs/reference/pharn-config.md`.'"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "docs/reference/pharn-config.md:42"
  problem: "The same unlabeled overclaim in the schema reference — the parenthetical asserts the only possible provenance, excluding the real case of an auto entry that upstream has since de-selected."
  evidence: "docs/reference/pharn-config.md:42 '`manual` (it can only have got there by hand)'"
```

**Why this is real, not pedantry.** A `source`-less entry outside the resolved set has **two** possible
histories: (a) the user added it by hand, or (b) it was auto-selected by an older index and upstream
later narrowed its `applies`. The merge cannot distinguish them — that is precisely why the plan
labeled the inference advisory. Case (b) is silently re-tagged `manual` and then preserved **forever**,
because rows 3/6 never drop a manual entry. The *mechanism* is fine and fail-safe (preserve rather than
delete); the *claim* is not. The code comment in `src/lib/merge-capabilities.ts` is careful; only the
user-facing text overclaims, so the fix is two sentences and touches no behavior.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: "src/commands/update.ts:193"
  problem: "A deliberate, documented design decision — that capability membership is written even when versionWithheld holds the version back — ships with no test asserting it, so nothing would catch a future change that starts withholding membership too."
  evidence: "src/commands/update.ts:193 'Membership is written even when `versionWithheld` holds the version back (below), and that is deliberate'. The nearest test, tests/update.test.ts 'WITHHOLDS the version bump when anything was skipped', asserts only skillsVersion/commit — it never inspects `capabilities`."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: "tests/update.test.ts"
  problem: "The dropped-capability behavior is only half-pinned: a test asserts the files remain on disk, but nothing asserts that the dropped entry's RECORDS are pruned, which is the half that determines what happens if the capability ever returns."
  evidence: "The test 'NAMES an auto capability the archetypes no longer select, and leaves its files on disk' asserts `body('pharn-review/stale/stale.md')` and the config, but never `records()`. src/lib/update-decision.ts:182-185: 'keyed by the manifest just applied, so entries for paths no longer installed are pruned'."
```

**Consequence worth the human's attention.** Because records are pruned but files are not deleted, a
dropped capability that later returns (merge row 1) arrives with files present and **no record**. If its
upstream bytes changed in the interval, `decideFileAction` row 5 fires → `SKIP unrecorded` → and because
`versionWithheld = counts.skipped > 0`, the whole run's version bump is withheld. This is the
grill's F3, raised before the build and **not fully closed by it** — the build's stated intent was to pin
both halves; it pinned one.

---

## Advisory-gate findings (these inform; they block nothing)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/commands/update.ts:352"
  problem: "The CAPABILITIES report prints `name` straight from pharn.config.json for kept/dropped entries, and capabilities-entry validation was deliberately scoped to `source` only — so a hand-edited or control-char-bearing `name` reaches the terminal unvalidated."
  evidence: "src/commands/update.ts reportCapabilityChanges: 'for (const { cap } of inGroup) lines.push(`  ${cap.role}:${cap.name}`)'. src/lib/pharn-config.ts: 'Deliberately narrow (P7): it validates `source` ONLY. `name` and `role` are still passed through unvalidated'."
```

The residual is small and pre-existing in kind (`list`/`remove` already print stored names), and
name/role hardening was an explicit non-goal. Named here so the next hardening increment inherits it
rather than rediscovering it.

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/pharn-config.ts:15"
  problem: "The CapabilitySource allowlist and its error class live inline in pharn-config.ts, breaking symmetry with models/seam, whose enum + validator + named error each live in their own module that pharn-config only delegates to."
  evidence: "src/lib/pharn-config.ts 'const CAPABILITY_SOURCES = [...]' and 'export class CapabilitySourceError', vs 'import { validateModelRouting, ModelRoutingError } from ./model-routing.js'."
```

This was an explicit HALT-1 decision (there is no `capabilities` lib module to own it, and creating one
for a two-value enum would be speculative, P7). Recorded as a known asymmetry, not a defect.

---

## Lens results

- **L-floor → P0:** the merge's substantive guarantees do reduce to the floor — union semantics,
  sticky-manual, gone-upstream drop, and idempotence are all `Set` membership over `role:name` or an
  exact two-value enum compare (`ARCHITECTURE.md §2` #3), each pinned row-by-row in
  `tests/merge-capabilities.test.ts`. Resurrection is correctly **not** claimed as prevented. The two
  blocking findings above are the exception: user-facing text asserting a non-floor-reducible claim.
- **L-eval → P1:** all nine table rows plus order, union, idempotence, duplicates, and non-mutation are
  covered; the acceptance scenario runs the real `update` flow. Two behaviors ship unpinned (the two
  `important` findings). No Capability/`rule_id` binding is involved — this increment adds no markdown
  capability, so `validate` is vacuously green here and the floor and I agree.
- **L-trust → P2:** the increment ingests no new untrusted remote field; `source` comes from the local
  config and is enum-gated at ingest, fail-closed. The merge does no I/O and joins no paths. No
  guaranteed decision rests on a free-text field. One minor residual noted above.
- **L-axis → P3:** `merge-capabilities.ts` carries one axis and imports only `types.js`; the direction
  is command→lib throughout, with no command→command or step→step edge. One minor asymmetry noted.

## Verdict (original pass)

**BLOCKED — 2 blocking floor-findings (both the same defect, in two files), plus 2 important and 2
minor.**

The increment's behavior is sound and its floor gates are GREEN; what blocks is **honesty of the
shipped claim**, which under P0 is not a lesser category. The fix is two sentences of doc wording and
no behavior change; the two `important` findings each want one added assertion. None requires
rethinking the design.

---

## Resolution pass — all findings addressed, and a THIRD defect found

Re-reviewed after the fixes. **Every finding above is resolved**, and the fix pass surfaced one more
defect that the original review missed — worse than the two it caught, because it was not an
overclaim but a **falsehood**.

### NEW — found during the fix pass

```yaml
- type: FINDING
  rule_id: "P4"
  severity: blocking
  file: "CHANGELOG.md:50"
  problem: "Two shipped docs stated that removing a `manual` capability is permanent, which is false whenever the archetypes also select it — the entry returns as `auto` on the next update."
  evidence: "CHANGELOG.md 'Removing a `manual` entry warns nothing — the union can never re-add it.' and docs/commands/remove.md 'warns nothing: the union can never re-add it.' Both contradict docs/commands/update.md, which already stated the true rule."
```

The claim was inherited verbatim from the source brief's invariant 8 and never re-derived against the
code. It is false because the union is `resolve(archetypes) ∪ manual`: `remove` empties the entry from
the _manual_ half, but the _resolved_ half is untouched, so a still-selected capability re-enters
through **row 1** as `auto`. Most capabilities upstream are `universal`, so this is the common case,
not an edge. Reproduced directly against the real merge before fixing:

```text
after `pharn add`   : [{"name":"a11y","role":"griller","source":"manual"}]
after `pharn remove`: []                        (no warning printed)
after `pharn update`: [{"name":"a11y","role":"griller","source":"auto"}]
```

**Resolution.** Both doc lines now state the true rule and say plainly why `remove` cannot warn about
it (it is offline and has no index). The behavior is unchanged and correct — `update` does name the
re-add under `ADDED`, so nothing is silent; only the docs were wrong. Pinned by a new test,
`tests/merge-capabilities.test.ts` → _"re-adds a REMOVED manual entry as auto when the archetypes
still select it"_, with the contrast case beside it.

### Resolution of the original findings

| #   | Finding                                     | Resolution                                                                                                                                                                  |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 | P0 legacy-inference overclaim (2 files)      | Both rewritten to name **both** possible histories and to label the inference a reconstruction. The same false certainty was also found in **two code comments** in `src/lib/merge-capabilities.ts` (which the original review wrongly called "careful") — both fixed. |
| 3   | P1 membership-vs-`versionWithheld` unpinned  | Pinned: _"still writes the merged membership when a skip WITHHOLDS the version bump"_.                                                                                        |
| 4   | P1 records-prune half unpinned               | Pinned: _"DROPS an auto capability … record PRUNED"_.                                                                                                                          |
| 5   | P2 unvalidated `name` rendered to terminal   | Unchanged — an explicit non-goal (name/role hardening is a separate axis). Left recorded for that increment.                                                                    |
| 6   | P3 allowlist asymmetry vs models/seam        | Unchanged — an explicit HALT-1 decision.                                                                                                                                       |

**A caught vacuity worth recording.** The first draft of the finding-4 test was **vacuous**: it never
wrote the dropped capability into the *clone*, so `addDir` bailed at `install-manifest.ts:117` and both
its byte and record assertions passed even with the drop inverted. It was rewritten to seed the clone,
then mutation-tested — inverting row 5 now fails it on the bytes assertion alone
(`expected 'stale v2' to be 'stale v1'`). Both new tests were mutation-checked this way; a passing
test was not accepted as evidence that it tests anything.

## Verdict (resolution pass)

**GREEN — no outstanding floor-findings.** Floor gates PASS in the working tree (595 vitest tests, 666
floor/hook tests, `validate` exit 0). The two `minor` advisory findings stand as recorded non-goals.

---

## Proposed lessons for canon (NOT written here — `/pharn-dev-memory-promote` decides)

**Candidate 1** — _A plan's guarantee audit labeling a claim `advisory` does not make the shipped text
say so. When an audit row says "labeled in `<file>`", that labeling is a **deliverable in the diff**,
and review must diff the audit's claims against the user-facing sentences — not against the code
comments, which were **also** wrong here._
**Provenance:** `PLAN.md:235` vs `CHANGELOG.md` / `docs/reference/pharn-config.md` /
`src/lib/merge-capabilities.ts`; findings 1–2 and the resolution pass.

**Candidate 2 (stronger)** — _An invariant asserted by a source brief is an untested claim, not a
premise. Invariant 8 ("the union can never re-add it") was false and shipped into two docs because it
was transcribed rather than re-derived against the code. Every brief-supplied invariant should be
executed as a test before it is written as prose._
**Provenance:** the brief's §3 invariant 8; the three-line reproduction above; the new merge test.

**Candidate 3** — _A test that passes proves nothing until its assertion is shown to fail against
inverted behavior. The records-prune test passed while being causally disconnected from the behavior
it named._
**Provenance:** the finding-4 test, first draft vs mutation-tested rewrite.

Recorded as candidates only. `/pharn-dev-review` declares no `.dev/memory-bank/**` write scope, and the
model never self-promotes (P2).

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` decides)

**Candidate:** _A plan's guarantee audit labeling a claim `advisory` does not make the shipped text
say so. When an audit row says "labeled in `<file>`", that labeling is a **deliverable in the diff**,
and review must diff the audit's claims against the user-facing sentences — not against the code
comments, which were correct here while both docs were wrong._

**Provenance:** increment `capability-source-provenance`; `PLAN.md:235` (audit row) vs `CHANGELOG.md:55`
and `docs/reference/pharn-config.md:42` (shipped text); this `REVIEW.md`, findings 1–2.

Recorded here as a candidate only. `/pharn-dev-review` declares no `.dev/memory-bank/**` write scope, and
the model never self-promotes (P2) — promotion is a separate human-gated `/pharn-dev-memory-promote` run
behind `check-provenance`.
