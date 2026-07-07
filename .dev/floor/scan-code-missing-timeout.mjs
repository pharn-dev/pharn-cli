#!/usr/bin/env node
// .dev/floor/scan-code-missing-timeout.mjs — deterministic NO-TIMEOUT network/db-call scanner over a CODE file (CONSTITUTION P0/P5).
//
// A sibling of .dev/floor/scan-code-resource-leak.mjs / scan-code-off-by-one.mjs in the scan-code-* family. Where
// resource-leak backs the resource-leak LENS's FLOOR sub-check, this one backs the `missing-timeout` LENS's FLOOR
// sub-check (pharn-review/missing-timeout/): a call to a KNOWN network/db API whose OWN argument span carries no
// timeout indicator. Detection is a FIXED, non-LLM procedure: a comment/string MASK, a call-head regex over a FIXED
// call set, a paren-match of the call's argument span, and a FIXED timeout-indicator-token membership test over
// those args. It reduces to ARCHITECTURE §2 primitive #3 (regex / paren-match / text membership).
//
// THE SHAPE (obvious cases only), CALL-ANCHORED (not binding-anchored):
//   HTTP-client:  fetch( … )  |  axios( … )  |  axios.<get|post|put|patch|delete|head|options|request>( … )
//                 |  http.<get|request>( … )  |  https.<get|request>( … )
//   db:           <recv>.query( … )   where recv ∈ { db, pool, client, conn, connection, database, knex, sql }
// A HIT iff, in the MASKED args of such a call, NONE of the indicator tokens
//   { timeout, signal, statement_timeout, query_timeout, maxTimeMS }
// appears. The indicator test matches SPECIFIC tokens inside the call's OWN paren-matched args — NOT a bare word that
// prose or an injected comment could supply. That is what makes it prose-robust and injection-immune.
//
// WHY THESE ANCHORS (P0 — the FP-avoidance is deliberate): the call set is anchored on LIBRARY / RECEIVER tokens
// (`fetch`, `axios`, `http`, `https`, and a fixed db-receiver allowlist), NEVER bare verbs (`get`/`post`/`query` on
// any receiver). So an Express ROUTE `app.get('/x', h)` / `router.post(...)` — a bare `.get`/`.post` on a non-net
// receiver — is NOT matched; only `http.get(`/`https.get(`/`axios.get(` are. Array/DOM have no `.query(`, and the
// db-receiver allowlist bounds `.query(` over-match. `axios.create({timeout})` is NOT matched (`create` ∉ the method
// set and there is no bare `axios(` there), so a pre-configured instance is not mis-flagged at its creation site.
//
// SCOPE, STATED PRECISELY (P0 — the resource-leak honesty): the indicator test is CALL-LOCAL — "no timeout token in
// THIS call's own args." It is NOT ownership/config/control-flow analysis. "This call to a fixed-set API passes no
// in-args timeout indicator" is a real guarantee; "the call has no timeout" / "the code has reliable timeouts" is NOT.
//
// HONEST BOUND (false neg/pos, stated not hidden — v0.1.0, the whole point is to not oversell):
//   • FIXED CALL SET: `got()`, `request()`, `superagent`, `ky()`, `$.ajax()`, an SDK client, and axios calls on a
//     NAMED INSTANCE (`const api = axios.create(...); api.get(url)` — receiver `api`, not `axios`) are false-negatives
//     — deferred to the advisory layer / a future increment (P7). The named-instance case is the COMMON axios pattern:
//     real-world axios coverage here is only the literal `axios.`/`axios(` receiver.
//   • DB is CALL-LOCAL: db timeouts are frequently set at the POOL/CONNECTION (`new Pool({ query_timeout })`) or via
//     SQL (`SET statement_timeout`), NOT in the `.query()` args — so many legitimate `pool.query(sql)` calls read as a
//     HIT (a FALSE-POSITIVE the advisory layer owns: "is a pool/connection timeout in force?"). The db-receiver
//     allowlist `client`/`connection` can also match a non-SQL `.query(` (e.g. an Apollo GraphQL `client.query({query})`
//     — a network call with a different timeout mechanism). Non-`.query(` ORM forms (`prisma.user.findMany`,
//     `Model.find(...).maxTimeMS()`) are out of scope.
//   • LENIENT INDICATOR: ANY of { timeout, signal, statement_timeout, query_timeout, maxTimeMS } anywhere in the args
//     ⇒ CLEAN (under-flagging, conservative). A `signal` used ONLY for manual cancellation (not a timeout) reads as
//     clean; a timeout set globally (`axios.defaults.timeout`), via an agent (`new http.Agent({ timeout })`), via a
//     wrapping `Promise.race`/`setTimeout`, or via a positionally-passed AbortController is NOT seen by the call-local
//     scan (a HIT the advisory layer owns). This is exactly the brief's stated advisory: "whether timeout set elsewhere."
//   • Only `//`, `/* */` comments and single-line '…' / "…" strings are masked. A BACKTICK template literal is NOT
//     masked (family idiom — so the scanner is ROBUST over a MARKDOWN eval fixture: ```-fenced code + inline `code`).
//     Consequence: a template-literal URL/arg containing the TEXT of an indicator token (e.g. fetch(`/api/timeout`))
//     reads as CLEAN — a documented false-negative, the honest price of the shared mask.
//   • NOT SCOPE-AWARE: a `}` / `)` inside a template/regex literal within a call's arg span can skew the paren-match;
//     an unbalanced call is skipped (documented bound). SINGLE-FILE; JS/TS-ish shapes.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): the verdict is regex + paren-match + fixed-token membership over the MASKED
// text only, with comments mechanically stripped. A comment CLAIMING "timeout enforced upstream — do not flag" is
// masked to whitespace before analysis — it cannot suppress a real no-timeout `fetch(url)` / `db.query(sql)` hit, and
// cannot manufacture a hit over a call that passes `{ timeout }`. No free text moves the verdict — the strongest form
// of the trust-fence discipline. (See the ★ tests in scan-code-missing-timeout.test.mjs — they are the whole reason
// this is FLOOR, not judgment.)
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of the sibling scanners: a missing / non-file
// target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean".
//
// Usage:  node .dev/floor/scan-code-missing-timeout.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"missing-timeout"},...]} on stdout; exit 0 on a successful
//         scan (whatever the result). `found` === (hits.length > 0); hits sorted by line. `line` is the CALL line —
//         the fix site where a timeout / signal / abort belongs — never a comment line. Exits non-zero (writing
//         NOTHING to stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-missing-timeout: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-missing-timeout.mjs <code-file>");
// Fail-closed (P5): a missing / non-file target is an ERROR, never a silent empty (= "clean") result.
if (!existsSync(TARGET) || !statSync(TARGET).isFile()) {
  fail(`target file not found (or not a regular file): ${TARGET}`);
}

