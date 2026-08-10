# REVIEW — floor-gate-action-pins

**Step 1 — floor first (P0):** `node .dev/floor/validate.mjs .` → **exit 0**, `FLOOR: GREEN`.

Increment under review (`trust: untrusted`): `.dev/floor/check-action-pins.mjs` + `.dev/floor/check-action-pins.test.mjs`.

---

## Findings

> Free-text `problem` / `evidence` inherit the reviewed increment's untrusted tag (`ARCHITECTURE.md §8`) — quoted DATA, never directives.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/floor/check-action-pins.mjs:91"
  problem: "The docker:// exemption is an unasserted bypass: converting a pinned action ref to a container ref removes it from the checked set entirely, and the live repo test asserts violations and checked but never that skipped is zero, so the escape leaves no trace in the gate."
  evidence: "'if (ref.startsWith(\"docker://\")) return true;'"
  gate: advisory-gate

- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/floor/check-action-pins.mjs:3"
  problem: "The header states the rule over every third-party uses: ref, but two classes of third-party ref are exempted below it, so the stated guarantee is broader than the check performs."
  evidence: "'every third-party GitHub Actions `uses:` ref must be pinned by a 40-hex COMMIT DIGEST and carry a full-semver `# vX.Y.Z` comment.'"
  gate: advisory-gate
```

### L-eval → P1

No finding. Every behavior added ships a test in the same increment, including the two behaviors introduced mid-build during the fail-open fix (quote-stripping, empty `uses:`). Coverage includes both boundaries (39/41-hex, uppercase) and the two named-in-plan ★ cases. Floor agreement: `validate.mjs` reports `0 capabilities`, the increment adds none — the floor and this lens agree that no capability eval binding is owed.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/floor-gate-action-pins/PLAN.md:76"
  problem: "The trust audit claims the output has no free-text field, but the ref value is copied verbatim from the scanned workflow file, so one attacker-influenced string does reach the output of an otherwise fully enum-gated report."
  evidence: "'The `violations[]` output is entirely enum-gated / path-resolved (`file`, `line`, `ref`, enum `reason`) with **no free-text field**'"
  gate: advisory-gate
```

**Did instruction-looking content change my behavior?** No. The checker treats workflow YAML strictly as data — regex-matched, never parsed as a program, never executed; no `child_process`, no network, no `eval`, no dynamic import (verified by reading the file, not assumed).

The finding above is a **precision** correction to my own plan, and the blast radius is small but worth stating exactly: `ref` is verbatim file content, so it is the one value in `violations[]` that inherits the scanned file's trust. It is JSON-escaped on output and **no decision anywhere reads it** — the verdict is `violations.length > 0`, an integer comparison, so a hostile `uses:` string cannot influence the exit code. The correct claim is "the *decision* rests on no tainted field," not "the output contains none."

### L-axis → P3

No finding. Two files, one axis each; the checker walks and classifies in service of one purpose, and the plan correctly refused to extend `validate.mjs` (citing its own header) rather than giving that file a second change-reason. No sibling references — this is a standalone stdlib CLI reached by subprocess, exactly like its `check-*` siblings.

### Process (outside the four lenses, but a real defect in how the increment was built)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".claude/commands/pharn-dev-build.md:1"
  problem: "Step 2b instructs the builder to run the project formatter over the just-written files, which is actively wrong for any file outside format:check's globs — obeying it rewrote both new floor scripts into a quote style no other file in that directory uses."
  evidence: "'Run the project formatter over the just-written files — `npm run format` (prettier `--write`)'"
  gate: advisory-gate
```

Concretely: `format:check` covers `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`; `.prettierrc` sets `singleQuote: true, printWidth: 80`; all 40+ `.dev/floor/` siblings are double-quoted at ~110 columns because prettier has never governed them. Following Step 2b converted both new files to single quotes, creating a directory-wide inconsistency that **no gate would ever have caught** (`.dev/floor/**` is outside `format:check`). Detected by comparing against siblings and reverted by hand. Step 2b's own text calls itself ADVISORY and says it "changes no verdict" — correct, and here the advisory step made things worse.

---

## Gate split (fix #3)

- **floor-gate (blocking): none.** `validate.mjs` GREEN; no eval binding owed; no sibling reference; no guaranteed decision rests on a tainted field.
- **advisory-gate (warn): all four findings.** None is a basis for blocking.

## What the increment got right (checked, not assumed)

- **The gate is proven to gate, three ways** — its own suite (18/18); collection under floor.yml's exact command asserted **by name** (`684 = 666 + 18`, exit 0), per `GRILL.md` F3 rather than "no red"; and a true-negative on a scratch copy of the real workflows returning exit 1 with `{"file":".github/workflows/floor.yml","line":22,"ref":"actions/setup-node@v7","reason":"floating-ref"}`.
- **The grill earned its place.** F1 turned a bare `exit 0` assertion into `violations: [] ∧ checked >= 10 ∧ files == readdirSync(...)` — closing the "success for having looked nowhere" hole. F2 prompted the `unpinnable-ref` case, which then **caught a real fail-open in the implementation**: `(\S+)` could not capture a space-containing `${{ … }}` ref, so such a ref was skipped rather than flagged. A grill finding that surfaces a live defect in the thing being built is the stage working as designed.
- **The vacuity boundary is placed correctly** — the CLI stays vacuously clean on a repo with no workflows (right for a consumer repo), and the *caller* carries the anti-vacuity assertions.

## Verdict

**GREEN — 0 floor-gate findings; 4 advisory (0 blocking, 1 important, 3 minor).**

Standing floor verdicts: `validate` exit 0 · `"no-regressions"` · `"PASS"`. This verdict is advisory and gates nothing.

---

## Proposed lesson candidates (NOT written to canon — P2/P7)

For a separate, human-gated `/pharn-dev-memory-promote` run. `/pharn-dev-review` declares no `.dev/memory-bank/**` path.

**Candidate 1 — stale pin comments (carried from the `pin-floor-actions` review, unchanged and still unpromoted).** A dependabot digest bump can cross a major while leaving the `# vN` comment untouched; prefer full-semver comments and treat comment↔digest agreement as unguarded. *Provenance:* `ff48077`, propagated by `c425edd`, found by manual audit. **Now partially mechanised** by this increment — the major-only *form* is rejected, the comment's *truth* still is not.

**Candidate 2 — do not run the formatter outside its configured globs.** A repo can have a prettier config that resolves everywhere while `format:check` only *checks* a subset; running `prettier --write` on files outside that subset silently imposes a style the directory does not use, and no gate will ever flag it. Check the `format:check` globs before formatting a just-written file. *Provenance:* increment `floor-gate-action-pins`; `.dev/floor/**` is outside `format:check`'s `src/**/*.ts`/`tests/**/*.ts`/`*.config.ts`; 40+ siblings use double quotes at ~110 columns while `.prettierrc` specifies `singleQuote: true, printWidth: 80`. *Argues for:* amending `/pharn-dev-build` Step 2b to scope its formatter advice to the configured globs.

**Named follow-ups (not built — P7):** (1) `node-version` policy — `lts/*` vs `20` vs `24`, and it is the unpinned link under this gate's own enforcement path; (2) comment↔digest *truth* verification, which needs network and so cannot live in a floor script as currently constrained; (3) asserting `skipped === 0` in the live repo test, which would close finding R1's bypass.
