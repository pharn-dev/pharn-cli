#!/usr/bin/env node
// floor/check-verify.mjs — the deterministic VERDICT CORE for the /verify stage.
//
// Floor/eval infrastructure — NOT a Capability (no `role:`; the floor capability count stays 1, exactly
// like floor/check-regress.mjs / floor/check-variance.mjs / floor/check-structural.mjs, which live in
// this floor-ignored dir). It owns the WHOLE deterministic verdict of /verify so the maximum surface is
// in tested Node, not in the command's Bash. The command (.claude/commands/verify.md) owns only the I/O
// side-effects (running the gates, discovering verifiers, writing artifacts); this helper computes the
// pass/fail verdict and emits the machine verify-report spine.
//
// THE TWO LAYERS, AND WHY THIS FILE IS THE FLOOR ONE (ARCHITECTURE §7 fix #3):
//   /verify has a FLOOR layer (deterministic gates: `npm test` / `validate` / `check-structural` /
//   `lint`) and an ADVISORY layer (`role: verifier` capabilities — LLM judgment). "verified" MUST mean
//   "the floor gates passed," NOT "a verifier judged it OK." So this helper computes the verdict from the
//   gate EXIT CODES ALONE — it never receives, reads, or is influenced by any verifier finding. The
//   command appends verifier findings to the report AFTER this helper has emitted the verdict; they
//   ANNOTATE, they never flip the number. A verifier saying "looks good" is not a guarantee; a verifier
//   raising a concern is a flag for the human, not a deterministic block.
//
// Unlike check-regress's `verdict` (a RELATIVE base→head flip-detection that EXCLUDES pre-existing
// failures), this is an ABSOLUTE threshold: are ALL gates green NOW? No baseline, no comparison, no
// exclusion — a separate axis of change, hence a separate file (P3).
//
// VERDICT (ARCHITECTURE §2 primitive #3 — an exit-code / enum threshold):
//   FAIL          iff ANY gate exit code !== 0 (the offenders are named in failing_gates[]). A real gate
//                 failure ALWAYS wins over incompleteness (precedence below), so /ship never blindly
//                 rebuilds over a genuine bug.
//   INCOMPLETE    iff all gates green AND the OPTIONAL build-completeness input says the build is
//                 incomplete (`--complete 1`) — exit 3, a DISTINCT non-terminal signal (like check-ship's
//                 exit-3 CONTINUE; 0/1/2 keep their PASS/FAIL/INCONCLUSIVE meaning). This is the
//                 retryable-by-/ship verdict, kept apart from FAIL.
//   PASS          iff EVERY gate exit code === 0 AND completeness is complete-or-not-supplied.
//   INCONCLUSIVE  iff the results map is missing / empty / not a { "<gate-id>": <int> } object, OR the
//                 completeness input is inconclusive / malformed (`--complete 2` or a non-recognized
//                 value) — FAIL-CLOSED (P5), never a silent pass.
//
// THE OPTIONAL `--complete <int>` INPUT (ship-completion-retry increment):
//   /verify runs floor/check-build-complete.mjs over the PLAN's `## Files` and passes ITS exit code here
//   (0 complete · 1 incomplete · 2 inconclusive). This helper reads ONLY that integer — never the
//   missing-path list (the command merges that into the report's `.completeness` block). `--complete`
//   is OPTIONAL: ABSENT ⇒ the legacy 3-valued behavior byte-for-byte ({feature, gates, verdict,
//   failing_gates}, verdict ∈ {PASS, FAIL, INCONCLUSIVE}), so dev /pharn-dev-verify (which passes no
//   --complete) and check-ship.mjs are PROVABLY unaffected — an INCOMPLETE verdict cannot arise without
//   the flag, and check-ship never receives the flag. (If an INCOMPLETE report ever reached check-ship,
//   its VERIFY_VERDICTS set would treat it as unknown → INCONCLUSIVE, fail-closed — bounded, not silent.)
//
// HONEST SCOPE (P0/P7): the verdict is a deterministic function of the gate exit codes the command
// captures. "verified" therefore means EXACTLY "the named gates passed" — NOT "the feature is correct."
// Correctness beyond what those gates check is the ADVISORY verifier layer's concern, and that layer
// never gates this number. Said plainly, not hidden.
//
// TRUST (P2): every operand is produced by deterministic tooling — gate-ids (strings) and exit codes
// (ints): the enum-gated / floor-verifiable class. The `--feature` value is a path/name string. NO
// free-text (`problem`/`evidence`) is ever read — the helper's INPUT cannot even carry a verifier
// finding (its sole input is the gate→exit-code map + the feature name). Inputs are JSON.parsed and used
// ONLY as string/int operands — never eval'd, executed, spawned, imported, or sent anywhere. No child
// process, no network. The verdict is therefore PROVABLY independent of any tainted field: no guaranteed
// decision rests on a tainted field.
//
// Usage:
//   node floor/check-verify.mjs <results.json> [--feature <name>] [--complete <int>]
//     results.json : a flat { "<gate-id>": <exit-code int>, ... } map written by the command, one entry
//                    per FLOOR gate it ran (e.g. "test", "validate", "lint", "structural:<expected>").
//     --complete   : OPTIONAL — the exit code of floor/check-build-complete.mjs (0/1/2). Omit for the
//                    legacy 3-valued behavior.
//
// Exit: 0 PASS · 1 FAIL (>=1 gate non-zero) · 2 INCONCLUSIVE / bad input — FAIL-CLOSED (P5) ·
//       3 INCOMPLETE (gates green but the build is incomplete; only reachable WITH `--complete 1`).

