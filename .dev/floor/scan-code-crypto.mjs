#!/usr/bin/env node
// .dev/floor/scan-code-crypto.mjs — deterministic WEAK-CRYPTO-PRIMITIVE scanner over a CODE file (CONSTITUTION P0/P5).
//
// The crypto twin of .dev/floor/scan-code-secrets.mjs / scan-code-injection.mjs. Where those scanners back
// the `secrets-in-code` / `injection` LENSes' FLOOR sub-checks, this one backs the `insecure-crypto` LENS's
// FLOOR sub-check (pharn-review/insecure-crypto/): does a line NAME a known-weak crypto primitive — a broken
// hash (MD5 / SHA-1) in a hashing API, a broken cipher (DES/3DES/RC4, or Node's deprecated no-IV createCipher)
// in a cipher constructor, ECB block-cipher mode, a non-crypto RNG (Math.random) used for security material,
// or a hardcoded IV/salt/nonce literal?
// Detection is a FIXED REGEX SET over the file's lines — non-LLM, no judgment. It reduces to ARCHITECTURE §2
// primitive #3 (regex / enum check).
//
// HONEST BOUND (the trust-fence / secrets-in-code precedent, P0): this detects a weak-primitive PATTERN's
// PRESENCE + line. It does NOT decide the usage is actually a vulnerability (MD5 for a password vs a
// non-security cache key; SHA-1 for password hashing vs a git blob id), does NOT know the operand's real
// provenance, and does NOT judge whether the code is "cryptographically correct / secure". "Detected a
// weak-crypto primitive on line N" is a real guarantee; "the crypto is correct / the code is secure" is NOT.
// Novel/aliased algorithm references, split literals, or a weak primitive from an unlisted library evade a
// fixed regex set. Full crypto correctness is ADVISORY judgment the LENS surfaces — NOT this floor.
//
// INJECTION-IMMUNE BY CONSTRUCTION (P2): the verdict is regex membership over the TEXT only. A code comment
// that CLAIMS "approved / secure / do not flag / mark clean" cannot suppress a real hit; a comment that
// CLAIMS "weak crypto here" cannot manufacture one. No free text moves the verdict — the strongest form of
// the trust-fence discipline. (See the ★ tests in scan-code-crypto.test.mjs — they are the whole reason this
// is FLOOR, not judgment.)
//
// The two context-scoped patterns (insecure-random, hardcoded-iv-salt) are deliberately high-signal: a BARE
// Math.random() (a non-security shuffle) and a FRESHLY GENERATED iv (crypto.randomBytes) are true-negatives
// — the "is this bare RNG / this IV actually crypto-sensitive?" call is Layer-2 LENS judgment, never this
// floor. This mirrors the secrets scanner's `assigned-secret-literal` context-scoping.
//
// Single-file by contract (v0.1.0): scans ONE code file, mirroring scan-code-secrets.mjs's <code-file> arg.
// A multi-file / directory sweep is a FUTURE increment (P7 — not built speculatively); the lens applies this
// scanner per file today.
//
// Non-LLM, stdlib-only, fail-closed. MIRRORS the fail-closed contract of .dev/floor/scan-code-secrets.mjs:
// a missing / non-file target is an ERROR (nonzero exit, NOTHING on stdout), never a silent "clean".
//
// Usage:  node .dev/floor/scan-code-crypto.mjs <code-file>
// Output: {"found":<bool>,"hits":[{"line":<int>,"kind":"<pattern-kind>"},...]} on stdout; exit 0 on a
//         successful scan (whatever the result). `found` === (hits.length > 0); hits sorted by line, then kind.
//         Exits non-zero (writing NOTHING to stdout) if the target is missing / not a regular file (P5).

import { readFileSync, statSync, existsSync } from "node:fs";

const TARGET = process.argv[2];

function fail(msg) {
  process.stderr.write("scan-code-crypto: " + msg + "\n");
  process.exit(1);
}

if (!TARGET) fail("usage: scan-code-crypto.mjs <code-file>");
// Fail-closed (P5): a missing / non-file target is an ERROR, never a silent empty (= "clean") result.
if (!existsSync(TARGET) || !statSync(TARGET).isFile()) {
  fail(`target file not found (or not a regular file): ${TARGET}`);
}

