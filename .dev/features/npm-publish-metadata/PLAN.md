# PLAN — npm publish metadata (publish the package to npm as `pharn`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — ARCHITECTURE.md, read this run
- increment: Make the package publishable to npm under the name `pharn` by adding npm publish metadata + a prepack build; sync the immediately-affected docs. (PR1 / axis 1 of 2 — the OIDC release workflow is a **separate** second increment / second `/pharn-dev-ship` run.)
- layer(s): repository packaging / release tooling — **NOT** a methodology layer in `ARCHITECTURE.md §4` (adds no Capability, contract, or rule).
- constitution_refs: [P4, P7] # P4 docs cite code; P7 honest scope + old pins never break + additive. P0/P1/P2/P5 audited below and found vacuous or N/A.

## Files

- `package.json` — npm publish metadata (see concrete values below): `name` pharn→**pharn**, `description`, `keywords`, `repository`/`bugs`/`homepage`, `bin`→`{pharn}`, `publishConfig{access,provenance}`, `scripts.prepublishOnly` + `scripts.prepack`, `engines` (decision Q1). `version` **stays 0.2.0** (metadata, not behavior). — layer: repo packaging
- `README.md` — add an **Install** section (`npx pharn@latest init`); update the npm badge `pharn`→`pharn` and the "npm package is `pharn` / both bins" note (line ~43) to the new name + single bin. **No** module-prose rewrite (see Q4). — layer: docs
- `CHANGELOG.md` — one `[Unreleased]` entry: rename to `pharn` + publish-readiness metadata, Keep-a-Changelog format. — layer: docs
- `CLAUDE.md` — update the "Published as `pharn`, exposing both `pharn` and `pharn` bins" line to the new `pharn` package name + single bin. — layer: project guidance

Out of scope for this increment (no `src/` change; no `.github/workflows/` change; no `pharn.config.json` schema change; the trusted docs are write-protected and untouched).

### package.json — concrete values (for GATE-1 review)

