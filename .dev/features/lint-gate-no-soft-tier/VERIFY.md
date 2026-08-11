# VERIFY — lint-gate-no-soft-tier

## FLOOR layer — the deterministic gates (this layer OWNS the verdict)

Run over the repo with the feature present, at HEAD (no worktree, so the style gates are cheap). Exit
codes only — no stdout free-text reaches the verdict.

| gate | exit | meaning |
| --- | --- | --- |
| `test` | 0 | `vitest run` — 40 files, 643 tests, including the feature's own `tests/lint-gate.test.ts` |
| `validate` | 0 | `.dev/floor/validate.mjs .` — structural floor GREEN (0 capabilities; vacuously green here) |
| `lint` | 0 | `eslint src tests scripts --max-warnings 0` — the gate this increment hardened, over its own new scope |
| `format:check` | 0 | prettier clean, whole-repo |
| `lint:md` | 0 | markdownlint clean, whole-repo (L9's style-gate coverage, tracked at verify) |

**`structural:*` gates: none.** This feature ships no committed eval pair (`<cap>/evals/expected/*.json`
↔ an actual `findings.json`), so by the same convention `/pharn-dev-regress` uses, no `structural:*` gate
exists in the map — it is absent, not silently passed.

Note the `lint` gate is doing double duty here and it is worth being explicit about it: it is both a
generic repo gate AND the artifact under test. Its exit 0 means the hardened gate is green over the
wider surface it now covers — it does **not**, by itself, demonstrate that the gate would go red when it
should. That demonstration is inside the `test` gate, in `tests/lint-gate.test.ts`, which lints planted
offences through the repo's own config via `--stdin` and asserts exit 1 on each of `src/*.ts`,
`tests/*.ts`, and `scripts/*.mjs` — plus exit 1 for `__dirname`/`require` in an ESM `.mjs`, which is what
distinguishes the chosen `globals.nodeBuiltin` from the weaker `globals.node`.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone.
No verifier free-text was produced, so no untrusted `problem` / `evidence` entered this report.

## Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS** — every gate in the map exited 0, `failing_gates[]` empty.

**Honest residual (P0/P7):** verified = **the named gates passed**. This is **NOT** a guarantee of
correctness beyond what those gates check — a defect that no test, eval, rule, or lint covers is
invisible to this verdict, and the verifier layer that might have noticed it is advisory and, today,
empty. Verifier concerns are advisory help, not assurance. In particular this stage says nothing about
whether the *unlinted* surfaces named in the plan (`eslint.config.mjs`, `vitest.config.ts`,
`.dev/floor/`, `.claude/hooks/`) should have been included — that is a scope judgment for the human, not
a gate.
