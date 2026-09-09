# PLAN — status-proxy-notice

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Hoist `status`'s proxy notice above the `--no-drift` guard so it precedes every fetch the command can make, and invert the test that pinned its absence.
- layer(s): pharn-cli `src/commands/` (one verb per file, P3) — no layer boundary crossed
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## The defect (verified live this run, P6)

`src/commands/status.ts` → `runArchetypeStatus`:

| line    | what happens                                                   |
| ------- | -------------------------------------------------------------- |
| `:58`   | `if (!drift) {` — the `--no-drift` guard                        |
| `:63`   | `await fetchRemoteSkillsVersion()` — **a real network fetch**   |
| `:74`   | `return` — the `--no-drift` path ends here                      |
| `:79-80`| the comment claiming `--no-drift` "never clones ⇒ stays silent" |
| `:81-84`| `detectProxyNotice` / `log.warn` — **below the return**         |
| `:90`   | `await fetchRepo()` — the drift path's clone                    |

`fetchRemoteSkillsVersion` is a real `await fetch(...)` (`src/lib/skills-version.ts:211`). So
`--no-drift` **fetches and never warns**. A proxy-only user gets an unexplained timeout — the exact
case the notice was added for.

**The comment at `:79-80` is the root cause, not a side-effect.** It reads "Inside the drift branch,
so `status --no-drift` — which never clones — stays silent." Both clauses are true; the inference is
false. It conflates **never clones** with **never fetches**. In this repo comments are load-bearing
spec, so the wrong reason is what let the placement look deliberate.

**The guarantee being violated is documented in two trusted places, and both already say the
opposite of the code** — so this is code-catches-up-to-docs, not a doc change (P4):

- `LIMITS.md:117` — "Every network-bearing command warns before fetching when it finds a proxy
  variable set." `LIMITS.md` is floor-write-protected (P2) and lives upstream; it is **not** edited
  here.
- `LIMITS.md:114-116` names `status --no-drift`'s version check as a fetch **in the same paragraph**.
- `docs/troubleshooting.md:191-193` lists "`SKILLS_VERSION` for `update` / `status --no-drift`"
  among "Every network call it makes", and `:204` promises "If a proxy variable is set, `pharn` says
  so **before** it fetches". The user-facing doc is already correct; only the code is wrong. **No doc
  edit is in scope** — this fix removes an existing P4 contradiction rather than creating one.

## Files

- `src/commands/status.ts` — hoist the one notice block above the `if (!drift)` guard; rewrite the
  `:79-80` comment — layer: command (P3, one verb)
- `tests/status.test.ts` — **invert** the assertion that pins the bug; retitle it; fix the
  describe-block comment; add order + fire-exactly-once coverage — layer: spec (P1)
- `CHANGELOG.md` — one short entry under the existing `## [Unreleased]` → `### Fixed`

Exactly three files. No sibling-PR file is touched: `src/commands/{add,init,update}.ts`,
`src/index.ts`, `src/lib/*`, `src/steps/install-archetype.ts` are all out of scope.

## The change

**One** call site, hoisted — never two. Two call sites (one per branch) would satisfy the letter of
the guarantee and re-open it on the next branch added, and would make "fires exactly once" a thing to
re-verify rather than a property of the shape. Placement invariants preserved:

- **before every fetch** — it now dominates both `fetchRemoteSkillsVersion()` (`:63`) and
  `fetchRepo()` (`:90`), because it dominates the branch that separates them;
- **before any spinner starts** — a `log.warn` into a live clack spinner frame is overwritten. Both
  branches start their spinner *after* the guard, so hoisting above the guard is still pre-spinner
  for both. This is the reason the original was pre-spinner and it is not weakened;
- **after `loadArchetypeConfigOrExit`** (in `runStatus`, `:44`) — a legacy-config refusal is
  promptless, local, and costs zero round-trips; it must still win over a proxy warning. Unchanged:
  the hoist stays inside `runArchetypeStatus`, which only runs past that load;
- **stderr** — `log.warn` is clack's stderr channel. Untouched.

The new comment must state that the notice precedes **every** fetch this command can make — naming
the `--no-drift` `SKILLS_VERSION` fetch and the drift clone as the two — and must **not** repeat the
"never clones" reasoning in any form.

## The test that pinned the bug (named, not quietly flipped)

`tests/status.test.ts` **currently asserts the violation**. This is the load-bearing fact of this
increment and it is recorded here rather than fixed in silence:

- `:182-193`, `it('says nothing under --no-drift, which never clones')` →
  `expect(warned).not.toContain('will not use it')`.
- `:154-157`, the describe-block comment → "status clones on the drift path only, so the notice must
  fire there and be silent under --no-drift. The --no-drift silence was previously asserted only in
  a code comment."

That last sentence is the whole story: someone noticed the silence was only a comment and **promoted
the comment to a test** — propagating the wrong reason from prose into the suite. The suite then
defended the bug. A green `npm test` was evidence *for* the defect.

So this is **not** "add a test". It is **"an existing assertion encodes a documented guarantee's
violation and must be inverted"**. A test that pins a documented guarantee's violation is how the bug
survived contact with a passing suite (P1: tests are the spec — a wrong spec ships the wrong
behavior). The human **pre-approved** this inversion.

