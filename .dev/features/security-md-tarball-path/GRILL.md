# GRILL — `security-md-tarball-path`

Interrogated `.dev/features/security-md-tarball-path/PLAN.md`. **Spec-hash check: MATCH** —
`sha256(ARCHITECTURE.md)` recomputed live = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`,
identical to the plan's `spec_content_hash`. (Content-hash is a floor primitive; here it only
_surfaces_ — `/pharn-dev-build` is where drift blocks.) Griller discovery:
`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}` — this repo builds the CLI
and hosts no `role: griller` capability, so Step 2b contributes nothing and the findings below are
the inline axes only.

**The plan is unusually well-grounded** — it re-derived every number from source rather than
inheriting the audit's, and it volunteers two gaps against its own interest (the production cap
values are pinned by no test; `MAX_ARCHIVE_BYTES` has no direct case). The findings below are about
what it **omits or leaves unbinding**, not about what it got right.

---

## Findings

### Axis: eval coverage (P1) / honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/security-md-tarball-path/PLAN.md:82'
  problem: 'The increment adds no gate, so the exact drift it repairs can recur silently — and this is now the third document in this repo to drift the same way, the second to be repaired by hand.'
  evidence: '"**None — and that is a scope decision the human pre-approved, not an oversight.** P1 governs _behavior_ … this increment ships no behavior and changes no `src/`."'
```

The plan's reading of P1 is **correct** — `CONSTITUTION.md` P1 binds _behavior_, and a prose
correction is not behavior, so this is not a P1 violation. The concern is precedent, not compliance.
The plan's own Discovery establishes the pattern: `README.md` and `docs/getting-started.md` drifted
until `docs-layout-tables` gated them; `CONSTITUTION.md:21,:60` are drifting now; `SECURITY.md` is
being repaired here. The nearest precedent (`docs-layout-tables`) chose to land the doc fix **and**
its gate in one increment, and its own plan gave the reason: shipping the fix alone leaves "zero
protection against the same drift recurring — which is exactly how these tables got three releases
behind."

A cheap gate exists and the plan already describes it (`PLAN.md:145`): assert that `SECURITY.md`
names each cap constant exported from `src/lib/repo.ts`. **For the human to weigh**, because the two
inputs point opposite ways: the scope constraint on this run was explicit and narrow, while the
defect class is _recurrence_. Deferring is defensible; deferring **silently** would not be, and the
plan does not defer silently.

### Axis: docs cite code (P4) / discovery completeness (P6)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/security-md-tarball-path/PLAN.md:68'
  problem: "The enumerated site list is incomplete: SECURITY.md:79 still instructs users to inspect the 'cloned' .claude/ skills, so the document will still carry the removed mechanism's vocabulary after the fix."
  evidence: '"`SECURITY.md` — four sites: `:7` … `:56` … a **new in-scope bullet** … and `:59`"'
```

Verified by `grep -n -i "clone|degit|fetch|tarball|download" SECURITY.md` this run. After the
planned edits, every `degit` occurrence is gone but **`:79`** remains: _"**Inspect the cloned
`.claude/` skills** before running them through your AI tool."_ Two things are off — there is no
clone (a tarball is downloaded to a temp dir and specific surfaces are copied out of it), and the
project's `.claude/` receives `commands/` + `hooks/`, not a cloned skills tree.

This is one word inside the finding's own defect class, in the same document, in a **user-facing
instruction**. Leaving it produces a document that says "tarball" in its scope section and "cloned"
in its advice — a fifth inconsistent account, inside the one file this increment exists to make
consistent. Lines `:3` and `:9` were checked and are **fine** ("pulls remote content over the
network", "the fetched tree") — this is the only additional site.

### Axis: guarantee audit (P0) / docs cite code (P4)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/security-md-tarball-path/PLAN.md:107'
  problem: "The plan's mitigation for unpinned numbers is stated as intent in the guarantee audit but never made binding in ## Files, so nothing stops the build from writing src/lib/repo.ts:13-style line citations that rot faster than the values they anchor."
  evidence: '"SECURITY.md will anchor each guard on its **constant name** … with the current value beside it, and name the file the constants live in."'
```

