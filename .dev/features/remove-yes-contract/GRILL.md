# GRILL — remove-yes-contract (advisory; gates nothing)

## F1 — the spec's test-anchor list is incomplete, and following it literally leaves the suite RED

**Problem.** The acceptance criteria say to fix "the three dispatch cases at lines 67-83" of
`tests/index.test.ts`. There are **five** assertions pinning `runRemove`'s call shape: the three named
plus `:212` (`keeps a numeric remove positional a string`) and `:225` (`leaves a bare add / remove
argument undefined`). Both spell `{ yes: false }`, and `toHaveBeenCalledWith` is an exact
argument-list match — so a build that trusted the spec's count would ship two red tests and then be
tempted to "fix" them by putting the parameter back.

**Reduction.** Discovery enumerated the call-shape pins with `grep -n "runRemove" tests/index.test.ts`
rather than by reading the cited range; the plan's `## Files` says five. The `:212` case also asserts
`typeof runRemove.mock.calls[0]![0] === 'string'` — that assertion is about the positional, not the
options object, and must survive the edit unchanged.

## F2 — this increment fixes prose, and no gate can read prose

**Problem.** The deliverable is "four sites stop lying." `lint:md` checks shape, `format:check`
checks TS formatting, and the test suite cannot see `CLAUDE.md`. Nothing prevents the same sentence
from being re-introduced next month, and a green `npm run check` after this PR is not evidence that
the docs are true.

**Reduction.** Partial and structural only: deleting `_opts` removes the artifact that made the false
sentence *look* justified — there is no longer a `yes` option in `remove`'s signature for a doc
writer to describe. A string-match test over `docs/commands/remove.md` was considered and rejected:
pinning prose by substring over-fits wording, and a doc test that passes on a re-worded lie is worse
than none. The guarantee audit marks this NOT floor-verifiable rather than implying the suite covers
it.

## F3 — the signature pin is a regex over source, and a regex that stops matching passes vacuously

**Problem.** Eval 5 reads `src/commands/remove.ts` and asserts the captured parameter list contains
no `yes`. If `runRemove` is renamed, re-wrapped by prettier, or given a generic, the regex matches
nothing — and `expect(undefined).not.toMatch(/yes/)` would be the *easy* reading of "no `yes` found."
A pin that silently stops pinning is worse than no pin (P5: fail closed).

**Reduction.** The test asserts `expect(params).toBeDefined()` **before** the negative assertion, and
asserts the parameter **count** is exactly 1 — so a non-matching regex fails loudly instead of
passing empty. The same shape as `tests/init.test.ts:323`, which collects offenders and asserts on
the list rather than on an absence.

## F4 — dropping a parameter from an exported function is an API change, unless it is not

**Problem.** `runRemove` is `export async function`. Removing a parameter from an exported symbol is
normally a breaking change, and this repo publishes to npm.

**Reduction.** Checked live: `package.json` ships `files: ["dist"]` with a single `bin` (`pharn` →
`dist/index.js`) and declares **no** `exports`/`main` entry for library consumers, and the build is
an esbuild bundle — nothing outside this repo can `import { runRemove }`. The only in-repo callers
are `src/index.ts` and `tests/remove.test.ts`, and every existing test call already passes one
argument. No CHANGELOG "Changed" entry is warranted; the `### Fixed` bullet is the honest tier.

## F5 — after the fix, `pharn remove --yes` is still silently accepted, and that is a real (accepted) gap

**Problem.** Option A makes the flag inert *and keeps it parseable*: `--yes` stays a declared minimist
boolean because it is `update`'s flag, so `pharn remove --yes` exits 0 having neither honored nor
refused it. A user who typed it to suppress a prompt still gets the picker's confirm, with no
feedback explaining why.

**Reduction.** Bounded, not closed. The worst case is an unexpected prompt, never an unexpected
deletion — the confirm defaults to No and cancelling is a graceful exit 0. `docs/commands/remove.md`
now says `--yes` belongs to `update` and that `remove` ignores it, so the answer is one page away.
Making it an *error* requires the per-command flag allowlist (FABLE 4.5's follow-up), which the spec
puts out of scope; the answer that prompt needs from this one — **`remove` does not accept `--yes`** —
is recorded in the PR description so the allowlist author does not have to re-derive it.

## Verdict

**Advisory: proceed.** F1 changes the build (five pins, not three) and F3 changes how the new
structural pin is written. F2 and F5 are honest scope limits recorded in the guarantee audit rather
than defects to fix here; F4 clears a blocking-looking concern.
