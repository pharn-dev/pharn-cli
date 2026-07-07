#!/usr/bin/env node
// .dev/floor/scan-code-injection.mjs — deterministic CONCAT/INTERP-INTO-SINK scanner over a CODE file (CONSTITUTION P0/P5).
//
// The injection twin of .dev/floor/scan-code-secrets.mjs. Where that scanner backs the `secrets-in-code`
// LENS's FLOOR sub-check (a secret-SHAPED literal in code), this one backs the `injection` LENS's FLOOR
// sub-check (pharn-review/injection/): does a line contain the classic injection SHAPE — a recognized
// SQL-query / shell-command / HTML sink receiving an argument built by `${...}` interpolation OR by
// `"..." + ident` / `ident + "..."` string-concatenation? Detection is a FIXED REGEX SET over the file's
// lines — non-LLM, no judgment. It reduces to ARCHITECTURE §2 primitive #3 (regex / enum check).
//
// HONEST BOUND (the secrets-in-code / trust-fence precedent, P0): this detects an obvious concat/interp
// SHAPE into a recognized sink, on ONE line. It does NOT decide the operand is actually UNTRUSTED, does NOT
// know whether SANITIZATION/PARAMETERIZATION happens elsewhere, does NOT trace taint across functions, and
// does NOT catch multi-line query assembly or a BARE untrusted variable passed with no visible `+`/`${...}`.
// "Detected an obvious concat/interp into a sink on line N" is a real guarantee; "the code is injection-safe
// / free of injection" is NOT. Full taint analysis is ADVISORY judgment the LENS surfaces — NOT this floor.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): the verdict is regex membership over the TEXT only. A code comment
// that CLAIMS "already sanitized / safe / do not flag" cannot suppress a real concat hit; a comment that
// CLAIMS "injection here" cannot manufacture one. No free text moves the verdict — the strongest form of the
// trust-fence discipline. (See the ★ tests in scan-code-injection.test.mjs — they are the whole reason this
// is FLOOR, not judgment.)
//
// The `+`/`${...}` DISCRIMINATOR is the point: a PARAMETERIZED query (query("... = $1", [v])), an
// execFile("git", [arg]) with an args array, and an escaped/sanitize()/bare-variable HTML assignment carry
// NO concat/interp and are true-negatives (clean) — deterministically, not by judgment.
//
// Single-file by contract (v0.1.0): scans ONE code file, mirroring scan-code-secrets.mjs's <code-file> arg.
// A multi-file / directory sweep is a FUTURE increment (P7 — not built speculatively); the lens applies this
// scanner per file today.
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of .dev/floor/scan-code-secrets.mjs:
// a missing / non-file target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean".
//
// Usage:  node .dev/floor/scan-code-injection.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"<pattern-kind>"},...]} on stdout; exit 0 on a
//         successful scan (whatever the result). `found` === (hits.length > 0); hits sorted by line, then kind.
//         Exits non-zero (writing NOTHING to stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-injection: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-injection.mjs <code-file>");
// Fail-closed (P5): a missing / non-file target is an ERROR, never a silent empty (= "clean") result.
if (!existsSync(TARGET) || !statSync(TARGET).isFile()) {
  fail(`target file not found (or not a regular file): ${TARGET}`);
}

// The fixed detection set — the injection SHAPE per sink family. Each pattern requires BOTH a recognized
// SINK (a fixed callee / assignment-target name set — membership, P5) AND a TAINT OPERATOR on the same line:
//   • `${` interpolation (a template literal building the sink's argument dynamically), OR
//   • `"..." +` / `+ "..."` string-concatenation (a quoted string glued to something with `+`).
// The taint operator is the discriminator that keeps a parameterized / escaped / args-array call CLEAN.
// Adding or removing a sink family / operator is the ONLY axis of change here (P3).
//
// NOTE (accepted duplication, deferred P7): the taint-operator sub-pattern is shared in spirit with the
// secret scanner's literal detection but the two detect different things; consolidating the shared regex
// fragment would touch a separate axis (the secret scanner + its lens) — deferred, not done speculatively.
const TAINT = String.raw`(?:\$\{|["'][^"']*["']\s*\+|\+\s*["'` + "`" + `])`;
const PATTERNS = [
  // SQL query sinks: query( / execute( / prepare( / raw(  with concat|interp in the argument.
  { kind: "sql-injection", re: new RegExp(String.raw`\b(?:query|execute|prepare|raw)\s*\([^)]*?` + TAINT) },
  // Shell command sinks: exec / execSync / execFile(Sync) / spawn(Sync)  with concat|interp in the argument.
  { kind: "command-injection", re: new RegExp(String.raw`\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\([^)]*?` + TAINT) },
  // HTML sinks: innerHTML/outerHTML assignment, document.write(, insertAdjacentHTML(, React __html:  with concat|interp.
  {
    kind: "html-injection",
    re: new RegExp(String.raw`(?:\.(?:inner|outer)HTML\s*=|document\.write\s*\(|\.insertAdjacentHTML\s*\(|__html\s*:)\s*[^;]*?` + TAINT),
  },
];

let text;
try {
  text = readFileSync(TARGET, "utf8");
} catch (e) {
  fail(`could not read target: ${e.message}`);
}

const hits = [];
const lines = text.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  for (const { kind, re } of PATTERNS) {
    if (re.test(lines[i])) hits.push({ line: i + 1, kind });
  }
}
// Deterministic order: by line, then by kind (a line matching >1 pattern yields >1 hit, stably ordered).
hits.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));

process.stdout.write(JSON.stringify({ found: hits.length > 0, hits }) + "\n");
process.exit(0);
