#!/usr/bin/env node
// .dev/floor/check-action-pins.mjs — deterministic floor check over .github/workflows/*.yml:
// every third-party GitHub Actions `uses:` ref must be pinned by a 40-hex COMMIT DIGEST and carry a
// full-semver `# vX.Y.Z` comment.
//
// NON-LLM, dependency-free (Node stdlib only). No network, no child_process, no eval, no dynamic import.
// It enforces the convention this repo states at .github/workflows/gitleaks.yml:11 — "pinning
// third-party code by digest, never a floating tag" (cited, not restated — P4).
//
// WHY IT EXISTS (P7 — a real, already-observed drift, not a hypothetical): commit ff48077
// ("chore(deps): bump actions/setup-node from 6 to 7") moved ci.yml's digest ACROSS A MAJOR while
// leaving the trailing comment at `# v6`, and c425edd copied that same stale pattern into
// publish.yml. The divergence survived two later PRs and was found only by a manual audit. The
// major-only comment form is what this checker's `malformed-comment` rule rejects.
//
// WHAT IS GUARANTEED (P0 — floor primitive #3, enum/regex; ARCHITECTURE.md §2):
//   the FORM of every ref — a 40-hex digest plus a full-semver comment.
// WHAT IS NOT (named residual, never claimed):
//   the TRUTH of the comment. Verifying that `# v7.0.0` really names the commit `8207627…` requires
//   `git ls-remote`, and floor scripts are network-free by convention. A well-formed-but-wrong
//   comment (digest bumped, `# v6.4.0` left behind) PASSES. This shrinks the recurrence surface; it
//   does not close it.
//
// Scope note: GitHub executes only `.github/workflows/*.yml|*.yaml` (flat — files in subdirectories
// are not workflows), so the walk is deliberately non-recursive and mirrors that semantics.
//
// Usage:  node .dev/floor/check-action-pins.mjs [targetDir]      (default: cwd)
// Output: {"checked":<int>,"skipped":<int>,"files":[...],"violations":[{file,line,ref,reason}]}
// Exit:   0 clean · 1 >=1 violation
//
// Every output field is enum-gated / path-resolved (paths, ints, an enum `reason`). There is NO
// free-text field, so nothing here can carry taint into a downstream decision (P2, fix #1).

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// A pinned ref: exactly 40 lowercase hex. Uppercase is rejected on purpose — git digests are
// lowercase, and accepting both would make the comparison in a future truth-check ambiguous.
const DIGEST_RE = /^[0-9a-f]{40}$/;
// A conforming comment: FULL semver. The major-only form (`# v6`) is the ff48077 defect and is
// rejected — that is the entire point of requiring three components.
const SEMVER_COMMENT_RE = /^v\d+\.\d+\.\d+$/;
// `uses:` line, with or without the YAML sequence dash. The ref and any trailing comment are split
// AFTERWARDS rather than captured by two groups here: a `${{ … }}` expression ref contains SPACES,
// so a `(\S+)` ref group silently fails to match the whole line and the ref is never examined at
// all — a fail-open (the line looks like "not a uses: line"). Capturing the remainder wholesale and
// splitting on `#` keeps every `uses:` line in scope.
const USES_RE = /^\s*(?:-\s*)?uses:\s*(.*)$/;

// Reasons are an ENUM, never prose (P5 — membership, not classification).
const REASON = {
  FLOATING: "floating-ref", // the @ref is not a 40-hex digest
  MISSING_COMMENT: "missing-comment", // digest-pinned but no trailing comment
  MALFORMED_COMMENT: "malformed-comment", // comment present but not full semver
  UNPINNABLE: "unpinnable-ref", // a ${{ }} expression — cannot be pinned at all
};

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exit(code);
}

// Classify ONE `uses:` ref. Returns a REASON, or null when the ref conforms.
// Exported shape is a pure function of (ref, comment) — no I/O, so the table is trivially testable.
function classify(ref, comment) {
  // An expression ref resolves at run time and has no fixed identity to pin. It is a DISTINCT
  // failure from a floating tag (there is no tag to replace with a digest), so it gets its own
  // reason rather than being mislabeled `floating-ref`.
  if (ref.includes("${{")) return REASON.UNPINNABLE;

  const at = ref.lastIndexOf("@");
  if (at === -1) return REASON.FLOATING; // no ref at all (`uses: actions/checkout`) — unpinned
  const rev = ref.slice(at + 1);
  if (!DIGEST_RE.test(rev)) return REASON.FLOATING;

  if (comment === undefined || comment === "") return REASON.MISSING_COMMENT;
  // Compare the FIRST token only: a trailing note after the version is fine (`# v7.0.1 (pinned)`).
  if (!SEMVER_COMMENT_RE.test(comment.split(/\s+/)[0])) return REASON.MALFORMED_COMMENT;

  return null;
}

// Refs that are deliberately OUT OF SCOPE. Each exemption is named and justified — an unexplained
// skip is how a gate quietly stops gating.
function isExempt(ref) {
  // Local/first-party action: nothing third-party to pin.
  if (ref.startsWith("./")) return true;
  // Container image ref: a different registry with a different digest format (sha256:<64hex>).
  // Pinning those is a separate axis; this repo has zero such refs today, so requiring a policy for
  // them here would be speculative (P7). Named, not silently swallowed.
  if (ref.startsWith("docker://")) return true;
  return false;
}

function main() {
  const target = process.argv[2] || process.cwd();
  const dir = join(target, ".github", "workflows");

  // A repo with no workflows is not in violation — it is vacuously clean. The CALLER is responsible
  // for asserting that something was actually inspected (see check-action-pins.test.mjs, which
  // asserts `checked` and the visited file set, never bare exit 0).
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    emit({ checked: 0, skipped: 0, files: [], violations: [] }, 0);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();

  const violations = [];
  let checked = 0;
  let skipped = 0;

  for (const file of files) {
    const rel = join(".github", "workflows", file);
    const lines = readFileSync(join(dir, file), "utf8").split("\n");

    lines.forEach((raw, i) => {
      // A commented-out example is not a ref. Test the RAW line's first non-whitespace character
      // before matching, so `# - uses: foo@v1` never registers.
      if (raw.trimStart().startsWith("#")) return;

      const m = USES_RE.exec(raw);
      if (m === null) return;

      // Split the remainder into ref + comment. An action ref never contains `#`, so the first `#`
      // begins the comment.
      const rest = m[1];
      const hash = rest.indexOf("#");
      const comment = hash === -1 ? undefined : rest.slice(hash + 1).trim();
      // Strip surrounding quotes — `uses: "actions/checkout@<sha>"` is valid YAML and must not slip
      // past the digest test on account of the quote characters.
      const ref = rest
        .slice(0, hash === -1 ? rest.length : hash)
        .trim()
        .replace(/^["']|["']$/g, "");

      // `uses:` with nothing after it is malformed, not absent — fail closed rather than skip.
      if (ref === "") {
        checked += 1;
        violations.push({
          file: rel,
          line: i + 1,
          ref,
          reason: REASON.FLOATING,
        });
        return;
      }

      if (isExempt(ref)) {
        skipped += 1;
        return;
      }

      checked += 1;
      const reason = classify(ref, comment);
      if (reason !== null) violations.push({ file: rel, line: i + 1, ref, reason });
    });
  }

  emit({ checked, skipped, files, violations }, violations.length > 0 ? 1 : 0);
}

main();