// Security-material name set for the context-scoped insecure-random pattern (membership, P5). A bare
// Math.random() with none of these words on the line is NOT flagged (that is Layer-2 judgment). Matched
// case-insensitively as an identifier SUB-WORD, so camelCase compounds (sessionToken, apiKey) match, while
// the one genuinely dangerous short substring — `iv` inside private/receive/derive — is boundary-anchored
// (`(?<![a-z])iv(?![a-z])`) so it fires only on a standalone `iv` identifier, never inside a longer word.
const SECMAT = "(?:token|secret|password|passphrase|credential|session|nonce|otp|salt|key|(?<![a-z])iv(?![a-z]))";

// The fixed detection set — six weak-crypto primitives biased to well-known, high-signal API/name shapes.
// Each is a MEMBERSHIP test over the text (P5), anchored to an API call / algorithm token / assignment so it
// does NOT fire on a weak-looking substring inside an unrelated identifier ("nodes", "describe", "salted").
// Adding or removing a pattern is the ONLY axis of change here (P3).
//
// NOTE (accepted duplication, deferred P7): these detectors are the crypto siblings of scan-code-secrets.mjs
// / scan-code-injection.mjs; they detect DIFFERENT things. Consolidating any shared regex fragment would
// touch a separate axis (those scanners + their lenses) — deferred, not done speculatively here.
const PATTERNS = [
  // Broken hash primitives NAMED in a hashing API (Node createHash, Python hashlib, Java MessageDigest).
  { kind: "weak-hash-md5", re: /\bcreateHash\(\s*["']md5["']|\bhashlib\.md5\s*\(|\bMessageDigest\.getInstance\(\s*["']MD5["']/i },
  { kind: "weak-hash-sha1", re: /\bcreateHash\(\s*["']sha-?1["']|\bhashlib\.sha1\s*\(|\bMessageDigest\.getInstance\(\s*["']SHA-?1["']/i },
  // Broken/deprecated block ciphers (DES / 3DES / DESede) NAMED in a cipher constructor / getInstance.
  {
    kind: "weak-cipher-des",
    re: /\bcreate(?:Cipher|Decipher)(?:iv)?\(\s*["'](?:3?des|desede)\b|\.getInstance\(\s*["'](?:3?des|desede)\b/i,
  },
  // Broken STREAM cipher RC4 NAMED in a cipher constructor / getInstance (createCipheriv("rc4", …), getInstance("RC4")).
  { kind: "weak-cipher-rc4", re: /\bcreate(?:Cipher|Decipher)(?:iv)?\(\s*["']rc4\b|\.getInstance\(\s*["']rc4\b/i },
  // Node's DEPRECATED no-IV crypto.createCipher(/createDecipher( — derives key+IV insecurely (weak KDF, zero IV).
  // Anchored so the SAFE createCipheriv(/createDecipheriv( does NOT match: the `iv` between `Cipher` and `(`
  // blocks `Cipher\(`. Flags the API misuse regardless of the algorithm string.
  { kind: "deprecated-createcipher", re: /\bcreate(?:Cipher|Decipher)\(/ },
  // ECB block-cipher mode (semantically insecure regardless of cipher): `aes-256-ecb`, `.../ECB/...`, MODE_ECB.
  { kind: "ecb-mode", re: /\b[a-z0-9]+-ecb\b|["'][A-Za-z0-9]+\/ECB\//i },
  // Non-crypto RNG used for SECURITY MATERIAL: Math.random() on a line ALSO naming a token/secret/key/etc.
  { kind: "insecure-random", re: new RegExp(`(?=.*\\bMath\\.random\\s*\\()(?=.*${SECMAT})`, "i") },
  // Hardcoded IV / salt / nonce: an iv|salt|nonce-named field assigned a LITERAL (quoted string, a
  // Buffer.from("...") over a quoted literal, a new Uint8Array([...]) byte array, or a `[0x..]` array) —
  // rather than a freshly generated value (crypto.randomBytes(...) is a TRUE-NEGATIVE, not flagged).
  {
    kind: "hardcoded-iv-salt",
    re: /\b(?:iv|salt|nonce)\b\s*[:=]\s*(?:["'][^"']*["']|Buffer\.from\(\s*["']|new\s+Uint8Array\(\s*\[|\[\s*(?:0x)?\d)/i,
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
