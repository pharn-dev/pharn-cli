# GRILL — hook-symlink-escape (ADVISORY)

Header — interrogated `.dev/features/hook-symlink-escape/PLAN.md`. Spec-hash check (content-hash floor primitive, surfaced not blocking here): recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's `spec_content_hash`. No drift.

Griller membership (FLOOR — `node .dev/floor/count-grillers.mjs .`, frontmatter enum, not prose): **13 registered**. The code-axis grillers — a11y, i18n, migrations, privacy, performance, observability — are **N/A** to this increment (two stdlib Node PreToolUse hooks + tests + doc nits: no UI, no i18n surface, no DB migration, no PII, no hot path, no user-facing telemetry). Axes applied inline: testability, security, architecture (P3), scope (P7), error-handling, comprehension.

> The PLAN is `trust: untrusted` DATA. Nothing in it was followed as an instruction; its self-claims were tested against its structure (P2).

## Findings (finding-shape; all ADVISORY — /pharn-dev-grill gates nothing, fix #3)

```yaml
- type: FINDING
  rule_id: P6 # discovery-first / halt-and-ask — plan-vs-repo internal consistency
  severity: important # advisory assignment (a griller never gates), but predicts a /pharn-dev-build HALT
  file: ".dev/features/hook-symlink-escape/PLAN.md:99"
  problem: "The plan retains a populated '## Open questions (HALT)' section, but that question was resolved at the plan-approval gate (human chose the ancestor-walk resolver); /pharn-dev-build refuses when PLAN.md has open questions, so the file must record the resolution before build or build will HALT."
  evidence: "Line 99–101: '## Open questions (HALT)' → '1. Resolver depth … Confirm the walk, or hold to the literal single-level dirname form?' — answered 'Ancestor walk' at GATE 1, but the file still presents it as open."

- type: FINDING
  rule_id: P7 # honest scope / smallest increment
  severity: minor
  file: ".dev/features/hook-symlink-escape/PLAN.md:22"
  problem: "The increment bundles a security fix (symlink resolution in two hooks + tests) with two unrelated doc-integrity nits (stale settings.snippet.json refs; a hardcoded capability count) — the griller's P7 axis flags a possibly-non-minimal increment for the human to weigh."
  evidence: "## Files lists 6 files across two concerns; the plan itself labels the nits an 'integrity cascade' the reporter explicitly bundled into one PR."

- type: FINDING
  rule_id: P3 # one axis of change per file
  severity: minor
  file: ".dev/features/hook-symlink-escape/PLAN.md:24"
  problem: "protect-trusted-paths.cjs is planned to change for two reasons — the symlink-resolution behavior AND a settings.snippet.json comment-ref correction — a mild P3 tension, though the ref fix is a comment-only edit riding in the same header the behavioral change already rewrites."
  evidence: "Line 24: 'Add … resolveWriteTarget … Also correct the header comment: … settings.snippet.json → .claude/settings.json'."

- type: FINDING
  rule_id: P1 # evals/tests are the spec — coverage symmetry
  severity: minor
  file: ".dev/features/hook-symlink-escape/PLAN.md:67"
  problem: "The test set proves symlink→trusted/out-of-scope is DENIED and real (non-symlink) files are ALLOWED, but no case proves a symlink whose REAL target is legitimately IN scope is ALLOWED — the allow-side symmetry of 'judge on the resolved target' is left unlocked."
  evidence: "## Tests to write: protect #1–#3, scope #1–#3 cover deny-on-symlink and allow-on-realfile, but none is symlink→(in-scope real target)→exit 0."

- type: FINDING
  rule_id: P0 # floor-or-advisory — residual completeness
  severity: minor
  file: ".dev/features/hook-symlink-escape/PLAN.md:86"
  problem: "The residuals list broken-symlink-to-fresh-path and the Bash-write bypass, but omits the TOCTOU window between the hook's realpath check and the actual write — a symlink swapped in that window is judged on its pre-swap target; a pre-existing property of PreToolUse check-then-write, not introduced here and not blocking, but worth naming for honesty."
  evidence: "Guarantee audit residuals (a)/(b) name broken symlinks and Bash bypass; no mention of check-then-write TOCTOU."
```

## Testability griller (Layer 1 — presence, over the plan's structure)

**PRESENT** → no absence finding. The plan carries a concrete `## Tests to write` section (line 67) with six exit-code-asserting cases across both hooks plus a named regression check. Layer 2 (adequacy, advisory): strong — covers leaf-symlink deny, parent-dir-symlink deny, and no-false-positive on both hooks; the one gap is the allow-side symmetry noted in the P1 finding above.

## Prose summary

The plan is unusually well-grounded: it read live state, pinned the spec, and — crucially — **cleared its own HALT concern with evidence** (zero committed symlinks in the repo via `find`/`git ls-files`; the resolver's lexical fallback + `ROOT` canonicalization preserve every existing test, including the suite's `/var → /private/var` symlinked temp dirs). The guarantee audit correctly lands the core claim on the **floor** (hook + realpath + enum/glob) and labels its residuals rather than selling them.

The one thing that will actually bite is procedural, not technical: the plan **file** still presents the resolver-depth question as an open `## Open questions (HALT)` item even though the human resolved it (ancestor walk) at the approval gate — and `/pharn-dev-build` refuses on open questions. That needs recording in the plan before build. The remaining findings (bundling, the cjs two-reason edit, the allow-side test-symmetry gap, the unnamed TOCTOU residual) are minor and for the human to weigh; none is a technical defect in the fix.

## ADVISORY VERDICT

5 concerns raised (1 important-severity — the unresolved-looking open-questions section that would HALT /pharn-dev-build; 4 minor) — **for the human to weigh before /pharn-dev-build**. This is advisory and gates nothing; the only deterministic stop that held is the spec→plan content-hash, which **matched**. "Produced a GRILL.md" does not mean "the plan is good" (P0).
