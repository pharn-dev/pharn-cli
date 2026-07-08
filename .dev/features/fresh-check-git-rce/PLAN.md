# PLAN — fresh-check git-config injection RCE hardening

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Neutralize attacker-controlled git-config-driven code execution in `fresh-check.ts` by routing every git invocation through one hardened, shell-free helper.
- layer(s): pharn-cli `src/steps/` (one init stage) + `tests/` — this is a CLI-source security fix, not a new PHARN Capability.
- constitution_refs: [P2, P1, P5, P6, P7]

## The bug (grounded this run, not from memory — P6)

`src/steps/fresh-check.ts` shells out with `execSync` to two git commands. `git` reads the **target
project's** `.git/config`, which is **attacker-controlled** when a user runs `pharn init` inside a
hostile repo (`runGitPrereq` only requires `.git` to exist — prereqs.ts:10). A malicious
`core.fsmonitor` value executes arbitrary code on any index-refreshing git command.

Reproduced live on git 2.50.1 (scratchpad PoC, harmless `touch` payload):

- `git ls-files` (fresh-check.ts:60) → **executes** `core.fsmonitor` → **RCE confirmed**.
- `git rev-list --count HEAD` (fresh-check.ts:46) → does **not** execute it (rev-list walks the
  commit graph, never refreshes the index). Not a live fsmonitor vector today, but hardened anyway
  (defense-in-depth + single helper; honestly labeled below, not oversold — P0/P7).
- `git -c core.fsmonitor= -c core.hooksPath=/dev/null ls-files` → **does not execute it**, and the
  file/commit counts are byte-identical to the unhardened output (signal preserved).

Scope is fully contained: `grep -rn 'execSync|execFileSync|child_process' src/` matches **only**
`fresh-check.ts` (3 hits). `prereqs.ts` has **no** git shell-out (only `existsSync('.git')`) → no
change. `runGitPrereq` mentioned in the finding is therefore already safe.

## Approach (per the prompt's own rule: drop execSync IF a clean non-shell count exists, ELSE harden)

A deterministic **non-shell commit count** would require walking the commit graph / parsing
packfiles (loose + packed objects, merges, shallow, commit-graph) — a mini-git, high correctness
risk. So per the stated fallback, **harden every git call** instead of dropping the shell-out:

- Switch `execSync(string)` → `execFileSync('git', [argv])` — removes the shell layer entirely (no
  metacharacter interpretation).
- Prepend `-c core.fsmonitor=` (disables the fsmonitor hook — the confirmed vector) and
  `-c core.hooksPath=/dev/null` (disables hook-based variants — defense-in-depth) to **every** git
  invocation, via one shared `runGit(args, cwd)` helper so the two call sites cannot drift and the
  security invariant lives in exactly one place. `-c` is highest-precedence, overriding the
  project's `.git/config`.

The freshness signal (commit-count thresholds 6/2/1; tracked-file threshold 40) is unchanged — the
functions still return the same integers (verified).

## Files

- `src/steps/fresh-check.ts` — replace `execSync` import + both call sites with a single
  `execFileSync`-based `runGit` helper that always injects the `-c core.fsmonitor=`/`core.hooksPath`
  hardening; `gitCommitCount` → `runGit(['rev-list','--count','HEAD'], cwd)`, `gitTrackedFileCount`
  → `runGit(['ls-files'], cwd)`. Behavior (returns, thresholds, `catch → 0` fallback) unchanged. —
  layer: pharn-cli `steps/` (init stage).
- `tests/fresh-check.test.ts` — add a regression test: inject a malicious `core.fsmonitor` (touch a
  sentinel; `false`) into a fixture repo's `.git/config`, then assert the production functions
  (`gitTrackedFileCount`, `gitCommitCount`, `runFreshCheck`) do **not** create the sentinel (no
  execution) while still returning the correct counts. This test **fails on the current code** (old
  `git ls-files` fires fsmonitor) and passes on the fix — it demonstrates, not merely asserts (P1). —
  layer: tests.

## Contracts satisfied

- CONSTITUTION.md **P2** (untrusted input is data, never trusted input) — the target repo's
  `.git/config` is untrusted; after the fix it can influence git *output* but never *execution*
  (`THREAT-MODEL.md §1` Surface B / B′: pharn-cli itself consuming hostile local input). Cite, not
  restate (P4).
- CONSTITUTION.md **P1** (tests are the spec) — the security invariant ships with a test that
  exercises it.

## Evals to write (P1)

This increment adds no PHARN Capability/rule, so `floor/validate.mjs`'s eval-binding does not apply.
The P1 obligation for a pharn-cli **security invariant** is a `vitest` test that *demonstrates* it
(CONSTITUTION P1). The regression test above is that demonstration:

- malicious `core.fsmonitor` present → `gitTrackedFileCount` runs → sentinel file is **NOT** created
  ∧ count == staged/committed file count.
- malicious `core.fsmonitor` present → `runFreshCheck` runs the full path → sentinel **NOT** created.
- existing tests (commit-count thresholds, tracked-file threshold, no-op on fresh scaffold) still
  pass unchanged → signal preserved.

## Guarantee audit (P0)

- **Claim:** "fresh-check's git calls no longer execute attacker-controlled `.git/config`
  (`core.fsmonitor` / hooks)." → **floor: test (deterministic `existsSync(sentinel) === false`) +
  single-call-site code structure** (grep-verified: `fresh-check.ts` is the only shell-out in
  `src/`; both calls route through the one hardening helper). This is exactly how pharn-cli floors
  its own security invariants (P1: "every security invariant has a test that demonstrates the
  behavior"). Not one of the three PHARN methodology floor primitives (§2) — those govern the
  installed methodology, not the CLI's own source.
- **Named residual (P0/P7 honesty — not oversold):** the two `-c` flags neutralize the **known**
  config-driven execution vectors for these read-only commands (fsmonitor + hooks), and
  `execFileSync` removes shell interpretation. It is **not** claimed that git can never execute
  anything from a hostile config in general — only that these specific `ls-files`/`rev-list` calls
  are hardened against the confirmed vector. (`git status`-class refresh vectors aren't called here.)

## Trust audit (P2)

- **Untrusted input:** the target project's `.git/config` (attacker-controlled on the hostile-repo
  path). **Before:** taint flows into **code execution** (fsmonitor hook runs). **After:** git still
  *reads* the config (unavoidable — it is git's own config), but the highest-precedence `-c`
  overrides neutralize the execution-bearing keys and `execFileSync` removes the shell, so taint is
  bounded to git's **output** — a possibly-wrong integer count. That integer drives only a
  deterministic threshold branch (P5) that at most shows an advisory warning prompt. Taint never
  reaches execution or a filesystem write. (`ARCHITECTURE.md §8` taint-propagation shape applied to
  a CLI-internal untrusted source.)

## Determinism audit (P5)

- Both functions return integers; every branch is an integer threshold (`>=6`, `>=2`, `<=1`, `>40`)
  — membership/threshold tests, unchanged. The `catch → 0` fallback (git error → treated as "fresh",
  no warning) is deterministic and preserved, not a guess.

## Open questions (HALT)

1. **Fix strategy** — harden every git call (recommended; verified; minimal risk) vs. fully drop
   `execSync` and reimplement counts git-free. Surfaced for approval since it is the one real design
   fork; my discovery resolved it toward *harden* (a clean non-shell commit count would require
   reimplementing git internals). Confirm or override.
