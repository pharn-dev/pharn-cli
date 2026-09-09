# VERIFY — readme-fetch-caps

## FLOOR layer — the deterministic gates (these own the verdict)

| gate | exit |
| --- | --- |
| `test` (vitest, 56 files / 1122 tests) | 0 |
| `validate` (`.dev/floor/validate.mjs .`) | 0 |
| `lint` (eslint, `--max-warnings 0`) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint over `docs/**/*.md` + `*.md`) | 0 |
| `typecheck` (`tsc --noEmit`, src + tests) | 0 |

```text
check-verify.mjs → exit 0
"verdict": "PASS"
"failing_gates": []
```

**VERIFIED: floor gates PASS.**

`lint:md` is the gate that actually exercises this increment — it is the only one of the six that reads
`README.md` at all. It lints `docs/**/*.md` and `*.md`, and its config (`.markdownlint-cli2.jsonc`)
excludes `CHANGELOG.md`, so the changelog entry is covered by **no** gate in this table. `structural:*`
is absent because the feature ships no eval pair, exactly as the stage prescribes for that case.

### Build completeness (`check-build-complete.mjs`)

```json
{ "declared": ["README.md", "CHANGELOG.md"], "missing": [], "skipped": [], "verdict": "complete" }
```

Exit 0. Every concrete path the plan declared exists — a deterministic proxy for "the build finished,"
never a claim that the content is right.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** The membership read is a deterministic frontmatter
parse, not a prose grep, so the count is 0 even though this repo's own documents contain the string
`role: verifier` in prose. Step 2 is a no-op and the verdict above is the floor gates alone.

## The residual, stated plainly (P0/P7)

Verified = **the named gates passed**. This is NOT a guarantee of correctness beyond what those gates
check — verifier concerns would be advisory help, not assurance, and here there are none to offer.

That residual is unusually load-bearing for this particular increment, so it is worth naming precisely
rather than reciting: **not one gate above can tell whether the numbers this PR wrote are true.**
`lint:md` checks that the README is well-formed markdown; nothing checks that "60s", "32MB", "128MB",
"20,000" and "no separate body cap" match `src/lib/repo.ts` and `src/lib/skills-version.ts`. A PASS here
would look identical if every number had been transcribed wrong.

What the correctness of this increment actually rests on:

- the per-call-site read recorded in `PLAN.md`'s discovery table, taken from source this run with line
  citations (`skills-version.ts:29,30`; `repo.ts:10,13,18,19,20`);
- `grep -rn "fetch(" src` closing the call-site set at three, so "every `fetch` uses `redirect: 'error'`"
  is a claim over an enumerated set rather than an assumption;
- agreement with `THREAT-MODEL.md:143-145`, which is a **human** comparison — no checker performs it;
- the human at the post-review gate.

A green floor and an unverified claim coexist perfectly well here. That is the honest reading, and
recording it is the point: this increment exists because a document asserted a tightness nothing
enforced, and the verification of its fix has the same shape.