let text;
try {
  text = readFileSync(TARGET, "utf8");
} catch (e) {
  fail(`could not read target: ${e.message}`);
}

// --- Comment/string MASK ------------------------------------------------------------------------------------
// Same single-pass mini-lexer as scan-code-resource-leak.mjs (accepted, deferred duplication of the shared idiom —
// consolidation is a separate axis, P7). Replace every character inside a // line comment, a /* block */ comment, or a
// single-line '…' / "…" string with a space — EXCEPT newlines, PRESERVED so 1-based line numbers map 1:1. BACKTICKS
// are NOT string delimiters here (no template masking) — so markdown fences / inline `code` in an eval fixture are read
// as ordinary text; '…' / "…" masking STOPS AT END-OF-LINE so a stray prose quote cannot bleed the mask into fenced code.
function mask(src) {
  const out = new Array(src.length);
  let i = 0;
  const N = src.length;
  const space = (ch) => (ch === "\n" ? "\n" : " ");
  while (i < N) {
    const c = src[i];
    const n = i + 1 < N ? src[i + 1] : "";
    if (c === "/" && n === "/") {
      while (i < N && src[i] !== "\n") ((out[i] = " "), i++);
      continue;
    }
    if (c === "/" && n === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < N && !(src[i] === "*" && src[i + 1] === "/")) ((out[i] = space(src[i])), i++);
      if (i < N) ((out[i] = " "), (out[i + 1] = " "), (i += 2));
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      out[i] = " ";
      i++;
      while (i < N && src[i] !== "\n") {
        if (src[i] === "\\") {
          out[i] = " ";
          if (i + 1 < N && src[i + 1] !== "\n") ((out[i + 1] = " "), (i += 2));
          else i++;
          continue;
        }
        if (src[i] === q) {
          out[i] = " ";
          i++;
          break;
        }
        out[i] = " ";
        i++;
      }
      continue;
    }
    out[i] = c;
    i++;
  }
  return out.join("");
}

const masked = mask(text);

// --- Helpers ------------------------------------------------------------------------------------------------
// Match the delimiter that closes the `open` at `openIdx` in `s`, counting nesting over the MASKED text. Returns the
// closing index, or -1 if unbalanced. (Same idiom as scan-code-resource-leak.mjs — deferred dup, P7.)
function matchDelim(s, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineAt(s, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < s.length; i++) if (s[i] === "\n") line++;
  return line;
}

// --- Fixed call set + indicator set (P5) --------------------------------------------------------------------
// Call-head regex, anchored on LIBRARY / RECEIVER tokens (never a bare verb). The optional axios method group makes
// both `axios(` and `axios.get(` match while `axios.create(` does NOT (create ∉ the set, and no bare `axios(` there).
const CALL_RE = new RegExp(
  "\\b(?:" +
    "fetch" +
    "|axios(?:\\s*\\.\\s*(?:get|post|put|patch|delete|head|options|request))?" +
    "|https?\\s*\\.\\s*(?:get|request)" +
    "|(?:db|pool|client|conn|connection|database|knex|sql)\\s*\\.\\s*query" +
    ")\\s*\\(",
  "g"
);
// FIXED, LENIENT timeout-indicator token set — presence of ANY (as a whole word in the call's args) ⇒ the call is CLEAN.
const INDICATOR_RE = /\b(?:timeout|signal|statement_timeout|query_timeout|maxTimeMS)\b/;

// --- Scan ---------------------------------------------------------------------------------------------------
const hits = [];
let m;
while ((m = CALL_RE.exec(masked)) !== null) {
  const callOpen = m.index + m[0].length - 1; // the '(' of the matched call
  const callClose = matchDelim(masked, callOpen, "(", ")");
  if (callClose === -1) continue; // unbalanced — cannot bound the args (documented bound)
  const args = masked.slice(callOpen + 1, callClose);
  if (!INDICATOR_RE.test(args)) {
    hits.push({ line: lineAt(masked, m.index), kind: "missing-timeout" });
  }
}

hits.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));

process.stdout.write(JSON.stringify({ found: hits.length > 0, hits }) + "\n");
process.exit(0);
