# PLAN — dead legacy symbols leave, and the narration they left behind is corrected

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Delete the module-era symbols nothing calls (4 `validate.ts` regexes, `format.ts#shortDescription`, all of `lib/constitution.ts`, `pharn-config.ts#toInstalledModules`) with their tests, after rewriting the `assertSafeString` vehicle pins onto a live regex — and make the surviving security narration true.
- layer(s): pharn-core (`src/lib/*`), tests, docs
- constitution_refs: [P0, P1, P3, P4, P7]

## Base + baseline (P6, read live this run)

- HEAD `e097adb` — **one commit ahead of the prompt's pin `4d24ad4`** (`#94`, archetype-detection build-cache skip, merged since). No candidate row changed.
- `npm run check`: **GREEN** (41 files, 748 tests) on re-run. The first run showed
  `tests/lint-gate.test.ts > rejects an unused variable in src/_plant.ts` FAIL — a **5s
  per-test timeout at 7341ms under parallel load** (that file shells out to eslint).
  Passes in isolation (7/7) and passes in a second full run. **Pre-existing load flake,
  not a gate failure, and not caused by this increment.** Named, not hidden (P7).

## The re-run map (fresh, untruncated, `src/ tests/ docs/ scripts/ pharn-contracts/ .dev/floor/ *.md`)

| Symbol | src refs | in-file callers | test refs | Verdict vs. prompt |
| --- | --- | --- | --- | --- |
| `MODULE_NAME_RE` | `validate.ts:11` (+ stale comment `:10`) | definition only | `validate.test.ts:5,20,27,**33,39**` | DEAD — **vehicle is 4 pins, not 2** ⚠️ |
| `INSTALL_PATH_RE` | `validate.ts:15` + stale comment `:119` | definition only | `:6` + own block `:57-74` | DEAD — **4 narration sites, not 3** ⚠️ |
| `WIZARD_VALUE_RE` | `validate.ts:17` + comment `:25` | definition only | zero | DEAD (confirmed) |
| `PACKAGE_NAME_RE` | `validate.ts:21` | definition only | zero | DEAD (confirmed) |
| `shortDescription` | `format.ts:12` | definition only | `format.test.ts:2,17-38` | DEAD (confirmed) |
| `stripPrinciple` + `MULTI_TENANT_PRINCIPLE` (all of `constitution.ts`) | self-contained | — | `constitution.test.ts` (136 ln) | DEAD — zero importers outside its own test |
| `toInstalledModules` | `pharn-config.ts:172` | **zero** in-file callers | `pharn-config.test.ts:12,152-155` | DEAD (confirmed) |
| `InstalledModule` | `types.ts:12` | — | — | **ALIVE-BY-FIELD** (`types.ts:127` `modules: InstalledModule[]`). STAYS |
| `InstalledSkill` | `types.ts:19` | — | — | **ALIVE-BY-FIELD** (`types.ts:139`). STAYS |
| `isMultiTenant` / `stackAnswers` | `types.ts:126/:138` | — | pass-through pin `:162` | Fields kept by P7. STAY, test stays |
| `resolveStageModel` | `model-routing.ts:165` | — | own test | DELIBERATELY KEPT (`model-routing.ts:49` receipt). Excluded |
| `row` (`format.ts:1`) | — | — | — | **ALIVE** — 4 src callers (`status.ts:120/121/126/127`, `capability-groups.ts:63/64`, `archetype-summary.ts:29/34/43`). Its test block STAYS |

### ⚠️ Correction 1 — the vehicle is FOUR pins, not two

The prompt named `validate.test.ts:20/:27`. The whole `describe('assertSafeString')` block
(`:18-43`) passes `MODULE_NAME_RE` as the *pattern argument* — **all four** `it`s:

| line | subject under test | value | rewrite to `CAPABILITY_NAME_RE` |
| --- | --- | --- | --- |
| `:20` | non-string rejection | `42` | ✅ pattern never reached |
| `:27` | control-char rejection | `pharn-\x01` | ✅ control check fires before pattern |
| `:33` | **pattern-mismatch rejection** | `'Nope'` | ✅ uppercase also fails `CAPABILITY_NAME_RE` |
| `:39` | **safe-value pass-through** | `'pharn-core'` | ✅ matches `CAPABILITY_NAME_RE` |

