#!/usr/bin/env node
// .dev/floor/check-action-pins.mjs — deterministic floor check over the GitHub Actions definitions
// this repo executes: every third-party `uses:` ref must be pinned by a 40-hex COMMIT DIGEST and
// carry a full-semver `# vX.Y.Z` comment.
//
// NON-LLM, dependency-free (Node stdlib only). No network, no child_process, no eval, no dynamic import.
// It enforces the convention this repo states at .github/workflows/gitleaks.yml:11 — "pinning
// third-party code by digest, never a floating tag" (cited, not restated — P4).
//
// WHY IT EXISTS (P7 — a real, already-observed drift): commit ff48077 ("chore(deps): bump
// actions/setup-node from 6 to 7") moved ci.yml's digest ACROSS A MAJOR while leaving the trailing
// comment at `# v6`, and c425edd copied that stale pattern into publish.yml. It survived two later
// PRs and was found by a manual audit. The major-only comment form is what `malformed-comment`
// rejects.
//
// WHAT IS GUARANTEED (P0 — floor primitive #3, enum/regex; ARCHITECTURE.md §2):
//   the FORM of every ref this scanner ENUMERATES — a 40-hex digest plus a full-semver comment.
// WHAT IS NOT (named residuals, never claimed):
//   • The TRUTH of the comment. Verifying that `# v7.0.0` names commit 8207627… needs `git
//     ls-remote`, and floor scripts are network-free. A well-formed but wrong comment PASSES.
//   • The OWNER of the digest. `attacker/checkout@<40hex> # v7.0.1` is fully conforming here;
//     binding a digest to an intended owner needs an allowlist policy this does not have.
//   • Total YAML fidelity. This is a LINE SCANNER, not a YAML parser (stdlib-only; js-yaml is a
//     transitive dep, not ours). It recognises the three `uses:` spellings GitHub users actually
//     write — bare key, quoted key, flow mapping — and unrecognised shapes fail TOWARD flagging,
//     never toward silence. Exotic YAML (anchors, a line-initial `uses:` inside a `run: |` block
//     scalar) can produce a FALSE POSITIVE. That direction is deliberate: noise is recoverable, a
//     silent miss is not.
//
// WHAT IT ENUMERATES (both are executed by GitHub, so both are in scope):
//   1. `.github/workflows/*.{yml,yaml}` — non-recursive, mirroring GitHub (files in subdirectories
//      of that folder are not workflows).
//   2. `.github/actions/**/action.{yml,yaml}` — LOCAL composite/docker action definitions, walked
//      recursively. A composite action's `runs.steps[].uses:` entries are real third-party actions
//      running with the job's token. Scanning only workflows made `uses: ./.github/actions/x` a
//      laundering path: exempt at the call site, never read at the definition.
//
// Usage:  node .dev/floor/check-action-pins.mjs [targetDir]      (default: cwd)
// Output: {"checked":<int>,"skipped":<int>,"files":[...],"violations":[{file,line,ref,reason}]}
// Exit:   0 clean · 1 >=1 violation
//
// Every output field is enum-gated / path-resolved (paths, ints, an enum `reason`). The `ref` value
// is copied verbatim from the scanned file, so it inherits that file's trust — but NO decision reads
// it: the verdict is `violations.length > 0`, an integer test (P2, fix #1).

