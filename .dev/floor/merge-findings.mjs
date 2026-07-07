#!/usr/bin/env node
// .dev/floor/merge-findings.mjs — deterministic merge + dedup of per-lens findings.json (CONSTITUTION P0/P2/P5).
//
// PURPOSE. A parallel /pharn-review spawns one subagent per lens; each emits its own findings.json
// (the JSON array defined by pharn-contracts/finding-shape.md §Emission). This helper ASSEMBLES those
// N arrays into ONE merged findings.json and DEDUPS — two lenses reporting the same problem-class at
// the same location collapse to one finding. It is the ONLY floor-grade part of a parallel review:
// the per-lens findings are advisory (a lens can't "decide approve" — ARCHITECTURE §7); THIS merge is
// deterministic (ARCHITECTURE §2 primitive #3, enum/regex over the finding objects). "merged" NEVER
// means "the findings are correct" or "the code is safe" (P0) — it means the assembly is deterministic.
//
// THE DEDUP KEY IS ENUM-GATED ONLY (P2 — the whole point). The key is (type, rule_id, file): the
// finding-shape enum-gated / floor-verifiable fields (finding-shape.md — cited, not restated, P4). It
// NEVER reads the tainted free-text (problem/evidence) — "problem-class" is the enum-gated rule_id, not
// the sentence. So the grouping/identity decision rests only on validated enum-gated fields; no
// guaranteed decision rests on a tainted field (ARCHITECTURE §8, fix #1).
//
// FAIL-CLOSED VALIDATION AT THE MERGE (fix #1 applied here). A lens subagent reads trust: untrusted
// code and could be injected into LAUNDERING a needle (e.g. a multi-line instruction) into an
// enum-gated field. Before grouping, every finding's enum-gated fields are structurally validated;
// one that fails — a control-char/newline in rule_id, a file without :line, a bad type/severity — is
// DROPPED and reported (never merged, never trusted). The validation admits the legitimate
// file-qualified rule_id form ("security.md SEC-1", which contains a SPACE) while rejecting the
// multi-line laundering vector (it forbids control chars, not spaces) — see hasControlChar / isCleanScalar.
//
// OUTPUT SHAPE. Each merged finding is finding-shape-CONFORMANT on the six required fields
// (type, rule_id, severity, file, problem, evidence — scalars), PLUS an ADDITIVE `sources[]` provenance
// array carrying every contributor's {source, problem, evidence} as quoted DATA. The additive field is
// documented, not a redefinition of finding-shape (P4): finding-shape consumers (e.g. check-structural.mjs)
// read the six fields and ignore the extra; needle_absent_from_enum_gated still scans only the enum-gated
// fields, never sources[] (which legitimately quotes attacker payloads as evidence).
//
// DETERMINISM (P5). Output bytes are INVARIANT under input-file order and intra-array order: findings
// group into a keyed map, groups sort by (file, rule_id, type), each group's sources sort by
// (source, problem, evidence), and the scalar problem/evidence are taken from sources[0] after sort.
// Merged severity = MAX over {blocking>important>minor} (an ordered-enum reduce, not judgment).
//
// Usage:   node .dev/floor/merge-findings.mjs <out.json> [<in1.json> <in2.json> ...]
//   - <out.json> required; zero inputs is legal → writes the empty array [].
//   - Each input is read as a finding-shape findings.json (a JSON ARRAY). The input's SOURCE lens id is
//     derived deterministically from its path (parent dir name — the emission convention
//     features/<lens>/findings.json), used only as trusted provenance in sources[].
// Output:  writes <out.json> (2-space JSON + trailing newline, deterministic); prints
//          {"merged":<int>,"inputs":<int>,"dropped":<int>} to stdout; exit 0 on success.
// Fail-closed (P5): a missing <out>, or ANY input that is unreadable / not valid JSON / not an array,
//          → exit non-zero, writing NOTHING to <out> (all inputs are validated before any write).

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const SEVERITY_RANK = { minor: 0, important: 1, blocking: 2 };
const SEVERITY_ENUM = new Set(Object.keys(SEVERITY_RANK));
// Key separator: the NUL byte. Built via fromCharCode so the SOURCE stays printable ASCII. A validated
// enum-gated field forbids all control chars (below), so NUL can never occur inside one → no key collision.
const NUL = String.fromCharCode(0);

function die(msg) {
  process.stderr.write("merge-findings: " + msg + "\n");
  process.exit(1);
}

// True iff s contains any C0 control char or DEL (charcode < 32 or === 127) — the newline/control-char
// laundering vector. Implemented by charcode scan (no control-char regex literal in the source).
function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

