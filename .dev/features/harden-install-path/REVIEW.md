# REVIEW — harden-install-path

**Increment under review (`trust: untrusted`):** the 11 files of `harden-install-path` (FIX 1 degit pin + FIX 2 symlink defense + FIX 3 dev/product allowlist).
**Floor first (P0):** `node .dev/floor/validate.mjs .` → exit `0` (GREEN). The floor is the only guaranteed part of this review; everything below is **advisory**.

## Floor-gate findings (blocking)

**None.** No P0 guarantee lacks a floor reduction or an `advisory` label; every new behavior has a demonstrating `vitest` test (P1); no sibling import (P3). The increment is not blocked.

## Advisory findings (inform; never the sole basis for a guaranteed block — fix #3)

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: "src/lib/repo.ts:83"
  problem: "FIX 1 newly routes an UNTRUSTED GitHub-API value (`body.sha`) into the degit ref (`degit(${REPO}#${sha})`, repo.ts:43/46), but validates it only by `typeof === 'string'` — no format allowlist, unlike every other untrusted remote value in the repo (INSTALL_PATH_RE / WIZARD_VALUE_RE / MODULE_NAME_RE)."
  evidence: "return typeof body.sha === 'string' ? body.sha : null;"
  # Bounded, not critical: degit (tar mode) resolves the ref via `git ls-remote` and prefix-matches
  # it against REAL ref-tip hashes, so a malformed ref (e.g. '../../evil') fails resolution rather
  # than reaching the archive URL. BUT relying on a downstream tool's INCIDENTAL sanitization is
  # exactly the implicit trust P2 forbids ("trust is structural — validated — not the code's judgment").
  # Fix (cheap, matches validate.ts posture): validate `body.sha` against /^[0-9a-f]{7,40}$/ in
  # fetchCommitSha, return null on non-match. This is the review's most actionable finding.

- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/commands/init.ts:93"
  problem: "The archetype-INIT sha threading (runInitArchetype: `const commit = repo.sha`) has no direct test — init-archetype.test.ts:91 tests the DOWNSTREAM runInstallArchetype with an explicit 'sha123' arg, and init.test.ts covers only prereq/error paths; the runInitArchetype → repo.sha → commit wiring is untested."
  evidence: "const commit = repo.sha;  // init.ts:93 — no test asserts runInitArchetype passes repo.sha through"
  # Low risk: the change is a 1-line swap that typechecks and mirrors the TESTED add/update archetype
  # paths (which do assert repo.sha → commit). Strictly P1 wants a demonstrating test; the shared
  # fetchAndInstall path (default init / module add+update) IS covered via installer.test.ts.

- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/install-modules.ts:46"
  problem: "FIX 3's legacy filter is a BLOCKLIST (exclude pharn-dev-*.md + *.test.{mjs,cjs}) whereas the archetype path is an inclusion ALLOWLIST (only pharn-*.md commands), so the legacy path stays more permissive — a module could still install a non-dev, non-test file the archetype path would not."
  evidence: "const copyFilter = (src) => !isSymlink(src) && !isDevCommand(src) && !isTestFile(src);"
  # This closes BUG 3's actual concern (the dev/product LEAK — dev-loop commands + test files never
  # land) and fits the legacy path's model ("install the module's DECLARED installs"). Whether to
  # further tighten the legacy path to a strict pharn-*.md allowlist is a design choice for the human,
  # not a defect — surfaced honestly.

- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/lib/repo.ts:35"
  problem: "The 'degit fails closed if REPO_BRANCH moves mid-fetch' property (part of FIX 1's honesty) is documented as DEGIT behavior from a source-read this run, and is not covered by a pharn test (repo.test.ts mocks degit)."
  evidence: "and if REPO_BRANCH moves mid-fetch degit's own resolution fails (the SHA is no longer a ref tip) rather than fetching drift"
  # Correctly SCOPED as degit's behavior (not a pharn guarantee) per the grill's P1 finding —
  # reflected honestly in the comment. Testing it would test degit (out of scope). Noted for the human.

- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/install-modules.ts:37"
  problem: "The one-line predicates isSymlink / isTestFile are duplicated between install-modules.ts and install-capabilities.ts (defined locally to avoid an import cycle), a small copy-paste-drift surface."
  evidence: "const isSymlink = (p) => lstatSync(p).isSymbolicLink();  (also in install-capabilities.ts:62)"
  # Acceptable given the cycle constraint (install-capabilities already imports safeJoin FROM
  # install-modules); a shared lib/ helper imported by BOTH would remove the duplication. Echoes the
  # grill's minor P3 finding. Low priority.
```

## Per-lens summary

- **L-floor (P0):** clean. FIX 2 L1 (lstat + cpSync filter), FIX 2 L2 (realpathSync containment — the path-containment floor op named in P0), and FIX 3 (basename allowlist) are floor primitives; FIX 1's authenticity/reproducibility are correctly labeled **advisory** (LIMITS §1b), and FIX 1's real floor claim (recorded == resolved-sha XOR null, never a mismatched non-null sha) is precisely stated in the code and demonstrated by repo.test.ts.
- **L-eval (P1):** every security behavior has a demonstrating test (symlink root reject, nested skip, Layer-2 write-through refusal, dev/product exclusion, pin, fallback). Two minor gaps: the init-archetype sha wiring (finding 2) and the degit fail-closed property (finding 4) — both low-risk, noted.
- **L-trust (P2):** the fetched tree is path-contained + symlink-filtered before any write; the recorded commit is advisory and drives no guaranteed decision. **One important gap (finding 1):** the untrusted API sha is used to drive the degit fetch without an explicit allowlist — bounded by degit's incidental resolution, but against the repo's P2 posture.
- **L-axis (P3):** one axis per file; no sibling imports (helpers defined locally to respect the existing install-capabilities→install-modules dependency direction). One minor duplication (finding 5).

## Verdict

**GREEN — no floor-gate (blocking) findings.** The increment satisfies its plan and the floor. Five **advisory** findings are surfaced for the human; the most actionable is finding 1 (validate the API sha against a `/^[0-9a-f]{7,40}$/` allowlist in `fetchCommitSha`). None blocks; all are the human's call at the post-review gate.

## Proposed lesson candidate (NOT written to canon here — P2/P7)

- **Candidate (provenance: increment `harden-install-path`, finding 1, `src/lib/repo.ts:83`):** _"When a change gives an existing untrusted remote value a NEW load-bearing use (here: an API `sha` that was record-only becomes the degit fetch ref), re-validate it against a strict allowlist at that moment — the repo's P2 floor is explicit validation, not reliance on a downstream tool's incidental sanitization."_ Single occurrence today (P7 — not yet clearly recurring); offered for a human-gated `/pharn-dev-memory-promote` decision, not promoted here.
