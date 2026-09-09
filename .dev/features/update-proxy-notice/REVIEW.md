# REVIEW — update-proxy-notice

Floor first (P0): `node .dev/floor/validate.mjs .` → **GREEN** (exit 0, "0 capabilities checked").
`regression-report.json` `.verdict` = `no-regressions`; `verify-report.json` `.verdict` = `PASS`
(six gates, all exit 0, 1175 tests). The increment was entitled to reach review.

> The increment is `trust: untrusted` to this stage. All `problem` / `evidence` free-text below is
> DATA.

---

## Floor-gate findings (blocking)

**None.** No P0 guarantee lacks a floor reduction or an `advisory` label; no eval binding is missing
that the floor disagrees about; no sibling **import** exists.

## Advisory findings (inform; never a sole basis for blocking)

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/commands/update.ts:147-149'
  problem: 'The new comment asserts a fact about a sibling command''s internals — that `add` makes no pre-lock fetch — which nothing checks, so if `add` ever gains one this file silently starts lying about it.'
  evidence: '`add` carries the same sentence and there it holds, because `add` makes no pre-lock fetch; the words travelled to a command where the precondition does not.'
```

This is the one finding worth weighing, and it is genuinely double-edged.

**Against it:** L-axis names "a prose mention of a sibling module's internals" as a P3 concern, and
this is exactly that. The claim was **verified live this run** (`add.ts:174-189` — the notice sits in
the lock closure, `fetchRepo` is the first fetch, nothing precedes it), but verification-at-write-time
is precisely the guarantee that decays. There is no import, so P3's hard rule (no sibling imports) is
**not** violated and this does not block.

**For it:** the comparison is the load-bearing part of the fix's reasoning. The defect was a sentence
that is **true in `add` and false in `update`**, and a reader who does not know that will read the
deleted comment as merely sloppy rather than as a precondition that failed to travel. Deleting the
comparison would remove the explanation of *why* the bug looked deliberate for as long as it did.

The existing convention also cuts both ways: `init.ts` is already cross-referenced by prose from
`status.ts`, `add.ts`, and this file's pre-existing comment, so the pattern is established — but
"established" is not "checked". Recommend keeping it and accepting the staleness risk, since the
alternative loses the increment's central insight; recorded here so the acceptance is explicit rather
than accidental.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/commands/update.ts:163-165'
  problem: 'The comment claims every run reaching the notice also fetches, but the precise property is that every such run ATTEMPTS a fetch — a rejection inside fetchRemoteSkillsVersion before any bytes leave still reaches the notice first.'
  evidence: 'it cannot fire early: the fetch below is the unconditional first statement of the try, so every run reaching this line also fetches'
```

The distinction does not affect correctness and the notice is never *wrong* in that case — a proxy
was set, and pharn did try to reach the network without using it, which is the whole content of the
message. But this repo's standard is that a comment states the property it actually has. "Attempts a
fetch" is what the control flow guarantees; "fetches" is what usually happens. Minor, and easily
absorbed on a later pass rather than churning the file now.

Noted deliberately as **not** a guarantee gap: the claim is a structural statement about control
flow, not a safety claim over untrusted content, and the two paths where the notice must **not**
fire (the config refusal, the TTY refusal) each have their own vitest assertion. Nothing rests on
the imprecision.

### L-eval → P1

**No finding.** The floor and this lens agree, and the agreement is worth stating because the numbers
look vacuous: `validate` reports "0 capabilities checked" because this is a TypeScript increment with
no markdown Capability, so the `rule_id`→eval binding is vacuously satisfied. P1's substance is
carried by the vitest layer — and carried unusually well, because the tests were **mutation-checked**
(`VERIFY.md`): reverting only `src/commands/update.ts` turns **exactly** the five new/inverted cases
RED, 1170 others green.

That check earns its keep here more than usual, because the increment's premise is that **a green
suite was evidence for the bug**. `tests/update.test.ts` previously asserted the early return's
silence "because it never clones"; a suite that defends a defect is only detectable by removing the
fix and watching what moves. Two cases stayed green under the mutation and are named rather than
hidden: `warns before the clone` (weak, not wrong — it pinned the *second* fetch) and
`warns exactly once on the full update path` (the branches are mutually exclusive, so a count cannot
separate them — which is the P0 relabel carried from the `status` grill, honored here).

