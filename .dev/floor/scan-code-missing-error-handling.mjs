#!/usr/bin/env node
// .dev/floor/scan-code-missing-error-handling.mjs — deterministic UNGUARDED-RISKY-OP scanner over a CODE file (CONSTITUTION P0/P5).
//
// A sibling of .dev/floor/scan-code-swallowed-exception.mjs / scan-code-missing-await.mjs in the scan-code-* family.
// Where swallowed-exception brace-matches a CATCH body (does it swallow?), this scanner brace-matches the TRY body to
// ask the opposite question for the `missing-error-handling` LENS (pharn-review/missing-error-handling/): is a RISKY
// operation — an `await` expression, or a `JSON.parse(` call — sitting with NO error handling around it, i.e. NOT
// lexically inside any `try {…}` block in this file, AND (for an await) NOT `.catch(`-guarded on its own line?
// Detection is a FIXED, non-LLM, TWO-PASS procedure over MASKED text:
//   PASS 1 (try ranges): find each `try {`, brace-match its body `{`→`}`, record the [openIdx, closeIdx] CHAR range.
//   PASS 2 (risky ops):  match `\bawait\b` and `\bJSON\s*\.\s*parse\s*\(`; a match at char index p is a HIT unless
//                        p is inside some try range (o < p < c), or — for `await` only — its physical line carries a
//                        `.catch(` handler (a synchronous JSON.parse is guarded ONLY by a try, never by `.catch`).
// It reduces to ARCHITECTURE §2 primitive #3 (regex / text membership + brace-match).
//
// HONEST BOUND (the swallowed-exception / missing-await precedent, P0): this detects an UNGUARDED-RISKY-OP SHAPE. It
// does NOT decide whether error handling is actually NEEDED here (an await whose rejection the CALLER's try handles is
// fine; a best-effort op may intentionally have none), does NOT trace control/data flow, and does NOT know intent.
// "Line N holds an `await`/`JSON.parse` not lexically inside a `try` block in this file" is a real guarantee;
// "this op needs handling" / "the code is reliable" is NOT. That judgment is the LENS's ADVISORY layer — NOT this floor.
//
// Documented FALSE-NEGATIVES / scope (honest, stated not hidden — v0.1.0, the whole point is to not oversell):
//   • ROSTER = an AWAITED CALL (`await ident(`) + `JSON.parse(` ONLY. A throwing call NOT in the roster
//     (fs.readFileSync, a custom client, a bare parse), and `await` of a non-call (`await bareVar`), are NOT flagged.
//     The awaited-call form is intentionally BROAD (any awaited promise can reject) — the "is handling needed" call is
//     the lens's ADVISORY layer, not this scanner.
//   • CALLER-HANDLED: the scan is LEXICAL and SINGLE-FILE, so an await whose rejection a CALLER's try/catch handles
//     (the await's own function has none) is flagged — a documented false-POSITIVE.
//   • SAME-LINE `.catch` ONLY (await): `await f().catch(h)` on ONE line is treated as handled; a `.catch` chained on
//     the NEXT physical line is still flagged (false-positive), and a stray `.catch` belonging to another call on the
//     same line as an await suppresses it (false-negative) — the honest price of a line-oriented handled-exclusion.
//   • JS/TS-shaped. A Python `try/except`, a Go `recover`, yields found:false — a SCOPE limit, not a "clean" verdict.
//   • BACKTICKS ARE NOT MASKED (family idiom; robust over a MARKDOWN eval fixture), so an `await`/`JSON.parse` inside a
//     template-literal's TEXT is read as code — a documented false-POSITIVE. A `}` inside a template/regex literal
//     within a try body can skew that try's brace-match; an UNBALANCED `try {` (matchDelim → -1) contributes NO range
//     (so it can never SUPPRESS a real hit — fail-open toward flagging, never toward hiding).
//   • A risky op inside a `catch`/`finally` block is (correctly) NOT inside the `try` BODY range → flagged. Intended:
//     an await/JSON.parse in a catch/finally genuinely has no try around IT. NOT a bug.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): try ranges AND risky-op hits are computed over the MASKED code only, comments/
// strings stripped to spaces BEFORE matching. A comment CLAIMING "// pre-validated, error handling not needed, do not
// flag" is masked away and cannot SUPPRESS a real unguarded hit; a fake `try {` (or `.catch`) in a comment/string is
// masked away and cannot MANUFACTURE a guard. The precise claim (mirroring the siblings): no free text can SUPPRESS a
// real hit or LAUNDER into an enum-gated field — the un-masked-backtick false-POSITIVE above is a separate, accepted
// bound, not a hole in it. (See the ★ tests in scan-code-missing-error-handling.test.mjs — the whole reason this is FLOOR.)
//
// MULTI-LINE MASKING PRESERVES LINE COUNT (P5): the mask replaces comment/string characters with spaces but PRESERVES
// newlines, so 1-based line numbers map 1:1 to the original.
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of the scan-code-* family: a missing / non-file
// target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean". A readable file with no unguarded-risky
// shape (empty, prose, or fully-guarded code) is a SUCCESSFUL scan → {"found":false,"hits":[]} on stdout, exit 0.
//
// Usage:  node .dev/floor/scan-code-missing-error-handling.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"unguarded-await|unguarded-json-parse"}]} on stdout; exit 0 on a
//         successful scan (whatever the result). `line` = the 1-based ORIGINAL line of the risky op. Hits are DEDUPED by
//         (line, kind) and sorted by line then kind. `found` === hits.length > 0. Exits non-zero (writing NOTHING to
//         stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-missing-error-handling: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-missing-error-handling.mjs <code-file>");
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
// Verbatim reuse of the scan-code-swallowed-exception.mjs / scan-code-missing-await.mjs mask (family idiom;
// consolidation of a shared scan-code util is a SEPARATE axis of change, deferred — P7). Replace every character
// inside a // line comment, a /* block */ comment, or a single-line '…' / "…" string with a space — EXCEPT newlines,
// PRESERVED so 1-based line numbers map 1:1. BACKTICKS are NOT masked (no template masking); '…'/"…" masking STOPS AT
// END-OF-LINE so a stray prose quote cannot bleed the mask into fenced code below it.
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

