# REVIEW — add-version-gate

**Step 1 — Floor first (P0).** `node .dev/floor/validate.mjs .` over tracked source with the feature
applied: **GREEN** (0 capabilities checked — vacuously green; the increment adds no markdown
capability). The live-working-directory RED is fully accounted for in `VERIFY.md`'s disclosure (15
blocking findings, all inside gitignored `test-*/` fixture installs, zero in tracked source, `0 → 0`
across base and head per `REGRESSION.md`). The increment did not reach review on a red floor.

**Trust posture (P2).** The increment is `trust: untrusted` to this review. No instruction-looking
content was found in the reviewed diff, and nothing in `PLAN.md` / `GRILL.md` altered this review's
behavior — both were read as DATA. I did not catch myself about to comply with anything.

---

## floor-gate findings (blocking)

**None.** Every guarantee the increment claims reduces to a floor primitive or is labeled advisory:

| Claim | Reduction | Confirmed by |
| ----- | --------- | ------------ |
| `add` refuses when the versions differ | string equality over two values (`add.ts:76`) | 8 tests + live e2e (`v0.0.1` vs `v2.3.0`, exit 1) |
| Nothing written on refusal | structural — `versionGate` short-circuits before `resolveArchetypeAdd` / `resolveAddPicker`, the only writers | mocks + real-fs byte-identical records test + e2e (config sha256 unchanged, no `pharn/`, no records file) |
| The picker never prompts on refusal | structural — `groupMultiselect` lives only inside `resolveAddPicker` | `expect(groupMultiselect).not.toHaveBeenCalled()` |
| Cleanup precedes every exit | `finally { repo.cleanup() }`, gate placed inside the `try` | structural; tests assert reachability only (correctly labeled after grill F4) |
| "`update`'s early-return is now truthful" | **labeled ADVISORY** in the plan's guarantee audit | the CHANGELOG wording is correctly narrowed to *"`pharn add` no longer **makes**"* — it never claims `update` is now universally truthful |

The one P0 accuracy defect the grill raised (F1 — "two `VERSION_RE`-validated values") was corrected
**before** the build, and the shipped code comment (`add.ts:61-66`) states the asymmetry honestly.

## advisory-gate findings (inform; never the sole basis for blocking)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "docs/commands/add.md:47"
  problem: "The doc says the refusal happens 'before anything is written', but the clone has already been fetched at that point — only the user's project is untouched, which the very next clause is the thing that is actually true."
  evidence: |
    docs/commands/add.md:47 — "The refusal happens **before** anything is written and before the
    interactive picker renders: no capability directory is copied, and neither `pharn.config.json`
    nor `pharn.records.json` is touched."
    By design (plan option (A) over (D)), the gate is clone-derived: fetchRepo has already run and
    written a temp clone plus ~/.degit cache entries before versionGate is called (add.ts:118, :183).
  recommendation: "Narrow 'anything' to 'anything in your project' — the scoped claim is exactly true and is what the tests and the e2e pin."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "tests/add.test.ts:275"
  problem: "The picker refusal test pins that nothing is written and no prompt renders, but never asserts the message content, so invariant 1a/1b (names both versions, names `pharn update`) is test-pinned only on the named path."
  evidence: |
    tests/add.test.ts — 'refuses the picker BEFORE the multi-select ever renders' asserts
    groupMultiselect/installCapabilityDirs/writePharnConfig not-called and cleanup called, but no
    lastError() assertion. The two content assertions live in the named-path tests only.
    Mitigation (why this is minor, not important): both paths call the SAME versionGate helper and
    render through the same log.error, so the message is structurally identical — the gap is in what
    the suite proves, not in what the code does.
  recommendation: "Add three lastError() assertions to the picker refusal test — one line each, closes invariant 1 symmetrically."
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/commands/add.ts:77"
  problem: "The refusal interpolates config.skillsVersion — a value only type-checked at ingest, never VERSION_RE-validated — into terminal output, so a hand-edited or committed pharn.config.json carrying terminal escape sequences would emit them to whoever runs `pharn add`."
  evidence: |
    src/commands/add.ts:77 — "pharn.config.json records v${config.skillsVersion}"
    src/lib/pharn-config.ts:43 — `typeof raw.skillsVersion !== 'string'` (type guard only).
    The OTHER side is safe: `fetched` passes VERSION_RE (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/) plus
    CONTROL_CHARS_RE via assertSafeString, so no escape can arrive from the untrusted clone.
    PRE-EXISTING PATTERN, not introduced here: update.ts:97 and status.ts:116-117 interpolate the
    same unvalidated field into output already. This increment adds one more instance of it.
  recommendation: "Out of scope for this PR — a fix belongs in lib/validate.ts / lib/pharn-config.ts (outside the may-edit whitelist) and would change how legacy configs load (P7). File as a separate ticket covering all four sites at once, rather than hardening one."
