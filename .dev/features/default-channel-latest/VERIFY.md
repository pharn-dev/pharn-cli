# VERIFY — default-channel-latest

Verdict (floor, `node .dev/floor/check-verify.mjs`, verbatim in `verify-report.json`): **PASS** — run after
build and again after the review's three minor fixes, both PASS.

| gate | exit |
| --- | --- |
| `test` (`npm test` — 102 files, 3245 passed, 1 skipped) | 0 |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 |
| `lint` | 0 |
| `format:check` | 0 |
| `lint:md` | 0 |
| `typecheck` (src + tests) | 0 |

- No `structural:*` gate: the increment ships no eval-actual pair (pharn's evals are its vitest tests).
- Verifiers: `count-verifiers.mjs` → `{"registered":0}` — no verifiers registered, floor gates only.

Advisory, outside the verdict — a live check against pharn-oss (2026-10-26) from source:
`init --dry-run --json` in an empty repo → `channel: "latest"`, `source: v7.1.3`, commit `35202ff8…`;
`init --yes` recorded `"ref": "latest"`; `status` and `status --no-drift` printed
`Channel latest — verified releases` and `(no newer verified release)`; an install made with
`--ref main` recorded no `ref`, and its `update --dry-run` printed the one-line notice and stayed on
`main (tip)`; a re-run `init --dry-run` over it printed `previously followed: main … pass --ref main to keep it`.

PASS means every gate above exits 0 with this change present. It does not mean the change is right; that
is `/pharn-dev-review`'s advisory read and the human's call.
