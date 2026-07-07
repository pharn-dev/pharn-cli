#!/usr/bin/env node
// floor/check-build-complete.mjs — the deterministic BUILD-COMPLETENESS checker for the /verify stage.
//
// Floor/eval infrastructure — NOT a Capability (no `role:`; the floor capability count stays 1, exactly
// like floor/check-verify.mjs / floor/check-regress.mjs, which live in this floor-ignored dir). It owns
// ONE cohesive axis — "did the build produce every path the plan DECLARED?" — separate from
// check-verify's "are all gates green?" axis, hence a separate file (P3).
//
// WHY THIS FILE EXISTS — the gap it closes (ship-completion-retry increment, P7-triggered by a REAL
// hole): /verify's gates are the project's whole-repo gates + one `structural:*` gate per eval pair that
// EXISTS. A path the plan's `## Files` DECLARED but the build never wrote yields NO gate at all — so an
// incomplete build could PASS /verify (verify green over a half-built plan), or FAIL for a coincidental
// whole-repo reason INDISTINGUISHABLE from a real bug. This checker gives /verify a deterministic
// completeness signal: every CONCRETE `## Files` path must exist after build.
//
// FLOOR REDUCTION (ARCHITECTURE §2 primitive #3): path-set membership + filesystem existence — set
// membership and path resolution, no LLM classification. `complete` iff every concrete declared path
// resolves to an existing filesystem entry.
//
// PARITY WITH THE WRITES-SCOPE SETTER (Q3 of the plan): the `## Files` extractor below is a faithful
// RE-IMPLEMENTATION of set-writes-scope.cjs's `pathsFromPlanFiles` + `clean` + `isConcrete` — the setter
// is the CANONICAL `## Files` parser, and check-build-complete.test.mjs cross-checks this checker's
// `declared` set against the setter's emitted `--from-plan` scope over shared fixtures (the parity test).
// The two parsers MUST be updated together; the parity test is example-based, not a proof of equivalence.
// Residual (shared with the setter, documented there): an inline-marked `- `path` — not touched` item is
// a path-item to BOTH parsers, so it is treated as declared, not excluded.
//
// TRUST (P2): the PLAN's `## Files` paths are `trust: untrusted` DATA. They are used ONLY as
// path-membership operands and as `existsSync` arguments (a filesystem READ) — never eval'd, executed,
// spawned, imported, or sent anywhere. No child process, no network. A crafted `## Files` entry can at
// most change WHICH paths are existence-checked (a coverage question the /verify command surfaces as
// DATA), never inject a command or flip a guaranteed decision beyond the deterministic existence fact.
// The `missing[]` values ORIGINATE in the untrusted PLAN, so a downstream renderer (VERIFY.md) MUST quote
// them as DATA.
//
// HONEST SCOPE (P0/P7): "complete" means EXACTLY "every concrete declared path exists" — a deterministic
// PROXY for "the build finished," NOT a semantic claim that the code does what the plan intended (that
// stays advisory/verifier + human). A placeholder/glob `## Files` entry (`<capDir>/…`, `a/*.md`) is not
// existence-checkable and is SKIPPED (recorded in `skipped[]`), never counted missing — mirroring the
// setter's isConcrete filter.
//
// Usage:
//   node floor/check-build-complete.mjs <PLAN.md> [repoDir]
//     PLAN.md : the feature plan whose `## Files` declares the paths the build must have produced.
//     repoDir : root the declared (repo-relative) paths resolve against (default ".").
//
// Exit: 0 complete · 1 incomplete (missing[] non-empty) · 2 inconclusive / bad input — FAIL-CLOSED (P5).

import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

// --- emit one JSON document to stdout, then exit. The /verify command captures this verbatim. ---
function emit(obj, code) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(code);
}

// --- PARITY helpers: byte-faithful copies of set-writes-scope.cjs's `clean` + `isConcrete`. ---
// Strip a trailing " (annotation)" (e.g. " (gated)") and surrounding whitespace.
function clean(entry) {
  return String(entry)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}
// A literal repo-relative path — no placeholders, globs, or empties (not existence-checkable).
function isConcrete(entry) {
  return entry.length > 0 && !entry.includes("<") && !entry.includes(">") && !entry.includes("*") && !entry.includes("?");
}

