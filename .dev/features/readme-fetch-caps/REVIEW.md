# REVIEW — readme-fetch-caps

Increment under review: `README.md:148-152` + one `CHANGELOG.md` entry. `git diff src/` is empty.

**Step 1 — floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities
checked in .`, exit **0**. The increment reached review with a green floor, so everything below is
**advisory** except where a finding is marked floor-gate.

---

## Findings

### L-floor → P0

The lens that matters most here, because this increment **is** a P0 correction. Checking whether it
committed the sin it repairs: every claim in the new text was traced back to a constant this run.

| new claim | reduces to |
| --- | --- |
| "Every `fetch` uses `redirect: 'error'`" | the literal at `repo.ts:185`, `repo.ts:228`, `skills-version.ts:212`, over a call-site set closed at three by `grep -rn "fetch(" src` |
| 8s / 256KB on the `SKILLS_VERSION` read | `skills-version.ts:29,30`, enforced by `AbortController` + a streamed running count |
| 8s / **no** body cap on the commit-SHA resolve | `repo.ts:10` + an unbounded `res.json()` at `repo.ts:236` |
| 60s / 32MB on the tarball | `repo.ts:13,18`, counted as the download streams (`repo.ts:198-207`) |
| 128MB decompressed / 20,000 entries | `repo.ts:19,20`, enforced at `tar-extract.ts:194,256,262` |

No claim is stated wider than its constant, and the sentence that previously generalized one fetch's
caps to all remote input is gone. **No L-floor finding against the numbers.**

One finding against a clause carried over unchanged:

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "README.md:148"
  problem: "The pre-existing clause 'contents copied from the clone are never executed or parsed by the CLI' is inaccurate in its second verb - parseCapabilityIndex parses the frontmatter of the very capability markdown files the install then copies - so the same sentence that this PR corrected for over-claiming still over-claims one clause to the left."
  evidence: "README.md:148 — 'contents copied from the clone are never executed or parsed by the CLI' vs src/lib/capability-index.ts:18-30 — 'This is the untrusted-frontmatter → typed CapabilityIndex boundary … it enumerates the griller + lens subtrees and derives one CapabilityEntry per capability from its markdown frontmatter'"
```

**Advisory-gate, and deliberately NOT fixed here.** The wording predates this increment; the diff moved
it without altering a word. Fixing it is a different claim about a different mechanism, and the brief
scoping this work said to touch nothing outside the finding — widening now would be the "fix every
instance" drift the plan explicitly refused (P7).

Worth stating precisely so the human can judge it rather than take my word: `parseCapabilityIndex` is
not a general YAML parser over untrusted bytes — it reads **only** `name` / `role` / `applies` through a
strict field reader and validates each against a regex/enum allowlist, which is exactly the P2 posture
the README is trying to convey. So the *security* posture is sound; it is the *sentence* that is wrong,
and wrong in the same direction as P-3: it claims an absolute ("never parsed") where the truth is a
bounded, validated, enumerated exception. `CLAUDE.md` already words it correctly — "file contents are
copied verbatim, never executed" — which is the accurate half without the false half.

### L-eval → P1

```text
no findings
```

The increment ships no eval, and the floor agrees rather than merely failing to object: `validate.mjs`
reports **0 capabilities checked**, so there is no Capability whose eval binding could be missing, and
no `enforces` rule_id needing a producing case. `git diff src/` is empty, so P1's trigger ("no behavior
ships without a test") never fires. Floor and lens concur — no disagreement to report.

The absence worth naming is not a P1 violation but a standing property: **no gate in this repo compares
doc prose to the `src/lib` constants.** That is the mechanism that allowed P-3, it is unchanged by this
PR, and `VERIFY.md` records it under the residual rather than leaving it implied.

### L-trust → P2

```text
no findings
```

The untrusted input to this increment was the **audit finding itself**, and it was handled as data: each
number it asserted was re-derived from source before use. That is not ceremony — it changed the output.
The finding said the README's claim was "true only of `skills-version.ts:29-30`", naming the tarball as
the sole counter-example. Re-deriving found a **second** one it missed: `fetchCommitSha` carries
`redirect: 'error'` + 8s but **no body cap at all**, so "a 256KB body cap" over-claimed there too. The
shipped README states that case explicitly. Had the finding been treated as instruction rather than
data, the README would have been "fixed" into a claim that was still false for one of three fetches.

