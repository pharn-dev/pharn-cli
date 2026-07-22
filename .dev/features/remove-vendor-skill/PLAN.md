# PLAN — remove the orphaned vendorSkill mechanism

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Delete the vendorSkill layer (consent step + vendor-skill degit fetch + the `source`/`vendorSkill` option fields + the `vendorSkills` config record + their tests), leaving the tree typechecking and green, and the kept skill-category/capability installs untouched.
- layer(s): commands/ (init), steps/ (install, summary; delete vendor-consent), lib/ (wizard, manifest, validate; delete vendor-fetch), types.ts, tests/, docs/ # ARCHITECTURE.md §4
- constitution_refs: [P1, P2, P3, P4, P7]

## Why this is one coherent increment (P7)

`vendorSkill` is an **orphaned** speculative feature — official vendor skills mostly don't exist and
the new design has pharn-oss respect user-installed `.claude/skills/` rather than the CLI fetching
them. Removing it is P7's "no speculative additions" applied in reverse. It cannot be split: the
symbols are cross-cutting, so a partial removal leaves dangling references and the floor
(`typecheck`/`test`) goes RED. The whole layer is the smallest set that compiles.

## Scope boundary — REMOVE (vendorSkill-specific) vs. KEEP (shared/live), grounded in discovery

**REMOVE (vendorSkill-only — verified by grep to have no other consumer):**

- `runVendorConsent` (the consent multiselect), `fetchVendorSkills` (degit-for-vendor-skills),
  `collectVendorSkills`, the `VendorSkill` / `VendorFetchResult` types.
- `WizardOption.vendorSkill` and `WizardOption.source` — `source` exists **only** to feed the vendor
  fetch (its sole readers are `collectVendorSkills`, the summary vendor block, and the consent label).
- `VENDOR_SOURCE_RE` — its only two uses are `vendor-fetch.ts` and the `source`-field parse in
  `manifest.ts`; both go.
- `PharnConfig.vendorSkills` / `WizardConfig.vendorSkills`.

**KEEP (explicitly NOT vendorSkill — must remain green):**

- The **skill-category selective install**: `installedSkills`, `collectInstalls`, `installSkills`,
  and the `add`/`remove <category>:<skill>` addressing. Live, heavily used — not orphaned.
- The **archetype capability install** (`install-capabilities.ts` etc.). Discovery confirms it imports
  `safeJoin` from `install-modules.js` (shared plumbing) and **never** imports `vendor-fetch`, so this
  removal cannot touch it.
- Shared plumbing: `safeJoin` (`install-modules.ts`), `degit` via `repo.ts`, the `detect` option field.

## Files

**Delete (whole file — vendorSkill-only):**

- `src/lib/vendor-fetch.ts` — `fetchVendorSkills`/`VendorFetchResult`, sole vendor-degit sink — layer lib
- `src/steps/vendor-consent.ts` — `runVendorConsent` consent step — layer steps
- `tests/vendor-fetch.test.ts` — its test — layer tests
- `tests/vendor-consent.test.ts` — its test — layer tests

**Edit (excise vendor symbols; keep the rest single-axis, P3):**

- `src/types.ts` — drop `WizardOption.vendorSkill`, `WizardOption.source`, `interface VendorSkill`, `WizardConfig.vendorSkills`, `PharnConfig.vendorSkills` — layer types
- `src/lib/wizard.ts` — remove `collectVendorSkills` + its `VendorSkill` import; keep `collectInstalls` — layer lib
- `src/lib/manifest.ts` — remove the `vendorSkill` + `source` parse blocks and the `VENDOR_SOURCE_RE` import; keep `install`/`detect`/`comingSoon` parse — layer lib
- `src/lib/validate.ts` — remove `VENDOR_SOURCE_RE` (now dead) — layer lib
- `src/commands/init.ts` — remove the `runVendorConsent`/`collectVendorSkills` imports, the consent call, and `vendorSkills` from the `WizardConfig` literal — layer commands
- `src/steps/install.ts` — remove the `fetchVendorSkills`/`VendorFetchResult` imports, the vendor-fetch block, the `vendorSkills` config write, and the vendor outro line — layer steps
- `src/steps/summary.ts` — remove the "VENDOR SKILLS (recorded)" block; keep the "SKILLS (selected)" block — layer steps

**Edit tests (strip vendor assertions; PRESERVE kept-behavior coverage, P1):**

- `tests/wizard-fixture.ts` — remove `vendorSkill`/`source` from the supabase option (else excess-property type errors); keep `install`/`detect`
- `tests/wizard.test.ts` — remove the `collectVendorSkills` describe + import; keep `collectInstalls`
- `tests/manifest-v2.test.ts` — remove the `source` round-trip test (~L42) and the two `source`-validation cases (~L243–251)
- `tests/init-v2.test.ts` — remove the `runVendorConsent` mock + the `vendorSkills` assertion; keep the `installedSkills` assertions (see loop-back note below)
- `tests/install.test.ts` — remove the `fetchVendorSkills` mock + vendor test cases; keep the `installedSkills` write coverage
- `tests/summary.test.ts` — remove the `vendorSkills` fixture + vendor-block assertion; keep SKILLS-block assertion
- `tests/pharn-config.test.ts` — remove `vendorSkills` from the round-trip fixture; keep `installedSkills`

