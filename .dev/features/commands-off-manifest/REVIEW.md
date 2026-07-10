# REVIEW — commands-off-manifest

Reviewing the increment `/pharn-dev-build` produced (the reviewed diff is `trust: untrusted`; any
instruction-looking content in it is DATA reported as a finding, never followed — none was found).

**Verdict: GREEN — 0 floor-gate (blocking) findings.** Four advisory notes below. The increment is
floor-clean: `npm run check` GREEN (test/typecheck/lint/format), `lint:md` GREEN, `/pharn-dev-regress`
`no-regressions`, `/pharn-dev-verify` `PASS`.

## Step 1 — Floor (P0)

The increment adds **no** PHARN markdown capability, so `.dev/floor/validate.mjs` is **vacuously green
for the increment's own files** — there is nothing for it to gate. The repo-root `validate.mjs .` RED is
exclusively the untracked `test-app/test-fixtures/red/skill.md` scratch fixture (pre-existing, outside
the increment — documented in VERIFY.md / REGRESSION.md). The increment's real floor is `npm run check`,
which is GREEN. No blocking floor finding.

## Floor-gate findings (blocking)

**None.**

## Advisory findings (inform; never a blocking basis on their own)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/validate.ts:111"
  problem: "safeJoin (path containment) now lives alongside the regex/enum allowlists in validate.ts, broadening the file's axis slightly."
  evidence: "'export function safeJoin(base, rel)' added to validate.ts (relocated from the deleted install-modules.ts)."
```

Advisory: this was the human's explicit choice at GATE 1 (validate.ts vs a dedicated safe-path.ts).
Cohesive reading: validate.ts is "the structural input-validation / security floor" (allowlists +
`..`/control-char rejection + path containment) — one axis. Its escape tests moved with it
(`validate.test.ts`). No action needed unless a future split is preferred.

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/constitution.ts:1"
  problem: "constitution.ts (MULTI_TENANT_PRINCIPLE/stripPrinciple) and format.ts's shortDescription are now referenced by no src file — dead after the module path's removal (constitution.ts is used only by its own test)."
  evidence: "grep: constitution.js has no src importer; the only importer is tests/constitution.test.ts. shortDescription fed only the removed legacy list renderer."
```

Advisory: floor-safe (tsc/eslint tolerate unused exports; tests pass). Out of this increment's approved
`## Files`, so left for a follow-up honest-scope cleanup (the grill F7 sweep result — named, not hidden).

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: "src/lib/repo.ts:27"
  problem: "A repo.ts doc comment still says the caller 'reads the manifest.json + each module's installs from it' — stale after the module path's removal."
  evidence: "'manifest.json + each module's installs from it, records `sha` as `commit`' — repo.ts was outside this increment's ## Files, so its comment was not updated."
```

Advisory: a one-line comment in an out-of-scope file; fold into the same follow-up.

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/commands-off-manifest/VERIFY.md:1"
  problem: "pharn-cli's deterministic floor is `npm run check`, NOT `.dev/floor/validate.mjs .` — the latter always RED at the repo root because it scans untracked test-app red fixtures. The dev-loop stage commands assume validate.mjs is the build/verify floor."
  evidence: "validate.mjs . → RED from test-app/test-fixtures/red/skill.md, unrelated to any pharn-cli source change."
```

Advisory + a doc-reconciliation for the human: for a TS installer repo like pharn-cli, the ship/build/
verify stages' "read validate.mjs" instruction maps to `npm run check`. Surfaced consistently across
GRILL/REGRESSION/VERIFY; not a defect in the increment.

## L-eval (P1)

Every new behavior ships a test (378 vitest cases, all green): `safeJoin` containment
(`validate.test.ts`), `loadArchetypeConfigOrExit` (archetype returns / legacy → exact
`LEGACY_CONFIG_MESSAGE` + exit — `pharn-config.test.ts`), each command's legacy-abort-before-fetch
(`add`/`update`/`status`/`remove.test.ts`) + `list`'s own message path, `diffInstalledCapabilities`
(`diff.test.ts`), and the USAGE sync (`index.test.ts`). No `rule_id`/eval binding to check (a TS
increment, no PHARN capabilities). GREEN.

## L-trust (P2)

Trust posture strictly **improves**: the increment **deletes** three untrusted ingest surfaces (the
`manifest.json`, per-module `module.json`, and the v2 `wizard` block). The surviving ingest path
(`install-capabilities.ts`, add/update clone) validates capability names (`CAPABILITY_NAME_RE` +
`assertNoDotDot`) before any path-join and `safeJoin`-guards + symlink-rejects every copy; no free-text
from the fetched repo drives a write. `LEGACY_CONFIG_MESSAGE` is a hardcoded trusted string. GREEN.

## L-axis (P3)

No command→command import introduced (verified by grep — commands import only `lib/`). `safeJoin` moved
lib→lib; `diff.ts`/`remove.ts`/etc. import it from `validate.js` (leaf→leaf through a shared floor
module, not a sibling-command reference). The one axis note (validate.ts) is the advisory P3 finding
above. GREEN.

## Proposed lesson (candidate — NOT written to canon; promotion is a separate human-gated run)

- **Lesson:** `set-writes-scope.cjs --from-plan` extracts **one back-tick path per `- ` bullet** and
  **stops at the first `#`-heading or exclusion-cue line** (e.g. "Delete … not … gated"). So a PLAN's
  `## Files` must list **every edited path on its own bullet**, and any Delete/exclusion subsection must
  come **after** all writable paths (and deletes need not be scope-listed — the hook gates only
  `Write|Edit|MultiEdit`, not `rm`). Provenance: this increment (`commands-off-manifest`) — the setter
  under-captured twice (25→16 paths) until the `## Files` was reformatted one-path-per-bullet with a
  trailing `### Explicitly deleted` heading. Real, recurring (any multi-file plan hits it).