// A scalar enum-gated value is CLEAN iff it is a non-empty, bounded, single-line string with no control
// characters. This is the F2 rule: it admits spaces (so "security.md SEC-1" passes) but forbids the
// newline/control-char laundering vector. It does NOT try to whitelist every rule roster shape (P0 —
// over-tight would silently DROP valid findings); the roster/eval binding is checked elsewhere.
function isCleanScalar(v, max = 200) {
  return typeof v === "string" && v.length >= 1 && v.length <= max && !hasControlChar(v);
}

const TYPE_OK = (v) => isCleanScalar(v, 64) && /^[A-Z][A-Z0-9_]*$/.test(v); // FINDING | CONSTITUTION_VIOLATION | ...
const RULE_ID_OK = (v) => isCleanScalar(v, 120); // clean single line; admits "P2", "security.md SEC-1", "ARCH§3.1"
const FILE_OK = (v) => isCleanScalar(v, 400) && /:\d+$/.test(v) && v.indexOf(":") > 0; // path:line, a real anchor

// Coerce a free-text field to a carried-as-DATA string (never gates; never executed). Non-strings → "".
function asText(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// The trusted source id for provenance: the emission convention is features/<lens>/findings.json, so the
// lens is the parent directory name. Deterministic; falls back to the raw path if there is no parent.
function sourceIdOf(inputPath) {
  const parent = basename(dirname(inputPath));
  return parent && parent !== "." && parent !== "" ? parent : inputPath;
}

// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length < 1) die("usage: merge-findings.mjs <out.json> [<in.json> ...]");
const outPath = argv[0];
const inPaths = argv.slice(1);

// PHASE 1 — read + structurally validate EVERY input file before any write (fail-closed).
const inputs = [];
for (const p of inPaths) {
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    die(`cannot read input: ${p} (${e.code || e.message})`);
  }
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    die(`input is not valid JSON: ${p} (${e.message})`);
  }
  if (!Array.isArray(arr)) die(`input is not a JSON array (findings.json must be an array): ${p}`);
  inputs.push({ source: sourceIdOf(p), findings: arr });
}

// PHASE 2 — validate each finding's enum-gated fields; DROP + report the malformed (never fatal).
// Group the survivors by the enum-gated key (type, rule_id, file).
const groups = new Map(); // key -> { type, rule_id, file, sevRank, sources: [{source, problem, evidence}] }
let dropped = 0;
const droppedReport = [];

for (const { source, findings } of inputs) {
  for (const f of findings) {
    const ok =
      f &&
      typeof f === "object" &&
      !Array.isArray(f) &&
      TYPE_OK(f.type) &&
      RULE_ID_OK(f.rule_id) &&
      FILE_OK(f.file) &&
      SEVERITY_ENUM.has(f.severity);
    if (!ok) {
      dropped++;
      // Report only enum-gated shape info + the source; never echo the (possibly hostile) free-text as guidance.
      droppedReport.push({ source, type: f && typeof f === "object" ? f.type : typeof f, rule_id: f && f.rule_id, file: f && f.file });
      continue;
    }
    const key = f.type + NUL + f.rule_id + NUL + f.file;
    let g = groups.get(key);
    if (!g) {
      g = { type: f.type, rule_id: f.rule_id, file: f.file, sevRank: -1, sources: [] };
      groups.set(key, g);
    }
    g.sevRank = Math.max(g.sevRank, SEVERITY_RANK[f.severity]);
    g.sources.push({ source, problem: asText(f.problem), evidence: asText(f.evidence) });
  }
}

// PHASE 3 — deterministic assembly. Sort sources within each group; take the representative scalar
// problem/evidence from sources[0]; emit conformant six fields + additive sources[]. Sort groups.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rankToSeverity = ["minor", "important", "blocking"];

const merged = [...groups.values()].map((g) => {
  g.sources.sort((a, b) => cmp(a.source, b.source) || cmp(a.problem, b.problem) || cmp(a.evidence, b.evidence));
  const rep = g.sources[0];
  return {
    type: g.type,
    rule_id: g.rule_id,
    severity: rankToSeverity[g.sevRank],
    file: g.file,
    problem: rep.problem, // finding-shape-conformant scalar (DATA)
    evidence: rep.evidence, // finding-shape-conformant scalar (DATA)
    sources: g.sources, // ADDITIVE provenance (DATA) — every contributor, quoted; not part of the required set
  };
});
merged.sort((a, b) => cmp(a.file, b.file) || cmp(a.rule_id, b.rule_id) || cmp(a.type, b.type));

// PHASE 4 — write (deterministic bytes) + report.
try {
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
} catch (e) {
  die(`cannot write output ${outPath}: ${e.message}`);
}
if (droppedReport.length) {
  process.stderr.write("merge-findings: dropped " + dropped + " malformed finding(s) (enum-gated validation failed):\n");
  for (const d of droppedReport) process.stderr.write("  - " + JSON.stringify(d) + "\n");
}
process.stdout.write(JSON.stringify({ merged: merged.length, inputs: inPaths.length, dropped }) + "\n");
process.exit(0);
