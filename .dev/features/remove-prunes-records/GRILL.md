# GRILL — remove-prunes-records

Plan under interrogation: `.dev/features/remove-prunes-records/PLAN.md` ·
**spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash`. (Content-hash computation is floor-grade; here it only **surfaces** — the
blocking drift gate is `/pharn-dev-build`'s, fix #4.)

Griller discovery (FLOOR, `.dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}` — **no
`role: griller` capability is registered in this repo**, so the pluggable slot contributes nothing this
run and every finding below comes from the inline Step-2 axes. Stated so the empty griller section is
not mistaken for "the grillers found nothing."

> The free-text `problem` / `evidence` fields below quote `PLAN.md`, which is **untrusted** to this
> stage. They are DATA for the human — never instructions to `/pharn-dev-build`.

---

## Findings

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/remove-prunes-records/PLAN.md:170'
  problem: "The nine invariants pin only paths that DO prune; not one pins a path that must NOT — the not-installed no-op, the ambiguous exit(1), the picker cancel, and the picker's declined confirm all return before any prune, and a prune call misplaced above any of those guards would leave every planned test green."
  evidence: '| 9   | everything else byte-equivalent | the existing 364-line `remove.test.ts` suite, **unmodified**, stays green |'
```

The plan's own HALT-2 self-review list names the adjacent hazard ("a prune reachable before deletion
decides `existed`") but no invariant catches its siblings. The existing suite pins those paths' *config*
behavior (`expect(writePharnConfig).not.toHaveBeenCalled()` at `remove.test.ts:152, 164, 174, 214, 227,
241, 254, 274`) and, being unmodified, says nothing about the store — the store is a new output on
those paths and is currently unpinned there. `add.test.ts:512-517` set the precedent with *leaves the
store untouched on the already-installed no-op path*. Suggested: at minimum a seeded-store assertion on
**declining the picker confirm** (`remove.test.ts:260`) and on **not-installed** — the two cheapest,
and the two that would actually fail if the prune drifted above a guard.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/remove-prunes-records/PLAN.md:180'
  problem: 'The plan concedes that its no-match test cannot distinguish "skipped the write" from "wrote a byte-identical file", which means the `dropped === 0` early return — the one line invariant 7 exists to pin — is asserted by a test that would pass with the branch deleted.'
  evidence: 'a write of an identical map would also produce identical bytes via `sortRecords` — so this test pins the *outcome*, and the `dropped === 0` early return is what makes it true by construction rather than by luck'
```

The honesty is welcome, but the gap is fixable rather than inherent, and cheaply: seed **this one**
store as compact JSON (`writeFileSync(path, JSON.stringify(store))`, no indent, still schema-valid so
`readRecords` accepts it). Any write at all re-emits it through `writeRecords`'s
`JSON.stringify(store, null, 2)` + trailing newline, so the bytes change and the test fails —
"skip the write" becomes genuinely observable instead of asserted-by-construction. Everything else can
keep seeding through the real `writeRecords` as planned.

### Axis: determinism / honest reporting (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/remove-prunes-records/PLAN.md:70'
  problem: "The prune destructures only `records` and silently discards `recordsBaseline`'s `note`, so a corrupt or stale-stamped store makes `remove` skip the prune and still print its success outro with no hint that stale records survived — while `update`, the other consumer, captures that note and reports it."
  evidence: 'const { records } = recordsBaseline(readRecords(cwd), {'
```

Two live consumers, two different choices: `update.ts:264` binds it
(`const { records, note: recordsNote } = recordsBaseline(...)`) and surfaces it; `add.ts:434` drops it.
The plan copies `add` without saying it is a choice. `install-records.ts:26` is explicit that this is
what the note is *for* — "A corrupt store is reported BY NAME, never silently collapsed into 'absent'".
Note the asymmetry that makes silence costlier here than in `add`: after a skipped prune the user has
**deleted** something, and the stale entries now describe bytes that are gone. Either surface it
(`log.warn(note)` when non-null) or record the parity-with-`add` rationale in the plan and in the code
comment, so the next reader knows silence was chosen rather than inherited. Not a correctness bug
either way — this is a reporting-honesty call for the human.