import { readFileSync, readdirSync, existsSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";

// A pinned ref: exactly 40 lowercase hex. Uppercase is rejected on purpose — git digests are
// lowercase, and accepting both would make a future truth-check ambiguous.
const DIGEST_RE = /^[0-9a-f]{40}$/;
// A container digest: docker uses sha256:<64 hex>, a different format from a git commit.
const OCI_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
// A conforming comment: FULL semver. The major-only form (`# v6`) is the ff48077 defect.
const SEMVER_COMMENT_RE = /^v\d+\.\d+\.\d+$/;

// The three `uses:` spellings GitHub accepts, all reduced to "the text after the key".
//   bare key      :  - uses: x        /  uses: x
//   quoted key    :  - "uses": x      /  'uses': x
//   flow mapping  :  - {uses: x, with: {...}}
// Capturing the remainder wholesale (rather than a `(\S+)` ref group) is load-bearing: a `${{ … }}`
// expression ref contains SPACES, and a `\S+` group silently fails to match the line at all — the
// ref is then never examined, which is a fail-OPEN.
const USES_LINE_RE = /^\s*(?:-\s*)?["']?uses["']?\s*:\s*(.*)$/;
const USES_FLOW_RE = /^\s*(?:-\s*)?\{\s*["']?uses["']?\s*:\s*([^,}]*)/;

// Reasons are an ENUM, never prose (P5 — membership, not classification).
const REASON = {
  FLOATING: "floating-ref", // the @ref is not a 40-hex digest
  MISSING_COMMENT: "missing-comment", // digest-pinned but no trailing comment
  MALFORMED_COMMENT: "malformed-comment", // comment present but not full semver
  UNPINNABLE: "unpinnable-ref", // a ${{ }} expression — no fixed identity to pin
  UNPINNED_CONTAINER: "unpinned-container", // docker:// without an @sha256 digest
  ESCAPING_LOCAL: "escaping-local-ref", // a ./ ref that climbs out with ..
  UNREADABLE: "unreadable-file", // could not stat/read (e.g. a dangling symlink)
};

function emit(obj, code) {
  // NOT process.exit(): stdout is ASYNC on a pipe, and exiting truncates it. Reproduced before this
  // change — 400KB of JSON cut to exactly 65536 bytes through `| cat` and through spawnSync, leaving
  // consumers with unparseable output. Setting exitCode lets the write drain and Node exit naturally.
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exitCode = code;
}

// Classify ONE ref. Returns a REASON, or null when it conforms.
// ORDER IS LOAD-BEARING: the expression test runs FIRST. Previously exemption ran before
// classification, so `./${{ … }}` and `docker://${{ … }}` were skipped instead of flagged — the
// prefix defeated the rule.
function classify(ref, comment) {
  if (ref.includes("${{")) return REASON.UNPINNABLE;

  // Container action. The scheme is NOT a blanket pass: `docker://alpine:latest` is a mutable tag,
  // i.e. remote code with no pin at all. Require the OCI digest form.
  if (ref.startsWith("docker://")) {
    const at = ref.lastIndexOf("@");
    if (at === -1 || !OCI_DIGEST_RE.test(ref.slice(at + 1))) return REASON.UNPINNED_CONTAINER;
    return null; // digest-pinned image; there is no semver comment convention for these
  }

  // Local action. Exempt only when it is genuinely inside the repo — a `..` segment climbs out to
  // a tree this scanner never enumerates. The definition it points at IS scanned (see collectFiles).
  if (ref.startsWith("./")) {
    return ref.split(/[/\\]/).includes("..") ? REASON.ESCAPING_LOCAL : null;
  }

  const at = ref.lastIndexOf("@");
  if (at === -1) return REASON.FLOATING; // `uses: actions/checkout` — unpinned
  if (!DIGEST_RE.test(ref.slice(at + 1))) return REASON.FLOATING;

  if (comment === undefined || comment === "") return REASON.MISSING_COMMENT;
  // First token only: a trailing note after the version is fine (`# v7.0.1 (pinned)`).
  if (!SEMVER_COMMENT_RE.test(comment.split(/\s+/)[0])) return REASON.MALFORMED_COMMENT;

  return null;
}

// A conforming ref that is exempt from the DIGEST rule but must still be COUNTED, so an audit can
// see that an exemption was used. `skipped` is asserted exactly by the live repo test — an
// exemption can never be a silent hole again.
function isExempt(ref) {
  if (ref.startsWith("./")) return true; // escaping ./.. never reaches here (classify rejects it)
  if (ref.startsWith("docker://")) return true; // only digest-pinned images reach here
  return false;
}

const isYaml = (f) => /\.ya?ml$/i.test(f); // case-INsensitive: `CI.YML` was silently dropped before

// lstat, not stat: a DANGLING symlink makes stat throw ENOENT, which previously crashed the walk
// inside Array.filter before any JSON was emitted.
function safeLstat(abs) {
  try {
    return lstatSync(abs);
  } catch {
    return null;
  }
}

// Enumerate every file GitHub would execute. Returns readable {rel, abs} pairs plus unreadable ones.
function collectFiles(target) {
  const found = [];
  const unreadable = [];

  // 1. workflows — flat, mirroring what GitHub actually executes.
  const wfRel = join(".github", "workflows");
  const wfDir = join(target, wfRel);
  if (existsSync(wfDir)) {
    let names = [];
    try {
      names = readdirSync(wfDir).sort();
    } catch {
      /* unreadable dir: nothing to enumerate */
    }
    for (const name of names) {
      if (!isYaml(name)) continue;
      const abs = join(wfDir, name);
      const st = safeLstat(abs);
      if (st === null || st.isSymbolicLink()) {
        unreadable.push({ rel: join(wfRel, name), abs });
        continue;
      }
      if (st.isFile()) found.push({ rel: join(wfRel, name), abs });
    }
  }

  // 2. local action definitions — recursive, depth-bounded, symlink-refusing.
  const walk = (absDir, relDir, depth) => {
    if (depth > 8) return; // bounded: a pathological tree cannot hang the floor
    let names = [];
    try {
      names = readdirSync(absDir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(absDir, name);
      const rel = join(relDir, name);
      const st = safeLstat(abs);
      if (st === null) {
        unreadable.push({ rel, abs });
        continue;
      }
      if (st.isSymbolicLink()) continue; // never follow a symlink out of the tree
      if (st.isDirectory()) walk(abs, rel, depth + 1);
      else if (st.isFile() && /^action\.ya?ml$/i.test(name)) found.push({ rel, abs });
    }
  };
  const actRel = join(".github", "actions");
  const actDir = join(target, actRel);
  if (existsSync(actDir)) walk(actDir, actRel, 0);

  return { found, unreadable };
}

// Pull the ref + trailing comment out of one line, or null if the line is not a `uses:`.
function parseUses(raw) {
  if (raw.trimStart().startsWith("#")) return null; // a commented-out example is not a ref

  const flow = USES_FLOW_RE.exec(raw);
  const m = flow || USES_LINE_RE.exec(raw);
  if (m === null) return null;

  const rest = m[1];
  // An action ref never contains `#`, so the first `#` begins the comment.
  const hash = rest.indexOf("#");
  const comment = hash === -1 ? undefined : rest.slice(hash + 1).trim();
  const ref = rest
    .slice(0, hash === -1 ? rest.length : hash)
    .trim()
    .replace(/[,}].*$/, "") // flow mapping: stop at the entry boundary
    .trim()
    .replace(/^["']|["']$/g, ""); // quotes must not smuggle a floating tag past the digest test

  return { ref, comment };
}

function main() {
  const target = process.argv[2] || process.cwd();
  const { found, unreadable } = collectFiles(target);

  const violations = [];
  let checked = 0;
  let skipped = 0;

  // An entry we cannot read is a VIOLATION, not a skip: "I could not look" must never render as
  // "there was nothing to find".
  for (const u of unreadable) {
    violations.push({ file: u.rel.split(sep).join("/"), line: 0, ref: "", reason: REASON.UNREADABLE });
  }

  for (const f of found) {
    const rel = f.rel.split(sep).join("/");
    let lines;
    try {
      lines = readFileSync(f.abs, "utf8").split("\n");
    } catch {
      violations.push({ file: rel, line: 0, ref: "", reason: REASON.UNREADABLE });
      continue;
    }

    lines.forEach((raw, i) => {
      const parsed = parseUses(raw);
      if (parsed === null) return;
      const { ref, comment } = parsed;

      // `uses:` with nothing after it is malformed, not absent — fail closed.
      if (ref === "") {
        checked += 1;
        violations.push({ file: rel, line: i + 1, ref, reason: REASON.FLOATING });
        return;
      }

      const reason = classify(ref, comment);
      if (reason !== null) {
        checked += 1;
        violations.push({ file: rel, line: i + 1, ref, reason });
        return;
      }

      // Conforming. Exempt refs are counted separately so an audit can see the exemption was used.
      if (isExempt(ref)) skipped += 1;
      else checked += 1;
    });
  }

  emit(
    { checked, skipped, files: found.map((f) => f.rel.split(sep).join("/")), violations },
    violations.length > 0 ? 1 : 0,
  );
}

main();
