# REGRESSION — fresh-init-hooks

- **Base:** `e8d0b0497955fc0901ceb7ee2cf1bb62b760d8bb` (working-tree build → `base = HEAD`).
- **Inside** (19 paths): the plan's `## Files` minus `THREAT-MODEL.md` (human-applied, not yet changed), plus the feature's PLAN/GRILL. `scope` found no path outside the declared writes (`escaped: []`).
- **Outside gates run** (same set at base and head): `tests` (47 `.dev/floor/*` + `.claude/hooks/*` node suites, all outside), `validate` (whole-repo). No committed eval pairs. **Style gates skipped** deterministically — `inside` touches no shared style config.

| Gate       | Base | Head | Result                     |
| ---------- | ---- | ---- | -------------------------- |
| `tests`    | 1    | 1    | pre-existing (red at base) |
| `validate` | 0    | 0    | clean                      |

- `regressions[]`: none
- `pre_existing[]`: `tests`

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

This certifies only the exit-code comparison: regress catches what its suite catches, nothing more. The
vitest suite (`npm test`, which covers the changed code) is inside the feature and is gated at HEAD by
`/pharn-dev-verify`, not here.