// --- PARITY: the leading back-tick path of each list item under `## Files`, stopping at the next
//     markdown heading of ANY level OR a head-less prose exclusion cue (non-blockquote). A byte-faithful
//     re-implementation of set-writes-scope.cjs's `pathsFromPlanFiles` (locked by the parity test). ---
function pathsFromPlanFiles(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Files\b/.test(l));
  if (start === -1) return { ok: false, reason: "no `## Files` heading" };
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // Boundary 1 — STRUCTURAL: any markdown heading of ANY level ends the authorized list (an exclusion
    // subsection like `### Explicitly not touched` is its own heading, so its paths are never scanned).
    if (/^\s{0,3}#{1,6}\s/.test(line)) break;
    // Boundary 2 — CUE fallback for a HEAD-LESS prose exclusion intro, anchored to a NON-path,
    // NON-blockquote line (a blockquote is explanatory commentary, exempt).
    const isPathItem = /^\s*-\s+`[^`]+`/.test(line);
    const isBlockquote = /^\s*>/.test(line);
    if (
      !isPathItem &&
      !isBlockquote &&
      /\bnot\W*(touch|writ|modif|edit|chang)|\bexplicitly\W*excluded|\bout\W*of\W*scope|\boff\W*limits/i.test(line)
    ) {
      break;
    }
    const m = line.match(/^\s*-\s+`([^`]+)`/);
    if (m) out.push(m[1].trim());
  }
  return { ok: true, value: out };
}

function main() {
  const argv = process.argv.slice(2);
  // Leading positionals = args before the first `--flag` (defensive: no flags are defined, but a stray
  // `--x` never leaks in as the PLAN path or repoDir).
  const positional = [];
  for (const a of argv) {
    if (a.startsWith("--")) break;
    positional.push(a);
  }
  const planPath = positional[0];
  const repoDir = positional[1] ?? ".";

  // Fail-closed input handling (P5): a missing/unreadable PLAN or a PLAN with no parseable `## Files`
  // is INCONCLUSIVE (exit 2), NEVER a silent "complete".
  if (!planPath) {
    emit(
      {
        plan: null,
        repoDir,
        declared: [],
        skipped: [],
        missing: [],
        complete: false,
        verdict: "inconclusive",
        reason: "no PLAN.md path provided",
      },
      2
    );
  }
  if (!existsSync(planPath)) {
    emit(
      {
        plan: planPath,
        repoDir,
        declared: [],
        skipped: [],
        missing: [],
        complete: false,
        verdict: "inconclusive",
        reason: `PLAN.md not found: ${planPath}`,
      },
      2
    );
  }
  let text;
  try {
    text = readFileSync(planPath, "utf8");
  } catch (e) {
    emit(
      {
        plan: planPath,
        repoDir,
        declared: [],
        skipped: [],
        missing: [],
        complete: false,
        verdict: "inconclusive",
        reason: `cannot read ${planPath}: ${e.message}`,
      },
      2
    );
  }

  const parsed = pathsFromPlanFiles(text);
  if (!parsed.ok) {
    emit(
      {
        plan: planPath,
        repoDir,
        declared: [],
        skipped: [],
        missing: [],
        complete: false,
        verdict: "inconclusive",
        reason: `${parsed.reason} in ${planPath}`,
      },
      2
    );
  }

  // Concrete declared paths only (placeholders/globs are not existence-checkable — SKIPPED, mirroring the
  // setter's isConcrete filter; recorded in `skipped[]` for transparency).
  const cleaned = parsed.value.map(clean);
  const declared = cleaned.filter(isConcrete);
  const skipped = cleaned.filter((e) => !isConcrete(e));

  if (declared.length === 0) {
    // A `## Files` with zero CONCRETE paths — nothing whose existence we can assert. Fail-closed (P5):
    // we cannot claim "complete" over an empty concrete set. INCONCLUSIVE, not a silent complete.
    emit(
      {
        plan: planPath,
        repoDir,
        declared: [],
        skipped,
        missing: [],
        complete: false,
        verdict: "inconclusive",
        reason: `no concrete back-tick paths under \`## Files\` in ${planPath}`,
      },
      2
    );
  }

  // The completeness test: every concrete declared path must resolve to an existing filesystem entry.
  const missing = declared.filter((p) => {
    const abs = isAbsolute(p) ? p : resolve(repoDir, p);
    return !existsSync(abs);
  });

  const complete = missing.length === 0;
  emit({ plan: planPath, repoDir, declared, skipped, missing, complete, verdict: complete ? "complete" : "incomplete" }, complete ? 0 : 1);
}

main();
