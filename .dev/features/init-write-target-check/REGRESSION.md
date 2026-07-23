# REGRESSION — init-write-target-check

- **base:** `c425eddf206722cad7fd2d03107c3ea34955bc86` (working-tree dogfood → base = HEAD)
- **verdict (floor, `check-regress.mjs verdict`):** `no-regressions` (exit 0)

## Inside / outside partition (deterministic, `check-regress.mjs scope`)

- **inside (16, the product changes):** the plan's `## Files` — `src/lib/install-manifest.ts`,
  `src/lib/diff.ts`, `src/steps/overwrite-check.ts`, `src/commands/init.ts`, `src/steps/fresh-check.ts`
  (deleted), the four test files, and the six docs + `CHANGELOG.md`. `scope` exit 0, `escaped: []`.
- **outside gates:** the 44 `role`-checker `node --test` suites (`.dev/floor/*.test.mjs`,
  `.claude/hooks/*.test.cjs`) — none is in the inside scope. `outside_eval_pairs: []`.

## Per-gate exit codes (base → head)

| gate    | base | head | flipped? |
| ------- | ---- | ---- | -------- |
| `tests` | 0    | 0    | no       |

- `regressions[]`: none. `pre_existing[]`: none.

## Gate-set decisions (deterministic skips, per this command's own skip rule)

- **`validate` skipped.** It ranges over capabilities / `.dev/floor` / `pharn-contracts`; the inside
  (product) diff touches **none** of those, so a `validate` flip from this change is provably
  impossible (the same reasoning the command applies to the style gates). Independently, running
  `validate .` over the **working tree** is confounded by gitignored `test-*/` scratch installs (present
  locally, absent in the clean baseline worktree), which would inject a false GREEN→RED unrelated to the
  code — so it is omitted from **both** maps rather than measured dishonestly.
- **style gates skipped** (`lint`/`format:check`/`lint:md`): the inside diff touches no shared style
  config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a
  style flip over the byte-identical outside files is impossible.

## Scratch-confound reconciliation (why the head measurement is the CLEAN run)

The raw working tree carries gitignored `test-*/` scratch installs (local `pharn init` fixtures, not
repo state). Two of the outside floor gates **scan the live cwd** and are polluted by them:

- `.dev/floor/lens-scanner-map.test.mjs` "map + reality agree on the live counts" — counts every lens
  under cwd, so the `test-*/pharn/pharn-review/**` scratch lenses make it FAIL in the working tree.

Run RAW, HEAD = 1 solely from that scratch. So both sides were run in **clean git worktrees** (no local
gitignored scratch), the sound apples-to-apples comparison:

- **base** = worktree @ HEAD (committed) → `tests` **0**.
- **head** = worktree @ HEAD **+ the 16 product changes** (my new files copied in, `fresh-check.ts`
  deletion applied, **no** `test-*/`) → `tests` **0**.

The product change provably touches no lens/scanner/map/`count-lenses` file, so the clean head result
is 0 — the working-tree failure was 100% the gitignored-scratch confound, not a regression.

> Tooling note for the human (outside this increment's axis): several `role`-counter floor gates
> (`validate.mjs .`, `lens-scanner-map.test.mjs`) scan the live cwd and so surface spurious local RED
> whenever gitignored `test-*/` scratch installs are present. Consider scoping those scans to tracked
> paths. Not fixed here (it lives in `.dev/floor/`, a different axis).

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`tests` gate
0 → 0 on the sound clean-tree comparison; `validate`/style gates provably cannot flip and are skipped.)

Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its deterministic suite catches —
nothing more. A broken behavior outside the feature with **no** covering test/rule/eval is invisible.
This is "no detectable regression," not "nothing broke." This report certifies the comparison, not the
increment.
