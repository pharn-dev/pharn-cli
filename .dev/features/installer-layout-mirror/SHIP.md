# SHIP — installer-layout-mirror

Thin, **advisory** roll-up of a gated `/pharn-dev-ship` run. It records that the chain ran and its floor verdicts — it is **not** an approval, a "shipped" mark, or a `PHARN ✓ reviewed` seal.

## Increment

Make the pharn installer **layout-aware**: mirror whichever layout the fetched pharn-oss clone has — the new `pharn/` single-install layout (PR #86 / `pharn-runtime-layout`) OR the legacy flat layout — across all archetype surfaces (install, status/drift, remove), recording the installed layout in `pharn.config.json`. This is the layout half of the original `/pharn-dev-ship` request; the DOCS_URL half already shipped as `remove-dead-docs-url`.

**GATE-1 decisions (human):** all-at-once (write + read side together); clone ref stays `main`; mirror PR #86's current subtree paths (accepted caveat: a follow-up tweak if #86 renames a subtree before merge).

**Design (P7-safe by construction):** one deterministic resolver (`lib/layout.ts`) — `detectLayout` (membership on the `pharn/pharn-contracts` marker), `layoutPaths`, `configLayout`. The `else` branch **is** today's flat behavior, so old pinned SHAs keep installing flat.

## Stages that ran, in order, and where the run ended

| stage | what happened |
| ----- | ------------- |
| `/pharn-dev-plan` | PLAN.md (revised to all-at-once); **GATE 1** — human **approved**. |
| `/pharn-dev-grill` | GRILL.md: 4 concerns (0 blocking, 2 important, 2 minor). Acted on both important ones in build: specific `pharn/pharn-contracts` marker (not bare `pharn/`), cross-layout diff test. Advisory, gated nothing. |
| `/pharn-dev-build` | 17 files (10 src + 7 test). Floor GREEN. |
| `/pharn-dev-regress` | no feature-attributable regression. |
| `/pharn-dev-verify` | all floor gates PASS; 0 verifiers. |
| `/pharn-dev-review` | REVIEW.md: GREEN, 0 floor findings, 0 blocking (1 minor advisory follow-up). |

**Run ended at GATE 2** (post-review human decision) — not at a RED-verdict STOP.

## Structural verdicts read, verbatim (the floor — the only guaranteed parts)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **`0`** (GREEN). Repo floor `npm run check` also exit 0: format:check + lint + typecheck + **616/616** vitest.
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (exit 0). The one RED gate (`tests`) is `1→1` **pre_existing** — the same non-hermetic `test-app`/`lens-scanner-map` node-runner drift documented for `remove-dead-docs-url`, not attributable to this increment (sound same-environment measurement in REGRESSION.md).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (exit 0); `failing_gates: []` over `{test, validate, lint, format:check, lint:md}`.

## Advisory artifacts (cited, not restated — P4)

- `.dev/features/installer-layout-mirror/REVIEW.md` — 4-lens review (GREEN); one minor advisory: `add` installs at the clone's layout, not the project's recorded layout — a documented **increment-3 follow-up** (thread `configLayout(config)` into `add`'s `installCapabilityDirs` call; the optional `paths` param added this run makes it one line).
- `.dev/features/installer-layout-mirror/GRILL.md` — advisory pre-build interrogation (4 concerns).

## Standing dependency (honest, P7)

The `pharn/` branch mirrors PR #86, which is **open, not merged to `main`**. Today a default `pharn init` (clone = `main`, flat) still installs flat; the `pharn/` path activates automatically once #86 merges. If #86 renames a subtree before merge, the `pharn/` constants need a one-line follow-up (the flat branch is unaffected). Re-confirm the `pharn/` paths against #86 at its merge.

## Honest close (P0)

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise. That is the human's call at the post-review gate: **merge / fix / abandon.** `/pharn-dev-ship` does not merge, push, commit, or seal. The change is currently **uncommitted** in the working tree.
