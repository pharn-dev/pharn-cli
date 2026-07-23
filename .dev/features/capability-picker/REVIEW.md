# REVIEW — capability-picker

**Verdict: GREEN — 0 floor-gate (blocking) findings. 4 advisory findings for the human to weigh.**

PHARN reviewing PHARN: the increment was read as `trust: untrusted` DATA. No instruction-looking content or injection was found in the built files, comments, or docs. Everything below the floor line is advisory (my judgment); only the floor is guaranteed.

## Step 1 — Floor (P0, the only guaranteed part)

`.dev/floor/validate.mjs` is **GREEN for the increment**: on a clean detached HEAD worktree (tracked files only) it reports `GREEN — 0 capabilities checked` (this increment adds no PHARN markdown capability). The live working tree's `validate` RED is **provably 100% gitignored `test-*/` fixtures** (verified: every finding path is under a git-ignored `test-*/`, none is an increment file). `npm run check` (build floor) and `/pharn-dev-verify` (PASS) independently corroborate. The increment legitimately reached review.

## L-floor → P0 (guarantee reduces to floor OR labeled advisory)

No P0 disease. Every guarantee the increment makes is either deterministic or explicitly test-backed/advisory:

- "available = catalog − installed; installed never re-offered by `add`" → **floor** (deterministic set-difference by `(name,role)` in `buildAddSelection`), unit-tested.
- "non-TTY never prompts" → the `interactiveAllowed` boolean is deterministic; the guarantee also depends on the guard being **called before any prompt** in both commands — that placement is **test-backed (advisory)**, and the code + `add`/`remove` tests bear it out. Correctly framed, not sold as pure floor.
- "picker reuses the same install/remove path" → **advisory, test-backed** (`installCapabilityDirs` / `resolveArchetypeAdd` / `deleteCapabilityDir` asserted via `toHaveBeenCalled…`). No blocking finding.

## L-eval → P1 (every behavior has a test)

The increment adds **no** PHARN Capability (no `role:` frontmatter, no `evals/expected`), so the markdown-capability eval obligation does not apply — the CLI's P1 is its `vitest` suite, and `validate` (which checks markdown capabilities) correctly finds none to bind, so floor and suite do not disagree. Every new behavior ships a test: the three pure functions, both non-TTY guards, both TTY picker paths, the grill-F1 final-config threading assertion, and remove's confirm/decline/cancel/empty paths. No missing binding. (One advisory gap in F3 below.)

## L-trust → P2

No finding-emission in this increment (it is CLI code). The pickers are strictly **downstream of the validated `parseCapabilityIndex` boundary** — option labels/values are built only from `name` (`CAPABILITY_NAME_RE`) + `role` (enum), so no raw untrusted frontmatter reaches the prompt. Picked `role:name` values are re-parsed (`parseCapabilityArg`) and re-resolved against the validated index (`add`) / `config.capabilities` (`remove`) before any fs op; the copy still passes through `installCapabilityDirs` (`safeJoin` + regex + symlink-reject) and delete through `safeJoin`. No guaranteed decision rests on a tainted field; no new taint path. No blocking finding.

## L-axis → P3

**No cross-command import and no sibling-leaf reference** (the blocking P3 case): `add.ts` and `remove.ts` reach shared code only through `lib/`; each picker calls a **file-local** helper (`resolveArchetypeAdd` in `add.ts`, `deleteCapabilityDir` in `remove.ts`), never the other command. Two soft cohesion/DRY notes below (F1, F2) — advisory, not blocking.

## Findings (all ADVISORY — no floor-gate blocks)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/capability-picker.ts:1"
  problem: "The module bundles the interactivity guard (interactiveAllowed) with the option-model builders (buildAddSelection/buildRemoveSelection) — arguably two axes of change (how interactivity is detected vs. the picker's option shape). Cohesive under one 'bare-picker support' axis, but a P3 purist could split the guard into its own leaf."
  evidence: "exports interactiveAllowed(...) alongside buildAddSelection(...) / buildRemoveSelection(...) — GATE-1-approved co-location; noted for the human."

- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/commands/add.ts:254"
  problem: "The one-line `plural(n)` helper is duplicated verbatim in add.ts and remove.ts. Trivial, but P3 routes shared logic through lib/ — it could live in lib/format.ts (next to `row`) rather than in two command leaves."
  evidence: "identical `function plural(n: number)` in src/commands/add.ts and src/commands/remove.ts."

- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/commands/add.ts:243"
  problem: "add's picker cancel path (isCancel → cancelAndExit) and the two defensive branches in resolveAddPicker (result.kind 'noop' / error) are unreachable for picker-sourced values and are not directly unit-tested. remove's cancel/decline ARE tested; add's is asymmetrically not."
  evidence: "resolveAddPicker `else if (result.kind === 'noop')` / `else { log.error(...) }` — defensive, uncovered."

- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/commands/add.ts:224"
  problem: "To reuse resolveArchetypeAdd verbatim, the add-picker loop re-parses the capability index once per pick (N+1 total) and writes pharn.config.json N times (one per pick). Correct and deliberately faithful to 'the same per-name path', but an atomic install (installCapabilityDirs over the whole set + one config write) would be O(1) parses/writes. Accepted tradeoff — flagged for visibility."
  evidence: "loop calls resolveArchetypeAdd per value; each call runs parseCapabilityIndex + writePharnConfig."
```

## Proposed lesson candidate (NOT promoted — for a separate /pharn-dev-memory-promote run)

- **Candidate (lessons-learned):** _"Dev-loop floor checks that scan the whole tree (`validate.mjs .`, `node --test` over floor tests) go RED in the developer working tree because gitignored `test-*/` fixture installs ship deliberately-invalid `red/skill.md` fixtures. Measure them on a clean detached `git worktree` (tracked files only) for the true increment verdict; the working-tree RED is a measurement artifact, not a regression."_
  - **Provenance:** increment `capability-picker` (`7f98902`); this bit the floor read at `/pharn-dev-build`, `/pharn-dev-regress`, and `/pharn-dev-verify` in one run (each resolved via a clean worktree).
  - **Why real (P7):** recurring across three stages this run and already noted in session memory — not hypothetical. Promotion is the human's call via `/pharn-dev-memory-promote` (this review writes no canon).

## Honest residual

GREEN here means **zero blocking floor-gate findings** and the four lenses raised only advisory concerns — it is **not** a guarantee the increment is correct beyond what the floor + the vitest suite check. The advisory findings are help, not assurance.
