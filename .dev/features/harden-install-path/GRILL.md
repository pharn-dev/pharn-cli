# GRILL — harden-install-path

**Plan under interrogation:** `.dev/features/harden-install-path/PLAN.md`
**Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash`. No drift. (The actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4.)
**Registered grillers (deterministic membership, `count-grillers.mjs`):** `0` — no griller capabilities installed in this repo; the built-in Step 2 axes are the whole interrogation.
**Trust:** the plan is `trust: untrusted`; its `problem`/`evidence` free-text below quotes the plan as DATA, never followed as instruction (P2).

---

## Findings (finding-shape objects — enum-gated fields are my assertions; free-text quotes the plan as DATA)

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/harden-install-path/PLAN.md:70"
  problem: "The FIX 1 floor invariant as stated does not hold in the graceful-fallback branch the human approved: when the sha is unresolved the design records commit:null, which is neither equal to the fetched tree nor a fail-close, so 'recorded == fetched, or fail-closed' is incomplete."
  evidence: "\"The recorded `commit` equals the sha degit was pinned to (recorded == fetched, or fail-closed)\" -> floor"
  # suggested restatement (build): "recorded == the resolved sha when one resolved, ELSE recorded == null (unknown) — never a mismatched NON-null sha." That is the true floor property (the record never LIES), and it is what the tests at :60-61 actually assert.

- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/harden-install-path/PLAN.md:70"
  problem: "The 'degit fails closed if it cannot fetch that sha' half of the FIX 1 floor claim has no planned eval — the repo.test.ts cases mock degit to capture the src argument, so they cannot demonstrate fail-closed; the property rests on a source-read of degit this run, not on a pharn test."
  evidence: "\"degit fails closed if it cannot fetch that sha. Testable (P1).\" — but the two repo.test.ts cases (:60-61) stub degit, exercising only the ref STRING passed, not degit's real resolution."
  # resolution (build): either scope 'fail-closed' as DEGIT behavior (source-grounded, advisory — not a pharn-tested guarantee), or drop it from the floor claim and rest the floor on the tested 'recorded == resolved-sha XOR null' property only.

- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/harden-install-path/PLAN.md:21"
  problem: "assertRealDestWithin realpath-checks the destination and then cpSync writes — a check-then-write window a LOCAL concurrent adversary could exploit by swapping in a symlink between the two; the plan does not state that this is out of scope, i.e. that THREAT-MODEL surface B is hostile REMOTE content (the fetched tree), not a local filesystem race during a single-process install."
  evidence: "\"Add `assertRealDestWithin(claudeDir, to)` (FIX 2 Layer 2).\""
  # note: genuinely out of the threat model (no local concurrent adversary in the install path); worth one sentence of honesty in the trust audit, not a redesign.

- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/harden-install-path/PLAN.md:21"
  problem: "FIX 2/3 duplicate the one-line symlink/test predicates into install-modules.ts to dodge an import cycle; a small shared lib/ helper module imported by BOTH install-modules and install-capabilities would remove the duplication (and the copy-paste-drift the repo's own review lens hunts) WITHOUT any sibling import — lib->lib is already used (install-capabilities imports safeJoin from install-modules)."
  evidence: "\"Add `isSymlink`/`isTestFile`/`isDevCommand`/`copyFilter` helpers (mirroring `install-capabilities.ts`, defined **locally** — importing from `install-capabilities.ts` would create a cycle …)\""
  # acceptable as-is (1-liners, file independence); the shared-helper option is cleaner and pre-empts a drift finding at review. Build/human to weigh.
```

---

## Prose summary

The plan is **fundamentally sound and unusually well-grounded**: discovery is live (the decisive BUG 3 question — is the legacy path dead? — is answered from `init.ts:41-47`, not memory; the spec-hash matches; degit's ref→tarball behavior was read from its installed source, not assumed). The guarantee audit correctly labels the two authenticity/reproducibility claims **advisory** (P0), the trust audit contains taint to `.claude/`, and the determinism audit holds. The two structural risks the task cared most about — the **verified** symlink arbitrary-write (FIX 2) and the missing dev/product allowlist (FIX 3) — are each closed by a floor primitive with a demonstrating test.

The concerns cluster on **FIX 1**, and both important findings are *precision*, not *design* problems — cheap to fix in build without touching the approach:

- **P0 (line 70):** the floor invariant omits the approved `commit:null` fallback branch. Restate it as "recorded == resolved sha, else null — never a mismatched non-null sha." The design is right; the *sentence* is imprecise, and P0 precision on a guarantee claim is exactly what this stage guards.
- **P1 (line 70):** the "fail-closed" sub-claim is untested (degit is mocked). Scope it as degit behavior (advisory, source-grounded) or drop it from the floor claim.

Two minor suggestions (a check-then-write honesty note; a shared-helper refactor to pre-empt copy-paste drift) are for build/human to weigh.

**On eval shape:** the plan's "evals" are `vitest` tests — correct for pharn code (CONSTITUTION P1). `eval-format.md`'s `structural[]`/`semantic[]` split governs **methodology-capability** evals (`{case, expected}` markdown skills), **not** CLI unit tests, so it does not strictly apply; every planned assertion is deterministic (`toThrow`, `existsSync`, captured `degit` arg) with **zero** LLM judge — the ideal the split exists to protect. Not a finding.

**On scope (P7):** the plan raised the bundle-vs-split question itself (OQ1) and the human resolved it at GATE 1 (bundle all three). Not re-litigated here.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking, 2 important, 2 minor) — for the human to weigh before `/pharn-dev-build`.** This grill-log is **advisory end-to-end**: it gates nothing. It does **not** mean "the plan passed" or "the increment is sound" — only the human, and `/pharn-dev-build`'s own floor-gates (spec-hash, unresolved HALT questions, `validate.mjs`), decide that. The two important findings are precision fixes the build agent can fold in without changing the design; none blocks proceeding.
