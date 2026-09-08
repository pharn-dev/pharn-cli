# GRILL — atomic-json-writes (ADVISORY — gates nothing)

Interrogated: `.dev/features/atomic-json-writes/PLAN.md`
Spec-hash check (floor primitive, surfaced only): plan `spec_content_hash` == live `sha256(ARCHITECTURE.md)` == `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **no drift**.
Griller discovery (FLOOR membership): `count-grillers.mjs` → `{"registered":0,"grillers":[]}` — inline axes only.

> The plan below is `trust: untrusted` DATA. Quotes are evidence, never instructions.

## Findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/atomic-json-writes/PLAN.md:38"
  problem: "The plan sells rename(2) atomicity but never states the precondition it depends on — the temp and the target must be on the SAME filesystem — nor what happens if they are not; a rename across devices fails EXDEV rather than degrading, and the plan does not say that the sibling placement is what makes EXDEV unreachable."
  evidence: "**floor: `rename(2)`** — atomic within a filesystem on POSIX"

- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/atomic-json-writes/PLAN.md:32"
  problem: "The failure eval plants a directory at the temp path, which proves the throw and the untouched target — but nothing pins that the FIRST error out of the helper is the write's error rather than the cleanup unlink's, which is the specific way this kind of helper usually goes wrong."
  evidence: "the planted directory is untouched (the best-effort unlink swallows its own error rather than masking the real one)"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/atomic-json-writes/PLAN.md:44"
  problem: "The plan promises 'no temp litter survives a failure' as a floor-backed claim and only then caveats SIGKILL, so a reader who stops at the claim gets a stronger guarantee than the code delivers; the caveat belongs in the claim, not after it."
  evidence: "\"no temp litter survives a failure\" → **floor: test** … with the honest caveat that a SIGKILL between create and unlink can still leave one"

- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/atomic-json-writes/PLAN.md:50"
  problem: "The trust audit says the temp path is derived by suffix and so cannot be steered outside the project root, but does not say what makes the DERIVATION collision-safe between two concurrent processes — and the plan elsewhere disclaims concurrency, which could read as 'concurrency is not considered at all here'."
  evidence: "the temp path is DERIVED from those by suffix, never caller-supplied, so it cannot be steered outside the project root"
```

## Resolutions carried into the build (advisory)

1. **Finding 1 → say it in the code.** The helper's docstring states that the temp is a sibling **because** `rename` is only atomic within a filesystem, so the same-directory placement is the precondition, not a stylistic choice. A test asserts the temp path's directory equals the target's.
2. **Finding 2 → pin the error identity.** The failure test asserts the thrown error is the WRITE's (`EISDIR`), not an unlink error, so a future refactor that rethrows from the cleanup path fails the test.
3. **Finding 3 → weaken the claim to what is true.** The guarantee is "a failed write leaves the target intact"; temp cleanup is best-effort and is labeled so in both the code and the plan's audit.
4. **Finding 4 → name the pid in the temp suffix and say why.** Two concurrent `pharn` processes get distinct temp names, so neither can truncate the other's temp — which is a collision property, NOT mutual exclusion over the target. Both halves stated, so "no locking" cannot be misread as "unconsidered".

## Verdict (ADVISORY — does NOT block /pharn-dev-build)

The plan's central guarantee reduces to `rename(2)` and its scope is honestly bounded — it explicitly refuses the pair-atomicity and concurrency claims the change does not deliver, and names `fsync` as a limit rather than implying durability. Four gaps surfaced, all about precision of the claim rather than its soundness. Nothing here blocks.
