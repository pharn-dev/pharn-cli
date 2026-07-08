# REVIEW — fresh-check-git-rce

Reviewing the increment `/pharn-dev-build` produced (working tree vs `c44170e`). The increment is
`trust: untrusted`; free-text below quotes it as DATA (P2). **Floor first (P0):**
`node .dev/floor/validate.mjs .` = exit 0 (GREEN) — the increment legitimately reached review.

## Floor-gate findings (blocking)

**None.** No guarantee is sold without a floor reduction (L-floor); no eval binding is missing
(L-eval); no tainted field gates a decision (L-trust); no sibling import (L-axis).

## Advisory findings (inform; never a blocking basis — fix #3)

### L-floor → P0

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/steps/fresh-check.ts:62"
  problem: "The 'every git call is hardened' invariant is a convention (one shared helper + one demonstrating test over THIS file), not a standing floor gate — a future un-hardened execSync('git …') added elsewhere in the CLI would not be caught by any floor or lint."
  evidence: "return execFileSync('git', [...GIT_HARDENING, ...args], {"
```

Honest and correctly bounded in the code and plan (the guarantee rests on the P1 test, which covers
`fresh-check.ts`'s own calls). This finding only records that the *repo-wide* version of the invariant
is unenforced — acceptable for this increment; see the proposed lesson.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/steps/fresh-check.ts:52"
  problem: "The untrusted .git/config can still influence the returned integer count (e.g. skew a customized repo toward 'fresh'), downgrading an advisory warning — correctly bounded to output, never execution, and the code says so; recorded for completeness."
  evidence: "Untrusted config can still influence the returned *count*, never *execution* (P2)."
```

No finding is emitted by this CLI code (it is not a Capability), so there is no free-text-gating-a-
decision path. The test payload `touch '<sentinel>'; false` is used strictly as a fixture (an attacker
payload as DATA under test), not obeyed. L-trust is satisfied.

### L-axis → P3 (portability sub-note folded in)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/steps/fresh-check.ts:54"
  problem: "runGit + GIT_HARDENING are local to fresh-check.ts (correct today per P7 — it is the sole git caller); if a second git-shell-out site appears, hoist to lib/git.ts so the hardening is one repo-wide invariant rather than a per-file one."
  evidence: "const GIT_HARDENING = ['-c', 'core.fsmonitor=', '-c', 'core.hooksPath=/dev/null'];"
```

Portability (advisory, not a finding): the `-c core.fsmonitor=` disable form was verified live on git
2.50.1 and neutralizes the confirmed vector; the empty-value form is the standard disable and cannot
be exec'd as a program, so the worst case on an older git is a harmless no-op (not a re-opened RCE).

### L-eval → P1

No finding. The increment adds no Capability/`rule_id`, so there is no eval-binding obligation; the P1
duty for a security invariant — a test that *demonstrates* it — is met and was shown **red→green** (2
cases fail on the pre-fix code, all 14 pass after). `validate` agrees (0 capabilities, vacuously
green) — floor and lens concur.

## Proposed lesson candidate (NOT written to canon here — P2)

`/pharn-dev-review` writes only `REVIEW.md`; promotion is a separate human-gated `/pharn-dev-memory-promote` run
(`check-provenance` + accept/deny halt). Proposed for `.dev/memory-bank/lessons-learned.md`:

> **Centralize AND gate a hardened-dangerous-call invariant.** When hardening a class of dangerous
> call that reads attacker-controlled state (here: git shell-outs reading the target repo's
> `.git/config`), route every site through one helper *and* consider a deterministic gate (a grep/lint
> that fails on an un-hardened reintroduction). Without the gate the invariant is a convention, not
> floor (P0). — provenance: increment `fresh-check-git-rce`, `src/steps/fresh-check.ts` git-config RCE.

## Verdict

**GREEN — 0 floor-gate (blocking) findings; 3 minor advisory findings + 1 proposed lesson.** Advisory
only: this review certifies the floor was GREEN and records judgment-level observations for the human.
It is **not** a merge decision — that is the human's at the post-review gate.