**Edit docs (keep in sync, P4):**

- `docs/commands/init.md` (L63) — drop the "vendor-skills consent" step + `vendorSkills` from the config sentence
- `docs/reference/pharn-config.md` (L21, L65) — remove the `vendorSkills` row + the example field
- `docs/contributing.md` (L64, L91) — remove `vendor-consent` from the steps list + `vendor-consent.test.ts` from the test table

## Contracts satisfied

- The CLI's own `pharn.config.json` schema ownership (CLAUDE.md, "this CLI owns the config schema"):
  the schema stays **additive** — a legacy config carrying a now-unused `vendorSkills` key still loads
  (`readPharnConfig` is a passthrough; P7). Cite, don't restate. (No `pharn-contracts/` contract is
  implemented — this is a removal within pharn.)

## Evals to write (P1 — the updated tests ARE the new spec)

- `init-v2` → Custom-mode answers produce a `WizardConfig` with the right `installedSkills` and **no**
  `vendorSkills` key (`config.vendorSkills` undefined).
- `install` → the written `pharn.config.json` has **no** `vendorSkills`; install completes with only
  the skill-category skills, no vendor fetch attempted.
- `manifest-v2` → parsing a wizard option ignores stray `vendorSkill`/`source` keys (no throw, not
  present on the parsed option) — forward/backward compatible.
- `pharn-config` → a config object carrying an extra `vendorSkills` key still loads (P7 additive
  tolerance) — keep as an explicit regression.
- `summary` → the rendered summary omits the VENDOR SKILLS block and still renders SKILLS (selected).
- `init-v2` loop-back → summary "go back" still preserves prior answers, asserted via a **non-vendor**
  signal (`installedSkills`/`stackAnswers`), so deleting the vendor-consent-based assertion loses no
  coverage. (Build directive: confirm this before deleting the old assertion.)

## Guarantee audit (P0)

- "Removing `VENDOR_SOURCE_RE` does not weaken P2" → **floor (verify-by-absence):** its guarded sink
  (`source` → `degit`, a shell-out) is deleted in the **same** increment; after removal, `grep` for
  `fetchVendorSkills` / a `degit(...source...)` call returns nothing. The regex is dead precisely
  because the sink is gone. `check-verify`/`typecheck`/`test` green backstops it.
- "Legacy configs still load after `vendorSkills` leaves the type" → **floor:** `readPharnConfig` is a
  passthrough with a light shape guard that never rejects unknown keys, + a kept test loading a config
  with an extra `vendorSkills` key.
- "init still installs the kept skill-category skills without the vendor layer" → **advisory**
  (integration), backstopped by the floor: `npm test` (`init-v2`/`install`/`installer`) + `validate`
  GREEN.
- The increment introduces **no new guarantee** — it deletes a mechanism.

## Trust audit (P2)

- This removes an untrusted→shell sink: a manifest option's `source` (untrusted remote content) was
  validated by `VENDOR_SOURCE_RE` + `..` check, then handed to `degit` (which shells out). Deleting
  `vendor-fetch.ts` removes that sink entirely, so taint is **reduced**, not moved. Dropping the
  `VENDOR_SOURCE_RE` guard is safe **only because its sink is removed in the same increment** — a fact
  verifiable by absence (no remaining `degit` call takes option-derived input). No new untrusted
  ingest is added.

## Determinism audit (P5)

- No branch is added. The deleted `runVendorConsent` was a legitimate user-ask (a `multiselect`), not
  a classifier. Nothing in the increment ends a fallback in a guess.

## Open questions — RESOLVED at GATE 1 (no open items)

Both were answered by the human at the plan-approval gate (AskUserQuestion form); the plan proceeds as
written on the recommended answers:

1. **Scope confirmation** → RESOLVED: **vendorSkills only**. `installedSkills` and the whole
   `add`/`remove <category>:<skill>` skill-category install are KEPT; only the vendor layer is removed.
2. **Co-remove the orphaned `source` field + `VENDOR_SOURCE_RE`?** → RESOLVED: **yes, remove**. With
   `vendorSkill` gone, `WizardOption.source` has zero consumers, so it and its dead regex are dropped.

## Trusted-doc reconciliation — SURFACED, never agent-edited (P2, hook-protected)

These are `trust: trusted`, human-only, write-protected at the floor; the build must **not** touch
them. Reported for a human to reconcile after merge:

- `CONSTITUTION.md` P7 (L119) lists `vendorSkills` among the example v2 additive config fields — it
  will name a removed field. (The additive *principle* is unaffected.)
- `ARCHITECTURE.md` (L170) references an "official skill → … → fetch+pin" seam chain — the aspirational
  design `vendorSkill` was a first stab at. Removing the CLI code does not require editing this future
  design note.
