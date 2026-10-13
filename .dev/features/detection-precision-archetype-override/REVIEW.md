# REVIEW — detection-precision-archetype-override

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0 (vacuous for this TypeScript increment; the deterministic gates that matter are `/pharn-dev-verify`'s).

Reviewed: `git diff 6dae4fe..HEAD` — `src/lib/archetype.ts`, `src/lib/detect-archetype.ts`, `src/index.ts`, `src/commands/init.ts`, `src/steps/archetype-summary.ts`, `src/types.ts` (comments), their tests, and the docs named in the plan. Smoke (by hand, via `tsx` over the reviewer's 39 fixtures): only the 11 targeted fixtures changed verdict (06, 07, 09, 10, 11, 12, 21, 22, 23, 30, 39); genuine Next apps (02, 20) and the monorepo fixtures (04, 15) are unchanged; the rendered evidence block reads e.g. `backend ← app/api/`, `ssr ← Next.Config.JS`, `lib ← no framework signal found`. `node dist/index.js init --archetype bogus` → the refusal on stderr, exit 1.

## Floor-gate findings (blocking)

None.

- L-floor (P0): every new guarantee reduces to a membership test — `parseArchetypeList` (exact `ARCHETYPE_VALUES` membership, duplicate set, `lib`-alone rule), `isBaseDir`/`ROUTER_DIRS`/`SQL_HOST_DIRS` set membership, `recordedArchetypes` (array + membership, no sanitising) — or to `terminalSafe` (fixed regex + cap) for display. Detection _correctness_ stays labelled advisory in the code header and docs; `--archetype` is the stated in-product correction.
- L-eval (P1): every rule direction has a test — the `classifyEntry` table covers each gate with and without its evidence (60 rows), the 24 precision fixtures, the evidence suite (dependency-over-path, preorder dir-before-file, suppressed `spa`, `lib`), 14 `--archetype` refusal rows incl. `--archetype --ref main`, `--archetype=`, `--help`/`--version` beside a bad value, and init's override/previous-config wiring.
- L-trust (P2): evidence paths are the user's own local entry names, display-only, rendered once through `terminalSafe` with a cap (ESC/U+202E/300-char tests); dependency evidence is the allowlist literal, never manifest bytes; the replaced config's `archetypes` reaches the screen only after membership reduction. No fetched input is involved; nothing in the reviewed artifacts read as an instruction.
- L-axis (P3): pure rules (`classifyEntry`, `isBaseDir`, `packageFacts`, `evidenceFor`, `parseArchetypeList`, `recordedArchetypes`) stay in `archetype.ts`; the base/`nextBase` computation (reading strategy) is in `detect-archetype.ts`; rendering is one pure function (`archetypeOriginLines`) in the summary step, ready to slot into F-07's `archetypeSummaryLines`. No command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/steps/install-archetype.ts:127'
  problem: 'Three comments outside this plan''s Files still label the archetype install as "(pharn init --archetype)" (also src/lib/pharn-config.ts:634, src/lib/constants.ts:13), which now reads as the override flag. Harmless but misleading; a follow-up (or F-07, which is reworking init) can drop the suffix.'
  evidence: '// The archetype-install apply stage (pharn init --archetype). Copies the'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/lib/archetype.ts:227'
  problem: 'jsProject is a coarse JS-ecosystem proxy (any parseable root package.json, even tooling-only). The residual is documented in README, init.md, troubleshooting.md and CHANGELOG; recorded here so the human sees it is a heuristic, not a language detector.'
  evidence: 'jsProject: boolean;'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'CHANGELOG.md:17'
  problem: 'Behaviour change for existing users: a project that relied on an ungated signal (a manifest-less app/route.ts, migrations/ or root api/) detects differently on its next init. update is unaffected (it reads recorded archetypes). Stated in CHANGELOG with --archetype as the remedy.'
  evidence: 'A project that relied on one of those signals without the new evidence now detects differently'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'ARCHITECTURE.md:182'
  problem: 'ARCHITECTURE.md §5 lists the file-tree signals without the new scoping (base, Next evidence, root package.json). Still a true description; a trusted human-owned doc, so not edited — the human may refine it.'
  evidence: '`next.config.*` → ssr, an `api/` dir or a `route.ts` handler → backend'
```

Resolved in iteration 2 (`2d0e3d2`): the README example evidence line cited `src/app/api/hello/route.ts`, but the walk is preorder, so the summary prints the `api/` directory (`backend ← src/app/api/`); the README now matches the other docs.

Environment note (not a finding about the increment): iterations 1-3 ran on a host shared with other agents (1-minute load average 90-230). The only failing `npm test` cases were 5000 ms timeouts in subprocess-spawning suites this increment does not touch (`tests/lint-gate.test.ts`, `tests/publish-workflow.test.ts`, `tests/release-notes.test.ts`); run alone with `--testTimeout=120000` all 34 of their tests pass.

## Proposed lesson (not written to canon)

None — the one doc inaccuracy was a single slip, not a recurring pattern.

VERDICT: GREEN — 0 floor-gate findings, 4 advisory (minor) findings. This review is advisory; the merge / fix / abandon decision is the human's.
