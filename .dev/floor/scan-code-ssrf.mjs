#!/usr/bin/env node
// .dev/floor/scan-code-ssrf.mjs — deterministic REQUEST-SOURCE-INTO-OUTBOUND-REQUEST-URL-SINK scanner
// over a CODE file (CONSTITUTION P0/P5).
//
// The SSRF sibling of .dev/floor/scan-code-path-traversal.mjs (and scan-code-injection.mjs). It backs the
// `ssrf` LENS's FLOOR sub-check (pharn-review/ssrf/): does a line pass a recognized HTTP-request source token
// DIRECTLY into a recognized OUTBOUND-REQUEST URL sink —
//   • fetch:        fetch( | client.fetch(               (the Fetch API) with a request source in the args
//   • http-request: http.get( | https.get( |            (Node core http/https OUTBOUND calls) with a request
//                   http.request( | https.request(         source in the args
//   • axios:        axios( | axios.get( | axios.post( |  (axios) with a request source in the args
//                   axios.put/delete/patch/head/request(
// Detection is a FIXED PATTERN SET over the file's lines — non-LLM, no judgment. It reduces to ARCHITECTURE
// §2 primitive #3 (regex / enum check).
//
// WHY THE DISCRIMINATOR IS THE UNTRUSTED SOURCE, NOT A CONCAT/INTERP OPERATOR (the key divergence from
// scan-code-injection.mjs — read this, it is the whole honesty of this file, P0; SSRF FOLLOWS path-traversal):
//   injection uses the `+`/`${...}` operator as its discriminator because a PARAMETERIZED query is safe, so the
//   operator SHAPE itself is the danger. But for an OUTBOUND URL, a bare CONSTANT url is the NORMAL, SAFE call
//   (`fetch("https://api.example.com/health")`, `axios.get(API_BASE + "/status")`). A concat-into-fetch
//   discriminator would fire on CORRECTLY-built constant URLs — a false-positive flood, i.e. a "manufactured
//   floor" (the exact thing the `input-validation` lens refused, fix #3). The honest line-local discriminator
//   for SSRF is instead a recognized untrusted HTTP-request SOURCE token
//   (`req|request . params|query|body|headers|cookies`) appearing directly inside the sink's argument list:
//   the untrusted SOURCE is what distinguishes dangerous (untrusted part → outbound URL) from safe (trusted
//   parts → fine). Membership over TEXT → injection-immune → FLOOR. This mirrors scan-code-path-traversal.mjs's
//   source-token discriminator, NOT injection's concat-operator one.
//
// HONEST BOUND (the path-traversal / injection precedent, P0): this detects the PRESENCE of a request source
// in an outbound-URL sink's argument on ONE line. It does NOT decide the value is unvalidated (a URL-host
// allow-list, an SSRF guard, or a fixed-host path-append may neutralize the risk — that is the LENS's ADVISORY
// layer), does NOT trace taint, and — the most important miss to foreground — does NOT catch an untrusted value
// arriving via a LOCAL VARIABLE (`const u = req.query.url; fetch(u)` — the source token is not on the sink
// line), nor NON-HTTP sources (process.argv/env/queues), nor OTHER libraries (got/superagent/undici, an aliased
// node-fetch), nor an `axios.create()` INSTANCE, nor OTHER-runtime sinks (Python `requests.get`), nor
// multi-line URL assembly. "Detected a request source reaching an outbound-request URL sink on line N" is a
// real guarantee; "the code is SSRF-safe / free of SSRF" is NOT. Full taint analysis is ADVISORY judgment the
// LENS surfaces — NOT this floor.
//
// DETERMINISTIC HIT ORDER (line, then kind): a line matching >1 family yields >1 hit, stably ordered — mirrors
// scan-code-path-traversal.mjs. Unlike path-traversal's canonical `fs.readFile(path.join(...))`, SSRF has no
// genuinely-nested canonical sink, so multi-hit is only a rare same-line-two-calls case; the ordering
// discipline is inherited (and pinned by the multi-line/multi-kind ordering test), not a claimed co-location.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): the verdict is regex membership over the TEXT only. A code comment
// that CLAIMS "already allow-listed / safe / do not flag" cannot SUPPRESS a real source-into-sink hit; a
// realistic "already safe" comment (which names no full sink CALL) cannot manufacture one. No free text can
// SUPPRESS the verdict — the strongest form of the trust-fence discipline. (See the ★ tests in
// scan-code-ssrf.test.mjs — they are the whole reason this is FLOOR, not judgment.) Honest edge (mirrors
// path-traversal): the scanner reads TEXT and does not distinguish code from a comment, so a comment that
// spells out a full `fetch(req.query…)` / `axios.get(req…)` sink CALL would itself register (a rare false
// positive the LENS's advisory layer / the human resolves) — but it can never SUPPRESS. A second, named
// false-positive source: `\bfetch\s*\(` also matches ANY object method named `fetch` (`client.fetch(` — the
// intended node-fetch-client breadth — but equally an unrelated `orm.fetch(req.query.x)`); this is an accepted
// breadth/FP trade (it catches more real outbound calls; the advisory layer resolves a non-HTTP `.fetch()`),
// and — like every pattern here — it can never SUPPRESS, only over-flag.
//
// Single-file by contract (v0.1.0): scans ONE code file, mirroring scan-code-path-traversal.mjs's <code-file>
// arg. got/superagent/undici, aliased node-fetch, axios.create() instances, the via-local-variable case, a
// multi-file / directory sweep, and any real taint analysis are FUTURE increments (P7 — not built
// speculatively); the lens applies this scanner per file today.
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of scan-code-path-traversal.mjs: a
// missing / non-file target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean".
//
// Usage:  node .dev/floor/scan-code-ssrf.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"<pattern-kind>"},...]} on stdout; exit 0 on a
//         successful scan (whatever the result). `found` === (hits.length > 0); hits sorted by line, then kind.
//         Exits non-zero (writing NOTHING to stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-ssrf: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-ssrf.mjs <code-file>");
// Fail-closed (P5): a missing / non-file target is an ERROR, never a silent empty (= "clean") result.
if (!existsSync(TARGET) || !statSync(TARGET).isFile()) {
  fail(`target file not found (or not a regular file): ${TARGET}`);
}