All four rewrite with **zero value changes** — only the third argument moves. Deleting the
regex while rewriting only two would leave `:33`/`:39` unresolved (a red typecheck, not a
silent un-pin — but the prompt's stated risk, un-pinning a security function, is real for
all four). Rewrite the block, then delete.

### ⚠️ Correction 2 — `INSTALL_PATH_RE` has a FOURTH narration site, and it is human-only

| # | site | agent-writable? |
| --- | --- | --- |
| 1 | `CLAUDE.md:58` — "validated against strict regex/enum allowlists (… `INSTALL_PATH_RE` …)" | ✅ yes |
| 2 | `docs/contributing.md:83` — same enumeration | ✅ yes |
| 3 | `src/lib/validate.ts:119` — "already validated by `INSTALL_PATH_RE` / `CAPABILITY_NAME_RE` upstream" | ✅ yes |
| 4 | **`LIMITS.md:30`** — "**Backstop (floor):** `INSTALL_PATH_RE` + `safeJoin` bound a hostile module to content **inside** `.claude/`" | ❌ **NO** — `DEFAULT_PROTECTED` in `.claude/hooks/protect-trusted-paths.cjs:58` |

`LIMITS.md` §1a states a **floor backstop** over a regex **nothing calls**. That claim is
already false at `e097adb` — this increment does not create it, it *exposes* it. It is also
stale on a second axis (it says "a hostile **module**"; the module era is gone). Per the
constitution's own enforcement rule, the agent **MUST NOT** edit a trusted file and **MUST
NOT** auto-fix — it flags for human review. See Open questions.

### Bonus ghost that dies for free

`validate.ts:10`'s comment pins `MODULE_NAME_RE` to "`scripts/schemas/*.schema.json`" — that
directory **does not exist** (`scripts/` holds only `build.mjs`, `install-local.mjs`). A fifth
stale narration, removed with its regex; no separate edit needed.

## Files

- `src/lib/validate.ts` — delete `MODULE_NAME_RE`, `INSTALL_PATH_RE`, `WIZARD_VALUE_RE`, `PACKAGE_NAME_RE` (+ their comments `:10`, `:13-14`, `:16`, `:18-20`); rewrite comment `:25` (drop the `WIZARD_VALUE_RE` comparison) and `:119` (drop the dead half; "validated by `CAPABILITY_NAME_RE` upstream" stays true) — layer pharn-core
- `src/lib/format.ts` — delete `shortDescription` + its docblock; `row` untouched — layer pharn-core
- `src/lib/pharn-config.ts` — delete `toInstalledModules` (`:172-176`); narrow the type import `:8` to `import type { PharnConfig }` (`InstalledModule` becomes unused **here**; the type itself stays in `types.ts`) — layer pharn-core
- `src/lib/constitution.ts` — **delete whole file** (50 ln) — layer pharn-core
- `tests/constitution.test.ts` — **delete whole file** (136 ln) — layer tests
- `tests/validate.test.ts` — rewrite the 4 `assertSafeString` pins → `CAPABILITY_NAME_RE`; delete the `INSTALL_PATH_RE` block (`:57-74`) and the 2 dead imports (`:5`, `:6`) — layer tests
- `tests/format.test.ts` — delete the `shortDescription` describe block (`:17-38`) + its import binding; **`row` block `:4-15` stays** (not a whole-file delete) — layer tests
- `tests/pharn-config.test.ts` — delete the `toInstalledModules` import (`:12`) + its `it` block (`:151-156`) — layer tests
- `CLAUDE.md` — line 58: drop `INSTALL_PATH_RE` from the allowlist enumeration — layer docs
- `docs/contributing.md` — line 83: same — layer docs
- `CHANGELOG.md` — one Unreleased line (internal cleanup + narration correction) — layer docs

**Explicitly NOT editable — byte-identity is the invariant:** `src/types.ts`,
`src/lib/model-routing.ts`. **Hook-denied, human-only:** `LIMITS.md`.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the `LIMITS.md` conflict is reported as a finding, never auto-fixed (P4/P0). Cited, not restated.

