# REGRESSION — proxy-env-notice

**Run 2** — after the `/pharn-dev-review` fix pass. (Run 1's report is superseded; its two
self-inflicted reds are preserved below, because a stage that quietly drops its own mistakes is worse
than one that carries them.)

**Base:** `03160c8e71e14a125f7dd3d107a42f18952a6f15` (`03160c8`, tip of `main`), resolved by the
deterministic state test (P5): `git status --porcelain` non-empty → working-tree dogfood → `base = HEAD`.

## Scope partition (fix #7)

`scope` exit **0**, `escaped: []`, and `inside == declared` — **fifteen** files each, byte-for-byte the
amended plan's `## Files`.

| inside (= declared, 15) | |
| --- | --- |
| `src/lib/proxy-env.ts` | `tests/proxy-env.test.ts` |
| `src/lib/proxy-env-format.ts` | `tests/proxy-env-format.test.ts` |
| `src/commands/init.ts` | `tests/init.test.ts` |
| `src/commands/add.ts` | `tests/add.test.ts` |
| `src/commands/update.ts` | `tests/update.test.ts` |
| `src/commands/status.ts` | `tests/status.test.ts` |
| `docs/troubleshooting.md` | `.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md` |
| `CHANGELOG.md` | |

The plan grew from 9 declared paths to 15 to accommodate the review fixes, and the scope setter was
re-run against the amended plan **before** any of the new files were written — the documented
procedure, never a hook bypass. One detail worth recording: the first amendment marked new entries
with a `**+**` prefix, which `set-writes-scope.cjs`'s `isPathItem` pattern
(`/^\s*-\s+\`[^\`]+\`/`) does not match, so it silently scoped only 9 of 15. The **plan format was
corrected to match the parser**, not the parser loosened.

### Paths excluded from `--changed`, with provenance

Same `base = HEAD` artifact as run 1: on a working-tree dogfood, `git diff --name-only HEAD` sweeps
every stage's artifacts and any pre-existing state, not only the build's writes.

| path | evidence | author |
| ---- | -------- | ------ |
| `.gitignore` | staged (`+prompts`), empty worktree diff; present as `M` in the session's opening `git status` | pre-existing |
| `.dev/features/proxy-env-notice/**` | each stage's own declared `writes:` (`pharn-dev-plan.md:8`, `pharn-dev-grill.md:15`, and the regress/verify/review/ship equivalents) | the pipeline stages themselves |

Nothing under `src/`, `tests/`, or `docs/` was excluded.

## Gate set

Identical gate-ids both sides, decided once.

- **`tests`** — `git ls-files '*.test.mjs' '*.test.cjs' | xargs node --test`, 46 outside floor/hook tests.
- **`validate`** — `node .dev/floor/validate.mjs .` (whole-repo; the named granularity limit).
- **`structural:*`** — none (`outside_eval_pairs` empty).
- **Style gates — SKIPPED** by the deterministic config-touch rule: `inside` touches none of
  `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`. Absent from
  both maps, so no gate-set mismatch; the baseline `npm ci` cost was not incurred.

## Per-gate exit codes

| gate | base (`03160c8`) | head | flip |
| ---- | ---------------- | ---- | ---- |
| `tests` | 0 | 0 | none |
| `validate` | 0 | 0 | none |

`regressions[]`: **empty**.  `pre_existing[]`: **empty**.

## Two self-inflicted reds from run 1, retained

1. **`scope` exit 1 on three "escapes"** — resolved by provenance, as above. Not a build escape.
2. **A false `tests = 1` at both ends** — the capture used `node --test $TESTS` under **zsh**, which
   (unlike bash) does not word-split an unquoted expansion, so 46 paths arrived as one argument and
   `node` failed with `Could not find '<all 46 paths>'`. Re-run through `xargs`: exit 0. Both runs
   above use the corrected form. "pre-existing" is precisely the label under which a self-inflicted
   failure would have gone unexamined.

A third, from the fix pass itself and **not** a regress issue but recorded where the file history is:
running `markdownlint-cli2 --fix` on `FACT-TABLE.md` — a file **outside** the `lint:md` gate's scope
(`docs/**/*.md` + `*.md`) — corrupted it, rewriting the literal issue reference `#331/#345/…` into a
heading `# 331/…` and flipping six `-` bullets to `+`. The file was reverted to `HEAD` and the H5
correction re-applied without `--fix`; the diff is now one line changed, twelve added.

## Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Machine report: [`regression-report.json`](regression-report.json) — `"verdict": "no-regressions"`.

The verdict is the helper comparing two exit-code maps; nothing in it rests on this stage's judgment.
Advisory here: the base resolution, the provenance exclusions, the gate set, the style skip, and the
harness corrections.

**Residual (named, not hidden):** this stage catches exactly what its suite catches. The claim is
"deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The
outside set is 46 floor/hook tests plus whole-repo `validate`, which do not exercise the four command
modules the increment edits — those are `inside`, and their coverage is the feature's own vitest suite,
now including wiring tests at all five call sites (added this pass).
