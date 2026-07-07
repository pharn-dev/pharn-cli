# GRILL — missing-timeout lens plan (ADVISORY)

- **Plan under interrogation:** `.dev/features/missing-timeout-lens/PLAN.md` (`trust: untrusted` to this griller).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's pinned `spec_content_hash`. No drift. (The actual drift _block_ is `/pharn-dev-build`'s floor-gate, fix #4 — this only warns.)
- **Griller discovery (deterministic membership, P5):** `count-grillers.mjs .` → **13 registered** (a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability). This increment builds a **review lens** (a methodology artifact), not application code — so the app-surface grillers (a11y, i18n, migrations, observability, privacy, performance) have **no applicable surface** on a `PLAN.md` for a lens and yield no findings; the code/plan-quality axes (architecture, coupling, comprehension, documentation, error-handling, security, testability) were applied and are folded below. Running any griller is **advisory** (fix #3).

> All findings below are **ADVISORY** — a griller gates nothing. `severity` is this griller's assessment (fix #3), not a floor verdict. Free-text `problem`/`evidence` quote the plan as DATA (P2), never executed. None is a `CONSTITUTION_VIOLATION` (that determination is the human's + the floor's).

## Findings — axis: scope & coverage (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: important # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:41"
  problem: "The axios call set matches only the literal `axios.`/`axios(` receiver — but the dominant real-world pattern is a NAMED INSTANCE (`const api = axios.create({ timeout }); api.get(url)`), whose calls the scanner will not match, so real-world axios hit-rate is low and the coverage is narrower than 'axios calls'."
  evidence: "line 41: `axios(`, `axios.<get|post|...>(` — a receiver-qualified `api.get(` from `axios.create()` is not in the set; documented under the fixed-set bound, but the named-instance case is the common one and is worth surfacing explicitly to the human."
- type: FINDING
  rule_id: P7
  severity: important # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:80"
  problem: "The db `.query(` branch will fire on nearly every pg/mysql `pool.query()` (their timeout is configured at the POOL, not the call), so on db-heavy real code the lens may be noisy — a signal-vs-noise cost the human chose at the gate and should re-weigh with eyes open."
  evidence: "line 80 (Resolved decisions): 'db per-call timeouts are frequently set at the pool/connection level, so many legitimate pool.query() calls read as a HIT — a false-positive the ADVISORY layer owns.' Honestly labeled + human-selected; surfaced so it is a conscious trade, not a surprise in review."
```

## Findings — axis: determinism / over-match precision (P5) + coupling

```yaml
- type: FINDING
  rule_id: P7
  severity: minor # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:42"
  problem: "The db receiver allowlist includes generic names `client`/`connection` that can match non-SQL `.query(` calls — notably an Apollo GraphQL `client.query({ query })` (a real network call, different timeout mechanism) — and `sql` rarely appears as `sql.query(` (postgres.js/Slonik use a `sql`-tagged TEMPLATE the scanner does not cover), so `sql` adds over-match risk for little gain."
  evidence: "line 42: `recv ∈ {db, pool, client, conn, connection, database, knex, sql}`. Build may reconsider trimming `sql` and note the Apollo `client.query(` over-match as an advisory-owned case in the lens body."
- type: FINDING
  rule_id: P3
  severity: minor # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:74"
  problem: "The db indicator/receiver sets encode DRIVER-SPECIFIC vocabulary (`statement_timeout` = Postgres, `maxTimeMS` = Mongo, `query_timeout` = node-pg), a latent maintenance axis that grows as drivers evolve — while the lens is `coupling: agnostic`. The classification is defensible (the driver knowledge lives in the `.dev/floor/` apparatus scanner, not the product lens), but the apparatus now carries a driver-versioning burden worth naming."
  evidence: "line 74: indicator set `{timeout, signal, statement_timeout, query_timeout, maxTimeMS}`. Not a P3 violation of the lens file (one axis), but the scanner's token lists are a second, driver-tracking reason-to-change living in apparatus — acknowledge it as such."
```

## Findings — axis: eval coverage & fidelity (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:47"
  problem: "The ★ case inherits off-by-one's TWO-needle pattern (comment needle + code-token needle), but this scanner surfaces NO code token in its hits (only `{line, kind}`, unlike off-by-one's `expr`), so the code-token laundering vector is weaker here; the second needle still tests that quoted call-code does not reach an enum-gated field — keep it, but author the fixture so the code-token needle is a DISTINCTIVE token actually present in the call (e.g. a named `endpoint` arg), not a generic word."
  evidence: "line 47: 'the injected comment needle + a call-code token absent from every enum-gated field.' The needle is only meaningful if it is a real, distinctive substring of the reviewed call."
- type: FINDING
  rule_id: P1
  severity: minor # advisory (fix #3)
  file: ".dev/features/missing-timeout-lens/PLAN.md:28"
  problem: "The db-with-timeout clean fixture (`db.query(sql, { timeout: 5000 })`) encodes an ILLUSTRATIVE API shape — node-postgres has no per-query `timeout` arg (its timeout is `query_timeout` at the Client, or `statement_timeout` via SQL/pool). The plan already flags it as illustrative; ensure `expected-db-query-with-timeout.md` states plainly it is testing the INDICATOR TOKEN, not endorsing a driver API, so the fixture is not mistaken for a real pg pattern."
  evidence: "line 28: 'why the `timeout` token in the `.query(` args reads clean (the shape is illustrative; the indicator token is what the floor tests).' Good that it is labeled — the expected.md must make the illustrative nature explicit."
```

## Prose summary

The plan is **strong and honestly scoped**: the floor claim is named precisely ("detects a call to a fixed call set whose paren-matched argument span contains no timeout-indicator token"), reduces cleanly to primitive #3 (mask + regex + paren-match + fixed-set membership), and is injection-immune by construction; the guarantee audit, trust audit, and determinism audit all mirror the `resource-leak`/`off-by-one` precedents faithfully, with the "this lens ensures reliable timeouts" over-claim explicitly struck (P0). The spec-hash is clean and there are **no open questions** left (both were resolved at the human gate). No blocking concern was found.

The concerns that remain are all about **real-world usefulness of the _coverage_, not soundness of the _floor_**, and cluster on the two scope decisions taken at the gate:

1. **axios coverage is narrower than it reads** — only the literal `axios.` receiver, missing the idiomatic `const api = axios.create(...)` named-instance pattern (the common one). Real hit-rate for axios will be low. (important)
2. **the db branch trades precision for coverage** — receiver-qualified `.query(` will flag nearly every `pool.query()` because db timeouts are pool-level; honestly labeled and human-chosen, surfaced here so it is a conscious signal-vs-noise trade. (important)
3. smaller precision notes: `client`/`connection`/`sql` receivers can over-match (Apollo GraphQL `client.query(`; `sql` is usually a template tag, not `sql.query(`); the db token sets import driver-specific vocabulary (a latent apparatus-maintenance axis); and two eval-fidelity nits (make the ★ code-token needle a distinctive real token; keep the db-with-timeout fixture explicitly labeled illustrative). (minor)

None of these blocks the build. They are inputs for the human at GATE 2 (and small ones the build may fold into the lens body's documented bounds). The **honest floor** — the scanner detects a SHAPE, and everything about "is a timeout really set / really needed" is advisory — is intact and correctly labeled throughout.

## Verdict

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor) — for the human to weigh before/after `/pharn-dev-build`.** This grill-log **gates nothing** (P0/fix #3): it does not pass, approve, or guarantee the plan; `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved open questions) and `.dev/floor/validate.mjs` remain the only deterministic backstops. The plan is sound to build; the concerns are coverage/precision trade-offs the human already partly chose at the gate, surfaced for eyes-open review.
