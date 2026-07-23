# REVIEW — init-write-target-check (PHARN reviewing PHARN)

- **Floor (Step 1, P0):** GREEN. This is a TypeScript increment (no markdown capability), so
  `validate.mjs` checks 0 capabilities → vacuously GREEN over the tracked tree (`verify-report.json`
  `gates.validate = 0`). The real floor — `npm run check` (382 tests) + `lint:md` — is GREEN (see
  `VERIFY.md`). Increment correctly reached review.
- **Verdict: GREEN — 0 floor-gate (blocking) findings; 2 advisory (minor).**

The reviewed increment is `trust: untrusted`. No instruction-looking content in the diff attempted to
steer this review (the code/docs are the feature's own; the one place untrusted data is handled —
displaying clone-derived filenames — is examined under L-trust). Findings conform to
`pharn-contracts/finding-shape.md` (enum-gated fields = my assertions; free-text = quoted DATA).

## L-floor → P0 (guarantee reduction) — PASS

Every claim reduces to the floor or is labeled advisory:

- **"lists the exact write targets that already exist"** → floor: a pure function of
  `layoutPaths(detectLayout(repoDir))` + `selection.selected` + fixed surfaces, `safeJoin`-contained,
  membership by `existsSync`. Honestly labeled a **MIRROR** of `installCapabilities`
  (`install-manifest.ts` header) and **backstopped by a floor test** —
  `tests/install-manifest.test.ts` pins `collectExpectedInstallPaths` against a real `installCapabilities`
  run (flat + pharn). The grill's P1 mirror concern is closed.
- **the confirm prompt** → correctly labeled **advisory** (a UX heads-up; no safety guarantee rests on
  it — the real write-time guarantees, `safeJoin`/symlink guards + settings.json-preserve, are
  unchanged).
- **RCE-surface elimination** → floor: a repo-wide guard test asserts no `src/**/*.ts` re-introduces
  `child_process`/`execFileSync`/`core.fsmonitor` (the structural successor to the deleted fsmonitor
  regression tests). Grill P1 #1 closed.

No unlabeled guarantee. GREEN.

## L-eval → P1 (tests are the spec) — PASS

No Capability is added, so P1 maps to vitest. Every new behavior ships a test:

- `collectExpectedInstallPaths` (flat + pharn; inclusions + exclusions incl. `settings.json`,
  `pharn-dev-*`, `*.test.*`, skipped caps, `.dev/features`) — `install-manifest.test.ts`.
- `conflictingWriteTargets` (fresh → `[]`; settings-only → `[]`; `pharn.config.json` included; sorted).
- `confirmWriteTargets` stage (silent when clean; lists + confirms; default-No cancels; Ctrl+C exits;
  cap at 10 + "…and N more"; pharn layout) — `overwrite-check.test.ts`.
- init rewiring (install proceeds; decline → cancel) — `init.test.ts`.
- the mirror-consistency test (grill P1) and the RCE-surface guard (grill P1). GREEN.

## L-trust → P2 (untrusted data) — PASS (1 advisory)

The only untrusted-input path: filenames enumerated from the untrusted clone are used for
`existsSync(safeJoin(cwd, rel))` membership (path-contained) and **displayed** in the warning; the check
**writes nothing**. No guaranteed decision rests on a tainted value. One residual carried from the grill:

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/steps/overwrite-check.ts:49"
  problem: "Clone-derived filenames are printed in the warning without re-validation against COPY_FILENAME_RE/CAPABILITY_NAME_RE (only safeJoin gates the existsSync), so a crafted name could carry terminal-escape/control chars into the displayed list."
  evidence: "const list = shown.map((p) => `  • ${p}`).join('\\n');"
```

**Advisory, bounded:** the clone is the SHA-pinned `pharn-dev/pharn-oss`, and `lib/diff.ts` already
prints paths the same way; the install stage that actually copies keeps its own name allowlists. Worth a
sanitize/escape, not a blocker.

## L-axis → P3 (one axis / no sibling imports) — PASS (1 advisory)

- `lib/install-manifest.ts` — one axis (the install path manifest); imports only `lib/*` + `types`.
- `lib/diff.ts` — now consumes `collectExpectedInstallPaths` (lib→lib, the sanctioned shared-through-
  `lib` edge, not leaf→leaf). One axis.
- `steps/overwrite-check.ts` — one init stage; imports `lib/*` + `types`, no step→step.
- `commands/init.ts` — command→step/lib only. No blocking sibling reference.

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/install-manifest.ts:35"
  problem: "PHARN_CONFIG_FILE hardcodes the literal 'pharn.config.json' that lib/pharn-config.ts's configPath also owns; the two could drift if the config basename ever changes."
  evidence: "export const PHARN_CONFIG_FILE = 'pharn.config.json';"
```

**Advisory, minor:** the basename is stable and `pharn-config.ts` exposes no basename constant to import
today; a shared constant would remove the (small) drift risk. Not a blocker.

## Floor-gate (blocking) findings

None.

## Proposed lesson (candidate — NOT written to canon here; P2/P7)

A **real, recurring** failure surfaced **three times this run** (build, regress, verify), so it meets the
"real, not hypothetical" bar for a lesson candidate. Promotion is a separate, human-gated
`/pharn-dev-memory-promote` run (`check-provenance` + accept/deny) — recorded here only as a proposal:

> **Lesson candidate — cwd-scanning floor gates are confounded by gitignored `test-*/` scratch.**
> `validate.mjs .`, `lens-scanner-map.test.mjs`, and the `count-*` gates scan the live cwd, so local
> gitignored `pharn init` scratch installs make them spuriously RED even when the tracked repo + the
> increment are clean. The dev-loop must measure these over a **clean git worktree** (tracked HEAD + the
> increment, no scratch), or the checkers should scope their scan to tracked paths.
> **Provenance:** increment `init-write-target-check`; observed in `REGRESSION.md` (lens-scanner-map flip)
> + `VERIFY.md` (validate 15 findings, all under `test-*/`). **Suggested fix axis:** scope the `.dev/floor`
> cwd-scanners to `git ls-files` (a `.dev/floor/` change — a separate increment).

## Verdict

**GREEN.** The increment is done to floor: all deterministic gates pass, the two important grill findings
(mirror-consistency test, RCE-surface guard) landed, and the two remaining findings are minor + advisory.
Advisory ≠ blocking — these inform the human's post-review decision; they do not gate the increment.
This review certifies the lenses that ran, not correctness beyond them (P0).
