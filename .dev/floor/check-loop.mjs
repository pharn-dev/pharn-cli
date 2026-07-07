#!/usr/bin/env node
// floor/check-loop.mjs — the deterministic STOP-DECISION CORE for the product `/pharn-loop` command.
//
// Floor/eval infrastructure — NOT a Capability (no `role:`; it lives in this floor-ignored dir, exactly
// like check-ship.mjs / check-verify.mjs / check-regress.mjs). It owns the WHOLE deterministic
// stop/continue decision of the product loop so the maximum surface is in tested Node, not in the
// command's prose. The command (.claude/commands/pharn-loop.md) owns only the I/O side-effects (running
// the stages, writing artifacts); this helper computes whether the loop STOPS or CONTINUES.
//
// WHY THIS FILE EXISTS — the floor reduction that makes `/pharn-loop` legal (ARCHITECTURE §2 / §7, P0):
//   `/pharn-loop` iterates the build→regress→verify body with NO human between iterations, so its
//   termination is safety-critical and MUST be floor, not agent judgment. This helper reduces the stop
//   to two deterministic operations: (1) enum membership over the two FLOOR verdicts the existing stages
//   already emit — /pharn-verify's `.verdict` and /pharn-regress's `.verdict` — and (2) an integer
//   `iter >= cap` compare. The agent OBEYS the exit code (advisory COMPLIANCE, exactly as it obeys
//   check-verify).
//
// A SIBLING OF check-ship.mjs, NOT AN OVERLOAD OF IT (P3 — one axis per file):
//   check-ship.mjs is the DEV loop's stop core (Design A): it CONTINUEs on ANY not-floor-green verdict
//   up to the cap, and its VERIFY_VERDICTS set does NOT include INCOMPLETE. This file is the PRODUCT
//   loop's stop core (Design B, the /pharn-ship Step 2b line generalized cap 1 → N): it retries ONLY the
//   deterministically-retryable INCOMPLETE state and stops IMMEDIATELY on any terminal red — a DIFFERENT
//   decision table, hence a separate file (P3), leaving check-ship.mjs and the dev loop byte-unchanged.
//
// "/review NEVER GATES THE LOOP" IS STRUCTURAL, NOT DISCIPLINE (the core invariant):
//   this helper's input signature is exactly { verify-report.json, regression-report.json, iter, cap }.
//   It has NO `/review` parameter — it CANNOT receive a REVIEW.md, a finding, or an LLM-assigned
//   severity (the product spine has no /review stage anyway). So "the loop stops on the two FLOOR
//   verdicts alone" is true by construction, not by an agent promise. Counting any advisory finding as a
//   loop gate would read LLM judgment as a deterministic gate — the fix#3 disease — and is impossible
//   here because the input does not exist.
//
// DECISION — Design B, retryable-only (ARCHITECTURE §2 primitive #3 — enum membership + integer
// threshold). `v` = verify.verdict ∈ {PASS, FAIL, INCOMPLETE, INCONCLUSIVE}; `r` = regress.verdict ∈
// {no-regressions, regressions, inconclusive}. Precedence top-down (mirrors check-verify's "a real
// failure ALWAYS beats incompleteness"):
//   bad input (missing/unparseable report, `.verdict` outside its enum, iter/cap not a positive integer,
//             malformed argv)                         → INCONCLUSIVE  exit 2  (FAIL-CLOSED, P5)
//   v ∈ {FAIL, INCONCLUSIVE}  OR  r ∈ {regressions, inconclusive}
//                                                     → STOP_TERMINAL exit 4  (a real red — NEVER retried)
//   v === "PASS"  ∧  r === "no-regressions"           → STOP_GREEN    exit 0  (converged — present at gate)
//   v === "INCOMPLETE" ∧ r === "no-regressions" ∧ iter <  cap → CONTINUE  exit 3  (retryable, under cap)
//   v === "INCOMPLETE" ∧ r === "no-regressions" ∧ iter >= cap → STOP_CAP  exit 1  (bounded: cap hit)
//
// The 5 outcomes need 5 exit codes. 0/1/2/3 keep check-ship's meaning (converged / cap / bad-input /
// continue); 4 is the DISTINCT Design-B outcome STOP_TERMINAL (stop immediately on a real red, without
// spending an iteration). A validly-parsed `v === "INCONCLUSIVE"` from /pharn-verify is a real terminal
// verdict → exit 4; the checker's OWN exit-2 INCONCLUSIVE is reserved for "cannot read a valid verdict"
// (bad/missing input). The retryable set is EXACTLY { INCOMPLETE } — the sole deterministically-
// identifiable "fixable" red (gates green, a plan-declared `## Files` path absent). "Fixable-RED among
// real FAILs" is NOT deterministically classifiable, so a real FAIL is terminal, never retried (P5 — no
// LLM judgment in the branch).
//
// HONEST SCOPE (P0/P7): this guarantees the loop's STOP CONDITION (retries only INCOMPLETE; stops
// immediately on any terminal red; never exceeds `cap`; /review never gates) — it guarantees NOTHING
// about whether a rebuild CONVERGES (that is irreducible model work, advisory). A non-converging
// INCOMPLETE simply runs to STOP_CAP and hands to the human.
//
// TRUST (P2): every operand is produced by deterministic tooling — two `.verdict` enum strings and two
// ints. NO free-text (`problem`/`evidence`), NO /review input is ever read. Inputs are JSON.parsed and
// used ONLY as string/int operands — never eval'd, executed, spawned, imported, or sent anywhere. No
// child process, no network. The decision is PROVABLY independent of any tainted field.
//
// Usage:
//   node floor/check-loop.mjs <verify-report.json> <regression-report.json> --iter <N> --cap <M>
//
// Exit: 0 STOP_GREEN · 1 STOP_CAP · 2 INCONCLUSIVE (bad input, fail-closed) · 3 CONTINUE ·
//       4 STOP_TERMINAL (a real red — stop immediately, not retried).

