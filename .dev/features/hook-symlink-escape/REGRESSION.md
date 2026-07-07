# REGRESSION — hook-symlink-escape

Deterministic verdict (floor; `.dev/floor/check-regress.mjs verdict`): **REGRESSIONS: none — no
deterministically-detectable breakage outside the feature.** Verdict exit `0`.

## Base + partition

- **Base:** `b4b7000` (HEAD; working-tree dogfood build → `git status` non-empty ⇒ `base = HEAD`, the
  pre-fix commit — confirmed pre-fix: `resolveWriteTarget` absent from HEAD's `protect-trusted-paths.cjs`).
- **Inside (the feature's changed code):** the 6 declared `## Files` — both hooks, both hook test suites,
  `.dev/floor/README.md`, `CLAUDE.md`. `scope` reported `escaped: []` — the build stayed inside its plan
  (no fix #7 breach). The feature's own artifact dir (`.dev/features/hook-symlink-escape/**`, incl. the
  cosmetically-reformatted `PLAN.md`) is not code and is excluded from `inside`, matching prior runs.
- **Outside gates run (identical set at base and head):** `tests` (the 42 test files outside the feature),
  `validate` (whole-repo `validate.mjs`), and `structural:…trust-fence…expected-injection-comment.json`
  (the one committed eval pair outside the feature). **Style gates skipped** (deterministic P5/P7 rule): no
  `inside` path touches a shared style config, so an outside style flip is provably impossible.

## Per-gate exit codes (base → head)

| Gate                                                 | base | head | result |
| ---------------------------------------------------- | ---- | ---- | ------ |
| `tests` (42 outside test files, `node --test`)       | 0    | 0    | OK     |
| `validate` (`node .dev/floor/validate.mjs .`)        | 0    | 0    | OK     |
| `structural:…trust-fence…expected-injection-comment` | 0    | 0    | OK     |

- **regressions[]:** none
- **pre_existing[]:** none

## Method note (honest)

A first capture recorded `tests: base 1 / head 1` — a **capture bug, not a pre-existing failure**: under
zsh an unquoted `$OUTSIDE` list is not word-split, so `node --test` received the whole newline-joined
list as one filename (`Could not find '…'`) and errored identically on both sides. Re-run with a proper
zsh array (`"${(@f)…}"`), the 42 outside tests genuinely execute and pass at both base and head. The
verdict above is from the corrected capture.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches **exactly what its deterministic suite catches — nothing more.** "No
regressions" means no gate that was GREEN at the baseline flipped RED outside the feature; it is **not**
"nothing broke." This certifies the comparison, not the increment as a whole.
