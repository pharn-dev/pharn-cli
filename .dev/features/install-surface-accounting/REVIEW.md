# REVIEW — install-surface-accounting

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment; the deterministic gates that matter are `/pharn-dev-verify`'s). The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff ff9312f..HEAD` — `src/lib/install-manifest.ts`, `src/lib/install-capabilities.ts`, `src/lib/absent-surfaces.ts` (new), `src/lib/status-report.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/steps/install-archetype.ts`, `src/commands/update.ts`, `src/commands/status.ts`, the tests and the docs. Live check: the current pharn-oss main (6.58.0) yields `absentInstallSurfaces` = `[]` at its own (`pharn`) layout.

## Floor-gate findings (blocking)

None.

- L-floor (P0): "absent" reduces to a count over the same enumeration that builds the manifest (`collectInstallManifest`), `=== 0`; status's strict failure goes through the one `strictFails` predicate; hook names are a suffix membership test shared by both writers. The copy-side agreement is stated as test-pinned (the mirror tests now carry an `.mjs` hook and its `.test.mjs`), not "by construction". The declared list being closed is labelled in code, docs and CHANGELOG.
- L-eval (P1): every new behaviour has a vitest test — accounting per surface and per layout, zero-files-passing-filter, the root features-README fallback, the symlinked root, `.mjs` copy and manifest, the formatter, init's single warning (install still completes), update's note / dry-run note / JSON field / bump not withheld, status's DRIFT section, `--strict` on the only finding, accounting at the clone layout, the LAYOUT note with `--strict` exit 0, and the JSON `layout` pair.
- L-trust (P2): `path` is a CLI-owned constant resolved for the layout, never a clone-read name; it is still passed through `terminalSafe` (text) and the JSON escaper / `cap` (JSON).
- L-axis (P3): `absent-surfaces.ts` holds only the wording; the accounting lives with the manifest; no command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: 'src/steps/install-archetype.ts:382'
  problem: 'init''s outro still says "PHARN commands + hooks written" unconditionally — the same unconditional-success line the docs fix removed for the trusted docs. With hooks (or commands) absent upstream, the warning names them and the outro then claims they were written.'
  evidence: "`${check} PHARN commands + hooks written → ${pc.dim('.claude/')}`"
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/install-manifest.ts:80'
  problem: 'An .mjs hook is now a copy candidate, so it is held to COPY_FILENAME_RE like a .cjs one: an upstream .mjs hook with an uppercase or underscore name now refuses init/update/status (it used to be skipped in silence). Same posture as .cjs and as commands, and named by the existing refusal text, but a new way upstream can trip a released CLI.'
  evidence: '/\\.(cjs|mjs)$/.test(name)'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/lib/update-report.ts:209'
  problem: 'The two JSON reports carry the field differently: update omits plan.absentUpstream when empty (its default bytes are pinned to 0.10.0), status always carries drift.absentUpstream. Both are documented; a consumer reading both should test presence on update.'
  evidence: '...(p.absentUpstream.length > 0'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'LIMITS.md:150'
  problem: 'LIMITS.md §3e does not mention fixed surfaces: a relocated one is now named (init/update) and fails status --strict, while the list stays closed and per-surface. Human-only file; replacement text handed over at GATE 2.'
  evidence: 'a relocated or renamed capability subtree throws'
```

## Out-of-feature observation (not a finding against this increment)

`/pharn-dev-verify`'s `test` gate exited 1 in iteration 1 only on `tests/lint-gate.test.ts` (unchanged by this increment): six `Test timed out in 5000ms` on its `eslint --stdin` spawns, with the host's load average at ~85–190. The same file passes 7/7 with `--testTimeout=120000`, and `npm run lint` is clean.

VERDICT: GREEN — 0 floor-gate findings, 4 advisory (1 important, fixed in iteration 2).

## Iteration 2

Re-reviewed `git diff fd9e7d2..d06bb40` (`src/steps/install-archetype.ts`, `tests/init-archetype.test.ts`, `docs/commands/init.md`, `CHANGELOG.md`). The important advisory finding above is resolved: the outro builds its `.claude/` line from the same `absentInstallSurfaces` result the warning uses (`PHARN commands written` when no hooks landed, a `!` line when neither did), pinned by two tests. No new findings. The three minor findings stand as advisory.

VERDICT: GREEN — 0 floor-gate findings.

## Iteration 3

No diff since iteration 2 (no fix was possible within the plan's `## Files`: the only red is `tests/lint-gate.test.ts`, which this increment does not touch, timing out on its own `eslint` child processes under host load). No new findings.

VERDICT: GREEN — 0 floor-gate findings.
