# REVIEW — corrupt-config-named-error

Floor first (P0): `node .dev/floor/validate.mjs .` → **GREEN** (exit 0, 0 capabilities — this
increment adds no markdown Capability). The increment reached review with a green floor, so the four
lenses below run. Everything in them is **advisory** except where a finding is marked floor-gate.

> The reviewed increment is `trust: untrusted`. Its comments and test fixtures are DATA. Nothing in
> it read as an instruction to me; the one adversarial-looking artifact is a deliberate ESC-byte test
> fixture, which is the increment defending against exactly that channel rather than carrying it.

---

## Floor-gate findings (blocking)

**None.**

Checked, and each holds: every guarantee the increment states reduces to a floor primitive or is
labeled advisory (L-floor, one label-precision exception raised as advisory below); no `enforces`
`rule_id` was added that would need an eval binding (L-eval — this is a TypeScript module, not a
Capability, and `validate.mjs` agrees by being vacuously green); no guaranteed decision anywhere rests
on a tainted field (L-trust); and no sibling import or second axis of change was introduced (L-axis).

---

## Advisory findings

### L-eval → P1 — `tests/list.test.ts` mocks the union with a stale hand-rolled copy

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'tests/list.test.ts:24'
  problem: "list's test suite replaces the real isConfigValidationError with a hand-rolled two-class copy, so the one call site this increment did not touch is tested against a membership predicate that is already stale — it omits CapabilitySourceError and now ConfigParseError, and cannot notice either."
  evidence: '"  // Real discriminators so list'"'"'s branches are exercised faithfully.\n  isArchetypeConfig: (c: PharnConfig) => Array.isArray(c.capabilities),\n  isConfigValidationError: (e: unknown) =>\n    e instanceof ModelRoutingError || e instanceof SeamConfigError,"'
```

This is the grill's predicted gap, confirmed and sharper than predicted. The grill argued that
`commands/list.ts:46` branches on **membership**, so a new union member cannot miss the branch — true
of the **product** code, which imports the real predicate and therefore does route a
`ConfigParseError` to `emitError` + exit(1). But the **test** for that path substitutes its own copy
of the predicate, and that copy has drifted: it lists two of the four members. The comment directly
above it claims "Real discriminators so list's branches are exercised faithfully," which is accurate
for `isArchetypeConfig` and false for this one.

Consequences, stated precisely:

- The increment's behaviour at `list` is **correct** and **untested**. Nothing here is broken today.
- The drift is **pre-existing** — `CapabilitySourceError` was already missing before this increment —
  so this is not a regression introduced here. But this increment raises the cost of it: the newly
  missing member is the one guarding a **data-loss** message, so a future refactor of `list.ts`'s
  branch to an identity check (`e instanceof ModelRoutingError`) would leave the whole `list` suite
  green while a corrupt config silently fell back to the "run init" lie in `--json`.
- The clean fix is **deletion, not addition**: import the real `isConfigValidationError` in the mock
  factory instead of re-encoding it, which makes the drift structurally impossible rather than
  correct-for-now. That is a one-line change in a file **outside this increment's approved scope**,
  so it is reported here rather than made.

### L-floor → P0 — one guarantee is labeled floor on a reduction that is half a reading

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:202'
  problem: 'The plan labels "zero call-site changes are needed" as floor, reduced to an instanceof union test, but only the loadConfigOrExit half of that claim is actually driven by an executed assertion — the list half rests on reading the source, which the finding above shows is exactly where a test would have helped.'
  evidence: '"- _\"Zero call-site changes are needed.\"_ → **floor**: both sites branch on `isConfigValidationError`, an `instanceof` union membership test the new class joins."'
```