```

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/commands/add.ts:340"
  problem: "The picker's cfg-threading block still carries a comment justifying itself partly by a skillsVersion skew the gate now makes impossible, so half its stated rationale is unreachable."
  evidence: |
    src/commands/add.ts (resolveAddPicker's loop) — "the records store is stamped with the persisted
    skillsVersion/commit, so a stale `cfg` makes the next pick's stamp check fail and silently drop
    its records." After the gate, result.version always equals config.skillsVersion; the COMMIT half
    of that rationale remains live and still justifies the block.
  recommendation: "Deliberately NOT changed — the brief's inside-file scope requires that sequence stay byte-equivalent, and the code is correct as-is. Recorded so a future reader does not mistake the dead half for evidence the threading is unnecessary."
```

### Lens results

- **L-floor → P0:** no blocking findings. One minor accuracy nit in a doc sentence (above).
- **L-eval → P1:** 8 new tests, one per invariant, plus two ordering pins. `versionGate` (`add.ts:74-78`)
  and both call sites (`:118`, `:183`) are **100% covered**; every remaining uncovered line in
  `add.ts` is a pre-existing `fetchRepo`-failure catch or defensive branch. Coverage rose on all four
  metrics (lines 82.72→86.95, stmts 80.16→84.25, funcs 91.66→92.30, branches 58.20→65.75). One minor
  symmetry gap (above). No `rule_id`/eval binding applies — pharn-cli ships no markdown capability, so
  the floor's eval check is vacuous and agrees with this lens.
- **L-trust → P2:** the increment emits no `findings.json`. The untrusted clone value reaches only a
  stderr message — never a path, ref, fetch, or config write on the refusal path — and is
  VERSION_RE + control-char validated before it gets there. One minor finding on the *config*-side
  value (above). No guaranteed decision rests on any tainted field.
- **L-axis → P3:** clean. `add.ts` still owns exactly one verb; `versionGate` is part of that verb's
  behavior, not a second axis. **No new imports at all** — `readSkillsVersion` and `REPO_URL` were
  already imported. No command→command or step→step reference.

## Verdict

**GREEN — 0 floor-gate (blocking) findings; 4 advisory findings.**

The increment does what it set out to do, and the claim is correctly scoped: `add` can no longer
manufacture the version skew, which is a narrower and more honest statement than "update is now
truthful". The two things worth acting on are both one-liners — the doc's unqualified "anything" and
three missing assertions on the picker refusal test. The P2 finding is real but pre-existing across
four sites and correctly deferred rather than half-fixed here.

Reaching this verdict is **not** authority to merge. `REVIEW.md` is prose only — no `findings.json`,
no `check-review.mjs` — and every `severity` above is an **LLM assignment (advisory, fix #3)**. The
floor-grade content of this stage is `validate.mjs` GREEN, which `/pharn-dev-build` and `/pharn-dev-verify`
already gated. The merge/fix/abandon decision is the human's.

---

## Proposed lesson candidates (NOT written to canon — `/pharn-dev-memory-promote` is a separate, human-gated run)

Both are **real** failures observed in this run (P7 — not hypothetical). Recorded here as candidates
with provenance; `/pharn-dev-review` declares no `.dev/memory-bank/**` path and writes no canon.

**Candidate 1 — an exit code is not evidence a gate ran.**
_Provenance: increment `add-version-gate`, `/pharn-dev-regress` Step 2, first capture._
The regress gate capture ran `node --test $TESTS` under zsh, which does not word-split unquoted
parameter expansions. All 44 test paths were passed as a **single** filename; both sides returned
`1` ("Could not find …") and the verdict would have compared two identical, meaningless exit codes.
It could not have produced a false *regression* (the codes matched), but it would have recorded a
gate as having run while it covered **nothing**. Generalized lesson: when a stage's verdict is an
exit-code comparison, capture a **work-count** alongside the code (tests run, files checked) and
assert it is non-zero — an exit code alone cannot distinguish "passed" from "never executed."

**Candidate 2 — the structural floor walks gitignored build artifacts.**
_Provenance: increment `add-version-gate`, `/pharn-dev-build` Step 3 and `/pharn-dev-verify` Step 1._
`validate.mjs .` exits 1 on any machine that has run `npm run build:install-local`, because it
descends into the seven gitignored `test-*/` fixture installs and finds pharn-oss's own
deliberately-red `floor/test-fixtures/red/skill.md`. This is permanent, unrelated to any feature, and
identical on an empty diff — it forces every dev-loop run to hand-adjudicate a red floor (this run
resolved it with a tracked-source worktree measurement, disclosed in `VERIFY.md`). Recurrence is
already evidenced: it is recorded in operator memory as a known gotcha. Generalized lesson: a floor
checker that walks untracked/gitignored build output measures the developer's machine, not the repo —
either respect `.gitignore` or take an explicit scope argument, so the floor verdict means the same
thing locally and in CI.