// The fixed detection set — the SSRF SHAPE per sink family. Each pattern requires BOTH a recognized OUTBOUND
// URL SINK (a fixed callee name set — membership, P5) AND a recognized untrusted-request SOURCE token in the
// sink's argument span (`[^)]*?` up to the first `)`, mirroring scan-code-path-traversal.mjs). The SOURCE is
// the discriminator that keeps a trusted CONSTANT-URL call (fetch("https://…/health")) CLEAN.
// `\b` word-boundaries keep `myfetch` / `myaxios` / `xreq.params` from false-matching. `[^)]` is a negated
// class (linear — no catastrophic backtracking / ReDoS on hostile input, threat surface #4). Adding or removing
// a sink family / a source token is the ONLY axis of change here (P3).
//
// BOUNDARY (P3, one axis per file): this scanner owns HTTP-source → OUTBOUND-REQUEST-URL sinks (fetch / node
// http(s) / axios). scan-code-injection owns concat/interp → query/command/HTML sinks; scan-code-path-traversal
// owns HTTP-source → FILESYSTEM-PATH sinks (fs / path.join / res.sendFile|download); scan-code-deserialization
// owns deserialization / dynamic-eval sinks. No sink is double-owned — fetch/axios/http.get are none of those.
const SOURCE = String.raw`\b(?:req|request)\.(?:params|query|body|headers|cookies)\b`;
const PATTERNS = [
  // Fetch API: fetch( / client.fetch( with a request source in the args. `\b` blocks `prefetch(`.
  { kind: "fetch", re: new RegExp(String.raw`\bfetch\s*\([^)]*?` + SOURCE) },
  // Node core http/https OUTBOUND calls: http(s).get( / http(s).request( with a request source in the args.
  // `.createServer(` and router `.get(` are NOT matched (not outbound).
  { kind: "http-request", re: new RegExp(String.raw`\bhttps?\.(?:get|request)\s*\([^)]*?` + SOURCE) },
  // axios: axios( / axios.<verb>( with a request source in the args. `axios.create(` (config, not a request)
  // is deliberately NOT matched (`create` is not in the verb set, and `axios(` requires `(` right after axios).
  {
    kind: "axios",
    re: new RegExp(String.raw`\baxios(?:\.(?:get|post|put|delete|patch|head|request))?\s*\([^)]*?` + SOURCE),
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