Reference for reviewers: the drift-path case at `:161-179` already uses the correct pattern
(`warnedBeforeFetch` captured inside `fetchRepo.mockImplementationOnce`), so the inverted case
mirrors an existing shape rather than inventing one.

## Evals to write (P1)

`tests/status.test.ts`, `describe('proxy notice')` — the four rows of the placement table:

- `--no-drift` + proxy set → **warns**, and the warn happens **before** `fetchRemoteSkillsVersion`
  resolves (captured in `fetchRemoteSkillsVersion.mockImplementationOnce`, mirroring `:161-179`) —
  **the inverted case**
- `--no-drift` + proxy set + `fetchRemoteSkillsVersion` **rejects** → the warning was still emitted,
  and emitted before the fatal report. **Adopted from the grill (P1).** Every other row exercises a
  fetch that SUCCEEDS, which leaves the one scenario the notice exists for — a proxy-only network
  where the fetch FAILS — as the single untested path. Without it, a future edit that emitted the
  notice only on the success path (e.g. moving it inside the `try`, after the `await`) would go
  unnoticed. `stubProcessExit` makes the `exit(1)` throwable, so this is mechanically available.
- drift path + proxy set → warns before `fetchRepo` (existing `:161-179`, must stay green)
- either path + proxy set → the `log.warn` carrying the notice fires **exactly once**
- no proxy variable set → silent (existing `:195-208`, must stay green — silence is still the
  complete answer when nothing is set)

## Guarantee audit (P0)

- "`status` warns before every fetch when a proxy variable is set" → **advisory** (a message, not a
  gate: it changes nothing about what the network does). Its *placement* is pinned by **floor:
  vitest assertions** (P1) — the order assertion is a deterministic before/after over a mock call,
  not a judgment. The message itself remains an explanation of a named limit (`LIMITS.md §3a`),
  never a mitigation: **pharn still does not use the proxy, and this fix does not make it work.**
  Claiming otherwise would be the disease.
- "exactly one warning reaches the user per run" → **floor: count check** — `toHaveBeenCalledTimes`
  over the mocked `log.warn`. Deterministic.
- "there is exactly one call site in the source" → **advisory**. Relabeled after the grill (P0): a
  count over `log.warn` **cannot** see source shape. `--no-drift` and drift are mutually exclusive,
  so a notice duplicated into both branches would still emit exactly one warning per run and every
  assertion above would stay green. The one-call-site shape rests on the comment and on review, not
  on the floor — so it is labeled advisory rather than credited to a test that cannot check it.
- "no behavior other than the notice's position changes" → **floor: the existing status suite** stays
  green. Exact delta: **one** case inverted + retitled (`:182-193`), **one** describe-block comment
  corrected (`:154-157`), **two** cases added (failure-path order, fire-exactly-once), **two** cases
  untouched (`:161-179` drift-path order, `:195-208` silence). `/pharn-dev-regress` recomputes this
  across the whole suite.

## Trust audit (P2)

No new untrusted input is ingested. The proxy **value** read from `process.env` is
attacker-influencable and is already handled: `detectProxyNotice` can only surface a key whose
lowercase equals `https_proxy` (safe to print by construction), and the value is rendered through
`redactProxyUrl` — userinfo → `***`, unparseable → the fixed literal `(set)`, capped at 120 chars.
**This increment moves that call, it does not change it**, so the redaction boundary is unchanged and
no taint reaches a new sink. The value is still never written to `pharn.config.json`.

## Determinism audit (P5)

The hoisted block's branch is `detectProxyNotice(...) !== null` — a presence test over an injected
env record, pure, no classification, no I/O. Its terminal case is `null` → silence, which is the
**complete and correct** answer when nothing is set, not a degraded fallback. `--no-drift` vs drift
remains a boolean membership test on `opts.drift`. No fallback ends in a guess.

## Out of scope — verified, not fixed here (P7: named, not hidden)

- **`src/commands/update.ts` has the same defect class, and worse.** Its `fetchRemoteSkillsVersion()`
  at `:144` is its **first** network call, while its notice sits at `:203` — 59 lines below, guarding
  only `fetchRepo()` at `:212`. A proxy-only `pharn update` therefore dies at `:144`
  ("Failed to check for updates") with **no warning at all**, and the "already up to date"
  early-return at `:157-160` fetches and returns without reaching the notice either. That file
  belongs to a **sibling PR**; fixing it here would collide. Reported, not touched — it must not
  vanish.
- **Not a defect, do not "fix":** `detectProxyNotice` matches only `https_proxy` spellings, so
  `HTTP_PROXY` is deliberately never a trigger — pinned at `tests/proxy-env.test.ts:37`. An audit
  note that "`HTTP_PROXY` produced no warning" is expected behavior, not part of this bug.

## Open questions (HALT)

None. Every branch, line number, and doc claim above was read from disk this run; the baseline was
measured green before any change (`npx vitest run tests/status.test.ts` → 28 passed, including the
case that pins the bug). The one judgment call — inverting a committed assertion — was
**pre-approved by the human** and is named in full above rather than folded into the diff.
