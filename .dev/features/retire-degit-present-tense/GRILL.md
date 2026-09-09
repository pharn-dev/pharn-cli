# GRILL — retire-degit-present-tense

Plan under interrogation: `.dev/features/retire-degit-present-tense/PLAN.md` (`trust: untrusted`).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only surfaces — `/pharn-dev-build` is where
drift blocks, fix #4.)

Pluggable grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
Membership is FLOOR; zero are registered in this repo (griller capabilities live in `pharn-oss`, not
in the CLI's own tree), so this run is the **inline axes only**. That is a fact about the repo, not a
pass.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/retire-degit-present-tense/PLAN.md:128'
  problem: 'The plan claims the existing suite is a floor for "no behavior changed", but no gate in this repo reads docs/roadmap.md at all, so two of the six sites are covered by nothing.'
  evidence: '"no behavior changed" → **floor: enum/regex + the existing suite.** `npm run typecheck` (tsc) and `npm test` (vitest) are deterministic exit codes; a comment-only diff cannot flip them.'
```

**Grounded, not asserted.** `grep -rn "roadmap" tests/ .dev/floor/*.mjs scripts/` returns **nothing**;
`tests/docs-install-tables.test.ts` pins only `README.md` and `docs/getting-started.md` (line 67); and
`.markdownlint-cli2.jsonc` **ignores `CHANGELOG.md` outright**. So the floor the plan invokes is real
for the four `.ts` files — a stray token there genuinely flips `typecheck`/`test` — and **absent** for
`docs/roadmap.md` (prettier checks its formatting, never its truth) and `CHANGELOG.md`. The plan's own
P0 discipline requires that split be stated rather than averaged. This is the disease in miniature:
a true floor claim stretched one file too far.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/retire-degit-present-tense/PLAN.md:114'
  problem: 'The named regression evidence ("git diff shows every changed line begins with // or lives in a Markdown table") is an eyeball check the plan presents alongside floor-grade gates without labeling which is which.'
  evidence: 'The regression evidence is therefore **the unchanged suite**: `npm run check` GREEN before and after, and `git diff` showing every changed line begins with `//`/` *` or lives in a Markdown table.'
```

The `npm run check` half is floor (exit codes). The `git diff` half is **human reading** — advisory.
Both are sound; only the labeling is loose.

### Axis: docs cite code / no unimplemented behavior (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/retire-degit-present-tense/PLAN.md:70'
  problem: 'The proposed roadmap row adds two durable negative security claims ("no git binary, no cache") to a table whose column is "Capability", creating a new user-facing site that must be re-audited whenever the fetch changes — the exact failure mode this increment is repairing.'
  evidence: '"Fetch `pharn-dev/pharn-oss` as a SHA-pinned `codeload` tarball (no `git` binary, no cache) and copy …"'
```

The claims are **true today** (verified: no `child_process` in `src/`, `fetchRepo` `mkdtemp`s per call
and caches nothing). The concern is not accuracy, it is **placement and durability**. `roadmap.md` is a
status table — "what ships, and is it shipped" — and, as finding P0/1 establishes, it is the one
user-facing doc **no gate verifies**. Negative security properties already live where they are
maintained and cross-checked (`THREAT-MODEL.md` §2, `SECURITY.md`, `LIMITS.md`). Minting an
unverified third copy in a roadmap row is how the original `degit` row went stale. **Suggested
reduction: state the mechanism, drop the parenthetical.** The row's job is to name the capability.

### Axis: precision of the replacement text (P4 / P5)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/retire-degit-present-tense/PLAN.md:59'
  problem: 'The phrase "the last segment of the codeload tarball URL" is true only on the SHA-resolved path; on the degraded path the URL ends in `refs/heads/main`, and a reader could take the comment to mean the URL always ends in a validated SHA.'
  evidence: 'before it becomes the last segment of the `codeload` tarball URL or is recorded as `pharn.config.json` `commit`'
```

Strictly the wording is **correct as scoped** — `COMMIT_RE` gates only the non-`null` value, and when
that value exists it *is* the final segment (`downloadArchive`: `${CODELOAD}/${REPO}/tar.gz/${ref}`
with `ref = sha`). When the resolve fails, `sha` is `null`, `COMMIT_RE` never runs, and the ref is the
literal `refs/heads/main`. The comment's own next clause already names `null` as the degraded case, so
the risk is small — but the builder should not lose that clause, and should keep the wording tied to
*the validated value* rather than to the URL in general.

### Axis: eval coverage (P1) and the structural/semantic split

**No finding.** The plan writes zero evals and argues P1 binds *behavior* — correct here: every hunk
is a comment body or a Markdown cell. More importantly, the plan does **not** launder a floor-checkable
assertion into a judge: it explicitly considers and **rejects** a "no `degit` in `src/**`" static test
on the grounds that `tar-extract.ts` and `proxy-env.ts` must keep the word, and that tense-detection
is a classifier driving a branch (P5 forbids). That reasoning is sound and is the right call —
`eval-format.md`'s `structural[]` could not express it.

### Axis: trust propagation (P2)

**No finding.** No untrusted artifact is ingested. The two rewordings that *are* the P2 rationale for
their guards (`dest-drift.ts`, `symlink-guard.ts`) both keep the classification UNTRUSTED and only
re-source it; the guards themselves (`safeJoin`, `findSymlinkComponent`) are untouched. Worth stating
plainly: the increment changes the **written** trust map, never the enforced one.

### Axis: one axis of change (P3) / honest scope (P7)

**No finding, with one observation.** Five files + the changelog is one axis — "how the fetch is named
in prose". `src/lib/validate.ts` takes two hunks for one reason, which P3 permits.

On scope, the plan does something worth crediting rather than flagging: it found **four additional
stale sites** (`CONSTITUTION.md:21,60`; `tests/validate.test.ts:102`; `tests/init.test.ts:308-313,396`)
and **reported instead of absorbing** them. `CONSTITUTION.md` is hook-write-protected and human-only,
so not editing it is forced by the floor, not by discipline. The other three are not forced — the plan
left them by choice, and named the choice. That is the correct P7 posture.

**Observation for the human (not a finding):** `tests/validate.test.ts:102` mirrors site 3 *verbatim*.
After this increment lands, the source comment and its own test's header comment will **disagree**.
That is a strictly better state than today (one is now true), but it is a knowingly-created
inconsistency, and the human may prefer to fold that one line in.

---

## Prose summary

The plan is well-grounded — every factual claim in it was re-derived from live files this run
(`package.json`, a `child_process` grep, `repo.ts`), and its out-of-scope list is not a list of
excuses: each entry was read and is genuinely past-tense or hook-protected. The rewordings preserve
the *reason* each comment exists rather than deleting a stale noun, which is the whole point of the
finding.

Two things are worth the human's attention before build. First, the guarantee audit **overstates the
floor's reach**: `npm run check` genuinely pins the four TypeScript edits, but nothing in this repo
reads `docs/roadmap.md`, and `CHANGELOG.md` is markdownlint-ignored — so a third of the increment
rests on review alone and should say so. Second, the proposed roadmap row **imports two security
claims into a status table**, creating a fresh unverified copy of facts that are already maintained in
`THREAT-MODEL.md`/`SECURITY.md`. Both are cheap to address: label the split honestly, and trim the row
to the mechanism.

Nothing here suggests the increment is wrong or should not proceed. The concerns are about the plan's
**self-description** and one line of proposed wording — not about the six sites, which are correctly
identified and correctly bounded.

---

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to
weigh before /pharn-dev-build.** This grill-log gates nothing. Zero grillers were registered, so no
pluggable axis ran; the inline axes above are model judgment, not a floor. Nothing in this file is a
statement that the plan is sound.
