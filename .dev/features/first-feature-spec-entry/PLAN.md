# PLAN — first-feature next-step enters at /pharn-spec

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256(ARCHITECTURE.md), fix #4
- increment: Point the post-`pharn init` first-run hint (`FIRST_FEATURE_COMMAND`) — and the docs that state that entry point — at `/pharn-spec` (intent capture) instead of `/pharn-plan`, so the norm the CLI sets does not teach users to skip intent capture.
- layer(s): pharn (the installer) — `src/lib/constants.ts` (the constant) + `src/steps/install-archetype.ts` (its one consumer, the dim label) + user-facing `docs/` / `README.md`. NOT a pharn-oss / product-surface change (the CLI copies pharn-oss verbatim).
- constitution_refs: [P4, P6, P7, P1]

## Files

- `src/lib/constants.ts` — set `FIRST_FEATURE_COMMAND = '/pharn-spec'` (was `/pharn-plan`); both literals are 11 chars so the fixed-width column padding downstream is unchanged — layer: pharn/lib
- `src/steps/install-archetype.ts` — the only consumer (line 92): retarget the step-2 dim label `plan your first feature` → `capture your first feature's intent` — layer: pharn/steps
- `docs/commands/init.md` — line 95 documents the printed hint; retarget `/pharn-plan` → `/pharn-spec` to keep doc = code (P4) — layer: docs
- `docs/getting-started.md` — lines 78 & 80: lead the "After init" step with `/pharn-spec` (intent capture, feeds `/pharn-plan`); reword the "it's optional" clause to "recommended first" — layer: docs
- `README.md` — line 88: lead the post-init step with `/pharn-spec` (feeds `/pharn-plan`) — layer: docs
- `CHANGELOG.md` — one entry under `## [Unreleased]` then `### Changed`; no version bump (release flow owns it) — layer: repo docs
- `tests/constants.test.ts` — new: prefix-invariant guard (P1) that the hint names a real product command and equals `/pharn-spec` — layer: tests

## Discovery — classified `/pharn-plan` hit list (P6; grep of src, docs, README, CHANGELOG)

| # | Location | Text (abbrev.) | Class | Action |
|---|----------|----------------|-------|--------|
| 1 | `src/lib/constants.ts:9` | `FIRST_FEATURE_COMMAND = '/pharn-plan'` | **(a) entry** | change → `/pharn-spec` |
| 2 | `docs/commands/init.md:95` | "suggests … running `/pharn-plan`" (documents the printed hint) | **(a) entry — cites the constant** | retarget → `/pharn-spec` (P4) |
| 3 | `docs/getting-started.md:78` | "Run **`/pharn-plan`** … For a fuzzy/larger feature, run **`/pharn-spec`** first … it's **optional** and feeds `/pharn-plan`." | **(a) entry — framed spec as optional** | Option A: lead with `/pharn-spec`; "optional" → "recommended first" |
| 4 | `docs/getting-started.md:80` | day-to-day loop `/pharn-plan → /pharn-grill → …` (prepend `/pharn-spec` …) | **(b) mid-pipeline loop spine** | keep the loop spine; only the "prepend/optional" clause is reworded |
| 5 | `README.md:88` | "run **`/pharn-plan`** … (or **`/pharn-spec`** first …)" | **(a) entry — framed spec as optional** | Option A: lead with `/pharn-spec` |
| 6 | `CHANGELOG.md:49` | "(Unreleased) surfaced the new **optional** `/pharn-spec` stage … **matching `pharn-oss`**" | **(b) changelog record** | do NOT rewrite; add a NEW entry noting the entry-point change |
| 7 | `CHANGELOG.md:89` | "(released) `/ship-feature` → `/pharn-plan`" | **(b) changelog history** | leave untouched |

Also relevant (not a `/pharn-plan` hit): `README.md:85` shows the typed-stage diagram `spec → plan → grill → …` with **spec first** — textual support that spec is the first stage (consistent with Option A).

## Confirmation: the change is a CONSTANT, not a conditional (the task's blocking discovery gate)

- Product commands are copied by a pure **prefix filter**: `install-capabilities.ts:134-135` copies every `.claude/commands/pharn-*.md` that is NOT `pharn-dev-*`, with **zero** archetype/capability gating (same rule in the shared `install-manifest.ts:96-97`, used by status/diff/overwrite-check). So `pharn-spec.md` lands in **every** install exactly like `pharn-plan.md`. → the "HALT if conditional" gate is **NOT triggered**; a constant is correct.
- Residual (P0/P6 — stated, not hidden): "pharn-oss `main` actually ships `pharn-spec.md`" is asserted by this repo's own docs + `CHANGELOG.md:49-51` ("ships transparently via the existing whole-module install from `main`") but is **not offline-verifiable from this CLI repo**. The existing shipped docs already reference `/pharn-spec`, so they already depend on this fact — the change adds no new dependency.

## Contracts satisfied

- None in `pharn-contracts` — this increment changes a user-facing hint string + its docs; it ingests no untrusted artifact and defines no inter-layer schema.

## Evals to write (P1)

- `tests/constants.test.ts` (new): assert `FIRST_FEATURE_COMMAND` starts with `PRODUCT_COMMAND_PREFIX` (`pharn-`), does **not** start with `DEV_COMMAND_PREFIX` (`pharn-dev-`), and equals `/pharn-spec`. This locks the *meaningful* invariant — "the hint names a real, installed product command" — not merely a literal. (No test pinned this before: grep found zero test hits for the value or the next-steps label.)

## Guarantee audit (P0)

- "`/pharn-spec` will exist in the user's install" → **floor**: the prefix copy filter (`install-capabilities.ts:134-135`; `PRODUCT_COMMAND_PREFIX` `startsWith` allowlist) copies it unconditionally — a membership test, not judgment. Backstop residual (pharn-oss actually shipping the file) → **advisory**, see above.
- "column padding stays aligned" → **floor-ish**: both literals are length 11 (verifiable); the padding literal is unchanged.
- "docs = code after the change" → **advisory** (human-read consistency), backstopped by `npm run lint:md` + review; no floor asserts doc/code agreement.
- No new *guaranteed* claim is introduced; no security invariant changes.

## Trust audit (P2)

- N/A — the increment ingests no untrusted artifact (no manifest / degit content is parsed by the change). It edits a local constant + local docs only. No taint path.

## Determinism audit (P5)

- No new branch. The one consumer prints a fixed constant; the copy that makes it valid is a membership (prefix) test, not a classification.

## Decisions (GATE 1 — human-approved; no open questions remain)

- **Q1 → Option A (spec-first is the new norm).** Approved by the human at GATE 1, explicitly accepting that this reverses the unreleased "matching `pharn-oss`" stance. The `## Files` doc edits lead with `/pharn-spec` (intent capture, feeding `/pharn-plan`) and reword the "it's optional" clauses to "recommended first." CHANGELOG history is untouched; one new `[Unreleased]` → `### Changed` entry is added.
- **Q2 → add the prefix-invariant guard test** in `tests/constants.test.ts` (see Evals).
- The plan is approved and ready to build; nothing remains unresolved.
