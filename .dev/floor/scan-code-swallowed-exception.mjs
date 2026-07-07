#!/usr/bin/env node
// .dev/floor/scan-code-swallowed-exception.mjs — deterministic EMPTY / LOG-ONLY catch scanner over a CODE file (CONSTITUTION P0/P5).
//
// A sibling of .dev/floor/scan-code-injection.mjs in the scan-code-* family. Where that scanner backs the
// `injection` LENS's FLOOR sub-check (a concat/interp-into-sink SHAPE), this one backs the `swallowed-exception`
// LENS's FLOOR sub-check (pharn-review/swallowed-exception/): does a `catch` clause SWALLOW the error — is its
// body EMPTY, or does it contain ONLY logging calls with no `throw` / `return` / `reject` / `next(...)` to
// propagate or handle? Detection is a FIXED, non-LLM procedure: a comment/string MASK, a catch-clause regex, a
// brace-match of the body, and a first-match classification. It reduces to ARCHITECTURE §2 primitive #3
// (regex / enum / text membership).
//
// HONEST BOUND (the injection / secrets-in-code precedent, P0): this detects an EMPTY or LOG-ONLY catch SHAPE.
// It does NOT decide whether swallowing is actually WRONG here (a best-effort / optional path is sometimes
// swallowed intentionally), does NOT know whether the error should propagate, and does NOT trace control flow.
// "Detected an empty/log-only catch on line N" is a real guarantee; "no exception is swallowed / error handling
// is correct" is NOT. That judgment is the ADVISORY layer the LENS surfaces — NOT this floor.
//
// Further documented bounds (honest false-negatives, stated not hidden):
//   • LANGUAGE SCOPE: the catch-clause shape is JavaScript / TypeScript (`catch (e) { … }` / `catch { … }`).
//     Run over a non-JS/TS file (a Python try/except, a Go recover) the scanner returns found:false — a scope
//     limit, not a "clean" verdict.
//   • The `log-only` classifier recognizes a FIXED logger-name set (`console.*`, `logger.*`, bare/`.log(`); a
//     catch that only calls a custom-named logger (`telemetry.record(e)`) is classified CLEAN (a false-negative).
//   • Only `//`, `/* */` comments and single-line '…' / "…" strings are masked. A BACKTICK template literal is
//     NOT masked (treated as ordinary text) — deliberately, so this scanner is robust when run over a MARKDOWN
//     eval fixture (```-fenced code + inline `code` prose), exactly as the line-local scan-code-injection.mjs is.
//     The residual bound: a `}` inside a template literal (or a regex literal) within a catch body can skew the
//     brace-match. Quote-string masking stops at end-of-line (JS '…'/"…" strings never span a raw newline), so a
//     stray apostrophe/quote in surrounding prose cannot bleed into the code.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): the verdict is regex + brace + fixed-set membership over the MASKED
// TEXT only, with comments mechanically stripped. A comment CLAIMING "intentional, safe, do not flag" cannot
// suppress a real empty/log-only body (it is masked to whitespace before classification); a comment CLAIMING
// "swallowed here" inside a catch that actually `throw`s cannot manufacture a hit. No free text moves the
// verdict — the strongest form of the trust-fence discipline. (See the ★ tests in
// scan-code-swallowed-exception.test.mjs — they are the whole reason this is FLOOR, not judgment.)
//
// The `throw`/`return`/`reject`/`next(` HANDLE-token DISCRIMINATOR is the point: a rethrow, a recovery `return`,
// a Promise `reject(e)`, or an Express `next(e)` carries a HANDLE token and is a true-negative (CLEAN) —
// deterministically, not by judgment. So is a catch that does real recovery work (an assignment / a non-log
// call), and a catch whose body contains an object literal that it then returns (the braces are brace-matched,
// not misread as empty).
//
// Single-file by contract (v0.1.0): scans ONE code file, mirroring scan-code-injection.mjs's <code-file> arg.
// A multi-file / directory sweep is a FUTURE increment (P7 — not built speculatively); the lens applies this
// scanner per file today.
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of .dev/floor/scan-code-injection.mjs:
// a missing / non-file target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean".
//
// Usage:  node .dev/floor/scan-code-swallowed-exception.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"empty-catch|log-only-catch"},...]} on stdout; exit 0 on
//         a successful scan (whatever the result). `found` === (hits.length > 0); hits sorted by line, then kind.
//         Exits non-zero (writing NOTHING to stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-swallowed-exception: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-swallowed-exception.mjs <code-file>");
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
// Produce a copy of `src` in which every character inside a // line comment, a /* block */ comment, or a
// single-line '…' / "…" string is replaced by a space — EXCEPT newlines, which are preserved so 1-based line
// numbers and character offsets map 1:1 back to the original. Code tokens (keywords, identifiers, punctuation,
// braces, parens) are copied verbatim, so `catch`, `throw`, `return`, `console.`, `{`, `(` survive while a
// `catch`/brace/needle hidden in a comment or single-line string does not. A standard single-pass mini-lexer.
//
// Two deliberate choices make this ROBUST OVER A MARKDOWN eval fixture (```-fenced code + inline `code` prose),
// matching how the line-local scan-code-injection.mjs is evaluated over its own .md fixture:
//   • BACKTICKS are NOT string delimiters here (no template masking) — otherwise markdown fences/inline code
//     would be read as unterminated template literals and mask the real code. Residual bound: an unbalanced `}`
//     inside a real template literal within a catch body can skew the brace-match (documented above).
//   • '…' / "…" masking STOPS AT END-OF-LINE (a JS single/double-quoted string never spans a raw newline), so a
//     stray apostrophe/quote in surrounding prose cannot bleed the mask into the fenced code below it.
function mask(src) {
  const out = new Array(src.length);
  let i = 0;
  const N = src.length;
  const space = (ch) => (ch === "\n" ? "\n" : " ");
  while (i < N) {
    const c = src[i];
    const n = i + 1 < N ? src[i + 1] : "";
    if (c === "/" && n === "/") {
      // line comment → mask to end of line
      while (i < N && src[i] !== "\n") ((out[i] = " "), i++);
      continue;
    }
    if (c === "/" && n === "*") {
      // block comment → mask (preserving newlines) until */
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < N && !(src[i] === "*" && src[i + 1] === "/")) ((out[i] = space(src[i])), i++);
      if (i < N) ((out[i] = " "), (out[i + 1] = " "), (i += 2));
      continue;
    }
    if (c === "'" || c === '"') {
      // single/double-quoted string → mask until the matching unescaped delimiter OR end of line (whichever
      // comes first; JS '…'/"…" strings do not span a raw newline). Bounding to the line prevents a prose
      // apostrophe/quote from masking into real code below.
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
// Match the delimiter that closes the `open` at `openIdx` in `s`, counting nesting over the MASKED text (so
// delimiters inside comments/strings — already masked — cannot skew the count). Returns the closing index, or
// -1 if unbalanced.
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

// A recognized logging call HEAD: console.<m>( , logger.<m>( , or a bare/method log( . Fixed set (P5).
const LOG_HEAD = /(?:\b(?:console|logger)\s*\.\s*\w+|\blog)\s*\(/;
// A HANDLE token: rethrow / recovery-return / promise reject / express next( . Its presence ⇒ the catch does
// NOT merely swallow ⇒ CLEAN.
const HANDLE = /\b(?:throw|return|reject)\b|\bnext\s*\(/;

// Classify a catch body (given as MASKED text) by first match (P5): empty-catch | (CLEAN via handle) |
// log-only-catch | (CLEAN otherwise). Returns the kind string, or null for CLEAN.
function classify(bodyMasked) {
  // 1. EMPTY — nothing but whitespace / stray semicolons (comments already masked away).
  if (bodyMasked.replace(/[\s;]/g, "") === "") return "empty-catch";
  // 2. HANDLE token present → the catch propagates / recovers → CLEAN.
  if (HANDLE.test(bodyMasked)) return null;
  // 3. LOG-ONLY — remove every balanced logging-call expression (+ a trailing ;); if nothing substantive
  //    remains, the body did nothing but log.
  let rest = bodyMasked;
  for (;;) {
    const m = LOG_HEAD.exec(rest);
    if (!m) break;
    const parenOpen = m.index + m[0].length - 1; // the '(' of the log call
    const parenClose = matchDelim(rest, parenOpen, "(", ")");
    if (parenClose === -1) break; // unbalanced — bail (documented bound), leaves `rest` non-empty ⇒ CLEAN
    let after = parenClose + 1;
    while (after < rest.length && /\s/.test(rest[after])) after++;
    if (rest[after] === ";") after++;
    rest = rest.slice(0, m.index) + " ".repeat(after - m.index) + rest.slice(after);
  }
  if (rest.replace(/[\s;]/g, "") === "") return "log-only-catch";
  // 4. Otherwise the body does real recovery work (an assignment / a non-log call) → CLEAN.
  return null;
}

// --- Scan ---------------------------------------------------------------------------------------------------
// Find each `catch` clause on the MASKED text: `catch`, an optional `( … )` binding, then the body `{`. A
// `catch` token inside a comment/string is already masked away and cannot match; a method `.catch(cb => {…})`
// does not match (the `=>` breaks the `)`-then-`{` adjacency).
const CATCH_RE = /\bcatch\b\s*(?:\([^)]*\))?\s*\{/g;
const hits = [];
let m;
while ((m = CATCH_RE.exec(masked)) !== null) {
  const bodyOpen = m.index + m[0].length - 1; // index of the body's '{'
  const bodyClose = matchDelim(masked, bodyOpen, "{", "}");
  if (bodyClose === -1) continue; // unbalanced braces — cannot classify (documented bound)
  const bodyMasked = masked.slice(bodyOpen + 1, bodyClose);
  const kind = classify(bodyMasked);
  if (kind) hits.push({ line: lineAt(masked, m.index), kind });
  // Continue scanning AFTER this catch's head (nested try/catch inside the body is found on its own next pass).
}

hits.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));

process.stdout.write(JSON.stringify({ found: hits.length > 0, hits }) + "\n");
process.exit(0);