- `name`: `"pharn"`
- `version`: `"0.2.0"` (unchanged)
- `description`: `"Audit-grade AI development methodology for Claude Code — spec, plan, grill, build, verify, ship."` (also de-stales the current modules/stack-pack wording)
- `keywords`: `["claude-code","ai","methodology","code-review","audit","agents"]`
- `license`: `"Apache-2.0"` (already set — no change)
- `repository`: `{ "type": "git", "url": "git+https://github.com/pharn-dev/pharn.git" }` (EXACT — provenance attestation validates this against the building repo)
- `bugs`: `{ "url": "https://github.com/pharn-dev/pharn/issues" }`
- `homepage`: `"https://github.com/pharn-dev/pharn#readme"`
- `bin`: `{ "pharn": "dist/index.js" }` (Q2 — drop the `pharn` alias)
- `files`: `["dist"]` (UNCHANGED — verified sufficient: runtime is `dist/**` only; the CLI fetches pharn-oss via `degit`/`fetch` at runtime and bundles no templates; the only package-relative read is `require('../package.json')`, always included by npm)
- `engines`: `{ "node": ">=20" }` (Q1 — recommend keep 20, not the task's 18)
- `publishConfig`: `{ "access": "public", "provenance": true }`
- `scripts.prepublishOnly`: `"npm run check"`
- `scripts.prepack`: `"npm run build"` (Q5 — REQUIRED, see guarantee audit)

## Contracts satisfied

- **None in `pharn-contracts`** — this increment adds no Capability/contract/rule (P4: cite, don't restate; there is nothing methodology-side to satisfy). It satisfies the **external npm publish contract** — the `package.json` fields `npm publish --provenance` requires — which is verified **deterministically** by `npm pack --dry-run` + `npm run check`, not by any methodology floor.

## Evals to write (P1)

- **None required.** P1 binds evals to Capabilities and `enforces` `rule_id`s; this increment introduces neither, so the obligation is **vacuously satisfied**. The standing regression spec is the existing `tests/*.test.ts` vitest suite. Acceptance = `npm run check` GREEN **and zero `src/` files changed** (no behavior change).

## Guarantee audit (P0)

- "`files: ["dist"]` ships exactly the runtime, zero dev/test junk" → **floor: deterministic** — the `npm pack --dry-run` tarball listing (asserted at build, not judged). The many `test-*/` scratch dirs are already `.gitignore`d and excluded by the whitelist.
- "`scripts.prepack: npm run build` guarantees a fresh `dist/` in the published tarball" → **floor: deterministic** — npm runs `prepack` on both `npm pack` and `npm publish`; the build stage will run `npm run build && npm pack --dry-run` to show the built `dist/**`. Without this, `dist/` is gitignored and unbuilt in CI → `npm publish` ships an empty `dist/` → broken `pharn` bin. This is the single ship-breaking gap in the literal task spec.
- "the metadata enables npm provenance attestation" → **ADVISORY from this repo's floor; the guarantee is npm/Sigstore's, at publish time (PR2).** What is deterministic *here* is only that `repository.url` **exactly equals** the building repo — a necessary, not sufficient, condition. Setting `provenance: true` does not itself attest anything; the OIDC publish does. (P0: a field-set is not the guarantee.)
- "no behavior change to CLI commands" → **floor-ish: deterministic** — the diff touches **no** `src/` file, and `npm run check` (the vitest suite = the spec, P1) stays GREEN.
- "`engines: >=20` is honest" → **advisory** compatibility claim, backstopped by CI testing on Node 20 (P7 — do not oversell an untested `>=18`).

## Trust audit (P2)

- **N/A — no untrusted remote artifact is ingested.** Every edit is static, author-written, local content (`package.json` + three docs). No `fetch`, no `degit`, no manifest, no capability frontmatter. There is no taint to propagate.

## Determinism audit (P5)

- No new runtime branch is introduced. Verification is deterministic: `npm pack --dry-run` (tarball membership) + `npm run check` (exit code). Every open decision below terminates in a **human choice at GATE 1** — the terminal fallback is "ask" (P5/P6), never a guess.

## Open questions (HALT)

**Status: RESOLVED — none open.** All five below were resolved by human decision at GATE 1 (see `## Decisions` below) and are retained only for the audit trail. There is **no** unresolved question blocking `/pharn-dev-build`.

1. **`engines`** — keep `>=20` (**recommended**: the already-declared, CI-tested baseline; global `fetch`/`AbortController` were experimental before Node 21) **or** set the task's `>=18` (an untested compatibility claim)?
2. **`bin`** — single `{ "pharn": "dist/index.js" }` (**recommended**: the package *is* `pharn` now; a `pharn` bin on a package named `pharn` is confusing) **or** keep the `pharn` alias too?
3. **Increment split** — confirm **PR1 = npm metadata (this run)** and **PR2 = OIDC release workflow (a separate `/pharn-dev-ship` run)**? release.yml depends on this PR's `prepack`, so PR1 must land first.
4. **README module-model staleness (P4)** — the README still describes the **removed** module/manifest system (module table, "pick which modules and stack pack", `orm:prisma`, privacy-posture wizard). Leave it and file a **separate fast-follow** (**recommended** — keeps this PR tight; my README edits introduce no new P4 violation) **or** expand PR1 to de-stale it now?
5. **`prepack: npm run build`** — confirm adding it. It is **not** in the literal task spec but is **required** for a working publish (Q-rationale in the guarantee audit). Recommend: **yes**.

## Decisions (resolved at GATE 1 — 2026-07-22, human-approved)

- Q1 `engines` → **keep `>=20`** (not `>=18`).
- Q2 `bin` → **single `{ "pharn": "dist/index.js" }`** (drop the `pharn` alias).
- Q3 increment split → **confirmed**: this run = PR1 (npm metadata); PR2 (OIDC `release.yml`) is a separate `/pharn-dev-ship` run.
- Q4 README staleness → **fast-follow**; PR1 stays tight (Install section + badge/bin note only).
- Q5 `prepack: npm run build` → **yes**, add it.
- Plan approved **as written**.
