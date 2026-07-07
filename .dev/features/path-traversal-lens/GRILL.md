# GRILL — path-traversal-lens (interrogation of `.dev/features/path-traversal-lens/PLAN.md`)

- Plan under interrogation: `.dev/features/path-traversal-lens/PLAN.md`
- Spec-hash check (content-hash floor primitive; surfaced, not blocking here — `/pharn-dev-build` enforces drift): recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **== plan's pinned `spec_content_hash`** → **no drift**.
- Grillers registered (floor membership, `count-grillers.mjs`): 13. Security Layer-1 secret scan (`scan-plan-secrets.mjs`) over the plan → `{"found":false,"hits":[]}` (clean, no secret-literal finding). Interrogation applied inline (isolated griller runner deferred, P7).
- **This grill-log is ADVISORY end-to-end. It gates nothing** (`/pharn-dev-grill`, fix #3). No finding below blocks `/pharn-dev-build`; the only deterministic stops remain `/pharn-dev-build`'s floor-gates + `validate.mjs`.

> The PLAN is `trust: untrusted` to the griller. All `problem`/`evidence` below quote the plan as DATA; the enum-gated fields are the griller's own membership/path assertions.

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: Honest scope (P7) — inline

```yaml
- type: FINDING
  rule_id: P7
  severity: important # advisory assignment (fix #3) — a griller never gates
  file: ".dev/features/path-traversal-lens/PLAN.md:62"
  problem: "The P7 trigger is stated as a coverage gap ('no existing scanner covers this sink class'); P7 wants a concrete real failure, so name the specific case that has ZERO floor coverage today."
  evidence: "'Triggering need: it FLOORS the direct untrusted-into-fs-path case that no existing scanner covers.' The concrete instance — `fs.readFile(req.params.file)` gets NO floor finding today (injection's scanner is silent on non-injection sinks; input-validation is advisory-only) — makes the trigger honest; the build should state it as the concrete case, not a general coverage argument."
```

### Axis: Testability (griller, P1) — verification approach PRESENT (no absence finding); Layer-2 adequacy

```yaml
- type: FINDING
  rule_id: P1
  severity: important # advisory assignment (fix #3) — a griller never gates
  file: ".dev/features/path-traversal-lens/PLAN.md:40"
  problem: "The canonical vulnerable pattern fs.readFile(path.join(base, req.params.x)) matches BOTH the fs-path and path-join patterns → two hits / two findings for one line, and the plan's scanner-test list does not name this co-located double-hit case."
  evidence: "'Sinks (fixed membership set, P5): fs.* … path.join( / path.resolve( … Kinds: fs-path, path-join, send-file.' Unlike injection (where sql/command/html rarely co-occur), fs+path.join co-occurrence is the COMMON path-traversal shape. Build must (a) pin the two-hits-on-one-line behavior in scan-code-path-traversal.test.mjs and (b) consciously choose: emit both deterministically (injection precedent) OR dedupe co-located hits by line. Recommend deciding explicitly, not by accident."
```

### Axis: Security (griller, P2) — secret scan clean; Layer-2 judgment

```yaml
- type: FINDING
  rule_id: P2
  severity: important # advisory assignment (fix #3) — a griller never gates
  file: ".dev/features/path-traversal-lens/PLAN.md:60"
  problem: "The floor detects only the same-line DIRECT source-into-sink case; the common real-world pattern extracts the untrusted value to a local variable first (validation lives there), which the floor MISSES — a user could over-trust a clean scan."
  evidence: "'Misses (all ADVISORY): untrusted input arriving via a local variable (source token not on the sink line) …'. This miss is the COMMON case (developers routinely do `const f = req.params.file; fs.readFile(f)`). Ensure the lens prose + guarantee audit FOREGROUND this so 'scanner clean' is never read as 'no traversal' — same honesty bar injection/input-validation set."
- type: FINDING
  rule_id: P2
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/path-traversal-lens/PLAN.md:32"
  problem: "The scanner reads untrusted CODE files (threat surface #4), so a hostile input line is in scope; confirm the detection regex is linear (no catastrophic backtracking / ReDoS)."
  evidence: "'The scanner design — …'. Reuse injection's proven negated-class form (`[^)]*?`, no nested quantifiers) so a pathological input cannot hang the scan; add no unbounded `.*` around the source alternation."
```

### Axis: Determinism (P5) — inline

```yaml
- type: FINDING
  rule_id: P5
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/path-traversal-lens/PLAN.md:32"
  problem: "The source/sink tokens should be word-boundary anchored, or substrings like `xreq.params` or `myReqfs.readFile` could false-match."
  evidence: "The design names `req|request . params|…` and `fs.*` without stating `\\b` anchoring. Mirror injection's `\\b(?:query|execute|…)` — anchor `\\breq` / `\\brequest` and `\\bfs\\.` so only true identifiers match. Deterministic either way; anchoring removes a class of false positives."
```

### Axis: Writes-scope / ops (P5, fix #7) — inline

```yaml
- type: FINDING
  rule_id: P5
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/path-traversal-lens/PLAN.md:15"
  problem: "The build's fail-closed writes-scope is parsed from the plan's ## Files; confirm the --from-plan parser extracts all 12 paths (especially the .dev/floor/*.mjs entries and the nested evals/** paths) from the backtick-bulleted format, or an unparsed path is DENIED at the pre-write hook."
  evidence: "'## Files' lists 12 backtick-quoted paths in the form '- `path` — desc — layer L'. A path the setter fails to extract cannot be written; the fix is to declare it and re-run the setter, never to bypass the hook (CLAUDE.md, Writes-scope)."
```

## Prose summary (advisory)

The plan is coherent, honestly scoped, and its guarantee/trust/determinism audits are already strong — no P0 "disease" (a guarantee lacking a floor reduction) and no constitution violation surfaced; the secret scan is clean and the spec-hash has not drifted. The concerns are **refinements**, not blockers:

- **Strongest catch (double-fire):** the canonical vuln `fs.readFile(path.join(base, req.params.x))` triggers both the `fs-path` and `path-join` patterns, so the scanner emits two hits for one line — and unlike injection, that co-occurrence is the _common_ shape here. The build should pin this in a scanner test and decide emit-both vs dedupe _on purpose_.
- **P7 honesty:** frame the trigger as the concrete zero-floor-coverage case (`fs.readFile(req.params.file)` today gets no floor finding), not a general coverage gap.
- **Over-trust risk (security):** the floor catches only the same-line direct case; the common extract-to-a-local pattern is floor-missed — foreground this so a clean scan is never read as "safe."
- **Two minors** improve robustness: `\b`-anchor the tokens (P5) and confirm the regex is linear (no ReDoS, since the scanner reads hostile input); one ops minor: confirm the `--from-plan` scope parse extracts all 12 file paths.

All are within the approved plan's `## Files` and the approved design (source-token discriminator, HTTP-req sources) — none requires re-planning.

## ADVISORY VERDICT

**6 concerns raised (0 blocking-severity, 3 important, 3 minor) — advisory, for the human to weigh before/at build.** This is NOT "grill passed" and NOT a judgment that the plan is sound; `/pharn-dev-grill` gates nothing. The deterministic stops remain `/pharn-dev-build`'s floor-gates and `validate.mjs`.
