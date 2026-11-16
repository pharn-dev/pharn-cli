# GRILL — core-164-init-carry-over

Plan: `.dev/features/core-164-init-carry-over/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`), so this log covers the inline axes only.

## Findings

### Honest scope / P7

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/core-164-init-carry-over/PLAN.md:47'
  problem: 'After the relaxed guard, `add`/`update`/`remove` load a config without `modules` and write it back the same way (spread), so a pinned older CLI (0.3.0–0.19.x) still reads that file as absent; the plan only keeps init writing `modules: []` and does not say what the docs promise about the other writers.'
  evidence: 'Legacy fields: `modules` is no longer load-bearing for an archetype config (a config with `capabilities` loads without it) but stays required for a pre-archetype one and is still written for older CLIs'
```

Suggested resolution (advisory): keep the writers unchanged (the ticket scopes the write to `init`; restoring the key from `update` would also flip CORE-162's `changesNothing` for such configs). In `docs/reference/pharn-config.md`, state it: `init` writes `modules: []`, and the other commands leave the file as they found it, so re-add `"modules": []` if an older CLI must read it.

### Determinism / P5

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/core-164-init-carry-over/PLAN.md:27'
  problem: "`firstSentence` cuts at the first unquoted `. `; `ConfigParseError`'s message starts with an unquoted, escaped project path, so a directory name containing `. ` cuts the reason before 'is not valid JSON'."
  evidence: 'on a throw, `unreadable = terminalSafe(escapeUnsafe(firstSentence(errorMessage(err))), {max: 200})`'
```

Display-only, and it never drives a branch, so the impact is a shorter reason. Suggested: accept it and add a code comment. Do not special-case per error class.

### Eval coverage / P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/core-164-init-carry-over/PLAN.md:39'
  problem: "Case 3 asserts 'printed before the select prompt' by mock call order, but the line must ALSO precede the overwrite prompt (`confirmWriteTargets`) and the --yes refusal. Only the summary note is named, and nothing pins that the overwrite prompt still lists `pharn.config.json` (default No) for this config."
  evidence: 'the summary `note` contains the `could not be read (…)` line, and it is printed before the `select` prompt (call order).'
```

Suggested: in case 3, also assert that `prompts.confirm` was called after the note, and that its message lists `pharn.config.json`. In case 4, assert that the note precedes the `ProcessExit`.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-164-init-carry-over/PLAN.md:37'
  problem: 'Cases 1–2 need the no-`modules` config to actually lack the key on disk at the second run; the first `init` writes `modules: []`, so the test must delete it by a raw JSON edit (not through writePharnConfig of a typed object that may reintroduce it).'
  evidence: "no `modules` + `n-plus-one` hand-marked `source: 'manual'` + upstream narrows it"
```

### Trust / P2

No findings. The reason comes either from fixed text or from a named error's message. Both kinds of message already escape offenders, the reason is escaped again and capped, and it never drives a branch.

### One axis / P3

No findings. `previousConfigLines` sits beside `previousChannelLines` in `lib/init-plan.ts` (the same reason to change: what the replaced config means to a re-run). `pharn-config.ts` changes only the guard. The `readPreviousConfig` unit tests sit in `tests/archetype-summary.test.ts`, next to the existing `previousChannelLines` tests, which is acceptable.

### Scope note (question for the human, not a finding)

`docs/troubleshooting.md:706` says a config that exists but is broken "never produces" the run-init message. That was already untrue for a wrong-shape file (e.g. a missing `skillsVersion`), and it stays untrue for the shapes the guard still rejects. It is outside the plan's `## Files`, so it is left as is unless the human widens the scope.

## Summary

The plan is small and matches the ticket. The guard change is a pure widening, with one newly throwing shape (F-30 holds without `modules`). The init line is display-only, and the fingerprint-first discipline is untouched. Main concerns:

- **Ordering pins.** The tests should prove the line precedes BOTH prompts and the `--yes` refusal, not only the summary prompt.
- **Older CLIs.** The docs should say honestly that only `init` restores `modules`.

The remaining finding is the first-sentence cut on an odd path, which is cosmetic.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh before /pharn-dev-build. This log gates nothing.
