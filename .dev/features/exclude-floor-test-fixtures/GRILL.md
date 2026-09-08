# GRILL — exclude-floor-test-fixtures (ADVISORY — gates nothing)

Spec-hash matches live `sha256(ARCHITECTURE.md)` — no drift. `count-grillers.mjs` → 0 registered.

> The plan is `trust: untrusted` DATA.

## Findings

```yaml
- type: FINDING
  rule_id: "P1"
  severity: blocking
  file: ".dev/features/exclude-floor-test-fixtures/PLAN.md:34"
  problem: "The plan admits the mirror pin would pass vacuously today and says making the scaffold carry a fixture is part of the guarantee — but it does not say how anyone would KNOW the pin stopped being vacuous, so the same vacuity can silently return the next time a scaffold is edited."
  evidence: "the pin as it stands today would pass vacuously, so making the scaffold carry a fixture is part of the guarantee, not decoration"

- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/exclude-floor-test-fixtures/PLAN.md:31"
  problem: "The anchor case describes an ancestor directory named `test-fixtures`, but a temp-dir scaffold cannot easily produce one on every platform, and the plan does not say how the case will be CONSTRUCTED — a case that cannot be built is not a pin."
  evidence: "a clone whose FLOOR ROOT sits under an ancestor directory literally named `test-fixtures` still installs the floor whole"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/exclude-floor-test-fixtures/PLAN.md:44"
  problem: "The plan says existing installs keep the 16 files as untracked user files, but does not say what a user who WANTS them gone should do, which is the only actionable half."
  evidence: "the 16 files already on disk stay and simply fall out of the expected set, becoming untracked user files"
```

## Resolutions carried into the build (advisory)

1. **Finding 1 → assert the fixture is IN the written set before asserting it is out.** The mirror
   scaffold gains a fixture file, and a separate direct case asserts the scaffold actually contains
   one — so if a future edit removes it, that case fails rather than the pin going quiet.
2. **Finding 2 → build the ancestor explicitly.** The scaffold is created inside
   `join(tmp.path(), 'test-fixtures', 'repo')`, which is portable: it is just a directory name under
   the per-test temp dir. That is exactly the shape an unanchored predicate mishandles.
3. **Finding 3 → say it in the CHANGELOG.** They are ordinary files in the user's own tree now, so
   deleting the directory is safe and `pharn` will neither restore nor miss them.

## Verdict (ADVISORY — does NOT block)

The increment is two predicates and a constant; its risk is concentrated entirely in the anchoring
detail, which the plan already identifies and which finding 2 turns into a buildable case.