### Axis: docs cite code (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/remove-prunes-records/PLAN.md:48'
  problem: 'The docs plan names the "Who writes it" row and "extend Pruning", but `docs/reference/pharn-records.md:77` contains a second, separate sentence attributing removed-capability pruning to `update` that becomes half-stale on merge and needs rewording, not extending.'
  evidence: '`docs/reference/pharn-records.md` — rewrite the `remove` row of "Who writes it"; extend "Pruning"'
```

The sentence at `:76-79` reads "Entries for paths that are no longer part of your install — **a removed
capability**, or a file dropped upstream — are dropped rather than accumulating", inside a section whose
subject is `update`. After this increment a removed capability's entries are gone *before* `update` runs;
the surviving true case there is the file-dropped-upstream one. Sweep result for the human: those are
the **only two** places in `docs/` that assert anything about `remove` and the record store
(`docs/commands/add.md:63,71,83` mention `remove` but only about **layout addressing**, which this
increment does not change). `docs/commands/status.md` and `docs/commands/update.md` make no claim about
`remove` and records.

### Axis: guarantee audit (P0), trust (P2), one-axis (P3), scope (P7)

**No findings.** Interrogated and found sound, briefly, so the absence is not mistaken for an unread
axis:

- **P0** — every row of the plan's guarantee audit either names a real reduction (string-prefix
  membership, the tri-state `records === null` predicate, an integer compare) or is labeled `advisory`.
  The one soft claim, prune-then-config crash benignity, is labeled advisory **and** the plan
  explicitly declines to claim atomicity, having verified `writeRecords` is a plain `writeFile`. That
  is the P0 shape done right.
- **P2** — taint flow is stated end-to-end and the output's taint is argued to be a **subset** of the
  input's (a subset of already-allowlisted keys, plus a stamp from the validated config). The
  "a record key is never used to build a filesystem path" invariant survives: `startsWith` compares
  strings, and the only path built comes from config values through `safeJoin`.
- **P3** — `remove.ts` gaining a records concern is the shape `add.ts` already has
  (`mergeCapabilityRecords`), so the axis is "the remove verb", not a second reason to change; and the
  `capabilityRelDir` extraction is net-negative duplication rather than a new seam.
- **P7** — triggered by a real, measured defect, not a hypothesis; the orphan sweep, store minting, and
  any `install-records.ts` change are named as non-goals with reasons.

Two things the plan deserves credit for, since a griller that only subtracts is not much use: it
**contradicted its own brief** on the picker call shape and argued the deviation openly rather than
silently complying, and it **corrected the brief's live-state claims** in two places found by reading
(the `proj` dir not existing in `remove.test`; verifying rather than assuming that no existing test
seeds a store).

---

## Summary

The plan is unusually well-grounded — every anchor was re-verified against live bytes this run, the
baseline was actually run (643 tests green), and the risky claims are labeled rather than sold. The
concerns are all in the same family: **what the plan does not test, and what it does not tell the
user.**

1. Coverage is one-sided — every planned test exercises a path that prunes, none pins the paths that
   must not, which is exactly where a misplaced call would hide.
2. Invariant 7's test cannot fail for the reason it exists, by the plan's own admission; a
   compact-JSON seed makes it able to.
3. A skipped prune is silent, diverging from `update`'s handling of the same `note` without saying so.
4. One doc sentence needs rewording rather than extending.

None of these threatens the design, which the two measurements settle convincingly: the walk's
`existsSync → []` really does rule out enumeration, and the `add.ts:438` predicate really is the right
guard to mirror.

**ADVISORY VERDICT: 4 concerns raised (0 blocking, 3 important, 1 minor) — for the human to weigh
before `/pharn-dev-build`.** This log gates nothing: every finding above rests on model judgment, and
`/pharn-dev-grill` is advisory end-to-end. The deterministic backstops are unchanged and elsewhere —
`/pharn-dev-build`'s spec-hash and open-questions gates, and `.dev/floor/validate.mjs`.