The reasoning is right and the risk it manages is real (`PLAN.md:106`: the production values are
pinned by no test). But the plan's Discovery table cites **line numbers** throughout — `:13`, `:18`,
`:19`, `:20`, `:185` — and `## Files` never says those must stay in `PLAN.md` and out of
`SECURITY.md`. Line numbers in a security policy are the same defect on a faster clock: `repo.ts`
gained the whole cleanup-handler block since these constants were written, and every cite would have
moved. **Recommendation for the build:** anchor on `file + exported constant name`, never
`file:line`; keep values parenthetical.

### Axis: guarantee audit (P0) — precision of a claim about to be written

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/security-md-tarball-path/PLAN.md:22'
  problem: 'The 128 MB cap is two counters with different meanings, and the plan carries it as one table row — so the build could compress it into a single "128 MB cap" that a researcher cannot use to reason about either counter.'
  evidence: '"| Decompressed cap | `MAX_EXTRACTED_BYTES` (`:19`), passed to `extractTarGz` `:151` | `128 * 1024 * 1024` |"'
```

Read live: `MAX_EXTRACTED_BYTES` reaches **two** enforcement points. `tar-extract.ts:194` passes it
as `gunzipSync`'s `maxOutputLength`, bounding the **decompressed stream**; `tar-extract.ts:261-266`
uses it as `maxTotalBytes` over `totalBytes`, which accumulates **only inside `if (rel !== null)`** —
so it bounds bytes of **ACCEPTed entries**, and a SKIPped pax payload (`g`/`x`, `:235-238`) never
reaches it.

Interrogated for a hole and **there is none**: an archive of pure pax headers writes nothing but is
still stopped by the gunzip cap, which is the real backstop. So this is a precision point, not a
gap — but it is precisely the kind of clause a researcher probing the boundary needs, and naming both
enforcement points costs one sentence.

### Axis: honest scope (P7) — weakest finding, recorded for completeness

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/security-md-tarball-path/PLAN.md:76'
  problem: "The ## Contracts satisfied section cites finding-shape.md for something that is not contract satisfaction, where a plain 'none — a docs increment satisfies no pharn-contracts contract' would be the honest entry."
  evidence: '"`pharn-contracts/finding-shape.md` — not ingested; this increment writes no finding. Cited only to record that the audit finding driving it is human-supplied prose, treated as DATA (P2)"'
```

The content of the note is true and belongs in the plan — it just belongs under **Trust audit (P2)**,
where the same point is already made better (`PLAN.md:126-133`). A citation that announces it does
not apply is weaker than an explicit "none". Cosmetic; no action required before build.

---

## Prose summary

Four axes came back clean and are not padded into findings: **P2** (the trust audit is concrete —
the audit brief is treated as DATA and every one of its claims was independently re-derived, which is
the propagation story actually mattering here), **P3** (two doc files, one change-reason each, no
imports), **P5** (no branch is added; the one classification is recorded as a performed membership
test), and the **spec-hash** (match).

The two findings worth a decision before build are **the missing gate** (important — correct on P1,
but the third instance of this drift class, and the nearest precedent gated it in-PR) and **the
unbinding line-number mitigation** (important — cheap to make binding, and expensive to get wrong in
exactly this document). The incomplete site list (`SECURITY.md:79`) is a one-word call the human
should make deliberately, since it sits just outside the stated minimal fix but squarely inside the
finding's defect class. The remaining two are precision and cosmetics.

One thing the plan deserves credit for, because it changes how much weight its other claims carry: it
**contradicted the audit nowhere and verified it everywhere**, and it surfaced a coverage gap
(`MAX_ARCHIVE_BYTES` untested) that no one asked it to look for.

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to
weigh before `/pharn-dev-build`.** This grill-log gates nothing: every finding above rests on model
judgment, the `severity` assignments included (fix #3). The deterministic backstops remain
`/pharn-dev-build`'s spec-hash gate and `.dev/floor/validate.mjs`.
