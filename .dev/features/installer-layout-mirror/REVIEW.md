# REVIEW — installer-layout-mirror

**Increment (trust: untrusted to this review):** make the CLI mirror the fetched clone's layout (flat OR the new `pharn/`) across install/status/remove, via one resolver, recording `layout` in config. Diff: 9 files modified (+106/−44) + `src/lib/layout.ts` (83 lines).

**Step 1 — Floor first (P0):** `node .dev/floor/validate.mjs .` → exit `0`, **GREEN**. The increment legitimately reached review. The floor is the only guaranteed part; everything below is advisory.

## Four lenses

### L-floor → P0 — no finding
Every guarantee reduces to a floor primitive or is labeled advisory. Detection → membership test on the `pharn/pharn-contracts` marker + vitest over both layouts. P7 (old flat pins) → the resolver's `else` **is** the current flat behavior, backed by a flat-clone regression test and a legacy-config-loads test. `safeJoin`/symlink guards preserved on every copy and delete and re-asserted. The one honestly-advisory item — the `pharn/` path set tracks an **unmerged** PR #86 — is labeled advisory in GRILL.md/VERIFY.md, not sold as a guarantee. No unlabeled guarantee. Clean.

### L-eval → P1 — no finding
No new Capability or `rule_id` (this is CLI product code), so there is no eval binding to miss; the floor agrees (`validate` GREEN). Every new behavior ships a vitest test in the same increment: `detectLayout`/`layoutPaths`/`configLayout` (incl. the no-false-positive + empty-dir cases), `installCapabilities` for pharn (mirror + THREAT-MODEL/LIMITS drop + `.claude/` kept) and the flat P7 guard, `capability-index` pharn enumeration, `diff` pharn + cross-layout degradation, `status` layout pass-through, `remove` capability at both layouts, `pharn-config` round-trip/legacy/garbage. 616/616 green. Clean.

### L-trust → P2 — no finding
The fetched clone is untrusted, and `detectLayout` reads only **path existence** against a **fixed constant** (`pharn/pharn-contracts`) — no untrusted byte drives the branch, no injection sink. Every copy/delete stays `safeJoin`- + symlink-guarded; `capability-index`'s strict frontmatter validation is untouched; the project `layout` is read from the CLI-owned config and enum-coerced (`configLayout` / `pharn-config` drop-garbage). No guaranteed decision rests on a tainted/free-text field. No instruction-looking content in the diff changed this reviewer's behavior. Clean.

### L-axis → P3 — no finding
Each file changes for the single reason "resolve the install layout rather than hard-code it." Layout logic is centralized in the new `lib/layout.ts` and reached from `lib/`, `steps/`, and `commands/` — no `command→command` or `step→step` sibling coupling is introduced (the `command→step` imports present are the sanctioned direction). `install-capabilities` delegates detection to `layout.ts` rather than growing a second axis. Clean.

## Gates (fix #3)

- **floor-gate (blocking):** none.
- **advisory-gate (warn):** one, below.

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: "src/commands/add.ts:351"
  problem: "`pharn add` calls installCapabilityDirs with the default layout, which detects from the CLONE (@main), not the project's recorded config.layout — so during the flat→pharn transition `add` could install a capability at the clone's layout into a project of the other layout."
  evidence: "installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);"
```
**Advisory, out of this increment's scope:** `add.ts` was not in the plan's `## Files`, and the mismatch is only reachable in the transition window (default clone is `main`, flat today; and `add` already was not layout-aware before this change). Recommended **follow-up** (increment 3): thread `configLayout(config)` into `add`'s `installCapabilityDirs` call, mirroring what `remove`/`status` now do — the optional `paths` param added this increment already makes that a one-line change. Surfaced for the human; it blocks nothing.

## Verdict

**GREEN — 0 floor findings, 0 blocking.** The increment satisfies its plan (17 files), the floor is GREEN, verify PASSed, and regress found no feature-attributable regression. The one advisory finding is an out-of-scope follow-up. Merge / fix / abandon is the human's call (GATE 2).

## Lessons

- **No new canon lesson.** The regress `test-app`/worktree confound this run re-encountered is already recorded as a proposed candidate in `.dev/features/remove-dead-docs-url/REVIEW.md` (this run is a second occurrence, strengthening that provenance) — not re-proposed here to avoid duplication. The `add` cross-layout gap above is a specific follow-up, not a recurring-failure pattern warranting canon.
