# VERIFY — manifest-filename-floor

- machine report: `.dev/features/manifest-filename-floor/verify-report.json`
- verdict (FLOOR, `.dev/floor/check-verify.mjs` exit 0): **PASS**

## FLOOR layer — the deterministic gates (these OWN the verdict)

| gate           | command                          | exit |
| -------------- | -------------------------------- | ---- |
| `test`         | `npx vitest run` (1012 tests)     | 0    |
| `validate`     | `node .dev/floor/validate.mjs .`  | 0    |
| `lint`         | `npm run lint`                    | 0    |
| `format:check` | `npm run format:check`            | 0    |
| `lint:md`      | `npm run lint:md`                 | 0    |
| `typecheck`    | `npm run typecheck`               | 0    |

No committed eval pair belongs to this feature, so no `structural:<expected>` gate is in the set.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers
registered; floor gates only.** Step 2 is a no-op in this state, and a verifier finding could never
have flipped the verdict anyway (fix #3).

## What this does and does not guarantee

Guaranteed: the six named gates passed, deterministically. **Not** guaranteed: that the filename
floor is the right trust posture, or that the two write paths agree on anything the gates do not
check. The new mirror cases exercise the agreement directly (both paths throw on the same clone), and
the update case was proven to FAIL without the source change — but "the gates passed" is the whole
claim this stage makes.
