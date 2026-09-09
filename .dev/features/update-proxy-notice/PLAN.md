# PLAN — update-proxy-notice

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Hoist `update`'s proxy notice out of the lock closure to the top of `runArchetypeUpdate` so it precedes BOTH fetches the command can make, and invert the test that pinned its absence on the up-to-date early return.
- layer(s): pharn-cli `src/commands/` (one verb per file, P3) — no layer boundary crossed
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## The defect (verified live this run, P6)

`src/commands/update.ts` → `runArchetypeUpdate`:

| line       | what happens                                                                 |
| ---------- | ---------------------------------------------------------------------------- |
| `:140-141` | `spinner()` / `s.start('Checking for updates')`                               |
| `:144`     | `await fetchRemoteSkillsVersion()` — **the command's FIRST fetch**            |
| `:147-149` | on throw: `s.stop('Failed to check for updates')` → `reportFatal` → `exit(1)` |
| `:156-160` | `current && !force` → `outro('Already up to date …')` → **`return`**          |
| `:254`     | `withProjectLock(cwd, 'update', …)`                                          |
| `:255-259` | the comment claiming "a refused run performs no fetch"                       |
| `:260-263` | `detectProxyNotice` / `log.warn` — **inside the lock closure**                |
| `:273`     | `await fetchRepo()` — the tarball download                                   |

`fetchRemoteSkillsVersion` is a real `await fetch(...)` (`src/lib/skills-version.ts`). It is the
first statement of the try at `:143` and is **unconditional** — every `runArchetypeUpdate` run makes
it. The notice at `:260` dominates only `fetchRepo()` at `:273`. So:

- a **proxy-only `update` dies at `:144`** with `Failed to check for updates` and **no warning at
  all** — the notice is 116 lines below the failure and is never reached;
- the **already-up-to-date early return (`:156-160`) fetches and returns** without ever reaching the
  notice either;
- a **lock refusal** (`ProjectLockedError`, thrown before the closure body runs) likewise fetched
  first and warned never;
- and a **confirm cancel** (`:197` `cancelAndExit()`) fetched first and warned never.

The last two are the paths where the hoist **adds** output: post-fix, a lock-refused run and a
cancelled run each print the notice. Both are **correct** — the version fetch at `:144` really did
happen — and the lock-refusal case is the sharpest evidence that the old comment's premise was
false, which is why it gets a test below rather than only a paragraph. **Both adopted from the grill
(P1, P0).**