import { readFileSync, existsSync } from "node:fs";

// The known verdict enums the two FLOOR stages emit. Unlike check-ship.mjs, VERIFY_VERDICTS INCLUDES
// "INCOMPLETE" — the product loop's one retryable state, which /pharn-verify emits via `--complete`. A
// `.verdict` outside its set is malformed input → INCONCLUSIVE (fail-closed), NOT a silent decision.
const VERIFY_VERDICTS = new Set(["PASS", "FAIL", "INCOMPLETE", "INCONCLUSIVE"]);
const REGRESS_VERDICTS = new Set(["no-regressions", "regressions", "inconclusive"]);

// --- emit one JSON document to stdout, then exit. The command captures this verbatim. ---
function emit(obj, code) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(code);
}

// --- strict argv parse (P5, fail-closed). The ONLY valid invocation is exactly two positional report
//     paths plus `--iter <N>` and `--cap <M>`. Extra positionals, an unrecognized flag, a repeated known
//     flag, or a flag missing its value are ALL malformed input → caller emits INCONCLUSIVE (exit 2),
//     NEVER a silent decision. Flag VALUES are consumed in-line so they never leak in as a path. ---
function parseArgs(argv) {
  const KNOWN = new Set(["--iter", "--cap"]);
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (!KNOWN.has(a)) return { ok: false, reason: `unrecognized flag: ${a}` };
      if (a in flags) return { ok: false, reason: `repeated flag: ${a}` };
      if (i + 1 >= argv.length) return { ok: false, reason: `${a} requires a value` };
      flags[a] = argv[++i];
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 2) {
    return { ok: false, reason: `expected exactly 2 positional report paths, got ${positional.length}` };
  }
  return { ok: true, positional, iter: flags["--iter"], cap: flags["--cap"] };
}

