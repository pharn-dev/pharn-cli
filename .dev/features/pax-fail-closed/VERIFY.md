# VERIFY — pax-fail-closed

## FLOOR layer — the deterministic gates (these own the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`structural:*`: **none** — this feature ships no committed eval pair, and this repo commits none
(`git ls-files '*/evals/expected/*.json'` is empty), so no such gate is in the map. Absent, not
skipped-and-hidden.

**VERIFIED: floor gates PASS** — `check-verify.mjs` exit 0, `failing_gates: []`.

## What the feature's own tests actually demonstrate

`npm test` collected 56 files / 1,139 tests. The 12 assertions this increment adds are inside
`tests/tar-extract.test.ts`, and they were checked for **teeth** rather than assumed to have them:
run unchanged against the pre-change `src/lib/tar-extract.ts`, **all 12 fail** and the 27
pre-existing assertions in that file still pass. A test that passes both before and after would
have proved nothing; these do not.

The before/after was also demonstrated end-to-end on the concrete defect, outside the suite:

- **before** — an archive whose `x` header carries `path=…/<144-char name>` followed by a ustar
  header truncated to 100 characters extracted with **no throw**, writing `deep/<100 z>`;
- **after** — the same bytes throw
  `tar archive contains a pax extended header (typeflag 'x'), which pharn does not support — its
records override the next entry's path and size: records path.`

Coverage (the CI ratchet, run separately since `npm run check` excludes it): statements 97.02,
branches 92.39, functions 97.58, lines 97.96 — above the 97 / 92 / 97 / 97 floors, exit 0.
`src/lib/tar-extract.ts` sits at 95.74 statements / 92.22 branches.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; nothing annotates this report and
nothing could have flipped the verdict even if it had.

## Residual (named, not hidden)

Verified = **the named gates passed**; this is NOT a guarantee of correctness beyond what those gates
check. Two limits are worth stating for this increment specifically:

1. The gates prove the reader now **refuses** the pax shapes fixtured here. They cannot prove the
   refusal set is **complete** for a writer nobody has run — the argument that `git archive` emits
   `x` only for `path`/`linkpath`/`size` is grounded in a measurement of one archive at one commit
   (zero `x` headers in 1,968 entries) and is **advisory**, recorded as such in `PLAN.md`'s guarantee
   audit.
2. Conversely, if upstream ever legitimately starts emitting `x`, these gates will not warn — the
   product will simply refuse to install, loudly and by design. That is the intended failure
   direction, not an untested one.

Verifier concerns would be advisory help, not assurance; there are none to weigh here.

## Second amendment — `SECURITY.md` joined the increment, and the untested arm was closed

Two changes were made after the first review, on human direction, and every gate above was re-run
against them:

1. **`SECURITY.md`'s `tar-extract.ts` bullet now describes the parser this increment ships.** The
   sentence on `main` was _correct about the old code_, so landing the fix alone would have left a
   disclosure policy misdescribing its own reader for the length of the gap — the shape of the
   already-closed finding P-2. It was added to `PLAN.md`'s `## Files` and the writes-scope re-set
   from the amended plan, so fix #7 gated the write rather than being bypassed.
2. **The `(+N more)` keyword-elision arm now has a test**, closing the `P1` minor finding recorded
   below. It was checked for teeth the same way as the rest: with the cap removed from
   `describeKeywords`, exactly that one test fails (1 failed / 39 passed); with it restored, 40 pass.
   Branch coverage on `src/lib/tar-extract.ts` moves **92.22 → 93.33** accordingly, and the file's
   uncovered lines are still only the three pre-existing ones (120, 238, 253).

Suite after both: 56 files / **1,195** tests. Coverage 97.22 / **92.82** / 97.66 / 98.16, exit 0.

## Re-run after the rebase (the numbers above describe the shipped commit)

`main` moved by eight merged PRs while this increment was in flight, one of them a **major bump of
the test runner** (`vitest` 4.1.11 -> 5.0.0, #166). Every gate above was therefore re-run against the
rebased tree with the new lockfile installed: all six still exit 0, `check-verify.mjs` still returns
`PASS` with `failing_gates: []`, and the suite is 56 files / **1,187** tests (it was 1,139 before the
rebase; the merged PRs supplied the difference). Coverage re-measured at 97.22 / 92.73 / 97.66 /
98.16, above the 97 / 92 / 97 / 97 ratchets, exit 0.

**One transient red is recorded rather than buried.** During the first post-rebase gate capture,
`npm test` exited 1 once. Its output had been sent to `/dev/null` by the capture command, so the
failing test name was not preserved and the red is **not attributable** beyond that. It did not
recur: six consecutive full-suite runs since then are clean, including two under twelve deliberately
spawned CPU-saturating processes. It is consistent with the repo's known `tests/lint-gate.test.ts`
5,000 ms timeout flake — which was observed directly earlier in this same session, timing out twice
under a concurrent coverage run and then passing 7/7 in 8.06 s standalone — but consistency is not
attribution, and it is reported here as unresolved rather than explained away. The results map was
re-captured from a genuine gate run; **it was not edited to reach PASS.**