## Evals to write (P1)

No new behavior ships, so no new eval. **Deletion is spec-negative**: the suite must go green
**minus exactly the deleted tests**, and every live subject keeps its pin.

- `assertSafeString` → its 4 pins survive the vehicle swap unchanged in intent (non-string / control-char / pattern-mismatch / pass-through), now against `CAPABILITY_NAME_RE`.
- `row` → its 2 pins untouched (live, 4 src callers).
- `stackAnswers` / `installedSkills` P7 pass-through → untouched (`pharn-config.test.ts:162`).
- Net expected: **748 → 748 − (4 constitution + 3 format-block + 2 INSTALL_PATH_RE + 1 toInstalledModules) tests**, counted for real at verify, not asserted here.

## Guarantee audit (P0)

| claim | reduction |
| --- | --- |
| "every deleted symbol has zero callers" | **floor: grep sweep** (untruncated, 7 names × 6 trees), re-run at verify → must be empty |
| "`types.ts` / `model-routing.ts` are byte-identical" | **floor: `git diff main -- <paths> \| wc -l` → 0** |
| "only the named exports left each module" | **floor: `grep -n '^export'` before/after diff** |
| "no live behavior lost" | **floor: `npm run check` green** + the export inventory; the *judgment* that nothing was worth keeping is **advisory** |
| "the narration is now true" | **advisory for 3 sites** (prose ≠ floor-checkable) — **and NOT true at all for `LIMITS.md:30`, which this increment cannot reach** |
| "baseline was green" | **floor: exit code**, with the named lint-gate flake disclosed |

**Struck:** "this PR makes the security narration true." It makes **3 of 4** sites true and
**names** the fourth. Claiming otherwise would be P0's exact disease.

## Trust audit (P2)

No untrusted artifact is ingested — this is a source-tree deletion. No taint path changes.
`safeJoin`, `CAPABILITY_NAME_RE`, `COPY_FILENAME_RE`, `COMMIT_RE`, `VERSION_RE`, `ROLE_VALUES`,
`APPLIES_TOKEN_VALUES` and every `assert*` — the entire **live** validation floor — are
untouched. The four deleted regexes have **zero** call sites, so no validation is weakened.

## Determinism audit (P5)

Every keep/delete branch is a **membership test over the fresh sweep** (`refs == 0` → delete;
`refs > 0` → keep, receipt cited). No judgment call drives a deletion. The one thing a
membership test cannot settle — what to do about the human-only `LIMITS.md` — **ends in "ask"**,
below.

## Open questions (HALT) — RESOLVED at GATE 1

1. **`LIMITS.md:30` names `INSTALL_PATH_RE` as a floor backstop, and the agent cannot edit it.**
   → **RESOLVED: delete + report.** All four regexes go; the three agent-writable narration
   sites are corrected; `LIMITS.md:30` is **surfaced as a required human-only follow-up** in
   this plan, in `REVIEW.md`, and in the PR body — never agent-edited (constitution
   enforcement: flag, never auto-fix). The claim is already false at `e097adb`, so this
   increment does not newly break it; it makes it visible.
2. **The vehicle is 4 pins, not 2.** → **RESOLVED: rewrite all four** `assertSafeString` pins
   to `CAPABILITY_NAME_RE`, values unchanged, before the regex is deleted.
3. **CHANGELOG entry?** → **RESOLVED: yes**, one line under Unreleased — internal cleanup +
   the narration correction.

## Human-only follow-up this increment CANNOT perform (report, never auto-fix)

`LIMITS.md` §1a, line 30:

> **Backstop (floor):** `INSTALL_PATH_RE` + `safeJoin` bound a hostile module to content
> **inside** `.claude/`, never an arbitrary-path write.

Stale on **two** axes after this PR: (a) `INSTALL_PATH_RE` no longer exists (and called
nothing before it was deleted — the backstop half of the claim was never true in the
records era), and (b) "a hostile **module**" predates the archetype/capability model.
`safeJoin` remains the real, live containment floor and is untouched. Suggested human
edit — **not applied by this increment**:

> **Backstop (floor):** `safeJoin` bounds a hostile capability to content **inside** its
> base dir, never an arbitrary-path write.
