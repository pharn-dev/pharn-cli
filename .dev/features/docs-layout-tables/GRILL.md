# GRILL — docs-layout-tables (advisory)

Five findings raised against the plan and its first draft. Four changed the increment.

## F1 — the table would have documented two files that never land

**Problem.** `PHARN_TRUSTED_DOCS` names four documents, so the obvious `pharn`-first row is
"`pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`, `pharn/THREAT-MODEL.md`, `pharn/LIMITS.md` — the
four trusted spec docs". Deriving the row from the CONSTANT rather than from what an install
produces would have replaced one wrong table with another: `git ls-tree origin/main pharn/` on the
live upstream returns no `THREAT-MODEL.md` and no `LIMITS.md`, and every reader existence-guards each
entry, so a `pharn` install silently lands two of the four. The user hunting `pharn/LIMITS.md` after
a fresh init would hit exactly the reproduction the brief describes, one path over.

**Reduction.** The row names only the two that land. The note under it names the other two, says the
copy is conditional on the fetched version shipping the doc at that path, and states the live split:
flat lands all four at the root, `pharn` lands two. The derived test requires all four spellings to
appear in the SECTION, not in a row — so the constant and the docs still cannot diverge silently.

## F2 — "no source changes" was about to be read as "no test either"

**Problem.** The brief says markdown-only and that "the corresponding gate is the markdown linter".
That is false as a guarantee: `lint:md` checks table syntax and would have been just as green on the
pre-change tables, which were three releases stale. `format:check` never opens a `.md` file here
(`prettier --check "src/**/*.ts" "tests/**/*.ts" "*.config.ts"`). Shipping the fix alone leaves the
drift free to recur, and the repo rule is "update the matching test before touching code" — there was
no matching test to update.

**Reduction.** Added `tests/docs-install-tables.test.ts`, deriving the required set from
`layoutPaths('pharn')` and the layout-invariant constants. A test is not a source change; `src/` is
untouched. Its negative half was RUN, not assumed: with the two doc files stashed, all five
assertions go red naming the pre-change defects.

## F3 — a "no flat paths" rule would have been unfalsifiable or wrong

**Problem.** The first sketch of the forbidden half was "the table must not contain `.dev/floor`".
Two ways that fails: the LICENSE row legitimately carries `PHARN-LICENSE` (a flat spelling, named on
purpose beside `pharn/LICENSE`), and the layout note under the table has to name the flat paths —
that is what makes it a note. A rule scoped to the whole section would have forced the note out; a
rule with hand-written exceptions would have stopped being derived from the code.

**Reduction.** The scopes are split and the split is the assertion: REQUIRED is checked over the
section (table + note), FORBIDDEN over the Artifact column only, and the forbidden list is
`layoutPaths('flat')`'s five DIRECTORY fields — `license.to` is excluded by construction, not by a
literal.

## F4 — `pharn-core/` is not "the same surface at the project root"

**Problem.** The brief's suggested note says the flat layout "puts the same surfaces at the project
root". Applied to the full row set that is untrue for `pharn-core`: `constants.ts:55-59` records that
upstream has no root `pharn-core/` — the flat path is resolved for `LayoutPaths` uniformity and
no-ops on every flat clone. A note claiming a root `pharn-core/` documents a directory the CLI
provably never creates.

**Reduction.** Both notes list the flat surfaces explicitly and say flat "ships no `pharn-core/`", so
the one non-mirrored surface is named rather than swept into a blanket sentence.

## F5 — widening the two prose lines would have quietly reverted PR 6

**Problem.** The brief quotes `docs/commands/init.md:112` and `docs/commands/status.md:64-65` in
their pre-PR-6 form. Both moved (to `:130` and `:69-70`) and both gained content: `features/README.md`
in the copied/compared set and "minus test files and `test-fixtures/`". Rewriting from the brief's
quotes would have deleted both additions and left no trace in the diff that they were ever there.

**Reduction.** Each line was re-read from disk and edited in place; `features/README.md` and the
`test-fixtures/` clause survive in both. The init.md `Copy product surfaces` cell was ALSO shortened
rather than extended — the per-layout paths moved into the adjacent `Mirror the layout` row, which is
the row that already existed to carry them.

## Verdict (advisory)

**Proceed.** Four of five findings changed the increment; F1 and F2 changed what ships. The residual
risk is stated in the plan's guarantee audit and not papered over: the new gate pins the path SET,
never the prose, and covers the two tables only.
