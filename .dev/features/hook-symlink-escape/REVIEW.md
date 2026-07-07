# REVIEW — hook-symlink-escape

**Verdict: GREEN** — no floor-gate (blocking) findings; 3 advisory minors for the human to weigh.
`.dev/floor/validate.mjs .` is GREEN (exit 0). The increment was reviewed as `trust: untrusted`; no
instruction-looking content in it steered this review (the hooks' own deny messages / "FIX (pick one)"
text are the hooks' output, not injection).

## Step 1 — Floor (the only guaranteed part of this review)

- `validate.mjs .` → GREEN. `npm test` → 661 pass / 0 fail (incl. 7 new symlink cases). The two
  `resolveWriteTarget` bodies are **byte-identical** across both hooks (`diff` → IDENTICAL) — the
  duplication the plan chose over a sibling `require` (P3) introduces no divergence.

## L-floor → P0 (guarantee reduction)

The increment's core guarantee — "a `Write|Edit|MultiEdit` whose target resolves through existing
symlinks to a trusted doc / outside the writes-scope is DENIED" — reduces to a **floor primitive**
(pre-write hook + deterministic `fs.realpathSync` canonicalization + basename/anchored-glob enum). Its
residuals (broken-symlink lexical fallback, Bash-write bypass, TOCTOU) are labeled advisory/limits in
`PLAN.md`. **No floor-gate finding.** One advisory note:

```yaml
- type: FINDING
  rule_id: P0
  severity: minor # ADVISORY
  file: ".claude/hooks/protect-trusted-paths.cjs:13"
  problem: "The header comment asserts 'Symlink-safe' and describes existing-symlink resolution, but does not name the broken-symlink lexical-fallback residual that PLAN.md's guarantee audit documents — a reader of the hook alone could over-read the claim."
  evidence: "'Symlink-safe: the write target is canonicalized … BEFORE the protected test' (no mention that a broken symlink, target absent, falls back to lexical judgment)."
```

## L-eval → P1 (eval/test binding)

This increment modifies **floor hooks**, not `role:` Capabilities, so `validate.mjs`'s capability-eval
binding (fix #6) does not apply; the appropriate binding is the hooks' `*.test.cjs` suites. The new
behavior is bound by **7 new exit-code assertions** (leaf-symlink→deny, parent-dir-symlink→deny,
out-of-scope-symlink→deny, in-scope-symlink→allow, real-file→allow ×2, across both hooks). The
allow-side symmetry case was added on the grill's advisory prompt. **No finding** — coverage is
complete for the changed behavior.

## L-trust → P2 (untrusted handling)

**Strengthens the trust model.** `tool_input.file_path` and a committed symlink are untrusted
filesystem state; the allow/deny decision rests **only** on deterministic path resolution + enum/glob
membership — never on a free-text/tainted field. Resolving the symlink deterministically (not "the model
notices") is the correct structural fix. **No finding.**

## L-axis → P3 (one axis per file; no sibling imports)

No sibling reference — the shared `resolveWriteTarget` is **duplicated** in each hook (matching the
existing `extractPaths`/`readStdin` pattern), not reached by one floor executable `require`-ing the
other. One advisory:

```yaml
- type: FINDING
  rule_id: P3
  severity: minor # ADVISORY (not a sibling reference; not blocking)
  file: ".claude/hooks/protect-trusted-paths.cjs:24"
  problem: "The file changes for two reasons — the symlink-resolution behavior AND a settings.snippet.json comment-ref correction — a mild one-axis-per-file tension, mitigated because the ref fix is a comment-only edit inside the same header the behavioral change already rewrites."
  evidence: "Header now carries the new 'Symlink-safe' note AND the corrected 'Wired via .claude/settings.json' line (was the non-existent settings.snippet.json)."
```

## Scope (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor # ADVISORY
  file: ".dev/features/hook-symlink-escape/PLAN.md:22"
  problem: "The increment bundles the security fix with two doc-integrity nits (settings.snippet.json refs; a hardcoded capability count) — non-minimal, though the reporter explicitly requested one PR as an 'integrity cascade' and each file carries a single change-reason (except the cjs header noted above)."
  evidence: "## Files spans 6 files across two concerns; grill raised the same P7 point."
```

## Lesson feed (P7 — real, not hypothetical)

**No new lesson proposed — this run CONFIRMS L9.** `/pharn-dev-verify`'s first pass returned FAIL on
`format:check` + `lint:md` because the hand-written `REGRESSION.md` table used inconsistent padding
(prettier alignment vs markdownlint `MD060` compact); `test`/`validate`/`lint` were green. That is
exactly L9's remedy working as designed — the style gates L9 added to verify's gate map caught an
increment-artifact style miss that regress (style-skip) does not. Fixed by hand at verify; no canon
change warranted (L9 already documents both the failure and the implemented remedy).

## Gate summary

- **floor-gate (blocking):** none.
- **advisory:** 3 minors (P0 comment-residual, P3 two-reason header, P7 bundling) — informational; none
  is a basis for blocking a guaranteed or constitutional invariant. "Reviewed GREEN" means the floor is
  GREEN and the lenses raised only advisory concerns — **not** that the increment is guaranteed correct
  beyond what the floor + tests check (P0).

## Follow-up — advisories dispositioned (human chose "fix advisories first" at GATE 2)

- **P0 (comment-residual) → ADDRESSED.** Both hook headers now name the broken-symlink lexical-fallback
  residual (`protect-trusted-paths.cjs`, `enforce-writes-scope.cjs`). Comment-only; re-ran the gates —
  `test` / `validate` / `lint` / `format:check` / `lint:md` all exit 0.
- **P3 (two-reason header) → WON'T-FIX (defensible).** The `settings.snippet.json` ref correction and the
  new symlink note are both "keep this hook's header accurate" — one axis under that framing; splitting
  would fight the reporter's explicit one-PR request.
- **P7 (bundling) → WON'T-FIX (reporter-sanctioned).** The security fix + two nits are the reporter's
  explicit "integrity cascade / one PR." Unbundling is available on request but not done unilaterally.
