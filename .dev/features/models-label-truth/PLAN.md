# PLAN — models-label-truth: make the CLI's `models` / config-key claims true again

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Rewrite the printed `models` label and the docs/CLAUDE.md prose around it to match pharn-oss 6.55.0 (orchestrated routing reads the block, MODEL only), and fix two `docs/reference/pharn-config.md` bugs (`seam.resolutionOrder` "must end with ask"; user-owned keys table missing `gates` and `budget`). No behaviour change beyond the printed label text.
- layer(s): CLI presentation (`src/lib/model-config-format.ts`, P3 "presenting the models block") + user-facing docs + tests. No `pharn-contracts` change. No trusted doc change.
- constitution_refs: [P0, P1, P3, P4, P6, P7]

## Discovery (read this run, P6)

- pharn-oss at `/Users/pgalarowicz/Projects/pharn-oss`, `SKILLS_VERSION` 6.55.0. Read: `pharn/floor/stage-agent-core.mjs` (header + `ROUTE_POLICY` :188-232), `check-model-config.mjs` header, `LIMITS.md` §8 and §3e, README (models/`testResults`/gates/limitations).
- Routing facts (cited, not invented): `/pharn-ship` full routes plan, grill, test, build; quick routes plan, test, build. `/pharn-loop` full and quick route spec, plan, test, build (its grill is floor-only inline in both). Spec in ship, every regress/verify, and each quick mode's grill run inline by policy. `inherit` and `claude-*` ids run inline (`INLINE_REMEDIES`), as do no-config / no-stages / config-red. The Agent tool takes a `model` and no effort → effort is never routed. A person's direct `/pharn-<stage>` uses the command's static frontmatter. `check-model-config.mjs agreement` is a checker you run; nothing in an installed project runs it automatically (LIMITS §8, README "Current limitations"). Routing only REQUESTS the model; nothing observes what ran (LIMITS §8).
- `budget.instructionGrowthBytes` is **not in pharn-oss's README** (grep: no hit). It is documented in pharn-oss `LIMITS.md` §3e and the header of `pharn/floor/instruction-files.mjs` (default 2048, read from `pharn.config.json` at the BASE commit, never the working tree). `gates.exclude` IS in the README ("Excluding a gate (6.36.0)").
- CLI code: `userOwnedConfigEntries` (`src/lib/pharn-config.ts` ~:245) is NOT an allowlist — every non-`CLI_OWNED_KEYS` key is already kept by `add`/`update`/`remove` and carried by `init`. So the docs bug is docs-only; `gates`/`budget` already behave correctly.
- `src/lib/seam-config.ts:119-125` and `tests/seam-config.test.ts:107` ("accepts ask not last — presence, not last-ness") confirm: `resolutionOrder` must CONTAIN `ask`. The error text is `must contain "ask"`. The doc bug is at `docs/reference/pharn-config.md` ~:235 (table), ~:239-241 (rejected-edits sentence).
- Claim sites found (grep for "frontmatter", "source of truth", "held to", "rout"): `src/lib/model-config-format.ts` (:11-15 comment, `modelsLabelLines` :53-60), comments in `src/steps/install-archetype.ts` :329-334 and `src/commands/status.ts` :238-244, `docs/reference/pharn-config.md` :128-140 (+ :141 "as of pharn-oss 6.22.0"), `docs/troubleshooting.md` :558-560, `docs/commands/update.md` :222-225 and :257-258, `docs/commands/status.md` :62-70, `docs/commands/init.md` :227, `CLAUDE.md` models paragraph ("never routing that happens") and its `userOwnedConfigEntries` mention of "`testResults` / `ship`".
- Label call sites (all go through `modelsLabelLines`, so one edit): `status` (`printModels`), `init` outro (`install-archetype.ts`), `update` (`update.ts` ~:1015).
- Tests that pin the label: `tests/model-config-format.test.ts` :67-82 (incl. `not.toMatch(/rout/i)`), `tests/status.test.ts` :678-717 (same, `:716`), `tests/init-archetype.test.ts` :224-240 (`:240`), `tests/update.test.ts` :2559 (only the checker command line — stays valid if the last label line stays that command). `docs-install-tables.test.ts` is unrelated to these docs.
- Mechanics the docs must state (verified in CLAUDE.md / code, not re-derived): `pharn update` decides each installed `/pharn-*` command file per file; a hand-edited command (frontmatter included) is `modified` → SKIPPED, and a skip withholds the `skillsVersion` bump (and sets `pendingSkillsVersion` when solely `modified`/`unrecorded`); `--force` backs up then overwrites. The `models` block is decided separately: kept whole if edited (`modified`/`unrecorded`), never withholds the bump, no file drift (`status` drift compares files, and `pharn.config.json` is not one). A re-run `init` replaces `models` with upstream's (`CLI_OWNED_KEYS`), `seam` with its default.