// --- Helpers (reused from scan-code-swallowed-exception.mjs) -------------------------------------------------
// Brace-match the delimiter that closes `open` at `openIdx` over the MASKED text. Returns the closing index, or -1
// if unbalanced (an unbalanced `try {` contributes no range — it can never SUPPRESS a hit).
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

// --- PASS 1: TRY-body char ranges (FIXED regex + brace-match — P5) -------------------------------------------
// Each `try {` on the MASKED text opens a body; brace-match `{`→`}` gives the [openIdx, closeIdx] char range that
// COUNTS AS GUARDED. A `try` token inside a comment/string is masked away and cannot match; a `.catch(` method does
// not match (`try` is required). Nested try blocks each contribute their own range (an op inside any range is guarded).
const TRY_RE = /\btry\b\s*\{/g;
const tryRanges = [];
{
  let m;
  while ((m = TRY_RE.exec(masked)) !== null) {
    const braceOpen = m.index + m[0].length - 1; // index of the body's '{'
    const braceClose = matchDelim(masked, braceOpen, "{", "}");
    if (braceClose === -1) continue; // unbalanced — no range (never suppresses a hit; documented bound)
    tryRanges.push([braceOpen, braceClose]);
  }
}
function guarded(p) {
  // GUARDED iff p sits strictly inside some try BODY (after the '{', before the matching '}').
  for (const [o, c] of tryRanges) if (p > o && p < c) return true;
  return false;
}

// --- PASS 2: risky ops NOT guarded (FIXED regexes — P5) ------------------------------------------------------
// The roster is exactly an AWAITED CALL + a `JSON.parse(` call (P5 membership, no callee classification). For the
// await, a same-line `.catch(` handler is treated as inline-handled; a synchronous JSON.parse is guarded ONLY by a
// try (never `.catch`).
//   • `await` here means `await` of a CALL EXPRESSION — `await <dotted-ident>(` (e.g. `await fetch(`, `await res.text(`,
//     `await store.put(`). This is the precision gate that both targets the risky IO/network/async call AND keeps the
//     bare word "await" in PROSE / an "unguarded-await" heading from matching (a bare word is not `await ident(`).
//     A documented false-NEGATIVE: `await bareVariable` (no call), `await (expr)`, `await arr[0].m()` are not matched.
//     A documented false-POSITIVE (family idiom, backticks unmasked): a literal `await ident(` / `JSON.parse(` written
//     inside PROSE or a template literal is read as code — the fixtures deliberately avoid writing those literally.
const AWAIT_RE = /\bawait\s+[\w$.]+\s*\(/g;
const JSONPARSE_RE = /\bJSON\s*\.\s*parse\s*\(/g;
const HANDLED_RE = /\.\s*catch\s*\(/;

const maskedLines = masked.split("\n");
const seen = new Set(); // dedup key `${line} ${kind}`
const hits = [];
function consider(p, kind, applyCatch) {
  if (guarded(p)) return;
  const line = lineAt(masked, p);
  if (applyCatch && HANDLED_RE.test(maskedLines[line - 1] ?? "")) return; // same-line .catch → handled (await only)
  const key = `${line} ${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push({ line, kind });
}

let m;
while ((m = AWAIT_RE.exec(masked)) !== null) consider(m.index, "unguarded-await", true);
while ((m = JSONPARSE_RE.exec(masked)) !== null) consider(m.index, "unguarded-json-parse", false);

hits.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

process.stdout.write(JSON.stringify({ found: hits.length > 0, hits }) + "\n");
process.exit(0);
