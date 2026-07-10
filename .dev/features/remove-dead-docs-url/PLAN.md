# PLAN — Remove the dead DOCS_URL

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Remove the dead `DOCS_URL` constant and its two post-install "Docs" output lines — no replacement URL (human decision: "just remove the URL").
- layer(s): pharn-cli product source — `src/lib/` (constants) + `src/steps/` (two install stages). ARCHITECTURE.md §4.
- constitution_refs: [P4, P7, P1]

## Files

- `src/lib/constants.ts` — layer lib. Delete the DOCS_URL export (currently :13).
- `src/steps/install.ts` — layer steps. Drop DOCS_URL from the constants import (:7, keeping FIRST_FEATURE_COMMAND + REPO_URL); delete the "Docs" outro line and its preceding empty-string separator (currently :123–124).
- `src/steps/install-archetype.ts` — layer steps. Drop DOCS_URL from the constants import (:4, keeping FIRST_FEATURE_COMMAND + REPO_URL); delete the "Docs" outro line and its preceding empty-string separator (currently :91–92).

## Contracts satisfied

- None — this touches no `pharn-contracts` schema. It removes a dead product-display constant; the config/manifest/module schemas are untouched (P4 — cited, not restated).

## Evals to write (P1)

- No new vitest test. The removed content is cosmetic clack `outro` output with **zero** existing test coverage (`grep 'DOCS_URL' tests` and `grep 'Docs' tests` are both empty), and asserting the absence of a UI line would brittly snapshot terminal output. Completeness is instead pinned to the deterministic floor:
  - `grep -rn 'DOCS_URL' src` → **empty** after the change (deterministic completeness check);
  - `npm run typecheck` (`tsc`) fails on any dangling `DOCS_URL` reference;
  - `npm run lint` (`eslint`) fails on a now-unused import;
  - `npm test` (full `vitest` suite) stays green — the regression backstop.

## Guarantee audit (P0)

- "DOCS_URL is fully removed, no dangling reference" → **floor**: typecheck (undefined symbol → `tsc` error) + lint (unused import → `eslint` error) + `grep -rn DOCS_URL src` empty. Deterministic, not advisory.
- No safety/trust guarantee over fetched or copied content is introduced or altered — this is a pure display-constant deletion. No new guarantee claimed.

## Trust audit (P2)

- N/A — the increment ingests no untrusted artifact and adds/changes no filesystem write driven by fetched content. No taint surface.

## Determinism audit (P5)

- N/A — no new branch. The change only deletes code; it introduces no classification or fallback.

## Deferred — layout migration (out of scope, honest per P7)

- The `pharn/`-layout migration (the other half of the original `/pharn-dev-ship` request) is **BLOCKED, not built here.** Verified live this run: pharn-oss has **no** `pharn/` top-level dir on `main` or `migrations-griller` (0 of 1385 paths) and **no** open PRs; its layout is still flat, exactly what the CLI mirrors today. The human confirmed the reorg is "planned and happening right now" — i.e. **not merged**. The CLI must mirror the real upstream layout, never invent one (P5/P6/P7). **Re-run the layout increment once pharn-oss lands `pharn/` on `main`.** No `install-capabilities.ts` / `constants.ts` path changes in this increment.

## Open questions (HALT)

- None remaining — both were resolved via the discovery form: layout migration deferred (upstream not merged); DOCS_URL removed outright (no replacement).
