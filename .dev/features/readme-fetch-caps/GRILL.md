# GRILL — readme-fetch-caps

Plan under interrogation: `.dev/features/readme-fetch-caps/PLAN.md`.
Spec-hash check: **MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only surfaces — `/pharn-dev-build` is where drift
blocks, fix #4.)

Griller membership (FLOOR, `node .dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}`.
Zero `role: griller` capabilities are registered in **this** repo — pharn-cli is the installer, and the
griller capabilities live upstream in `pharn-dev/pharn-oss`. Step 2b is therefore a **no-op with a
recorded count**, not a skipped step. The findings below are the inline axes only.

---

## Findings

### Axis: determinism / build-gate readiness (P6)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: blocking
  file: ".dev/features/readme-fetch-caps/PLAN.md:118"
  problem: "The plan carries a populated `## Open questions (HALT)` section, which is the exact literal trigger for /pharn-dev-build's Step 1.1 HALT — and the plan's own assertion that the questions are non-blocking is prose the build gate does not read."
  evidence: "## Open questions (HALT) … 1. CONSTITUTION.md:64 carries the identical over-claim … **Answers 1-3 do not block this increment**"
```

This is the one finding with teeth before build. `/pharn-dev-build` Step 1.1 reads: _"If it has unresolved
`## Open questions (HALT)` → **HALT**; it is not approved."_ The gate is a **section-presence** test, not
a comprehension test — a plan that argues its own questions are harmless is still a plan with open
questions. Worse, the builder cannot fix this itself: build's writes-scope is parsed from the plan's
`## Files` (`README.md`, `CHANGELOG.md`), so `PLAN.md` is **outside** what build may write. The
correction has to happen at the plan stage or not at all.

The substance is genuinely resolved — the approving human's brief scoped it in advance ("Scope:
`README.md` only (plus the CHANGELOG entry)", "do not touch SECURITY.md"). What is unresolved is only
the plan's **encoding** of that: it filed settled, out-of-scope observations under a heading reserved
for things that block.

### Axis: honest scope / docs cite code (P4, P7)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/readme-fetch-caps/PLAN.md:64"
  problem: "The plan will print four exact constants in README.md, but THREAT-MODEL.md - the file the README is being made to agree with - deliberately prints only 60s and describes the other three caps by shape, so the README becomes the sole doc carrying 32MB / 128MB / 20,000 and therefore a NEW single point of the very drift being fixed."
  evidence: "`THREAT-MODEL.md:145` — '60s timeout + a streamed-byte cap on the download + a separate cap on the **decompressed** size + `redirect: 'error'`; entry-count and total-byte caps in the extractor'"
```

Worth weighing rather than reflexively fixing, because the two failure modes point opposite ways. Print
the numbers and the README is maximally useful to the reader the finding is about — the one who was
told "256KB" and believed it — but three constants now live in exactly one prose location that no test
touches. Omit them and the README cannot drift, but it also cannot answer the question the audit
raised, and P-3 recurs as "the README is vague" instead of "the README is wrong."

The plan's stated mitigation (link `THREAT-MODEL.md` as canonical) reduces the blast radius — a
maintainer who changes a constant has one obvious table to update, and the README defers to it rather
than competing — but it does **not** eliminate the drift surface, and the plan should not be read as
claiming it does.

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/readme-fetch-caps/PLAN.md:110"
  problem: "The plan closes one instance of the audit's drift class and leaves two more standing in the repo (CONSTITUTION.md:64, docs/troubleshooting.md:124), so 'the README no longer oversells' must not be read at the post-review gate as 'the repo no longer oversells'."
  evidence: "'`docs/troubleshooting.md:124` — different claim, different section, borderline; widening scope to it would make this PR the \"fix every instance\" PR the human did not ask for.'"
```

The scoping decision itself is right (P7 — smallest coherent increment, and a sibling PR owns
`SECURITY.md`). The finding is about **how the result gets reported**, not about widening the branch.

### Axis: guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/readme-fetch-caps/PLAN.md:120"
  problem: "After this PR the identical false claim still stands in CONSTITUTION.md:64 - the document the constitution itself says wins every conflict - so the repo's highest-authority text will contradict the corrected README, and a reader who follows the stated hierarchy still gets the wrong number."
  evidence: "`CONSTITUTION.md:64` — 'Remote fetches use `redirect: 'error'`, an 8s timeout, and a 256KB body cap.' vs `CONSTITUTION.md:24` — 'When any document in this repo conflicts with this file, **this file wins.**'"
```

The plan's handling is **correct and must not be changed**: `CONSTITUTION.md` is human-only,
write-protected at the floor by `protect-trusted-paths.cjs`, and P0 states plainly that an agent MUST
NOT auto-fix a constitution violation. So this finding is not a request to act — it is the escalation
P0 prescribes **instead** of acting, and it is the single most important thing for the human to see at
GATE 2. Note the asymmetry it creates: this PR makes the README subordinate-but-right and leaves the
governing document authoritative-but-wrong.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/readme-fetch-caps/PLAN.md:79"
  problem: "The plan ships no test, correctly reasoning that P1 binds behavior and src/ is untouched - but the absent doc-to-constant coupling is precisely the mechanism that let P-3 exist, so 'no test needed' and 'nothing prevents a recurrence' are both true at once and only the first is prominent."
  evidence: "'**None, and the reason is structural, not an exemption.** P1 binds *behavior* … There is no behavior to pin'"
```

The reasoning is sound and I am not asking for a speculative test (P7 cuts against inventing one here).
The plan **does** disclose this under its guarantee audit ("no automated check compares these README
numbers to the constants in `src/lib/`"). The finding exists so the disclosure is weighted as a
standing repo property rather than a footnote to one PR.

### Axis: discovery precision (P6)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/readme-fetch-caps/PLAN.md:26"
  problem: "The plan states the grep 'returns exactly three call sites'; the command as written returns five matching lines, two of which are prose comments in skills-version.ts - the conclusion is right but the cited evidence is tidier than the command that produced it."
  evidence: "'`grep -rn \"fetch(\" src` returns **exactly three** call sites.'"
```

Small, and the conclusion survives: `src/lib/skills-version.ts:199` and `:264` are comment lines
(`` `fetch()` resolves as soon as HEADERS arrive `` and `` `await fetch(...)` ``), leaving three real
call sites. But a plan whose entire purpose is "a document said something the code does not support"
should not itself round its own evidence — the standard it applies to the README applies to it.

---

## Summary

Six findings, and the plan is in good shape on the axes that matter most: the discovery is genuinely
live (P6), the guarantee audit is honest about its own untested seam rather than hiding it (P0), the
trust audit does the one thing that mattered — re-derive the audit's numbers from source instead of
trusting them, which is how it caught that the finding under-reported `fetchCommitSha` (P2), and the
scope is the smallest coherent one (P7).

**One finding is actionable before build and cannot be fixed by build:** the `## Open questions (HALT)`
section is a literal build-HALT trigger, and `PLAN.md` sits outside build's writes-scope. Either the
section is re-encoded at the plan stage to reflect that the approving human already settled all three
items, or `/pharn-dev-build` HALTs on a plan whose substance is not actually in question.

**Two findings are for the human at GATE 2, not for the builder.** `CONSTITUTION.md:64` carries the
identical over-claim in the document that outranks everything this PR touches — escalated, deliberately
not auto-fixed, exactly as P0 requires. And the four printed constants trade a live drift surface for
reader usefulness; the plan's `THREAT-MODEL.md` pointer narrows that trade but does not close it.

The remaining three are precision and framing: report the increment as closing **one** instance of the
drift class rather than the class, keep the plan's own evidence as exact as the standard it is
enforcing, and let the missing doc-to-constant coupling stand as a named repo property.

ADVISORY VERDICT: 6 concerns raised (1 blocking-severity, 3 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`. This log **gates nothing**: every finding above rests on model judgment,
including the severities. The only floor-grade facts in this run are the spec-hash match, the griller
count, and the writes-scope hook that pinned this file — nothing here is a pass, and "grilled" is not a
statement that the plan is sound.