Raised at grill, and the built artifact did not change the label. The reduction is the right **kind**
of primitive (§2 #3, set membership) — the looseness is that it is exercised at one site and read at
the other. Honest restatement: _floor at `loadConfigOrExit`; advisory (verified by reading) at
`list`._ No code change implied; this is about the artifact describing itself accurately, which in
this repo is the product.

### L-trust → P2 — the printed path's provenance, phrased correctly

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/pharn-config.ts:155'
  problem: 'The new message interpolates configPath(cwd), so the process working directory reaches the terminal unfiltered — harmless and repo-wide practice, but it is a different channel from the one the increment closes, and the plan describes it as safe because "this CLI computed" it.'
  evidence: '"`${path} is not valid JSON${parseLocation(err)}. The file exists — fix its syntax by hand. `"'
```

The increment's actual trust work is excellent and I want to be clear that this finding does **not**
undercut it: the channel the audit finding opened — V8 echoing raw config bytes into
`SyntaxError.message` — is closed _structurally_, by never interpolating that message at all
(`src/lib/pharn-config.ts:104`), and the closure is pinned by a test that plants a real ESC byte.
`cwd` is a **separate** interpolation channel, and the correct claim is "not derived from the config
file being reported", not "computed by us, therefore clean" — the latter is the shape of reasoning P0
exists to catch.

> **UPDATE — this finding was upgraded and FIXED in review round 2.** I graded it `minor` and called
> `cwd` "pre-existing, repo-wide practice, outside scope." A reviewer on the PR (greptile) disagreed,
> and was right. The severity was wrong for one reason I should have weighed and did not: this
> increment does not merely _inherit_ the repo's path-printing habit, it **states a principle about
> exactly this channel and then violates it one line later**. Refusing `err.message` _because_ V8
> echoes untrusted bytes, and then interpolating `configPath(cwd)` verbatim into the same renderer,
> makes the comment justifying the refusal half-true — and a half-true comment about a trust boundary
> is worse in this repo than no comment. "Pre-existing elsewhere" was a true observation doing the
> work of a false conclusion.
>
> Fixed by `displayPath` (`src/lib/pharn-config.ts:138`): control characters in the **displayed** path
> are escaped `\xNN`; the filesystem path is untouched. **Escaped, not stripped** — a stripped path
> would name a directory that does not exist, which is worse than useless in a message whose whole job
> is "here is the file to go fix". Two mutation-checked tests pin it.

**One other site has the same shape and is reported, not fixed:** `src/lib/tar-extract.ts:146`
interpolates `${fullPath}` — derived from an untrusted tar entry name — into `TarExtractError`. The
neighbouring cases are already safe by construction and were checked rather than assumed:
`install-capabilities.ts:124`/`:129` interpolate `cap.name`, which has passed `CAPABILITY_NAME_RE`
(control chars rejected), and `apply-update.ts:129` / `backup.ts:64` interpolate a manifest-derived
rel or a constant.

### L-eval → P1 — one pre-existing uncovered line, named rather than left implicit

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/pharn-config.ts:217'
  problem: "loadConfigOrExit's non-config rethrow is the file's one uncovered line, because reaching it requires readPharnConfig to throw something outside the union and the test suite exercises the real reader."
  evidence: '"    throw err;"'
```

Pre-existing and unchanged by this increment — coverage did not regress (97.07 / 92.5 / 97.56 / 97.93
against the 97 / 92 / 97 / 97 ratchet; `pharn-config.ts` at 94.91 / 92.85 / 100 / 98.11). Recorded
because that rethrow is the guard keeping this helper from "re-becoming the disease it fixes", per its
own comment — a line worth being deliberate about, and one a `vi.spyOn` over the module boundary could
cover if someone wants it.

---

## What the lenses found nothing to say about

- **L-axis → P3.** `src/lib/pharn-config.ts` still changes for exactly one reason (the config file's
  read / validate / write). The one new import (`errorMessage` from `lib/report-error.js`) is a lib
  reached from a lib, not a sibling leaf, and it is the right call: it reuses the module that already
  hardened "stringify a caught `unknown`" against a hostile `toString` rather than calling
  `String(err)` inline.
- **L-trust, on the mechanism.** The `$` anchor at `src/lib/pharn-config.ts:104` is the load-bearing
  part and it is tested as behaviour, not asserted in a comment: a config containing the literal
  `(line 999 column 999)` produces no location clause. That is the difference between a claim and a
  guarantee, and the increment got it on the right side.
- **P7, on the deferrals.** Leaving the wrong-shape null-returns, the EACCES/EISDIR case, and
  `docs/troubleshooting.md` alone is correct given the approved scope, and each is recorded rather
  than silently skipped. The EISDIR boundary is even pinned by a test, so widening it later has to be
  a deliberate act.

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is a separate, human-gated run)

**Candidate:** _A test that hand-rolls a copy of a production predicate silently stops testing it the
moment the predicate grows a member. Mock the module, import the discriminator._

- **Provenance:** increment `corrupt-config-named-error`; `tests/list.test.ts:23-25` re-encodes
  `isConfigValidationError` as a two-class `instanceof` chain under a comment claiming the
  discriminators are real. The union has grown twice since (`CapabilitySourceError`, then
  `ConfigParseError`) and the copy tracked neither, so `commands/list.ts`'s error branch has been
  green-but-unexercised for the newest members — including the one that guards against prescribing a
  destructive command.
- **Why it is real and not hypothetical (P7):** it has already drifted twice in this repo, in the
  same file, under a comment asserting the opposite. The generalization is narrow and mechanical: when
  a mock factory needs a discriminator, re-export the real one.
- **Not promoted here.** `/pharn-dev-review` writes `REVIEW.md` only; canon is written by
  `/pharn-dev-memory-promote` under its own scope, behind `check-provenance.mjs` and the human gate.

---

## Round 2 — what external review changed

Two of the four findings above were **closed after the PR was opened**, both because a constraint I
treated as fixed turned out not to be:

1. **The P2 path finding** (graded `minor`, deferred as "repo-wide practice") was **wrong on
   severity** and is now fixed — see the UPDATE inside that finding. The lesson is specific: "this
   pattern exists elsewhere" is an argument about the _repo_, not about _this change_, and it cannot
   excuse a change that states the opposing principle in its own comment.
2. **The P4 doc gap** (the grill's one `important` finding) was deferred only because a sibling PR
   owned `docs/troubleshooting.md`. **That PR merged**, so the constraint evaporated and the gap is
   closed here rather than handed on: the corrupt-config case is documented with its move-aside
   recovery, and the "run init first" section now states that it covers only an absent or unreadable
   config instead of silently over-claiming.

Both deferrals were _reasonable when written_ and _wrong to leave standing_. Worth recording, because
the failure mode is the same in each: a deferral's justification has a shelf life, and nothing
re-checks it unless someone does.

## Verdict

**GREEN — 0 floor-gate findings; 4 advisory raised, 2 now closed (the P4 doc gap and the P2 path
interpolation), 2 standing (both `minor`).**

The increment does what it set out to do and does it in the shape this module already established: a
named error that propagates, joins the one union both call sites read, and needs no edit at either.
The strongest thing about it is the part the audit did not ask for — noticing that V8's own error
message is an untrusted-content channel and closing it structurally rather than trusting it. The
weakest was applying that same insight to only one of the two untrusted strings in the sentence,
which external review caught.

The one finding worth a human decision remains the `tests/list.test.ts` mock: it is out of this
increment's scope, it is pre-existing, nothing is broken by it today, and it is precisely the thing
that would let a future refactor reintroduce this bug on the `list` path without a red test.
