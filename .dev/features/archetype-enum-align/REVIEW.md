# REVIEW — archetype-enum-align

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN** (exit 0, 0 markdown capabilities). The
increment reached review legitimately. Everything below the floor line is **advisory**.

The increment under review is `trust: untrusted`. Its comments (e.g. "reverses decision #2") are factual
documentation read as DATA — none were instructions I followed (P2).

## Lenses

### L-floor → P0 — no findings

Every claim reduces or is labeled. "Detection is deterministic" reduces to enum/regex membership — the
added branches are pure membership tests (`lower === 'migrations'`, `lower.endsWith('.sql')`,
`names.has('prisma'|'@prisma/client'|'drizzle-orm')`). "A DB concern maps onto `backend`" is a **design
choice**, correctly not sold as a guarantee (PLAN Guarantee-audit labels it advisory). No unlabeled
guarantee. No new enum member → `ARCHITECTURE.md §5` and the four `validate` maps are untouched.

### L-eval → P1 — no findings

No markdown Capability (so no `enforces`/eval binding to confirm — floor agrees, 0 capabilities). P1 here
is vitest, and every new behavior ships a test: `.sql`-file→backend and `migrations/`-dir→backend (each in
isolation + combined), the three ORM deps→backend, the DB+UI merge (`backend`+`spa`), and DB-not-suppressed-
by-ssr. The reversal's **second** old-behavior pin — `tests/archetype.test.ts` `next+prisma → ['ssr']` —
was found and updated (surfaced by grill, incorporated at build), so `npm test` is 409/409 green.

### L-trust → P2 — no findings

The increment emits **no** finding objects and no free-text; detection output is the closed `Archetype[]`
enum + a boolean, so no untrusted text escapes the boundary. The new inputs (`.sql` / `migrations` /
ORM package names) are membership-tested only — never executed, interpolated, or logged. The shared walk's
guards (`SKIP_DIRS` node_modules/.git/dist/build at `detect-archetype.ts:49`, symlink skip at `:131`,
`.env` skip at `:134`) still gate the `.sql` signal. No guaranteed decision rests on a tainted field.

### L-axis → P3 — no findings

Each file changed for exactly one reason: `archetype.ts` — the package-name allowlist (`BACKEND_FRAMEWORKS`)
grew; `detect-archetype.ts` — the file-tree classification rule (`classifyEntry`) grew. No new imports; the
existing `detect-archetype.ts → archetype.js` dependency (I/O boundary consuming pure rules) is unchanged —
no sibling-leaf reference.

## Findings

### Floor-gate (blocking): none

### Advisory (warn — rest on judgment; never block a guaranteed invariant)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/archetype.ts:46"
  problem: "A schema-/migration-only Drizzle project can carry only drizzle-kit (a devDependency) and no drizzle-orm runtime dep, so the package-name path would miss it — though a .sql file or migrations/ dir still catches it via the file-tree path."
  evidence: "BACKEND_FRAMEWORKS adds 'prisma', '@prisma/client', 'drizzle-orm' — not 'drizzle-kit'. (Consistent with tests/wizard-fixture.ts detect: ['drizzle-orm'].)"
```

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/detect-archetype.ts:91"
  problem: "The `.sql`-anywhere signal is broad: a project that merely vendors a stray .sql fixture outside the skip-dirs is attributed `backend`. This mirrors the breadth already accepted for the `.tsx`-anywhere → spa signal, and node_modules/dist/build/.git are skipped — so it is consistent, but worth a human's awareness."
  evidence: "backend: … || lower.endsWith('.sql'). A `.sql under node_modules → skipped` parity test (mirroring the existing `.tsx under node_modules` test) would pin the skip behavior for the new signal."
```

Both are **advisory** — the increment builds and passes all gates as approved; these are boundary
observations for the human at the post-review gate, not blocks. The `drizzle-kit` item is grill Finding 2,
still open (the plan was approved as written before grill ran).

## Proposed lesson candidate (NOT written to canon — P2)

Proposed for a separate, human-gated `/pharn-dev-memory-promote` run; recorded here with provenance only.

- **Lesson (candidate):** In `/pharn-dev-regress` / `/pharn-dev-verify` gate capture, `node --test $VAR` under **zsh** does
  not word-split an unquoted parameter, so `node --test` receives one bogus filename and the gate mis-fires
  **identically at base and head** (a spurious exit 1 that could mask a real flip). Run the file list through
  `bash -c '… $(git ls-files …)'` (or `${=VAR}`) to get normal word-splitting.
- **Why canon:** a **recurring** failure — hit in this increment (`archetype-enum-align`) **and** the prior
  one (`archetype-file-tree-scan`, whose REGRESSION.md documents the same gotcha). Real, not hypothetical (P7).
- **Provenance:** increment `archetype-enum-align`; observed in the Step-2 regress capture (both this run's
  `REGRESSION.md` Notes and the prior increment's).

## Verdict

**GREEN — 0 floor-gate (blocking) findings; 2 advisory (minor).** The increment is done by the floor's
measure. This verdict is advisory beyond the floor line: it certifies the four lenses found no blocking
issue, **not** that the feature is correct beyond what the gates check (P0). Merge / fix / abandon is the
human's call at the post-review gate.
