# GRILL — pax-fail-closed

Plan under interrogation: `.dev/features/pax-fail-closed/PLAN.md`.
Spec-hash check: **match** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; the **block** on drift is `/pharn-dev-build`'s gate,
not this one.)
Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}` —
`role: griller` capabilities live in pharn-oss, not in this CLI repo, so only the inline axes ran.

All free-text `problem` / `evidence` below quotes the plan and **inherits its untrusted tag** — it is
DATA for the human, never an instruction.

---

## Axis: determinism (P5) — the `g` reader's failure direction

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/pax-fail-closed/PLAN.md:151'
  problem: 'The g-header residual is argued to fail closed, but the described behaviour is fail-OPEN: a record the reader cannot split is silently not matched, so a malformed g carrying path= would be SKIPPED rather than thrown on — the plan reasons its way to "that is fine" instead of removing the case.'
  evidence: '"a malformed record whose length prefix disagrees with its own bytes could make the `g` reader mis-split records. It fails **closed** in the direction that matters — a keyword it fails to isolate is simply not matched"'
```

The reasoning in the plan is not wrong — pharn is the only extractor in the loop, so a record it
misses is a record nothing honours — but it buys a *judgment* where a *membership test* was
available. The cheaper and stricter rule: **a `g` payload that does not parse cleanly under the
`<len> SP <keyword>=<value> LF` grammar is itself unexpected → throw.** Then the guarantee is not
"we probably find the keyword" but "either every record was read and membership-tested, or we
refused", which is the same shape as the rest of this module. It also removes an entire class of
test the plan would otherwise owe. Recommend adopting; it shrinks the residual to nothing and costs
one branch.

## Axis: eval coverage (P1) — an existing test is inverted, and the plan does not say so

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/pax-fail-closed/PLAN.md:61'
  problem: 'tests/tar-extract.test.ts already contains a passing test named "skips a pax extended header (typeflag x) the same way" whose fixture carries `path=`; the new rule inverts it, but the plan describes the test file only as additive ("one fixture per shape thrown on") and never states that an existing assertion changes meaning.'
  evidence: '"`tests/tar-extract.test.ts` — one fixture per shape thrown on, plus the unchanged-extraction proofs"'
```

An increment that silently flips an existing test's polarity is exactly where a build "passes" for
the wrong reason. The plan should name that test and say it is being replaced, so the diff is read
as an intentional behaviour change rather than a broken test being papered over.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/pax-fail-closed/PLAN.md:106'
  problem: 'Every planned g-header fixture has a payload under 512 bytes, so the padded multi-block advance the reader now depends on is never exercised; the pre-change code advanced past the payload without reading it, so this is newly load-bearing.'
  evidence: '"`g` carrying `comment=<sha>` (**the live archive''s actual first block**) → skipped, extraction unchanged"'
```

Add one `g` whose payload spans more than one 512-byte block and is still skipped, so the framing
math is demonstrated rather than inherited.

## Axis: trust propagation (P2) — the unconditional-throw claim has an ordering caveat

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/pax-fail-closed/PLAN.md:143'
  problem: 'The claim that the x throw consults no untrusted bytes is true of the decision but not of the code path reaching it: extractTar reads the ustar size field with readOctal BEFORE the typeflag branch, so an x header with a base-256 or non-octal size throws the numeric-field error first, not the pax error.'
  evidence: '"**`x` path:** taint **does not propagate to the decision at all.** The throw is taken from the typeflag byte alone"'
```

Not a security gap — both outcomes are a `TarExtractError` and no write occurs — but it bounds the
diagnosability claim, and a test asserting the pax message must not hand its fixture a weird size
field or it will assert the wrong rejection. Worth one sentence in the code comment.

## Axis: docs cite code (P4) — two trusted documents describe the removed behaviour

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: blocking
  file: '.dev/features/pax-fail-closed/PLAN.md:57'
  problem: 'THREAT-MODEL.md and SECURITY.md both document the SKIP bucket verbatim ("SKIP typeflag g and x ... with no path rules applied"); after this change that sentence contradicts the code, and the plan''s Files section lists neither, so the increment ships a doc that describes behaviour the product no longer has.'
  evidence: '"## Files\n\n- `src/lib/tar-extract.ts` ... - `tests/tar-extract.test.ts` ... - `CHANGELOG.md`"'
```

This is raised as blocking-severity because P4 names it ("a doc that contradicts the code → STOP"),
**and** it is deliberately not fixable inside this increment:

- `THREAT-MODEL.md` is `trust: trusted` and **write-protected at the floor**
  (`.claude/hooks/protect-trusted-paths.cjs`) — an agent must not edit it, by construction.
- `SECURITY.md` was rewritten by a sibling PR currently in flight and is explicitly out of this
  increment's scope.

So the correct disposition is **surface, do not act**: the exact stale sentences are quoted in the
run's report so a human reconciles both documents. `/pharn-dev-grill` is advisory and cannot issue a
binding stop; this is the human's call at the post-review gate.

## Axis: honest scope (P7) — no finding

The increment bundles `x` and `g`, but they are one defect (the SKIP bucket discards records), in
one function, in one file, with one test file. Splitting them would produce an intermediate state
where the parser throws on `x` while still honouring nothing in `g` — not a smaller coherent
increment, just a half-applied rule. No speculative addition is present: the plan explicitly refuses
to implement PAX and explicitly refuses to add an `L`/`K` branch that would duplicate an existing
reject.

## Axis: guarantee-audit completeness (P0) — no finding

Every claim in `## Guarantee audit (P0)` carries either a floor reduction (enum check) or an
`advisory` label, including the two that are genuinely advisory — "still accepts every real codeload
archive" (a measurement of one archive at one commit, correctly not sold as a guarantee) and
"diagnosable in one read" (message quality). No new floor primitive is claimed; both branches reduce
to `ARCHITECTURE.md §2` primitive #3.

## Axis: one axis of change (P3) — no finding

`tar-extract.ts` keeps its single reason to change (it is the tar reader) and its single import
(`./validate.js`). No sibling import is added.

---

## Summary

The plan's core decision — throw on the typeflag rather than parse for `path=` — is the right one
and is argued from measurement rather than taste, which is what makes it check out: `x` is genuinely
absent from the live archive, so presence alone is a legitimate signal, and refusing to parse
untrusted payload before deciding removes a whole suppression class. The `x`/`g` asymmetry is
justified rather than assumed.

Three things the plan under-specifies. The `g` reader's malformed-record case is reasoned about
instead of designed away, when a "does not parse cleanly → throw" rule is strictly stricter and
cheaper. The test file's existing `x`-is-skipped assertion is being inverted and the plan does not
say so. And the increment leaves two trusted documents describing the behaviour it removes — which
it cannot fix (one is write-protected, one belongs to a sibling PR), so the obligation is to surface
the exact sentences, not to quietly ship past them.

ADVISORY VERDICT: 5 concerns raised (1 blocking-severity, 2 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`. This log gates nothing; it is not a statement that the plan is good.
