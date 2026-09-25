# VERIFY — models-pharn-oss-owned

**Iteration 2** (after the GATE 2 "fix" decision — see `SHIP.md`): re-run over the fixed tree.

The verdict below is computed by `.dev/floor/check-verify.mjs` from the gate exit codes; no verifier
judgment reaches it.

## Floor layer — gate exit codes

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

- `test` is the whole vitest suite with the feature in it: 69 files, 1818 passed, 1 skipped. It
  includes `tests/model-config-parity.test.ts`, which runs pharn-oss's own checker
  (`tests/fixtures/pharn-oss/check-model-config.mjs`, sha256-pinned to pharn-oss `767bf61`) over a
  93-case corpus and compares every verdict, RED line and resolution with this CLI's copy.
- `validate` is `FLOOR: GREEN` (no markdown capability was added, so it gates structure only).
- No committed eval pair ships with this feature, so there is no `structural:*` gate.
- Not in this map, measured separately during `/pharn-dev-build`: `npm run test:coverage` passes its
  ratchet (97.61 / 93.32 / 98.43 / 98.44 against 97 / 92 / 97 / 97), and `npm run build` succeeds.

**VERIFIED: floor gates PASS** (`verify-report.json` `.verdict` = `PASS`, `failing_gates: []`).

## Advisory layer — verifiers

No verifiers registered (`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`) — floor gates
only.

## Beyond the gates (advisory, recorded for the human)

A live run of the built CLI against pharn-oss `main` (`767bf61`, SKILLS_VERSION 6.22.0), in a scratch
project holding the default an earlier pharn wrote: `pharn status --no-drift` reported the old format;
`pharn update --yes` re-opened the same-version gate, replaced the block with pharn-oss's and recorded
it; the installed `pharn/floor/check-model-config.mjs` then printed GREEN for both `validate` (12
stages) and `agreement` (11/11 product stages agree with command frontmatter); a second `update`
answered "Already up to date". An edited old-format block was converted with its values kept and its
unconvertible `deploy` stage named. The migration was repeated on the fixed build (iteration 2):
`agreement` GREEN, then "Already up to date". This is a demonstration, not a gate.

---

Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance.