import { readFileSync, existsSync } from "node:fs";

// --- emit one JSON document to stdout, then exit. The command captures this verbatim. ---
function emit(obj, code) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(code);
}

// --- read a flag value (`--flag value`) from an argv slice; undefined if absent. ---
function flag(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

// --- read + validate the { "<gate-id>": <exit-int> } results map (same discipline as check-regress). A
//     missing / empty / non-{string:int} map is bad input → INCONCLUSIVE, never a silent pass (P5). ---
function readResultsMap(path, label) {
  if (!path) return { ok: false, reason: `${label} path not provided` };
  if (!existsSync(path)) return { ok: false, reason: `${label} not found: ${path}` };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, reason: `${label} is not valid JSON (${path}): ${e.message}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `${label} must be a { "<gate-id>": <int> } object (${path})` };
  }
  const keys = Object.keys(parsed);
  if (keys.length === 0) return { ok: false, reason: `${label} is empty — no gates captured (${path})` };
  for (const k of keys) {
    if (!Number.isInteger(parsed[k])) {
      return { ok: false, reason: `${label} gate "${k}" is not an integer exit code: ${JSON.stringify(parsed[k])} (${path})` };
    }
  }
  return { ok: true, value: parsed };
}

function main() {
  const argv = process.argv.slice(2);
  // Leading positional = the results.json path (everything before the first `--flag`, so a flag VALUE
  // like `--feature verify` can never leak in as the path).
  const positional = [];
  for (const a of argv) {
    if (a.startsWith("--")) break;
    positional.push(a);
  }
  const resultsPath = positional[0];
  const feature = flag(argv, "--feature") ?? null;

  // OPTIONAL build-completeness input (ship-completion-retry): `--complete <int>` = check-build-complete's
  // exit (0 complete · 1 incomplete · 2/other inconclusive). ABSENT ⇒ "n/a" ⇒ legacy 3-valued behavior. A
  // "2" or a malformed value both mean "cannot assert completeness" → INCONCLUSIVE (fail-closed, P5) —
  // NEVER silently treated as complete.
  const completeRaw = flag(argv, "--complete");
  let completeStatus = "n/a";
  if (completeRaw !== undefined) {
    completeStatus = completeRaw === "0" ? "complete" : completeRaw === "1" ? "incomplete" : "inconclusive";
  }

  const res = readResultsMap(resultsPath, "results.json");
  if (!res.ok) {
    // Fail-closed shape: same four-key spine + a diagnostic `reason` (the helper's OWN deterministic
    // message about its input — not untrusted free-text; no verifier finding can reach this code).
    emit({ feature, gates: {}, verdict: "INCONCLUSIVE", failing_gates: [], reason: res.reason }, 2);
  }

  // Absolute threshold (P5 — integer equality, no classification): a gate passes iff its code is 0.
  const gates = {};
  const failing = [];
  for (const id of Object.keys(res.value).sort()) {
    const code = res.value[id];
    gates[id] = code;
    if (code !== 0) failing.push(id);
  }

  // Verdict precedence (P0/P5) — each emit() exits, so these read as guarded branches:
  //   1. ANY gate red → FAIL (a real failure ALWAYS beats incompleteness — an INCOMPLETE, retryable
  //      verdict is never emitted while a real gate is red, so /ship never rebuilds over a real bug).
  //   2. else completeness "incomplete" → INCOMPLETE (exit 3, distinct so /ship can retry ONLY this).
  //   3. else completeness "inconclusive" → INCONCLUSIVE (fail-closed; cannot assert completeness).
  //   4. else → PASS (gates green ∧ completeness complete-or-n/a).
  // When --complete is ABSENT (completeStatus "n/a"), branches 2–3 are dead ⇒ the emitted object AND exit
  // are byte-identical to the legacy {PASS, FAIL} behavior (regression-guarded by the test suite).
  if (failing.length) {
    emit({ feature, gates, verdict: "FAIL", failing_gates: failing }, 1);
  }
  if (completeStatus === "incomplete") {
    emit({ feature, gates, verdict: "INCOMPLETE", failing_gates: [] }, 3);
  }
  if (completeStatus === "inconclusive") {
    emit(
      {
        feature,
        gates,
        verdict: "INCONCLUSIVE",
        failing_gates: [],
        reason: `build-completeness inconclusive (--complete ${JSON.stringify(completeRaw)})`,
      },
      2
    );
  }
  emit({ feature, gates, verdict: "PASS", failing_gates: [] }, 0);
}

main();
