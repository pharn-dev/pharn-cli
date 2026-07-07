# VERIFY — missing-timeout lens increment

Did the feature get built **correctly** — is the whole repo (with this increment in it) green on the
deterministic gates?

## FLOOR layer — deterministic gates (own the verdict)

| gate           | exit | what it checks                                                              |
| -------------- | ---- | --------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — the hermetic suite incl. this feature's own scanner test (18)  |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — the structural floor, GREEN (33 capabilities) |
| `lint`         | 0    | `npm run lint` — eslint clean                                               |
| `format:check` | 0    | `npm run format:check` — prettier clean (whole-repo)                        |
| `lint:md`      | 0    | `npm run lint:md` — markdownlint clean (whole-repo)                         |

No `structural:*` gate: the feature ships eval `expected/*.json` but no committed actual `findings.json`
(the live lens runner is deferred, P7), so — exactly as the sibling `off-by-one` — there is no
`structural:*` gate at verify. The feature's deterministic correctness is carried by `test` (the
scanner's 18 hermetic assertions, incl. ★ injection-immunity) and `validate` (frontmatter, evals
present, `enforces: [P2]` eval-bound — fix #6).

> **Build-completion note (honesty, L9).** The first gate run read `format:check`=1 and `lint:md`=1:
> this increment's own new files were not prettier/markdownlint-clean (the build's `validate`-only gate
> does not cover repo style — the exact hole L9 says verify closes). Fixes applied **within the
> feature's own files**: `npx prettier --write` (quote-style + the REGRESSION table, MD060) and one prose
> reword in `missing-timeout.md` (a line that began with `+` followed by a space, misread as a list — MD004/MD032). The
> scanner was **re-run over all six fixtures after formatting** — counts and lines are unchanged
> (`fetch`@14, `db.query`@12, four clean), because the scanner masks both quote styles. The exit codes
> above are the post-fix state; `check-verify.mjs` read this map.

## ADVISORY layer — verifiers

`count-verifiers.mjs .` → `{"registered":0}` — **no verifiers registered; floor gates only.** Step 2 is
a no-op (membership → ∅); no verifier is authored speculatively (P7). No advisory free-text is produced,
so nothing untrusted enters this report.

## Verdict (deterministic — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS** — every named gate exited 0.

Honest residual (P0/P7): _verified = the named gates passed; this is **NOT** a guarantee of correctness
beyond what those gates check._ The lens's LLM behavior (does it emit the right finding on a live,
never-seen file?) is **not** gated here — the live lens runner is deferred (P7); what is pinned is the
deterministic scanner (18 tests), the structural floor (`validate`), repo style, and the eval
`expected/*.json` (proven satisfiable at build via `check-structural`). Verifier concerns would be
advisory help, not assurance — and there are none registered.
