# VERIFY — core-179-trim-docs

| Gate         | Exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |
| line-caps    | 0    |
| anchors      | 0    |
| srcnames     | 0    |

The `test` gate is the full vitest suite, run with `--maxWorkers=2` through heavy.sh (105 files, 3596 passed, 1 skipped). Three gates are specific to this feature:

- `line-caps`: update.md ≤ 350, troubleshooting.md ≤ 450, README.md ≤ 250 (`wc -l`).
- `anchors`: `check-anchors.mjs` finds exactly one broken link, the pre-existing `CHANGELOG.md` → `support-policy.md#the-flat-layout-is-deprecated`.
- `srcnames`: `srcnames-grep.sh` finds no src path, src link or exported function/const name. The only hits are user-project example paths (`src/app.ts`) and the shipped bin (`dist/index.js`).

VERIFIED: floor gates PASS (verdict `PASS`, from `check-verify.mjs`).

Verifiers: none registered, so only the floor gates ran.

Verified means the named gates passed. This is NOT a guarantee of correctness beyond what those gates check; the "no content lost" claim is advisory and rests on the ledger and the review.
