# VERIFY — init-install-capabilities

- verdict source: `.dev/floor/check-verify.mjs` (deterministic exit-code threshold: PASS iff every gate 0)

## FLOOR layer — deterministic gates (own the verdict)

| gate         | exit | meaning                                             |
| ------------ | ---- | --------------------------------------------------- |
| test         | 0    | `npm test` — the hermetic vitest suite (452 passed) |
| typecheck    | 0    | `tsc --noEmit` (src + tests configs)                |
| lint         | 0    | `eslint src`                                        |
| format:check | 0    | prettier (whole-repo)                               |
| lint:md      | 0    | markdownlint (whole-repo)                           |
| validate     | 0    | `.dev/floor/validate.mjs .` (GREEN — 0 capabilities)|

**VERIFIED: floor gates PASS.** `failing_gates`: none.

The gate set is the repo's full `npm run check` aggregate (test + lint + typecheck + format:check) plus
`lint:md` + `validate.mjs`. No committed eval pairs exist in this repo → no `structural:*` gate.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0}` — **no verifiers registered — floor gates
only.** Step 2 is a no-op; the verdict is the floor gates alone.

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates
check — verifier concerns would be advisory help, not assurance (and none are registered). Specifically:
the deterministic suite exercises the parse/copy/resolve/config logic and the CLI flag dispatch, but the
**networked** path (`fetchRepo` degit clone + `fetchCommitSha`) is reused-as-is and not driven here, and
the correctness of pharn-oss's own capability content is out of scope (pharn-oss's SoT). The grill-stage
concerns (`GRILL.md`) — sibling-command behavior on an archetype config; re-install pruning — remain
advisory for the human at the post-review gate.