// --- read a report file and validate its `.verdict` is a member of `allowed`. A missing / unparseable
//     file, a non-object, or a `.verdict` outside the enum is bad input → fail-closed (P5). ---
function readVerdict(path, label, allowed) {
  if (!path) return { ok: false, reason: `${label} path not provided` };
  if (!existsSync(path)) return { ok: false, reason: `${label} not found: ${path}` };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, reason: `${label} is not valid JSON (${path}): ${e.message}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `${label} must be a JSON object (${path})` };
  }
  const v = parsed.verdict;
  if (typeof v !== "string" || !allowed.has(v)) {
    return { ok: false, reason: `${label} .verdict ${JSON.stringify(v)} is not one of {${[...allowed].join(", ")}} (${path})` };
  }
  return { ok: true, verdict: v };
}

// --- parse a positive-integer flag (`--iter 2`). A missing / non-digit / < 1 value is bad input. ---
function posInt(raw, name) {
  if (raw === undefined) return { ok: false, reason: `--${name} not provided` };
  if (!/^\d+$/.test(raw)) return { ok: false, reason: `--${name} must be a positive integer, got ${JSON.stringify(raw)}` };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { ok: false, reason: `--${name} must be >= 1, got ${raw}` };
  return { ok: true, value: n };
}

function main() {
  const argv = process.argv.slice(2);
  // Strict, fail-closed argv parse (P5): a malformed invocation shape (extra positionals, an unknown flag,
  // a repeated `--iter`/`--cap`, or a flag missing its value) is bad input → INCONCLUSIVE (exit 2), the
  // SAME handling as a bad operand below — never a silent decision.
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    emit(
      {
        verify_verdict: null,
        regress_verdict: null,
        floor_green: null,
        iter: null,
        cap: null,
        decision: "INCONCLUSIVE",
        reason: parsed.reason,
      },
      2
    );
  }

  const verify = readVerdict(parsed.positional[0], "verify-report.json", VERIFY_VERDICTS);
  const regress = readVerdict(parsed.positional[1], "regression-report.json", REGRESS_VERDICTS);
  const iterR = posInt(parsed.iter, "iter");
  const capR = posInt(parsed.cap, "cap");

  // Fail-closed (P5): any malformed operand → INCONCLUSIVE (exit 2), NEVER a silent decision. Echo back
  // whatever parsed cleanly (nulls otherwise) plus the helper's OWN diagnostic `reason` (not free-text).
  const bad = [verify, regress, iterR, capR].find((r) => !r.ok);
  if (bad) {
    emit(
      {
        verify_verdict: verify.ok ? verify.verdict : null,
        regress_verdict: regress.ok ? regress.verdict : null,
        floor_green: null,
        iter: iterR.ok ? iterR.value : null,
        cap: capR.ok ? capR.value : null,
        decision: "INCONCLUSIVE",
        reason: bad.reason,
      },
      2
    );
  }

  const iter = iterR.value;
  const cap = capR.value;
  const v = verify.verdict;
  const r = regress.verdict;

  // Design B (retryable-only). Three deterministic predicates over the two verdict enums:
  const floorGreen = v === "PASS" && r === "no-regressions"; // converged
  const terminalRed = v === "FAIL" || v === "INCONCLUSIVE" || r === "regressions" || r === "inconclusive"; // a real red
  // retryable === (v === "INCOMPLETE" && r === "no-regressions") — the ONLY deterministically-retryable
  // state. It is not named as its own const because, by the precedence below, it is exactly what remains
  // once terminalRed and floorGreen are both false (proof in the trailing comment).

  let decision, code, reason;
  if (terminalRed) {
    // A real failure is NEVER retried (the /pharn-ship Step 2b rule): stop immediately, don't spend an
    // iteration blindly rebuilding over a genuine bug. exit 4, the Design-B outcome check-ship lacks.
    decision = "STOP_TERMINAL";
    code = 4;
    reason = `terminal red (verify ${v}, regress ${r}) — a real failure is never retried; stop and hand to the human`;
  } else if (floorGreen) {
    decision = "STOP_GREEN";
    code = 0;
    reason = "floor-GREEN: /pharn-verify PASS and /pharn-regress no-regressions — stop and present at the human gate";
  } else if (iter < cap) {
    // Reachable ONLY when v === "INCOMPLETE" ∧ r === "no-regressions" (terminalRed false ⇒ v ∈
    // {PASS, INCOMPLETE} ∧ r === "no-regressions"; floorGreen false ⇒ v !== "PASS" ⇒ v === "INCOMPLETE").
    // So this branch is the retryable state, under cap → iterate.
    decision = "CONTINUE";
    code = 3;
    reason = `retryable (verify INCOMPLETE, regress no-regressions) and iter ${iter} < cap ${cap} — iterate: one build pass, then re-verify`;
  } else {
    // Same retryable state (INCOMPLETE ∧ no-regressions), but iter >= cap → bounded stop. NEVER unbounded.
    decision = "STOP_CAP";
    code = 1;
    reason = `cap reached: retryable (verify INCOMPLETE) but iter ${iter} >= cap ${cap} without floor-GREEN — stop and hand to the human`;
  }

  emit({ verify_verdict: v, regress_verdict: r, floor_green: floorGreen, iter, cap, decision, reason }, code);
}

main();
