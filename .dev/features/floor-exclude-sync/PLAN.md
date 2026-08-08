# PLAN — sync the stale `pharn/floor` exclusion into the vendored floor checkers

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add `${sep}pharn${sep}floor${sep}` to `EXCLUDE_SEGMENTS` in pharn-cli's four vendored
  floor checkers, mirroring the fix pharn-oss already made to `validate.mjs`, so a dogfood tree
  containing pharn-layout installs does not turn the dev-loop floor RED (and does not inflate the
  griller/lens/verifier counts) on files that are tooling, never product capabilities.
- layer(s): `.dev/floor` (dev-loop tooling — NOT shipped to users; the copy users run is
  `pharn/floor/*`, copied from the pharn-oss clone by `src/lib/install-manifest.ts`)
- constitution_refs: [P0, P1, P3, P5, P7]

## Why this is a separate increment (P3)

This is a different axis from `capability-source-provenance` (a `pharn.config.json` schema + one
command's merge semantics). It touches a **floor primitive**, changes no product behavior, and ships
no user-visible change. Bundling it would have put two change-reasons in one diff.

## Verified live state (P6 — read this run)

- `.dev/floor/validate.mjs:30` — `EXCLUDE_SEGMENTS` is a 4-element list:
  `.claude/commands/`, `.dev/`, `node_modules/`, `.git/`. It lacks `pharn/floor/`.
- **Upstream already fixed it.** `pharn-oss/pharn/floor/validate.mjs:37-45` carries the 5-element
  list plus an explicit rationale comment. pharn-cli's copy is a stale vendor of that file.
- The three counters carry byte-identical stale copies:
  `count-grillers.mjs:36`, `count-lenses.mjs:33`, `count-verifiers.mjs:31`. **Upstream has NOT fixed
  these** — the divergence is intentional here and must be upstreamed separately (see Risks).
- Measured impact while the dogfood scratch existed: `validate.mjs` RED with 15 findings (14 from
  `test-*/pharn/floor/test-fixtures/red/skill.md`); `count-grillers` reported **81** and
  `count-lenses` **142**, every one from that scratch. With the scratch deleted: GREEN, 0/0/0.
- **CI never saw any of this** — `.github/workflows/floor.yml:19,28` runs on a fresh
  `actions/checkout`, which has no gitignored scratch.
- **No user was ever affected.** Each installed project runs its OWN `pharn/floor/validate.mjs`,
  copied from the clone, which already has the exclusion. Verified: all seven scratch installs were
  GREEN under their own floor (28–35 capabilities each).

## Files

- `.dev/floor/validate.mjs` — add `pharn/floor/` to `EXCLUDE_SEGMENTS` — layer: floor
- `.dev/floor/count-grillers.mjs` — same — layer: floor
- `.dev/floor/count-lenses.mjs` — same — layer: floor
- `.dev/floor/count-verifiers.mjs` — same — layer: floor
- `.dev/floor/validate.test.mjs` — a case pinning that `pharn/floor/` is excluded — layer: test

## Contracts satisfied

- None new. This restores parity with pharn-oss's `validate.mjs`, whose comment states the rationale
  (cited, not restated — P4).

## Evals to write (P1)

- `validate.test.mjs` → a `withRepo` fixture with a valid product capability at `pharn-review/sample/`
  **plus** a role-bearing decoy at `pharn/floor/fake-capability.md` → `GREEN — 1 capabilities checked`
  (mirrors the existing ★ `.dev/` test at `:63-78`, which locks the exclusion by the COUNT, not just
  the exit code — so a regression that stopped excluding would fail on the count).

## Guarantee audit (P0)

| Claim                                                        | Reduction                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pharn/floor/**` is not scanned as product capabilities        | **floor: lexical path-segment membership** — a `String.includes` over `sep`-delimited segments, hermetic, no git, no I/O beyond the existing walk |
| The change cannot make a currently-RED gate green incorrectly  | **floor: monotonic** — shrinking the candidate set can only remove findings; the new test pins the count so "excluded too much" fails             |
| The dev loop stays green across future dogfooding              | **ADVISORY** — it removes 14 of 15 known finding sources; a `features/*/GRILL.md` artifact (CHECK 5) still trips it. Named, not hidden.           |
| Users were affected by the staleness                           | **NOT CLAIMED — investigated and disproven.** Every install runs its own already-fixed floor.     |

## Trust audit (P2)

No new ingest. The exclusion is a lexical test over a path already produced by the existing walk;
no file contents are read that were not read before, and nothing is executed. Deliberately **not**
gitignore-aware: making the verdict a function of the git binary + a user-editable `.gitignore` would
let an untracked capability escape validation and print `GREEN — 0 capabilities checked`, which every
consumer reads as PASS. Lexical exclusion cannot fail open that way.

## Determinism audit (P5)

`EXCLUDE_SEGMENTS.some((seg) => norm.includes(seg))` — a membership test over a fixed list. No
classification, no fallback, no git subprocess.

## Risks

- **Divergence from upstream on the three counters.** pharn-oss has the exclusion only in
  `validate.mjs`; its `count-*.mjs` are stale in the same way. Adding it to pharn-cli's counters is
  therefore a local fix ahead of upstream. It must be upstreamed to pharn-oss, or the next vendor
  sync will silently revert it. **Not done in this increment** (different repo, different axis).
- The `walk` at `validate.mjs:48` uses `statSync`, not `lstatSync`, so it follows symlinks; a
  symlinked directory can yield a `../`-prefixed relative path that no segment matches. Pre-existing
  and orthogonal — recorded, not fixed here.

## Open questions (HALT)

None — the change mirrors an existing upstream fix verbatim, and the user approved the scope.
