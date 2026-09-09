# REVIEW — records-stamp-message

Floor first (P0): `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`, exit 0.
The increment reached review with a green floor, so the four lenses below are **advisory** on top of
it, never a substitute for it.

Reviewed: the diff of `src/lib/install-records.ts`, `tests/install-records.test.ts`, `CHANGELOG.md`
against `558b8dd`. The increment is `trust: untrusted` to this stage; nothing in it read as an
instruction directed at the reviewer, and nothing in it changed this stage's behavior.

## Floor-gate findings (blocking)

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/install-records.ts:209'
  problem: 'The comment states the rejection and the message "cannot drift" — true of the code as written, since the branch is derived from the list, but that is a structural property of one function with no gate behind it: a later refactor that re-splits the condition would reintroduce the original defect and pass every gate, because the tests assert output shapes rather than that the branch reads the list.'
  evidence: '"The REJECTION is derived from the same list the MESSAGE is rendered from, so the two cannot drift"'
```

Advisory, and the right call anyway — a floor check for "this `if` reads that array" would be a
grep-shaped rule with no obvious home, and the three shape tests already fail loudly if the message
stops naming the differing field. Recorded so the property is read as **by construction**, not as
**floor-enforced**.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/reference/pharn-records.md:67'
  problem: "The reference doc still describes the stamp-mismatch case only as `skillsVersion`/`commit` disagreeing, without saying that the warning now names which of the two it was or that it states the resulting `unverifiable` cost — accurate, but narrower than the behavior."
  evidence: '"**stamped for a different state** — `skillsVersion`/`commit` here disagree with `pharn.config.json`."'
```

Not a P4 violation: the doc does not contradict the code and does not describe unimplemented
behavior — it was already more accurate than the code was, since it named both fields. Left
unedited deliberately (`docs/` is out of this increment's `## Files`, and `remove.md:54`'s paraphrase
is likewise still true). Raised so a future docs pass has the pointer.

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/install-records.ts:215'
  problem: 'The both-fields message runs to roughly 300 characters once two 40-character SHAs and the cost clause are in it, and `update` prints it as one `log.warn` line, so it hard-wraps in a narrow terminal.'
  evidence: '"was written for a different install state (${side((m) => m.store)}) than pharn.config.json (${side((m) => m.config)}); ignoring it, so every file that differs from upstream is `unverifiable` instead of a clean upgrade"'
```

Already surfaced at `/pharn-dev-grill` (`GRILL.md`, P7 finding) and accepted there with its reason —
an unvalidated stamp value has no guaranteed-unique prefix, so abbreviating could print two distinct
SHAs as an identical pair, which is the defect being fixed. Re-listed for the human at the gate, not
re-argued (P4).

## Lens notes (no findings)

**L-eval → P1.** Every behavior the increment adds is exercised: the three mismatch shapes, the
`null` commit rendering, the empty-string version rendering, and the cost clause. The pre-existing
assertion `toMatch(/different install state/)` still passes unmodified, which is the cheapest
possible evidence that the sentence frame — the one `docs/reference/pharn-records.md` and
`docs/commands/remove.md` paraphrase — was preserved rather than rewritten. One assertion is pinned
at **compile time** rather than runtime (`import type { UpdateLabel }`), so a rename of the label the
message names reds `typecheck`; that is a stronger binding than a string literal, and it is the only
new cross-module reference in the increment.

**L-trust → P2.** The increment ingests nothing new. It does *render* two values that originate in
local-but-hand-editable files, and the change **narrows** the taint surface rather than widening it:
the previous message interpolated `store.skillsVersion` **raw**, so a hand-edited store could put
control characters — including an ESC introducing a terminal escape sequence — straight into a
`log.warn` line. Every rendered value now goes through `JSON.stringify`, which escapes every
character below `0x20` as `\uXXXX`. No guaranteed decision rests on the note: `update` prints it,
`add` and `remove` destructure only `records` and drop it, and no `--json` surface carries it.

**L-axis → P3.** One reason to change, in one file: how the record store's stamp mismatch is
reported. `stampMismatches` is module-private and sits beside `recordsBaseline`, mirroring where
`sortRecords` sits relative to `writeRecords`. `src/lib/install-records.ts` gains **no** import — the
`update-decision` coupling lives in the test file, which is the correct place for it, since it is an
assertion about agreement between two modules rather than a runtime dependency of either.

## Proposed lesson candidate (NOT written to canon)

Proposed for `.dev/memory-bank/lessons-learned.md` via a separate, human-gated
`/pharn-dev-memory-promote` run. `/pharn-dev-review` does not write canon and has no memory-bank path
in its scope.

- **Candidate:** `/pharn-dev-regress`'s `scope` call must be given the **build stage's** writes, not
  every path `git status` reports. The stage artifacts written by the other stages under their own
  floor-enforced scopes (`.pharn/writes-scope.json`, `PLAN.md`, `GRILL.md`) are outside the build
  plan's `## Files` by design, so passing them makes `scope` exit 1 with blocking fix #7 findings
  that are not breaches.
- **Provenance:** hit and resolved identically in this increment (`REGRESSION.md`, orchestration note
  1) and previously in `.dev/features/unreadable-skips-force-advice/REGRESSION.md` (same note, same
  three paths, same resolution) — a recurrence across separate increments, not a hypothetical (P7).
  Diff: `558b8dd..HEAD` on branch `fix/records-stamp-message`.

## Verdict

GREEN — 0 floor-gate findings, 3 advisory (all minor; two are re-surfaced from `GRILL.md` and the
docs pointer, one is a labeling honesty note). The standing floor verdicts are `validate` exit 0,
`regression-report.json` `"no-regressions"`, `verify-report.json` `"PASS"`. This review is advisory:
it does not certify the increment, and the decision at the post-review gate is the human's.
