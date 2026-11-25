# REGRESSION — core-386-unpack-listed-paths-only

- Base: `51a96d2932` (origin/main, the branch's fork point), checked out in a detached worktree.
- Inside: the three source files, five test files, the docs (`CLAUDE.md`, `SECURITY.md`, `THREAT-MODEL.md`,
  `docs/architecture.md`, `docs/contributing.md`), `CHANGELOG.md` and this feature's dev artifacts. None escapes the
  plan's declared files (`check-regress.mjs scope`: `escaped` empty).
- Outside gates: the 53 stdlib `*.test.mjs`/`*.test.cjs` files (`node --test`), `node .dev/floor/validate.mjs .`, and
  the full vitest suite (through heavy.sh, `--maxWorkers=2`; at HEAD with `--coverage`).

| Gate     | base | head |
| -------- | ---- | ---- |
| tests    | 1    | 1    |
| validate | 0    | 0    |
| vitest   | 0    | 0    |

`regressions[]`: none. `pre_existing[]`: `tests` (red at base too: the gitignored `test-*/` fixtures, unrelated).

REGRESSIONS: none, meaning no breakage outside the feature that these gates can detect (verdict `no-regressions`,
from `check-regress.mjs`). This certifies only the base→head comparison of these gates.
