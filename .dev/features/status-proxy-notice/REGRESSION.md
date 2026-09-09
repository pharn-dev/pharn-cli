# REGRESSION — status-proxy-notice

**Base:** `558b8dd8082e28f9d9b2e85eae0a1d5e95a8c868`
(`docs: point SECURITY.md at the fetch pharn performs, not the one it removed (#159)`)

Base resolution was deterministic (P5): `git status --porcelain` was non-empty — a working-tree
dogfood build — so `base = HEAD`. `HEAD` is also exactly `origin/main`, so the two candidate rules
agree. Worth noting for the reader: `origin/main` has advanced since this session's opening snapshot
(`377e1f5`); sibling PRs #158, #160 and #159 landed in between, and the baseline is the **current**
main, not the stale one.

## Partition (from `check-regress.mjs scope`, exit 0)

| set                  | contents                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `inside`             | `CHANGELOG.md`, `src/commands/status.ts`, `tests/status.test.ts`      |
| `declared` (PLAN.md) | `src/commands/status.ts`, `tests/status.test.ts`, `CHANGELOG.md`      |
| `escaped`            | none — `inside` ⊆ `declared`                                          |
| `outside_tests`      | 46 floor tests (`.dev/floor/*.test.mjs`, `.claude/hooks/*.test.cjs`)  |
| `outside_eval_pairs` | none                                                                  |

**Style gates skipped on BOTH sides, deterministically.** `inside` touches no shared style config
(`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so over the
outside files — byte-identical at base and head — a style result cannot flip. They are therefore
absent from both maps, keeping the gate sets identical (a mismatch would have forced
`inconclusive`, never a silent pass). This also avoids `npm ci` in the baseline worktree.

## Per-gate exit codes

| gate       | base | head | result    |
| ---------- | ---- | ---- | --------- |
| `tests`    | 0    | 0    | unchanged |
| `validate` | 0    | 0    | unchanged |

`regressions[]`: empty. `pre_existing[]`: empty.

## Verdict (floor — computed by `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

The verdict rests entirely on the exit-code comparison above; no judgment of mine entered it. The
in-scope suite was separately GREEN at head (`npm run check`: format:check, lint, lint:md, typecheck,
and vitest **1126 passed / 56 files**, up from 1123 — the +3 are this increment's own new cases, all
inside `tests/status.test.ts`).

**The honest residual (P7):** this catches **exactly what its suite catches — nothing more.** A
regression no deterministic check covers is invisible to it. The claim is "deterministically-detectable
breakage outside the feature is caught," **not** "nothing broke."

## Tooling observation — a false-positive scope breach worth recording (not a build escape)

The first `scope` invocation exited **1** with a blocking `P0`/fix#7 finding:

> `changed file '.pharn/writes-scope.json' is outside the declared writes-scope (fix #7) — the build
> escaped its plan's ## Files`

**That is a false positive, and it will fire on every `/pharn-dev-regress` run in this repo.** Grounded,
not assumed:

- `.claude/hooks/enforce-writes-scope.cjs:61` declares `const ALWAYS = [".pharn/**"]` — the file is
  always-writable process scratch, so the fix#7 hook never gated it and no build could have "escaped"
  into it.
- The file is **tracked** (`git check-ignore` exits 1; it has commit history), so `git diff --name-only`
  reports it like any source file.
- It is rewritten by `set-writes-scope.cjs` itself — the fix#7 **mechanism** — once per stage. Every
  stage of this chain necessarily dirties it.

So `scope`'s changed-set does not exempt the `ALWAYS` list that the enforcing hook honors: the two
halves of fix #7 disagree about `.pharn/**`. The partition above was therefore computed over the three
genuine source changes, and the exclusion is recorded here rather than applied silently. This is a
**tooling gap in the dev-loop, not a finding against this increment**, and it is out of scope for this
PR (which may touch only `src/commands/status.ts`, `tests/status.test.ts`, `CHANGELOG.md`).
