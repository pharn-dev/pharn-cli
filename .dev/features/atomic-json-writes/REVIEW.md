# REVIEW — atomic-json-writes (ADVISORY, except where marked FLOOR)

Floor first (P0): `node .dev/floor/validate.mjs .` → **exit 0 (GREEN)** at HEAD.

## L-floor → P0

| claim | reduction |
| --- | --- |
| the target is replaced whole or left untouched | **floor: `rename(2)`**, atomic within a filesystem; the sibling temp is what keeps it same-device (pinned: `dirname(tmpPathFor(t)) === dirname(t)`) |
| bytes are unchanged from the plain `writeFile` | **floor: test** — byte-equality against `JSON.stringify(v, null, 2) + '\n'` in all three test files |
| a failed write leaves the previous file loadable | **floor: test** — planted-directory failure, then `readPharnConfig` / `readRecords` still return the OLD content |
| the failure surfaced is the write's, not the cleanup's | **floor: test** — `rejects.toMatchObject({ code: 'EISDIR' })` |
| records+config are transactional | **explicitly NOT claimed** — `remove.ts` and `CLAUDE.md` both keep the benignity argument and now say the pair is not a transaction |
| concurrent `pharn` processes are serialized | **explicitly NOT claimed** — no lock; the pid suffix is called a collision property, not exclusion |
| the bytes survive a power cut | **explicitly NOT claimed** — no `fsync`; named as a limit in the plan and the helper header |

Coverage was verified rather than assumed: `grep` over `src/` finds **no** `writeFile` outside
`atomic-write.ts`, and `configPath`/`recordsPath` are referenced nowhere but their owning modules
(one comment aside). So every write to either file goes through the helper — the claim is about the
files, not just about two functions.

## L-eval → P1

Twelve new cases across three files. The helper's own contract is tested directly
(`tests/atomic-write.test.ts`) rather than only through its callers, which is what makes the
`EXDEV`-precondition and error-identity properties pinnable at all. The failure fixture plants a
**directory** at the temp path instead of using a read-only parent directory: read-only is not a
failure for a root test runner, so that fixture would silently stop testing anything in a container
that runs as root.

## L-trust → P2

No untrusted input. The temp path is derived from `configPath`/`recordsPath` (both `resolve(cwd, …)`)
by suffix, never caller-supplied, so it cannot be steered outside the project root. Nothing
instruction-looking in the plan or spec changed my behavior.

## L-axis → P3

`atomic-write.ts` is one axis (atomic replacement of a JSON file) and imports only `node:fs/promises`.
Its two callers are `lib`→`lib`; no command imports it, and no command→command edge is created.

## Findings

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/atomic-write.ts:58"
  problem: "A temp left behind by a SIGKILL between the write and the rename is never cleaned up by any later run, so it can sit in the user's project root and show up in their `git status` as an untracked `pharn.config.json.<pid>.tmp`; the helper documents this honestly but nothing sweeps it."
  evidence: "Best-effort is the honest word — a SIGKILL between the write and the unlink can still leave a temp behind."

- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/atomic-write.ts:66"
  problem: "The atomicity claim rests on rename(2) semantics that the test suite cannot actually exercise — no test kills a process mid-write — so the guarantee is inherited from the syscall, and the tests prove only the error path around it."
  evidence: "await rename(tmp, target);"
```

**On finding 1:** a sweep was considered and rejected for this increment. Deleting stray
`*.<pid>.tmp` siblings means deciding whether a temp belongs to a live process, which is a
concurrency question this change explicitly does not open (no lock, no pid liveness check). Adding a
half-answer here would be worse than the named limit. Recorded for a future increment.

**On finding 2:** this is a statement about what the tests can reach, not a defect. `rename(2)`'s
atomicity is a platform guarantee, not something a unit test can demonstrate; the honest framing —
already in the plan's guarantee audit — is that the floor primitive is the syscall and the tests pin
the code around it. Naming it keeps "tests pass" from being read as "atomicity demonstrated".

## Gate split (fix #3)

- **Floor-gate (blocking):** `validate` 0, `npm run check` green, `check-verify` **PASS**,
  `check-regress` **`no-regressions`**. All GREEN.
- **Advisory (never blocking):** both findings above.