This is the same defect just fixed in `status` (PR #165), and **worse**: in `status` the unwarned
fetch was confined to one flag (`--no-drift`); in `update` the unwarned fetch is on **every single
run**, because it is the first thing the command does.

**The comment at `:255-259` is the root cause, not a side-effect.** It reads:

> Inside the lock: a refused run performs no fetch, so a warning about how that fetch would behave
> is noise it should never print.

The premise is **false for `update`**. By the time the lock is attempted, `fetchRemoteSkillsVersion`
has already gone over the wire. `src/commands/add.ts:178-179` carries the same reasoning, and there it
is **true** — `add` makes no pre-lock fetch, so its notice really does dominate its only fetch. The
precondition holds in one command and not the other; whether the words travelled from `add` to
`update` is not something read this run and is not claimed (P6, adopted from the grill). This is
`status`'s "never clones ≠ never fetches" in `update`'s dialect: **"the lock refused it" ≠ "it never
fetched".**

The contradiction is already written down **twenty lines above** it, in P-9's own lock comment
(`:232-236`): _"the `fetchRemoteSkillsVersion` check further up has already run, so a refused
`update` still makes ONE small guarded GET … saying 'zero round-trips' here would be false."_ Two
comments in one function assert opposite things about the same run. P-9's is correct; the proxy one
is not. In this repo comments are load-bearing spec, so the wrong reason is what made the placement
look deliberate.

**The guarantee being violated is stated in two trusted places, both of which already say the
opposite of the code** — so this is code-catches-up-to-docs, not a doc change (P4):

- `LIMITS.md:117` — "Every network-bearing command warns before fetching when it finds a proxy
  variable set, so the failure is explained rather than silent." `LIMITS.md` is floor-write-protected
  (P2, `protect-trusted-paths.cjs`) and is **not** edited here.
- `LIMITS.md:114-116` names **`pharn update`'s version check** as a plain-`fetch` network call **in
  the same paragraph** — the trusted doc names the exact fetch site the notice skips.
- `docs/troubleshooting.md:113` lists `update`'s `SKILLS_VERSION` read among the network calls, and
  `:204` promises "If a proxy variable is set, `pharn` says so **before** it fetches". The
  user-facing doc is already correct; only the code is wrong. **No doc edit is in scope** — this fix
  removes an existing P4 contradiction rather than creating one.

## Files

- `src/commands/update.ts` — hoist the one notice block to the top of `runArchetypeUpdate` (above the
  `Checking for updates` spinner); rewrite the `:255-259` comment — layer: command (P3, one verb)
- `tests/update.test.ts` — **invert** the assertion that pins the bug; retitle it; fix the
  describe-block comment; add first-fetch order, failure-path, fire-exactly-once, lock-refusal, and
  two precedence cases — layer: spec (P1)
- `CHANGELOG.md` — one short entry under the existing `## [Unreleased]` → `### Fixed`

Exactly three files. No sibling-PR file is touched: `src/commands/{add,init,status,list,remove}.ts`,
`src/index.ts`, `src/lib/*`, `src/steps/*`, `docs/*` are all out of scope. `LIMITS.md` is upstream +
floor-write-protected and is not edited.

## The change

**One** call site, hoisted to the first statement of `runArchetypeUpdate` — never two. Two call sites
would satisfy the letter of the guarantee and re-open it on the next early return added, and would
make "fires exactly once" a thing to re-verify rather than a property of the shape.

Placement invariants, each preserved deliberately:

- **before every fetch** — the top of `runArchetypeUpdate` dominates `fetchRemoteSkillsVersion()`
  (`:144`) unconditionally, and therefore dominates everything downstream of it including
  `fetchRepo()` (`:273`). There are exactly two fetch sites in the file (verified by grep this run);
  no third path exists.
- **before any spinner starts** — a `log.warn` into a live clack spinner frame is overwritten. The
  `Checking for updates` spinner starts at `:141` and the `Updating from …` spinner inside the lock
  starts at `:265-267`; the top of the function is above both, so the block is pre-spinner for both.
  This is why the original was pre-spinner and it is strengthened, not weakened.
- **after `loadArchetypeConfigOrExit`** (`:76`, in `runUpdate`) — a legacy-config refusal is
  promptless, local, and costs zero round-trips; it must still win over a proxy warning. Unchanged:
  the hoist stays inside `runArchetypeUpdate`, which only runs past that load.
- **after the TTY gate** (`:90-101`, in `runUpdate`) — the same principle one step later: a piped
  `update` without `--yes` gets its actionable "run it in an interactive terminal, or pass `--yes`"
  error and **zero round-trips**, not a proxy note about a fetch it will never make. The hoist does
  not move that gate and stays below it.
- **NOT inside the lock, and P-9's lock/fetch ordering is untouched** — the block is _removed_ from
  the closure and nothing else in `withProjectLock` moves. The lock is still taken after the confirm
  and before `fetchRepo`.
- **stderr** — `log.warn` is clack's stderr channel. Untouched.

**It cannot fire spuriously.** `fetchRemoteSkillsVersion()` is the unconditional first statement of
the try, so every run that reaches the notice also fetches. The old placement could warn **too late**
(after a fetch had already failed, or never at all); the new one cannot warn **too early**.

The new comment must state that the notice precedes **every** fetch this command can make — naming
the `SKILLS_VERSION` read and the tarball download as the two — must record that the old sentence's
premise was false and why (`add`'s precondition does not hold here; P-9's own comment in the same
function already says so), and must **not** repeat the "a refused run performs no fetch" reasoning
in any form.

## The test that pinned the bug (named, not quietly flipped)

`tests/update.test.ts` **currently asserts the violation**, exactly as `status`'s suite did:

- `:346-358`, `it('says nothing when update returns early without cloning')` →
  `expect(warned).not.toContain('will not use it')`.
- `:345`, the case comment → "No clone on the up-to-date early return, so no transport to describe."
- `:319-322`, the describe-block comment → "update clones, so the notice fires; the early-return
  'already up to date' path does not clone and must stay silent."

Same mistake, same mechanism: the wrong reason was promoted from prose into the suite, so the suite
**defended the bug** and a green `npm test` was evidence _for_ it. And the early return does have a
transport to describe — it reaches the network at `fetchRemoteSkillsVersion` before it returns.

So this is **not** "add a test". It is **"an existing assertion encodes a documented guarantee's
violation and must be inverted"** (P1: tests are the spec — a wrong spec ships the wrong behavior).
The human **pre-approved** this inversion.

Reference for reviewers: the existing `:326-343` case already uses the correct pattern
(`warnedBeforeFetch` captured inside `fetchRepo.mockImplementationOnce`), so every case below mirrors
an existing shape rather than inventing one.

## Evals to write (P1)

`tests/update.test.ts`, `describe('proxy notice')`:

- **the inverted case** — up-to-date early return (`skillsVersion === latest`) + proxy set → **warns**,
  and the warn happens **before** `fetchRemoteSkillsVersion` resolves (captured inside
  `fetchRemoteSkillsVersion.mockImplementationOnce`). Also asserts `fetchRepo` **not** called, so the
  early return still does what it says.
- **first-fetch order on the full path** — proxy set + an out-of-date config → the warn precedes
  `fetchRemoteSkillsVersion`, not merely `fetchRepo`. This is the case that would have caught the
  defect: the existing `:326-343` "warns before the clone" was green _throughout_ the bug.
- **failure path** — proxy set + `fetchRemoteSkillsVersion` **rejects** → the warning was still
  emitted, and emitted before the fatal report + `exit(1)`. This is the scenario the notice exists
  for (proxy-only network, direct egress blocked); every other row exercises a fetch that succeeds,
  which would leave a future edit that warned only on the success path undetected. Carried over from
  the `status` grill's P1 finding rather than re-learned.
- **exactly once** — parametrized over the early-return path and the full update path: the `log.warn`
  carrying the notice fires **exactly one** time per run.
- **the lock refusal still warns** — proxy set + the lock already held → the run is refused **and** the
  notice was emitted, because the version fetch already happened. **Adopted from the grill (P1).**
  This is the plan's own central argument — that "the lock refused it" never implied "it never
  fetched" — promoted from prose into an assertion. Without it, the one path whose output the hoist
  *adds* stays unspecified in both directions.
- **the config refusal still wins** — proxy set + `loadArchetypeConfigOrExit` throws → **silent**, and
  no fetch. Pins "the actionable error beats the proxy note", the ordering `CLAUDE.md` states.
- **the TTY refusal still wins** — proxy set + non-TTY + no `--yes` → **silent**, `exit(1)`, and no
  fetch. Pins that a refusal past the gate still costs zero round-trips.
- **silence when nothing is set** — existing `:360-372`, must stay green unmodified.
- **warns before the clone** — existing `:326-343`, **left exactly as it is**: title and assertion both
  untouched. Settled here rather than left to the builder (grill P1). The title is still accurate
  post-fix; the case is merely *weak* — it was green throughout the defect — and the new
  first-fetch-order case is what carries the discrimination.

## Guarantee audit (P0)

- "`update` warns before every fetch when a proxy variable is set" → **advisory** (a message, not a
  gate: it changes nothing about what the network does). Its _placement_ is pinned by **floor: vitest
  assertions** (P1) — each order assertion is a deterministic before/after over a mock call captured
  at call time, not a judgment. The message remains an explanation of a named limit (`LIMITS.md §3a`),
  never a mitigation: **pharn still does not use the proxy, and this fix does not make it work.**
  Claiming otherwise would be the disease.
- "exactly one warning reaches the user per run" → **floor: count check** — a length assertion over
  the filtered `log.warn` calls. Deterministic.
- "there is exactly one call site in the source" → **advisory**. A count over `log.warn` **cannot**
  see source shape: the early return and the full path are mutually exclusive, so a block duplicated
  into both would still emit exactly one warning per run and every assertion above would stay green.
  Labeled advisory (the comment + review), not credited to a test that cannot check it. Carried over
  from the `status` grill's P0 finding — recorded here so the relabeling is not re-litigated.
- "the notice never fires on a run that makes no network call" → **floor: vitest** for the two
  refusals that precede it (config, TTY), and **structural** past them: `fetchRemoteSkillsVersion()`
  is the unconditional first statement of the try, so **all four** exits below it — the fetch
  failure, the up-to-date return, the confirm cancel, and the lock refusal — are downstream of a
  completed round-trip. The enumeration is now exhaustive rather than partial (grill P0): the cancel
  and lock-refusal paths gain a warning, and in both cases it is honest.
- "no behavior other than the notice's position changes" → **floor: the existing update suite** stays
  green. Exact delta: **one** case inverted + retitled (`:346-358`), **one** describe-block comment
  corrected (`:319-322`), **six** cases added, **two** cases untouched (`:326-343` clone-order,
  `:360-372` silence). `/pharn-dev-regress` recomputes this across the whole suite.

## Trust audit (P2)

No new untrusted input is ingested. `detectProxyNotice` reads `process.env` — **operator-controlled,
not remote** — and `proxyNoticeMessage` already redacts inline credentials and truncates/escapes the
value (`src/lib/proxy-env-format.ts`, pinned by `tests/proxy-env-format.test.ts`). Moving the call
site changes **when** that already-sanitized string is printed, never **what** it contains or where
it is sourced from. No fetched content, no filesystem write, no `safeJoin` surface is involved.

## Determinism audit (P5)

The one branch is `if (proxyNotice)` — a null check over `detectProxyNotice`'s return, which is
itself a deterministic lookup over a fixed variable-name list (`tests/proxy-env.test.ts` owns that
truth table). No classification, no guess, no fallback. The hoist removes a branch-dependent emission
rather than adding one: the notice's position becomes unconditional within the function.

## Open questions (HALT)

None. Every fact above was read from live files this run: the two fetch sites and the single notice
site (`grep` over `src/commands/*.ts`), the contradicting P-9 comment (`update.ts:232-236`), `add`'s
true-precondition twin (`add.ts:174-183`), the inverted-assertion test (`tests/update.test.ts:346-358`),
and both trusted-doc citations (`LIMITS.md:107-118`, `docs/troubleshooting.md:113,204`).
