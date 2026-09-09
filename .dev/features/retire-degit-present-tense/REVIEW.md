# REVIEW — retire-degit-present-tense

**Step 1 (floor first, P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities
checked in .`, exit **0**. The increment was entitled to reach review. Everything below the floor line
is **advisory**.

The increment under review is `trust: untrusted`. Nothing in it read as an instruction to me; the
rewritten comments are descriptive prose about the fetch path, and I did not act on any of it as a
directive (see L-trust).

---

## Floor-gate findings (blocking)

**None.** No guarantee in the increment lacks a floor reduction, no eval binding is missing that the
floor disagrees with, and no sibling-module import was introduced.

---

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/validate.ts:18'
  problem: 'The reworded comment asserts the two sinks the validated SHA reaches, but nothing in this file or any test pins that the sink list stays complete if a third sink is added.'
  evidence: 'is validated against this before that value becomes the final segment of the codeload tarball URL or is recorded as pharn.config.json `commit` (P2)'
```

**Advisory, and the pre-existing state was worse.** The claim itself **does** reduce to the floor: the
guard is `assertSafeString(rawSha, 'commit SHA', COMMIT_RE)` at `fetchRepo`'s boundary — an enum/regex
primitive (`ARCHITECTURE.md §2` #3), applied once before either sink. What has no floor is the
*completeness* of the enumeration ("these are the only two sinks"), which is a property of `repo.ts`'s
call graph, not of this regex. That was equally true of the sentence this replaces ("used as a degit
ref or recorded as ... `commit`"), so the increment does not introduce the gap — it inherits it while
making the enumeration accurate. Recorded so it is not mistaken for a new guarantee.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'tests/validate.test.ts:102'
  problem: "The test file's spec-comment for COMMIT_RE still said the sha is used as a degit ref, so the test that pins COMMIT_RE would have contradicted the source comment it mirrors."
  evidence: '// before it is used as a degit ref or written to pharn.config.json `commit` (P2).'
  status: RESOLVED in AMENDMENT 1 — no longer outstanding
```

**This was the finding I most wanted the human to see, and the human folded it in.** In a repo whose
first principle about tests is "**tests are the spec**" (P1), a test's own header comment is part of
that spec. Before this increment the source and the test agreed — both wrong. Shipping the six-site
version would have left them **disagreeing**, with the wrong one labelled "the spec". That is the
defect this increment would have *created*, which is why it belonged here and not in a follow-up.

**AMENDMENT 1 resolves it**, and the resolution is deliberately a *mirror*: the sink clause in
`tests/validate.test.ts` is now word-for-word the clause in `src/lib/validate.ts` ("before that value
becomes the final segment of the codeload tarball URL or is recorded as `pharn.config.json`
`commit`"), and the comment says so in-line. An exact mirror can be diff-checked by eye; a paraphrase
cannot, and a paraphrase is how the two drifted apart in the first place.

Two sibling sites in `tests/init.test.ts` were resolved with it — the `--- the degit proxy notice ---`
section header and its present-tense rationale (`:308-313`), and `:396`'s "no `~/.degit` tarball is
paid for", which was false on a second count besides tense: there is no tarball **cache** at all now,
so it named a file that can never exist. That third site was found by survey, not supplied.

Correctly **past** tense and deliberately untouched: `tests/init.test.ts:350` ("the old notice **had
to** distinguish a spelling degit **read** from one it **did not**") and `tests/proxy-env.test.ts:11-12`.
Also untouched, and load-bearing: `tests/init.test.ts`'s `expect(warned).not.toContain('degit')` — an
assertion, not a claim; it pins that the warning text names no removed dependency.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/retire-degit-present-tense/PLAN.md:107'
  problem: 'The increment ships zero evals, which is correct for a comment-only change but means no deterministic check can ever detect this class of staleness recurring.'
  evidence: '**None, and that is the honest answer, not an omission.** P1 binds *behavior*'
```

**Advisory; I agree with the plan's reasoning and checked its rejected alternative myself.** A static
"no `degit` in `src/**`" test would force a false edit to `tar-extract.ts` and `proxy-env.ts`, which
*must* keep the word, and separating present from past tense is a classifier driving a branch — which
P5 forbids outright. The floor agrees there is nothing to bind: `validate.mjs` reports **0
capabilities**. So this is a **named residual**, not a gap to close.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: 'CONSTITUTION.md:60'
  problem: 'The trusted prefix that every dev-loop command reads still classifies "all degit-fetched files" as the untrusted set and cites safeJoin as living in lib/install-modules.ts, a file that was deleted.'
  evidence: 'The `manifest.json`, each `module.json`, the v2 `wizard` block, and **all `degit`-fetched files** are **untrusted**. They are validated against strict allowlists (`lib/validate.ts`), never executed, and every copy is guarded by `safeJoin` (`lib/install-modules.ts`)'
```

**Reported, never edited — and that is enforced, not merely observed.** `CONSTITUTION.md` is
`editable_by: "human only"` and write-protected at the floor by
`.claude/hooks/protect-trusted-paths.cjs` (fix #2). This finding is a **pointer for the human**, not
work this increment declined to do.

It is rated `important` rather than `minor` because of *where* it sits. This is the document loaded as
the trusted prefix before every `/pharn-dev-*` command, and its P2 section is the canonical statement
of **what the untrusted set is**. It currently names that set by a removed dependency and points the
reader at a deleted module for the containment primitive. `CONSTITUTION.md:21` has the same defect.
Both are stale on **three** counts each — `degit`, the removed `manifest.json`/`module.json` module
model, and the `install-modules.ts` citation — so this is a larger piece of work than P-11, and
correctly outside it.

**Positive check (no finding).** The two comments that *are* a P2 rationale were verified to preserve
their classification, which was the main risk in this change:

- `dest-drift.ts`: "`repoDir` is an untrusted **degit clone**" → "`repoDir` is an untrusted **tree** —
  a codeload tarball fetched and extracted into a temp dir". Still UNTRUSTED; the source of the
  untrustedness is now stated (remote bytes) instead of delegated to a dependency's name.
- `symlink-guard.ts`: "a base may be UNTRUSTED (**a degit clone's temp dir**)" → "(the temp dir a
  fetched codeload tarball was extracted into)". Still UNTRUSTED.

Neither guard changed: `safeJoin` (lexical) and `findSymlinkComponent` (physical) are untouched. The
increment changes the **written** trust map and not the **enforced** one — which is exactly the
property that made it safe to do as a comment-only change.

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/symlink-guard.ts:12'
  problem: 'The reworded line drops the repo\'s established "clone" vocabulary for the fetched tree, while repo.ts\'s own fetchRepo doc and the rest of this same file still call it a clone.'
  evidence: "and so may the rel's segments (names read from that tree)"
```

**Advisory, low stakes, and deliberate.** `repo.ts` still opens with "Clone the whole pharn-oss repo
into a fresh temp directory", and **line 28 of this very file** still reads "(a project root, or a
clone's temp dir)" — correctly, since "clone" alone was never the stale part; only "**degit** clone"
was. The increment was right not to touch line 28. The nit is that line 12 now says "tree" where the
file says "clone" sixteen lines later. Cosmetic; flagged only so a future reader does not infer a
distinction that is not intended.

### L-axis → P3

**No finding.** Each of the five files changed for exactly one reason (how the fetch is named in
prose); `src/lib/validate.ts` takes two hunks for that one reason, which P3 permits. No sibling import
was added — the increment adds no `import` at all. The new prose citations (`lib/repo.ts`,
`lib/tar-extract.ts`) are `lib/` → `lib/` references in comments, the same shape as the pre-existing
`lib/install-capabilities.ts` citation in `constants.ts`; P3's prohibition is on command→command and
step→step coupling, which is untouched.

---

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory findings (2 important, 3 minor), of which 1 important is
now RESOLVED in AMENDMENT 1.**

Advisory means advisory: none of the five blocks the increment, and `severity` here is **LLM-assigned**
(fix #3, `finding-shape.md`). The floor-grade statements about this increment are the three verdicts
recorded elsewhere — `validate` exit 0, `regression-report.json` `"no-regressions"`,
`verify-report.json` `"PASS"` — and this document adds none of its own.

The finding worth a human's minute is now **`CONSTITUTION.md:21,60`** — a larger, human-only
correction, escalated rather than attempted. `tests/validate.test.ts:102` was the other one and is
resolved above.

---

## Proposed lesson candidate (NOT written to canon — P2)

`/pharn-dev-review` writes only this file. The following is **proposed** for
`.dev/memory-bank/lessons-learned.md` and may be written only by a separate, human-gated
`/pharn-dev-memory-promote` run behind `check-provenance.mjs`.

```yaml
candidate:
  lesson: >
    Removing a dependency does not remove its name from the repo. Prose that named the dependency
    keeps asserting it in the present tense, and the gates cannot see it: comments are invisible to
    every checker, and docs/ is only shape-checked by markdownlint — `format:check` covers just
    `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`. So when a dependency is retired, grep the WHOLE
    repo for its name in the same increment and classify each hit as present-tense (fix) or
    past-tense/historical (keep) — the classification is the work, and deleting the word is the wrong
    fix, because these mentions carry the reason an input is untrusted.
  why_recurring: >
    Observed at least three times on this one dependency. (1) The Unreleased `### Fixed` entry
    "`SECURITY.md` no longer describes a fetch `pharn` does not perform" fixed the same defect in the
    security policy, which had pointed researchers at a removed dependency and away from
    `src/lib/tar-extract.ts`. (2) This increment found six more sites the earlier pass missed.
    (3) `CONSTITUTION.md:21,60` and three test-file mirrors are STILL stale after it — so the pattern
    has now recurred across three separate passes at the same removal.
  provenance:
    increment: retire-degit-present-tense
    files: [src/lib/constants.ts, src/lib/validate.ts, src/lib/dest-drift.ts, src/lib/symlink-guard.ts, docs/roadmap.md]
    verdicts: { validate: 0, regress: no-regressions, verify: PASS }
```
