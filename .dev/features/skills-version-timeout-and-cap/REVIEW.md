# REVIEW — skills-version-timeout-and-cap

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN** (exit 0, 0 markdown capabilities —
vacuously green here, and it gates nothing for a TypeScript increment; the real deterministic gate
for this increment is `npm run check`, GREEN at exit 0 with 894 tests). Everything below the floor
line is **advisory** — the four lenses are model judgment, not a gate.

Reviewed: `src/lib/skills-version.ts` (`fetchRemoteSkillsVersion` + the new private
`readCappedBody`), `tests/skills-version.test.ts`, `CHANGELOG.md`. The increment is
`trust: untrusted` to this stage.

---

## Floor-gate findings (blocking)

### L-floor → P0 — a docstring that claimed more than the change delivers

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: blocking
  file: 'src/lib/skills-version.ts:155'
  problem: 'The new docstring opened "All three guards cover the BODY, not just the header exchange." Two of the three do. `redirect: ''error''` is a header-phase guard by nature — there is no body phase for it to cover — so the sentence sells a scope the change cannot have delivered for that guard, in the exact docstring a reader consults to learn what is guaranteed.'
  evidence: 'The increment changes the timer scope and the cap; the fetch options object is byte-identical, `redirect: ''error''` included.'
```

Small wording, but this is L-floor's whole job: an over-broad guarantee sentence is the disease
whether it costs a line or a subsystem, and it is worse in a docstring than in prose because a
docstring is what the next reader trusts instead of reading the code.

**Resolved in-increment.** Now: _"The two guards that CAN cover the body now do … (`redirect: 'error'`
is a header-phase guard by nature — it is unchanged, and it was never the one that stopped short.)"_

### L-eval → P1 — two behaviours shipped without a test

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: 'src/lib/skills-version.ts:217'
  problem: 'The multi-chunk merge loop (`merged.set(chunk, offset); offset += chunk.byteLength`) had no test: every existing case sends the body as ONE chunk, so an off-by-one in the offset would corrupt the decoded version silently instead of failing. The `if (!res.body) return ''''` guard had none either, though the plan names it as a behaviour ("a null body reads as empty text").'
  evidence: 'Mutation-checked both this run: `offset += 0` → 1 failed test; deleting the null-body guard → 1 failed test. Before the fix, BOTH mutants survived the whole 892-test suite.'
```

P1 is "tests are the spec", and a spec that admits a corrupting mutation is not one. **Resolved
in-increment:** `reassembles a body that arrives in several chunks` (three chunks → `1.2.3`) and
`treats a bodyless response as empty, and rejects it as an invalid version` (a 204 → refused by
`VERSION_RE`, never a silent "no version"). Both kill their mutants; suite is 892 → 894.

---

## Advisory-gate findings (inform, never block)

### L-trust → P2 — untrusted bytes reach exactly one sink, and one echo remains upstream

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/validate.ts:88-92'
  problem: '`assertSafeString` interpolates the whole rejected value into its message, and both consumers print it. This increment BOUNDS that echo at 256KB (it was unbounded) but does not close it; a body under the cap that fails VERSION_RE is still echoed in full.'
  evidence: 'Observed live before the fix: `SKILLS_VERSION has invalid format: "一一一…"` carrying all 100,000 untrusted characters. `JSON.stringify` escapes control characters, so the residual is volume, not a terminal-repaint vector.'
```

Advisory and deliberately out of scope: `validate.ts` is a second axis (P3), and the increment
strictly improves the situation. Recorded so the improvement is not mistaken for a closure.

Otherwise the trust path is clean: the collected bytes go to `TextDecoder` → `.trim()` →
`assertSafeString(..., VERSION_RE)` and nowhere else — no path join, no write, no branch except the
integer cap compare. Both error messages interpolate numbers and a module constant, never body
bytes. `TextDecoder`'s non-fatal default turns malformed UTF-8 into U+FFFD, which `VERSION_RE`
then refuses — same posture as the `res.text()` it replaces.

**Did instruction-looking content in the reviewed artifact change my behaviour? No.** The increment
carries a `// FABLE 4.6:` marker addressed to a future editor; it was read as DATA (a note about where
a sibling fix must land) and acted on only by leaving it in place, which is what the plan specified.

### L-eval → P1 — one branch still uncovered, named rather than papered over

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/skills-version.ts:235'
  problem: '`await reader.cancel().catch(() => undefined)` — the catch arm has no test. Provoking it needs a stream whose cancel rejects, which no realistic transport produces.'
  evidence: 'Coverage for the file: 96.82 stmts / 83.33 branches / 98.3 lines; the only uncovered LINE (101) is a pre-existing `readMinCli` open-error path, unrelated to this increment.'
```

Advisory: a defensive arm whose only job is to not mask the real error. Named, not hidden.

### L-axis → P3 — one axis, no sibling coupling

No finding. `readCappedBody` is module-private and serves the file's single stated axis ("obtaining
the skills version"); no import was added; the two prose citations (`lib/repo.ts`'s timer shape,
`LIMITS.md §1b/§3b`) are references, not sibling imports. `readSkillsVersion`, `readMinCli`,
`fetchCommitSha`, `fetchRepo`, and both consumers are untouched, as the plan required.

---

## Docs check (P4) — cited, and now true

`SECURITY.md:56`, `THREAT-MODEL.md:135`, and `docs/contributing.md:85` each already asserted the 8s
timeout + 256KB body cap. Read this run: all three now match the code, so **no doc edit is needed** —
this increment removes a P4 violation (documented behaviour with no implementing code) rather than
creating one. `CHANGELOG.md` gains the `### Fixed` entry, which names the defect and the bound it
actually delivers.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the gated path)

**Candidate:** _"A `finally` around `await fetch(...)` alone disarms every timer before the body is
read; scope the cleanup to the whole read, and count body limits in wire bytes, never in
`String.length`."_ Provenance: this increment, `src/lib/skills-version.ts:161-247`, defect verified
live against the pre-fix exported function (a 300,000-byte / 100,000-code-unit body cleared both
caps). Recurrence evidence is real but thin — `fetchCommitSha` had the correct shape already, so the
repo has one instance of the bug and one of the fix. **Recorded as a candidate only; the model does
not self-promote (P2).**

---

## Verdict

**GREEN — 0 outstanding floor-gate findings.** Two blocking findings were raised (P0 docstring
overreach, P1 untested merge + null-body behaviours) and both were resolved inside the increment;
the floor was re-run afterwards and is GREEN (`npm run check` exit 0, 894 tests; `verify` PASS;
`regress` `no-regressions`). Three advisory findings stand as named residuals, none of them a
basis for blocking.

This verdict is **advisory**: `/pharn-dev-review` writes prose, has no `check-review.mjs`, and gates
nothing. The floor-grade statements in this run are `validate.mjs` GREEN and the `npm run check`
exit code — both already owned by `/pharn-dev-build` and `/pharn-dev-verify`.