Nothing instruction-shaped appeared in the reviewed diff, and I did not find myself steered by any
content in it. No free-text from the finding was copied into the README — the text is written from the
plan's discovery table. No guaranteed decision in this run rested on a tainted field: the proceed/stop
reads were `validate` exit 0, `check-regress` `no-regressions`, `check-verify` `PASS`.

### L-axis → P3

```text
no findings
```

`README.md` changes for one reason (user-facing documentation of the network floor); `CHANGELOG.md` for
one reason (recording that change). No sibling reference: the increment adds one repo-relative link to
`THREAT-MODEL.md`, a trusted root doc that `README.md` already sits alongside — not a reach into another
module's internals. No `src/` file was touched, so no import graph moved.

---

## Additional observations (advisory, no rule violated)

- **The `THREAT-MODEL.md` link is the load-bearing part of this fix, more than the numbers are.** It is
  what makes the README defer rather than compete, so a future maintainer changing `MAX_ARCHIVE_BYTES`
  has one canonical table to update and a README that points at it. Worth preserving through later
  edits.
- **The README is now the only doc that prints 32MB / 128MB / 20,000.** `THREAT-MODEL.md:145`
  deliberately describes those three by shape. Raised at grill (P4, important) and carried here
  unresolved by design: it is a trade between reader usefulness and drift surface, and it is the
  human's to make.
- **Two instances of this drift class remain standing in the repo** — `CONSTITUTION.md:64` (identical
  over-claim, in the document that outranks every other; agent-unfixable by construction, and P0 forbids
  auto-fixing it) and `docs/troubleshooting.md:124` (borderline). `SECURITY.md` is owned by a sibling
  branch, `docs/security-md-tarball-path`, confirmed live in `git worktree list`. This PR closes **one**
  instance, not the class.
- **`docs/contributing.md:94` and `CLAUDE.md` were checked and need no change** — both state the 8s /
  256KB pair but scope it to `lib/skills-version.ts` by name, which is true. They were candidates until
  read; recording that they were verified rather than skipped.

## Proposed lesson candidate (NOT written to canon — P2)

Proposed for `.dev/memory-bank/lessons-learned.md`, **for a human to accept or deny via a separate
`/pharn-dev-memory-promote` run.** `/pharn-dev-review` writes no canon.

> **A doc's security numbers are the claims most likely to outlive the code, because nothing tests
> prose.** Three of this repo's documents generalized one fetch's caps to every fetch, and the
> generalization survived a rewrite of the entire fetch layer (#146, which replaced degit and changed
> the tarball's timeout from none to 60s). When a doc states a floor constant, the reduction to check is
> not "is this number right" but "how many call sites does this sentence quantify over" — P-3 was an
> over-quantification, not a wrong number, and both remaining instances have the same shape.

Provenance: increment `readme-fetch-caps`; audit finding P-3 (MED, Dim G); `README.md:148`;
`CONSTITUTION.md:64`; `docs/troubleshooting.md:124`; base `377e1f5`.

Real, not hypothetical (P7): three live instances found this run, one fixed, two standing.

---

## Verdict

**GREEN — 0 floor-gate findings; 1 advisory finding (important) + 4 observations.**

The one advisory finding concerns a clause this increment carried over verbatim and did not introduce;
leaving it is the scope-correct call, and it is escalated rather than silently accepted.

**This verdict is ADVISORY.** The severities above are LLM-assigned (fix #3) and gate nothing. The
floor-grade facts in this run are exactly three: `validate.mjs` exit **0**, `regression-report.json`
`.verdict` = **`no-regressions`**, `verify-report.json` `.verdict` = **`PASS`**. "Reviewed GREEN" does
not mean the README's new sentences are true — no gate in this repo can check that. It means four lenses
found no rule violation in a change whose correctness rests on a source read and on human judgment.
