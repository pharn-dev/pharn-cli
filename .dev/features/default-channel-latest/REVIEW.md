# REVIEW — default-channel-latest

Floor first (P0): `npm run check` GREEN and `node .dev/floor/validate.mjs .` exit 0 (`/pharn-dev-build`);
`/pharn-dev-regress` → `no-regressions`; `/pharn-dev-verify` → `PASS`. Every finding below is ADVISORY
(LLM-assigned severity, fix #3); none is a floor gate.

Reviewed: `git diff origin/main` over `src/`, `tests/`, the docs, and the `LIMITS.updated.md` draft.

## Findings

### L-axis → P3

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/commands/status.ts:343"
  problem: "The new `latestWithoutClone` and `channelRow` were inserted between the existing `// VERSION note …` comment block and `printArchetypeVersion`, so that comment now documents the wrong function."
  evidence: "// `pharn update` refuses that downgrade without `--force`, so `--strict` must ... async function latestWithoutClone("
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/init-plan.ts:448"
  problem: "`previousChannelLines` sits between `buildInitPlan`'s JSDoc and `buildInitPlan`, so the build-plan doc block now attaches to the wrong export (and two JSDoc blocks are stacked)."
  evidence: "* (ManifestValidationError from the pre-flight, a bad SKILLS_VERSION). */ /** The summary lines a RE-RUN init prints"
```

### L-eval → P1 / documentation discipline

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "docs/reference/pharn-config.md:23"
  problem: "The `ref` row still describes `\"latest\"` as the `--ref latest` opt-in only; since this change it is also what a plain `pharn init` writes, and absent also covers installs made before `--ref` existed."
  evidence: "`\"latest\"` to follow verified releases (`--ref latest`); absent → the tip of main"
```

### L-floor → P0

No finding. Each guarantee the plan claims is backed by a test that fails without the change: the default
(`tests/init.test.ts`, integration `init with no --ref …`), the fail-closed refusal on the default path with
no tarball request (`tests/init.test.ts`, integration `… no release refuses …`), `main`/unrecorded installs
not switched and told once (`tests/update.test.ts` counts the notice across the real run, the early return,
`--dry-run`, `--json`, `--ref`, and `latest`), and the one-GET `--no-drift` (`tests/status*.test.ts`,
`tests/release.test.ts` asserts the single URL). "Verified" stays pharn-oss's promise and is labelled so in
the docs and `LIMITS.updated.md`.

### L-trust → P2

No finding. The only new remote value is the release tag, which `resolveLatestReleaseVersion` holds to
`RELEASE_TAG_RE` before it is returned or displayed (same code path as before, now shared). The replaced
config's `skillsVersion` in the re-run line is `VERSION_RE`-validated at load and printed through
`terminalSafe`. No free text reaches a decision.

## Observations (not findings)

- The CI rate-limit cost of a fail-closed default (grill finding 1) is now named in
  `docs/troubleshooting.md`, the CHANGELOG and `LIMITS.updated.md` §3b. There is no code mitigation (no
  token support, by design).
- `status`'s main-channel hint (`pharn update --ref latest` follows verified releases) is shown even when the
  install is ahead of the newest release, where that switch would be refused as a downgrade; the ahead note
  on the same line already says so. Left as is.

ADVISORY: 3 minor findings (0 blocking, 0 important). The decision is the human's at GATE 2.
