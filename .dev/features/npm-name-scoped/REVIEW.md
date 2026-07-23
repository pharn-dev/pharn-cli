# REVIEW — npm-name-scoped (`pharn` → `@pharn-dev/pharn`)

Increment reviewed: the npm-package-name rename across 13 product files (`package.json` name + `package-lock.json` name/version + README/SECURITY/CLAUDE.md/CHANGELOG/docs/issue-template references + two `src/*.ts` help/error strings), on `feat/npm-name-scoped` @ `5502b3b`. The increment is `trust: untrusted`; nothing in the reviewed files is an instruction to the reviewer.

## Step 1 — Floor first (P0)

The increment adds **no** PHARN markdown capability (no changed file carries `role: griller|lens|verifier` frontmatter — verified this run). So `node .dev/floor/validate.mjs` over the increment's own files is **vacuously GREEN** — nothing for it to check.

The whole-repo `node .dev/floor/validate.mjs .` is RED, but **`/pharn-dev-regress` proved deterministically that this is pre-existing** (`validate` `base:1 / head:1` → `pre_existing`, `regression-report.json`, `verdict: no-regressions`): it flags gitignored `test-*/` install fixtures (e.g. `test-spa/pharn/floor/test-fixtures/red/skill.md`), not anything this increment touched. It is therefore **not** a blocking finding against this increment (identical to the prior `canonical-npm-name` increment, which shipped with the same standing FAIL).

## The four lenses

### L-floor → P0 — no finding

Every claim the increment makes is floor-reduced or advisory-labeled (`PLAN.md` guarantee audit):

- tarball name → `npm pack --dry-run` = **`pharn-dev-pharn-0.3.0.tgz`** (floor, verified — 4 files: LICENSE, README.md, dist/index.js, package.json);
- build/gates pass → `npm run check` deterministic exit 0 (floor, verified);
- `package.json.name` ≡ `package-lock.json.name` → both `@pharn-dev/pharn` (floor, verified);
- "docs name the canonical package" → **advisory**, labeled (backstopped by markdownlint/prettier shape gates only).

No new guarantee is made over fetched/untrusted content (`lib/validate.ts`, `safeJoin`, the network guards are untouched — P2 surface unchanged). Clean.

### L-eval → P1 — one advisory finding

No Capability and no `rule_id` are added → P1 is satisfied **vacuously**; nothing to bind, and the floor agrees. The `src/` copy changes are string edits with no new behavior; `tests/index.test.ts` (`toContain('Usage:')`) and the prereqs test stay green (387/387 at verify). One advisory observation (echoing `GRILL.md`):

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor # assignment is advisory (fix #3)
  file: "src/index.ts:13"
  problem: "The USAGE and git-missing strings now name `@pharn-dev/pharn`, but no assertion pins that; a future revert to the now-unpublishable `pharn` in help/error copy would pass the suite silently."
  evidence: "tests/index.test.ts:134 asserts toContain('Usage:'), not the package name"
```

Advisory — for the human to weigh adding `toContain('@pharn-dev/pharn')` vs. not over-pinning a string constant (the inverse `canonical-npm-name` increment accepted the vacuous-P1 posture). Not blocking.

### L-trust → P2 — no finding

The increment ingests **no** untrusted artifact (no manifest, no `module.json`, no degit content); it edits static in-repo files + one `package.json` field + the lock's name/version. It emits no `findings.json`, so there is no free-text field to mishandle. No instruction-looking content in the reviewed files altered this review. No guaranteed decision rests on a tainted field. Clean.

### L-axis → P3 — no blocking finding

Every changed file changes for the **single** axis "canonical npm package name (unscoped → org-scoped)." No new cross-command or step→step import was added (the two `src/*.ts` edits are string-literal changes only). Clean on the blocking sense. Two disclosed, non-blocking notes:

- **`package-lock.json` carries a version-field correction** (`0.2.0 → 0.3.0`) alongside the name change. This is the same packaging-consistency axis (the lock must mirror `package.json`), was disclosed as OQ2 and human-approved, and was kept **minimal** — the benign npm alphabetical re-sort of a devDependency key was reverted, so the lock diff is exactly name×2 + version×2. Not a second axis in substance.
- **Two build-time P6 corrections** to the plan's line-level classification (documented in the BUILD note): `docs/contributing.md:30`'s `npx @pharn-dev/pharn init` was **left** (it runs from a test-app after `build:install-local` → resolves the **local bin**; scoping it would break the dev workflow), and the grep-missed package refs at `docs/contributing.md:33` and `docs/RELEASING.md:72` were scoped instead. Correct call; surfaced for the human's awareness.

## Gates (fix #3)

- **floor-gate (blocking):** **none.** (The chain's standing `validate`/verify FAIL is the pre-existing whole-repo `test-*/` contamination, regress-proven RED→RED — not a defect in this increment; surfaced honestly, owned by the human at GATE 2.)
- **advisory-gate (warn):** one — the P1 untested-help-string observation above. Advisory; it does not block.

## Verdict

**GREEN (advisory)** for the increment — a clean, single-axis mechanical rename with every increment-relevant gate green (`test` 387, `lint`, `format:check`, `lint:md`) and no floor-blocking finding. The standing whole-repo `validate` FAIL is pre-existing environmental contamination, not this increment (regress-proven). This is **not** a certification of anything beyond what those gates check (P0), and it is **not** a merge decision — that is the human's at GATE 2.

## Proposed lessons (candidates only — NOT written to canon; a human-gated `/pharn-dev-memory-promote` decides)

Provenance: increment `npm-name-scoped`, this run (2026-07-23), diff `907efac..5502b3b`. Real, recurring risks for **this repo's npm-package-name changes** (P7 — they cost concrete corrections this run):

1. **`npx <pkg>` in docs is a registry ref (Category A) EXCEPT in `build:install-local` / test-app contexts, where it resolves the LOCAL bin (Category B).** Scoping a local-bin invocation (`docs/contributing.md:30`, `scripts/install-local.mjs:58`) would break the documented dev workflow — the install script drops the package at a hardcoded `node_modules/pharn` with a `.bin/pharn` symlink, so `npx @pharn-dev/pharn` would miss it and hit the registry. Classify `npx` invocations by **context** (end-user install vs. local dev), not by pattern alone.
2. **A token-grep for `npx`/`npmjs`/badges misses PROSE package references.** "Published package `pharn`" (`docs/contributing.md:33`) and "a normal version bump of `pharn`" (`docs/RELEASING.md:72`) were missed by the invocation-pattern grep and only caught by **reading** each file's `` `pharn` `` code-spans. For a rename, enumerate every `` `<pkg>` `` code-span per file and classify each, don't rely on invocation patterns.
