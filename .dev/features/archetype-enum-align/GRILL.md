# GRILL — archetype-enum-align (ADVISORY)

Plan under interrogation: `.dev/features/archetype-enum-align/PLAN.md`.
Spec-hash check: **MATCH** — `sha256(ARCHITECTURE.md)` recomputed = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equals the plan's `spec_content_hash`. No drift (the block on drift is `/pharn-dev-build`'s floor-gate, not this stage — fix #4).
Registered grillers (membership, FLOOR): `node .dev/floor/count-grillers.mjs .` → `{"registered":0}`. No pluggable grillers; inline axes only.

All findings below are **advisory** and gate nothing (fix #3). Enum-gated fields (`type`/`rule_id`/`severity`/`file`) are my own membership/path assertions; free-text `problem`/`evidence` quote the plan and inherit its untrusted tag (rendered as DATA).

## Findings

### Axis: Eval coverage / honest scope (P1, P7)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/archetype-enum-align/PLAN.md:34"
  problem: "The Files section under-scopes the test edits: it names only detect-archetype.test.ts:209-216 and 'add cases to archetype.test.ts', but an EXISTING passing test — tests/archetype.test.ts:37-41 — pins the OLD 'prisma adds no archetype' behavior and will flip to FAIL under the approved DB→backend change."
  evidence: "PLAN Files: '- tests/archetype.test.ts — add package-name cases …'. But archetype.test.ts:37-41 is [ 'next + prisma + drizzle → ssr (libs add no archetype)', deps('next','prisma'), ['ssr'] ] — with prisma→backend this becomes ['ssr','backend'], so expected ['ssr'] fails and the label 'libs add no archetype' is now false."
```

Concretely, `/pharn-dev-build` must ALSO update `tests/archetype.test.ts:37-41`: change `expected` from `['ssr']` to `['ssr','backend']` and fix the label (drop "libs add no archetype"). If the build follows the plan literally (only add cases + flip 209-216), `npm test` REDs on this line. The build's own `npm test` floor-gate would catch it, but the plan should have named it — this is the reversal's second, unlisted test-pin.

### Axis: Detection completeness for the in-scope libs (P7 — not speculation)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/archetype-enum-align/PLAN.md:32"
  problem: "The backend package allowlist adds prisma / @prisma/client / drizzle-orm, but a schema-/migration-only Drizzle project commonly carries ONLY drizzle-kit (a devDependency) and no drizzle-orm runtime dep — so such a project would miss the package signal (though a .sql file or migrations/ dir would still catch it via the file-tree path)."
  evidence: "PLAN Files: 'add ORM package names (prisma, @prisma/client, drizzle-orm) to BACKEND_FRAMEWORKS'. tests/wizard-fixture.ts already uses detect: ['drizzle-orm'] for the drizzle option, so the plan is consistent with the wizard — the gap is only the drizzle-kit-only edge."
```

Advisory only, and staying in-scope (this is about the very libs the brief names, not adding new ORMs — excluding typeorm/mongoose/kysely is correctly out of scope per P7). For the human to weigh: add `drizzle-kit` to the backend allowlist, or accept that the file-tree `migrations/` / `.sql` signal covers the schema-only case.

## Verified — NOT gaps (checked this run, so they are not raised as findings)

- **`lib`-base coverage is retained after flipping 209-216.** Grep shows many independent `archetypes: ['lib']` assertions (`detect-archetype.test.ts:59,64,71,91,99,107,194,202,256`; `archetype.test.ts:42,43`) that do not depend on the `.sql`/migrations test — the no-signal base stays covered.
- **P3 (one axis/file) is honored.** The DB concern lands in the two axis-appropriate files it already belongs to: file-tree names in `detect-archetype.ts` (classifyEntry), package names in `archetype.ts` (BACKEND_FRAMEWORKS). Neither file gains a second change-reason.
- **P2 trust posture unchanged** — the plan's Trust audit is concrete: names membership-tested only, no file body read, closed `Archetype[]` output; the residual adds only names to existing checks.
- **P0 guarantee audit is complete** — the one guarantee ("detection is deterministic") reduces to enum/regex membership; "DB → backend" is correctly labeled an advisory design choice, not a guarantee.
- **No enum member added** — DB folds onto existing `backend`, so `ARCHITECTURE.md §5` and the four `validate` maps are untouched (no `db` member introduced).

## Summary

The plan is honest and well-grounded — notably it discovered the requested enum alignment is already implemented and correctly narrowed the increment to the one buildable residual (DB→backend), recording the human-approved reversal of decision #2. The guarantee/trust/determinism audits hold. The **one material concern** is a scope omission (Finding 1): the reversal breaks a second, unlisted test pin (`archetype.test.ts:37-41`) that the Files section doesn't name — the builder must update it, not only the 209-216 pin. Finding 2 is a minor, in-scope completeness nicety (drizzle-kit-only projects) for the human to weigh.

ADVISORY VERDICT: 2 concerns raised (1 important, 1 minor; 0 blocking) — for the human to weigh before /pharn-dev-build. This grill-log gates nothing; the deterministic backstops remain /pharn-dev-build's floor-gates (spec-hash drift, unresolved HALT questions) and npm test / validate.
