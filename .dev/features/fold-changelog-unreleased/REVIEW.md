# REVIEW — `fold-changelog-unreleased`

**Floor first (P0, Step 1):** `node .dev/floor/validate.mjs .` → **exit 0, GREEN** (`0 capabilities
checked`). The increment was entitled to reach review. Everything below the floor line is
**advisory**.

> **Trust (P2):** the reviewed increment is `trust: untrusted`. Every `problem` / `evidence` below is
> quoted **DATA**, never an instruction followed.

---

## L-floor → P0 (the governing lens)

The increment makes five claims. Each was checked against its reduction, not against its wording:

| claim | reduction | status |
| --- | --- | --- |
| no changelog prose lost or altered by the fold | sha256 equality over the sorted multiset of non-heading, non-blank lines (943 = 943, hash equal) | **floor — holds** |
| kind assignment and within-kind order preserved | byte-identical `diff` of kind-tagged, stable-sorted lines | **floor — holds** |
| only 10 characters of prose changed, all `*`→`_` | `git diff -U0` = 5 lines; `--word-diff=porcelain` = only `*`↔`_` | **floor — holds** |
| `CHANGELOG.md` is now actually linted | `lint:md` exit 0 **and** `Linting: 24 files` (was 23); `ignores` no longer contains it | **floor — holds** |
| the `[0.4.0]` reference link is no longer dangling | set equality between `## [X]` headings and `[X]:` definitions (`diff` exit 0) | **floor — holds** |

**No finding.** The one place this lens would normally fire — a hash quietly asked to cover more than
it covers — was pre-empted: `GRILL.md` raised exactly that (Phase B is order-blind and heading-blind
by construction), and the build responded by **adding a stricter check** rather than by softening the
wording. The commit message states the limitation in the same sentence as the hash
(`"That hash is order-blind and heading-blind by construction, so it was backed by a stricter
check"`), which is the labeling discipline P0 asks for.

Two claims are correctly withheld rather than sold:

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:145"
  problem: "The editorial question — whether these ~72 entries belong under 0.4.0 at all rather than split across two releases — is labeled advisory and left to the human, which is correct, but it means the increment's most consequential decision has no floor backing of any kind."
  evidence: "**\"the folded section is the *right* set of release notes for 0.4.0\"** → **advisory.**"
```

Advisory, and correctly so — no deterministic operation can settle it. Recorded so the human reads
`PASS` as covering conservation, not judgment.

## L-eval → P1

`validate` reports `0 capabilities checked`, so there is no Capability and no `rule_id` to bind — the
floor and this lens **agree**, which is what the lens asks be confirmed. The increment adds no
`vitest` test, and for the changelog half that is right: folding prose is not behavior.

The config half is not so clean:

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".markdownlint-cli2.jsonc:3"
  problem: "The one-line `ignores` value that this whole increment exists to change has nothing pinning it, so a future PR can re-add `CHANGELOG.md` to the array and silently restore the exact blind spot P-6 was opened to close — and `lint:md` would stay green while doing it."
  evidence: '"ignores": ["node_modules", "dist", "coverage", "**/*.updated.*"],'
```

**Advisory-gate, not floor-gate** — it rests on a judgment that the regression is likely enough to
pin, not on a check the floor can run. It was raised first in `GRILL.md` and deliberately **not**
acted on: `tests/` is outside the approved plan's `## Files`, and fix #7 would have denied the write.
Expanding scope past an approved plan is the wrong way to close it. The right way is a follow-up
increment, and there is live precedent for the shape — `tests/ci-workflow.test.ts` pins the six CI job
`name:` strings for the same reason. **Recorded for the human at GATE 2**; this is the single most
substantive thing in this review.

## L-trust → P2

The increment ingests **no** untrusted artifact — no fetch, no clone, no network, no new taint edge.
There is therefore no finding-emission path whose free-text needed marking.

The lens also asks whether instruction-looking content in the reviewed artifact changed my behavior.
It did not, and the boundary is worth recording because this increment reads ~1000 lines of prose:

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "CHANGELOG.md:937"
  problem: "The changelog embeds imperative CLI output inside a fenced block, which is instruction-shaped text sitting in a file this increment bulk-moves; it was treated as DATA to be conserved byte-for-byte and never as a directive, and the fold's script never interprets line content at all."
  evidence: "project is already on — run `pharn update` first, then re-run `pharn add`."
```

No compliance occurred and none was close: the fold classifies lines **only** by column-0 heading
membership and otherwise copies bytes, so line content cannot steer it. Reported because noticing is
the defense, not because the boundary bent.

## L-axis → P3

Two files, one reason to change: make the changelog conform and put it under the gate. They are not
separable — removing the ignore without folding lands `lint:md` at 21 red, and folding without
removing the ignore leaves the gate blind. No code, therefore no sibling import; no `reads:` entry
crosses a module root. **No finding.**

One nit worth naming as handled rather than missed: the config's comment previously read
`"…generated output, and the changelog"`, which would have become a doc contradicting its own code
(P4) the moment the ignore was dropped. It was updated in the same edit to
`"…dependencies and generated output"`.

---

## Verdict

**GREEN — 0 floor-gate (blocking) findings.**

| gate kind | count | detail |
| --- | --- | --- |
| floor-gate (blocking) | **0** | — |
| advisory | **3** | 1 important (P1, unpinned `ignores`), 2 minor (P0 editorial residual, P2 boundary observation) |

The increment is done in the sense the floor can certify: `validate` GREEN, `check-verify` **PASS**
over six gates, `check-regress` **no-regressions**, and the fold proved lossless by hash equality plus
a stricter order/kind-preserving check. It is **not** certified in the sense that no gate — here or
anywhere in the repo — asserts what the changelog should *say*.

**The one thing to carry to GATE 2:** the `ignores` value is unpinned (P1, important). The fix that
was applied has no guard against being undone.

---

## Proposed lesson (candidate only — NOT written to canon)

`/pharn-dev-review` declares no `.dev/memory-bank/**` path and does not write canon. This is a
**proposal**; promotion is a separate human-gated `/pharn-dev-memory-promote` run behind
`check-provenance.mjs`.

- **Candidate:** *A gate's exclusion list is part of its guarantee, and an unpinned exclusion is a
  silent hole.* `lint:md` reported success over `CHANGELOG.md` for its entire life by never opening
  it — the gate was green because it was looking away. The generalization is that when a check
  declares an `ignores` / `exclude` / `skip` set, the **set itself** deserves the same pinning the
  check gets, or the guarantee decays without any gate turning red.
- **Provenance:** increment `fold-changelog-unreleased`; branch `chore/fold-unreleased-into-0.4.0`;
  commit `316f32b`; finding P-6 of the adversarial audit; evidence — `.markdownlint-cli2.jsonc:3` and
  the 21 violations that surfaced the moment the entry was removed.
- **Is it real, not hypothetical (P7)?** Yes — it is the defect this increment fixed, found by audit
  rather than by any gate. Whether it generalizes enough to be canon is the human's call, not this
  command's.