## Files

- `src/lib/model-config-format.ts` — rewrite the header comment (:11-15) and `modelsLabelLines` text (:53-60); keep `modelsCheckerCommand` and the LAST label line equal to the `agreement` command (callers/tests rely on it); each line ≤ 70 cols — layer: CLI presentation
- `src/steps/install-archetype.ts` — comment-only (:329-334): drop "nothing reads this block / must not read as routing"; say it is a declaration plus what reads it — layer: CLI presentation
- `tests/model-config-format.test.ts` — replace the `not /rout/i` pin with positive pins (see Evals) — layer: tests
- `src/commands/status.ts` — comment-only (:238-244): drop "nothing reads this block / must not read as routing" — layer: CLI presentation
- `tests/status.test.ts` (:678-717) — same: positive pins on the new label, drop `not.toMatch(/rout/i)` — layer: tests
- `tests/init-archetype.test.ts` — outro label pins (:224-240), same change — layer: tests
- `tests/docs-models-claims.test.ts` (NEW, small) — pins the doc claims that were wrong (see Evals); cheap anti-regression, P1/P4 — layer: tests
- `docs/reference/pharn-config.md` — (a) rewrite the Models section callout (:128-140): what reads the block / what does not / what editing each thing does; refresh the "as of pharn-oss 6.22.0" stamp only if the block shown still matches 6.55.0's root `pharn.config.json` (check at build; otherwise restamp the version only after diffing); (b) `seam.resolutionOrder` row and the "Five hand-edits" sentence: "must contain `ask`", ask may sit anywhere, the error names it; (c) user-owned keys table: add `gates` (`gates.exclude`) and `budget` (`budget.instructionGrowthBytes`), see Open question 2 for the budget citation — layer: docs
- `docs/troubleshooting.md` (:558-560) — replace "change both or neither" with the accurate two-case text — layer: docs
- `docs/commands/update.md` (:222-225, :257-258) — fix the models intro and the "differs from frontmatter" sentence; add the `modified`-command consequence — layer: docs
- `docs/commands/status.md` (:62-70) — it restate the old label ("Claude Code applies ... frontmatter, not this block"); update to the new label wording (not in the request's list but they contradict the new label, P4) — layer: docs
- `docs/commands/init.md` — :227 restates the old label; update to the new wording — layer: docs
- `CLAUDE.md` — the models paragraph: replace "never routing that happens" with the true statement; in the `pharn init` step 5 text and `lib/pharn-config.ts` paragraph keep as is except `userOwnedConfigEntries — upstream's testResults / ship` → add `gates` / `budget` ("EVERY such key, not an allowlist" already says it). Keep edits to those two sentences only (sibling increment touches CLAUDE.md elsewhere) — layer: docs
- `CHANGELOG.md` — one `### Changed` line under `[Unreleased]` (label text changed; docs corrected). Local, minimal. No `package.json` bump — layer: docs
- `src/lib/pharn-config.ts` (comment ~:245-248) — optional comment-only: name `gates`/`budget` beside `testResults`/`ship`. Skip if it risks a conflict; not required.

## Contracts satisfied

- `pharn-contracts/seam-config.md` — the `seam` doc fix aligns the user docs with the contract's validator (contain-`ask`, presence not last-ness), citing it rather than restating (P4).
- No other `pharn-contracts` file applies (no new schema, no new command, no flag).

## The new label (draft — exact wording finalized in build; ≤ 70 cols/line; must stay pure, no color)

Truth conditions every line must satisfy, each traced above:

1. `/pharn-ship` and `/pharn-loop` read the block at run time to choose the MODEL they request for the stages they run as subagents (not every stage: some run inline on the session's model; `inherit` and `claude-*` ids run inline).
2. EFFORT is not routed.
3. A `/pharn-<stage>` you invoke yourself uses that command's own `model:`/`effort:` frontmatter; the block is what that frontmatter is held to.
4. The two are compared only when you run the checker; nothing runs it automatically. Last line is the `agreement` command.
5. Never claims what a stage ran on (routing requests; nothing observes).

Draft:

```text
/pharn-ship and /pharn-loop read this block to pick the model they
request for each stage they route to a subagent; effort is never
routed, and other stages run on the session's model. A stage you
run directly uses its command's own model:/effort: frontmatter,
which this block is held to. Nothing checks that automatically:
node pharn/floor/check-model-config.mjs agreement
```

Lines about editing consequences stay in docs, not the label (width and noise).

## Doc text (draft of the load-bearing claims; build refines wording)

- **What reads the block:** orchestrated routing — `/pharn-ship` (full: plan, grill, test, build; quick: plan, test, build) and `/pharn-loop` (full and quick: spec, plan, test, build) request the resolved MODEL for those stage agents. Cite pharn-oss `stage-agent-core.mjs` `ROUTE_POLICY` and `LIMITS.md` §8 (table is pharn-oss's and may change; the doc says "as of pharn-oss 6.55.0").
- **What does not:** a person's direct `/pharn-<stage>` (uses frontmatter); EFFORT anywhere in routing; stages run inline (ship's spec, regress, verify; loop's grill; `inherit`/`claude-*`; no/invalid config) which run on the session's model; the checker's `agreement` mode is never run automatically.
- **What editing does:** (1) edit a `/pharn-*` command's frontmatter → that file is `modified`; `pharn update` SKIPS it (keeps your edit) and withholds the `skillsVersion` bump (recording `pendingSkillsVersion`); `--force` backs it up and overwrites; `pharn status` lists it as differing. (2) Edit only `models.stages` → no file drift (`pharn.config.json` is not a compared file; `update` keeps an edited block whole and never withholds the bump over it; a re-run `pharn init` resets it to pharn-oss's). Routed runs then use your values for MODEL; direct invocation still uses the unedited frontmatter and the checker reports the difference. So the two edits have different reach: block → routed model; frontmatter → direct invocations; set both if you want both, and pay the `modified` cost for the frontmatter.
- Replaces "change both or neither" (troubleshooting) with: the difference is not an error here; pick per the above; `agreement` lists where they differ.
- `seam.resolutionOrder`: "must contain `ask`" anywhere; duplicates, unknown steps rejected; hand-edit list becomes "a `resolutionOrder` that does not contain `ask`".
- User-owned keys: `testResults` (unchanged), `ship`, plus `gates` — `gates.exclude`: ids of discovered gates to leave out (pharn-oss README, "Excluding a gate (6.36.0)"; only documented gate ids; commit before the run) — and `budget` — `budget.instructionGrowthBytes`: the per-change instruction-growth threshold for the `instruction-growth` verify gate, default 2048, read at the base commit (pharn-oss `LIMITS.md` §3e). Nothing beyond those pharn-oss sentences. State that pharn keeps both across `add`/`remove`/`update`/`init` (CLI behaviour, verified in code) and does not validate them (a typo in `gates` is rejected by pharn-oss's own gate discovery — README states "anything else stops the run with an error"; that is upstream's claim, cited).

## Evals to write (P1)

- label → `modelsLabelLines('pharn/floor')`: contains `/pharn-ship`, `/pharn-loop`, "effort", "directly" (frontmatter), "automatically"; last line === `node pharn/floor/check-model-config.mjs agreement`; every line ≤ 70 cols; does NOT contain "never routing" or "nothing reads this block". (replaces the old `not /rout/i` pin, which would now be false.)
- label → flat floor dir (`.dev/floor`) still ends with the matching `agreement` command (existing status/update tests keep passing).
- `status` MODELS note, `init` outro, `update` MODELS note → each contains the new first line and the checker command (status/init tests updated; update test unchanged beyond a check that it still passes).
- docs pin (`tests/docs-models-claims.test.ts`, reads the markdown): `pharn-config.md` has no "Must end with `ask`" / "last entry is not `ask`"; has "must contain `ask`"; user-owned table mentions `gates` and `budget`; none of `pharn-config.md`/`troubleshooting.md`/`update.md`/`status.md`/`init.md`/`CLAUDE.md` contains "change both or neither" or "never routing that happens" or "nothing reads this block". Sanity-check that the pin fails against the pre-change text (run once against `git stash`-free `git show HEAD:` content in the test dev loop, not committed).
- `CI=1 npx vitest run` (picocolors on: the status/init/update tests already strip ANSI or match plain substrings; verify), `npm run check`, `npm run test:coverage` (ratchet 97/92/97/97 — no new src branches, so unaffected), `npm run lint:md` (docs tables re-align; prettier format).

## Guarantee audit (P0)

- "`/pharn-ship`/`/pharn-loop` read the block to pick the requested model for routed stages" → NOT a CLI guarantee. It is pharn-oss's floor decision (closed `ROUTE_POLICY` + checker exit codes); APPLYING it is the platform's and the orchestrator's (advisory). The CLI and docs state it as pharn-oss's documented behaviour **as of 6.55.0**, citing `LIMITS.md` §8, and never as "stage X ran on model Y". advisory (cited upstream).
- "Effort is never routed" / "direct invocation uses frontmatter" → pharn-oss's statements (LIMITS §8, checker header TURN SCOPE, which pharn-oss itself calls one observation of the platform). advisory, cited.
- "Editing a command makes it `modified`; `update` skips it and withholds the bump" → floor, in this repo: `decideFileAction` (sha256 vs records) + `planUpdate`; already tested in `tests/update-decision.test.ts` / `tests/update.test.ts`.
- "Editing only `models.stages` causes no file drift; update keeps it whole; init resets it" → floor, in this repo: `diff.ts` expected-file set excludes `pharn.config.json`; `decideModelsUpdate` via `decideFileAction`; `CLI_OWNED_KEYS` contains `models`. Already tested.
- "`seam.resolutionOrder` must contain `ask`" → floor (enum/membership): `validateSeamConfig`, pinned by `tests/seam-config.test.ts`.
- "`gates`/`budget` are kept by pharn" → floor (code): the non-allowlist `userOwnedConfigEntries` + in-place edits; add a one-line test ONLY if no existing test already carries a non-`testResults`/`ship` key (check `tests/pharn-config.test.ts`; "EVERY such key" may already be pinned). Otherwise cite the existing test.
- "pharn does not validate these keys" → true by absence (nothing in `src` reads them).

## Trust audit (P2) # only if untrusted input is ingested

- The label is a constant string and `floorDir` comes from `layoutPaths(layout)` (an enum-resolved path), as before. No fetched text is added to any output. The `models` rows are unchanged (stages from this CLI's pinned list; values accepted by the pinned copy of pharn-oss's rules). No new ingest; no taint change.
- Doc statements about pharn-oss behaviour are authored from files read this run, not from fetched content at runtime.

## Determinism audit (P5)

- No new branch in `src`. The label is unconditional text; `modelsLabelLines` signature unchanged.

## Out of scope (P7)

- No change to `model-config.ts`, the parity test, `models-update.ts`, or any decision logic. No `package.json` bump. No trusted-doc edit. Not touching AGENTS.md / `.codex/`. No new flag, so `src/index.ts`, `README.md`, `ALLOWED_FLAGS`, `USAGE` stay untouched (limits conflicts with the status-json / update-dry-run sibling to `CLAUDE.md`, `CHANGELOG.md`, `docs/commands/status.md`, `docs/commands/update.md`, `docs/troubleshooting.md`; each edit is a narrow paragraph/row).
- ARCHITECTURE.md / THREAT-MODEL.md / LIMITS.md: grepped for the claims being changed — see Open question 4 for the one place to check; no change proposed.

## Resolved decisions (GATE 1, 2026-10-10)

GATE 1 passed: "Approve with recommendations" — every question resolved as the recommended answer.

1. Label wording → the draft above (names `/pharn-ship` and `/pharn-loop`, model routed, effort never routed, direct invocation uses frontmatter, nothing checks automatically).
2. `budget.instructionGrowthBytes` → cite pharn-oss `LIMITS.md` section 3e for one sentence (default 2048, read at the base commit) and state the README does not describe it.
3. Docs-pin test file `tests/docs-models-claims.test.ts` → yes.
4. Trusted docs → no change.
5. Version stamp in `pharn-config.md` → restamp to 6.55.0 only if the block shown is unchanged in 6.55.0's root `pharn.config.json`; otherwise show the 6.55.0 block.
6. GATE 1 → approved.