### L-trust → P2

**No finding.** Checked and clear on three axes:

- **No new taint.** `detectProxyNotice` reads `process.env` — operator-controlled, not remote — and
  `proxyNoticeMessage` already redacts inline credentials, truncates, and strips control characters
  (`tests/proxy-env-format.test.ts` owns that). Moving the call site changes **when** an
  already-sanitized string prints, never what it contains.
- **No guaranteed decision rests on it.** The notice is a message; nothing branches on it, and the
  increment adds no finding with free-text fields.
- **Nothing instruction-shaped was found in the reviewed artifact,** and nothing in it changed this
  stage's behavior. The deleted comment ("a refused run performs no fetch") is a false *factual*
  claim, not a directive — worth saying explicitly, because "a comment asserted X" is exactly the
  shape that could be an injection vector in a less benign file.

One consequence checked and cleared: the notice now prints on two paths that previously printed
nothing (a lock refusal, a cancelled confirm). That is more output, not more disclosure — the value
is redacted before it renders, and it is the user's own environment shown back to the user's own
terminal.

---

## What the review CONFIRMED (recorded so the human need not re-derive it)

- **The hoist dominates both fetch sites.** `src/commands/update.ts` has exactly two:
  `fetchRemoteSkillsVersion()` at `:176` and `fetchRepo()` at `:295`. The notice is at `:167-170`,
  the first statement of `runArchetypeUpdate`, whose only caller is `runUpdate:103`. `:176` is the
  unconditional first statement of the try at `:175`, so every path — including the up-to-date early
  return at `:188-192` — passes the notice before reaching the network.
- **P-9's lock/fetch ordering is untouched.** The diff is a pure move out of the closure plus a
  comment rewrite: `withProjectLock`, its spinner, the MIN_CLI gate, and `fetchRepo` inside are
  byte-identical. The notice is **not** inside the lock.
- **Both promptless refusals still win.** `loadArchetypeConfigOrExit` (`:76`) and the TTY gate
  (`:90-101`) are in `runUpdate`, above the hoist, and each now has a test asserting silence **and**
  zero fetches.
- **The CHANGELOG entry does not overclaim.** It states what changed for `update` and explicitly
  refuses the mitigation reading — "pharn still does not use a proxy … this only makes the failure
  explained instead of silent". It notably does **not** repeat the sibling PR's headline claim of
  parity with "every other network-bearing command", which that PR's own review flagged as false
  while `update` was still broken.
- **`LIMITS.md` correctly untouched** (P2, floor-write-protected, owned upstream), and no doc edit
  was needed: `docs/troubleshooting.md:113` already lists `update`'s `SKILLS_VERSION` fetch and
  `:204` already promises the warning precedes it. Code caught up to the docs.

## Proposed lesson candidate (NOT written to canon — `/pharn-dev-memory-promote` decides)

`/pharn-dev-review` writes no canon. Proposing one candidate, because P7 requires a **real**
recurring failure and this is now the **second** instance of an identical shape in two different
commands:

- **Provenance:** `.dev/features/status-proxy-notice/` (PR #165, `src/commands/status.ts` — "never
  clones ≠ never fetches") and this increment (`src/commands/update.ts` — "the lock refused it ≠ it
  never fetched").
- **Candidate lesson:** when a guard's placement is justified by a comment, the comment states a
  **precondition**, and a precondition copied between commands must be re-checked against the command
  it lands in. In both cases the reasoning was sound where it was written and false where it was
  pasted, the placement therefore looked deliberate, and a test **promoted the false premise into an
  assertion** — so the suite defended the bug and a green run was evidence *for* it. The detection
  that worked both times was the same: **mutation-check the assertion** (revert the fix, confirm the
  case goes red). A case that stays green when the fix is removed is pinning something other than
  what its title claims.
- Two occurrences, both shipped, both found by adversarial audit rather than by the suite. Real, not
  hypothetical.

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (both minor).**

Neither advisory finding blocks: one is an accepted-with-eyes-open staleness risk on a cross-command
prose reference, the other a wording precision nit. The increment is small, its diff is a pure move
plus a comment rewrite, and its central claim — that the notice now precedes every fetch `update` can
make — is pinned by assertions that were **demonstrated** to go red without the fix rather than merely
asserted to exist.
