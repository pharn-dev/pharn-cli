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

// Split on ALL THREE line-ending conventions, not just "\n". Splitting on "\n" alone leaves a
// trailing "\r" on every line of a CRLF file, and a line-anchored regex ending in `$` cannot match
// it (`.` does not match a carriage return), so EVERY `uses:` in that file became invisible —
// exit 0, checked:0, byte-identical to a clean repo. That is reachable BY ACCIDENT: `core.autocrlf`
// on Windows produces CRLF on checkout, this repo has no `.gitattributes`, and prettier's globs
// exclude `.github/**`, so nothing else would normalise or reject it. Lone-CR collapses the whole
// file into one line, with the same result.
const LINE_SPLIT_RE = /\r\n|\r|\n/;

// A `uses:` key ANYWHERE in the line — deliberately NOT anchored to the start.
//
// Anchoring was the second root cause: `steps: [{uses: x@main}]`, `- {with: {…}, uses: x@main}`,
// and a flow sequence on its own line are all valid YAML that GitHub executes, and all three put
// the key somewhere other than line-start-after-an-optional-dash. Each was invisible.
//
// The leading `(?:^|[\s,{[])` is what stops `causes:` / `reuses:` from matching, and capturing to
// the next `,` `}` `]` (rather than a `(\S+)` ref group) is load-bearing: a `${{ … }}` expression
// ref contains SPACES, and a `\S+` group fails to match the line at all — a fail-OPEN.
//
// Deliberate imprecision, in the fail-CLOSED direction: a `run:` line that happens to contain the
// text `uses:` is treated as a ref and reported. That is noise a human can resolve; a missed ref
// is not.
const USES_KEY_RE = /(?:^|[\s,{[])["']?uses["']?\s*:\s*([^,}\]]*)/g;

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

// Pull EVERY `uses:` ref (with its trailing comment) out of one line. Returns [] when the line
// declares none. A line can legitimately carry more than one in flow style — `[{uses: a}, {uses: b}]`
// — and returning only the first would leave the rest invisible, which is the bug class this
// function exists to close.
function parseUses(raw) {
  if (raw.trimStart().startsWith("#")) return []; // a commented-out example is not a ref

  const out = [];
  USES_KEY_RE.lastIndex = 0; // the regex is /g and shared: reset before each line
  let m;
  while ((m = USES_KEY_RE.exec(raw)) !== null) {
    const rest = m[1];
    // An action ref never contains `#`, so the first `#` begins the comment.
    const hash = rest.indexOf("#");
    const comment = hash === -1 ? undefined : rest.slice(hash + 1).trim();
    const ref = rest
      .slice(0, hash === -1 ? rest.length : hash)
      .trim()
      .replace(/^["']|["']$/g, ""); // quotes must not smuggle a floating tag past the digest test
    out.push({ ref, comment });
  }
  return out;
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
      lines = readFileSync(f.abs, "utf8").split(LINE_SPLIT_RE);
    } catch {
      violations.push({ file: rel, line: 0, ref: "", reason: REASON.UNREADABLE });
      continue;
    }

    lines.forEach((raw, i) => {
      for (const { ref, comment } of parseUses(raw)) {
        // `uses:` with nothing after it is malformed, not absent — fail closed.
        if (ref === "") {
          checked += 1;
          violations.push({ file: rel, line: i + 1, ref, reason: REASON.FLOATING });
          continue;
        }

        const reason = classify(ref, comment);
        if (reason !== null) {
          checked += 1;
          violations.push({ file: rel, line: i + 1, ref, reason });
          continue;
        }

        // Conforming. Exempt refs are counted separately so an audit can see the exemption was used.
        if (isExempt(ref)) skipped += 1;
        else checked += 1;
      }
    });
  }

  emit(
    { checked, skipped, files: found.map((f) => f.rel.split(sep).join("/")), violations },
    violations.length > 0 ? 1 : 0,
  );
}

main();
