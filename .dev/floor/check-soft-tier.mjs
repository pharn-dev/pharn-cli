#!/usr/bin/env node
// .dev/floor/check-soft-tier.mjs — deterministic floor check over the GitHub Actions definitions
// this repo executes: NO job, step, or matrix cell may declare `continue-on-error`.
//
// NON-LLM, dependency-free (Node stdlib only). No network, no child_process, no eval, no dynamic import.
//
// WHY IT EXISTS (P7 — a real triggering need, not a hypothetical): the OS×Node matrix landed five
// cells, four of which had never executed a test. The standing temptation when one goes red is to
// mark it `continue-on-error: true` and call it "experimental" — which produces a YELLOW cell: a
// check that renders as present, gates nothing, and reads to every future contributor as covered.
// A yellow cell is a lie with extra steps. Before this file, "no soft tier" was DISCIPLINE — a
// sentence in a build brief that nothing enforced. This is the fence.
//
// WHAT IS GUARANTEED (P0 — floor primitive #3, enum/regex; ARCHITECTURE.md §2):
//   the ABSENCE of a `continue-on-error` key on every line this scanner ENUMERATES.
// WHAT IS NOT (named residuals, never claimed):
//   • R1 — "GATES THE MERGE" IS A REPO-SETTINGS PROPERTY, NOT A FILE PROPERTY. This gate proves no
//     workflow ASKS to be soft. It cannot read branch protection, so a job simply left OUT of the
//     required-checks list is invisible here and is soft in the only way that finally matters.
//     Nothing in .github/** can close this; it is closed by a human in Settings → Branches.
//   • R2 — SHELL-LEVEL SWALLOWING. `run: npm test || true`, `set +e`, a trailing `|| exit 0` — a
//     soft tier written in bash instead of YAML. Recognising it means deciding whether a shell
//     fragment neutralises an exit code, which is a CLASSIFICATION (P5 forbids). Out of contract by
//     construction, not by oversight.
//   • R3 — ENUMERATOR DUPLICATION. collectFiles/safeLstat/isYaml/LINE_SPLIT_RE/emit are duplicated
//     from check-action-pins.mjs. A shared module was rejected for the reason check-run-pins.mjs
//     already records as its own R2: NO floor script imports another, and that isolation is a safety
//     property (one module's bug cannot take down two gates). check-soft-tier.test.mjs cross-checks
//     that this scanner and check-action-pins.mjs enumerate the SAME files[] for this repo, so the
//     three walkers cannot drift silently.
//   • R4 — `if:` CONDITIONS ARE NOT READ. This repo's six gates deliberately use
//     `if: always() && steps.install.outcome == 'success'`, which is honest: the step still fails the
//     job. A hostile `if:` that routes around failure is not distinguishable from that honest one
//     without classification. Only the `continue-on-error` key is in contract.
//
// WHAT IT ENUMERATES — identical to check-action-pins.mjs, and for the identical reason (both are
// executed by GitHub, so both are in scope):
//   1. `.github/workflows/*.{yml,yaml}` — non-recursive, mirroring GitHub (files in subdirectories
//      of that folder are not workflows).
//   2. `.github/actions/**/action.{yml,yaml}` — LOCAL composite action definitions, walked
//      recursively. A composite action's steps can carry `continue-on-error` too, so scanning only
//      workflows would leave the same laundering path `uses:` had before that walk was added.
//
// Usage:  node .dev/floor/check-soft-tier.mjs [targetDir]      (default: cwd)
// Output: {"checked":<int>,"lines":<int>,"files":[...],"violations":[{file,line,value,reason}]}
// Exit:   0 clean · 1 >=1 violation
//
// `checked` counts FILES and `lines` counts LINES — not violations, which are zero in a healthy
// repo and therefore useless as an anti-vacuity bound. `lines` is the stronger of the two: it proves
// the scanner actually READ content rather than merely stat-ing a directory.
//
// Every output field is enum-gated / path-resolved (paths, ints, an enum `reason`). The `value` is
// copied verbatim from the scanned file, so it inherits that file's trust — but NO decision reads
// it: the verdict is `violations.length > 0`, an integer test (P2, fix #1). See VALUE-BLINDNESS.

import { readFileSync, readdirSync, existsSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";

// Split on ALL THREE line-ending conventions. Splitting on "\n" alone leaves a trailing "\r" on
// every line of a CRLF file, which defeats any line-anchored match — the exact fail-OPEN
// check-action-pins.mjs documents at its own LINE_SPLIT_RE. The repo now ships `.gitattributes`
// (`* text=auto eol=lf`), which kills that class at checkout for TRACKED files; this stays because
// a scanner must not depend on a policy file remaining present to be correct.
const LINE_SPLIT_RE = /\r\n|\r|\n/;

// A `continue-on-error` key ANYWHERE in the line — deliberately NOT anchored to line start, because
// `- { os: x, continue-on-error: true }` and `jobs: {j: {continue-on-error: true}}` are valid YAML
// that GitHub honours and an anchored regex never sees.
//
// The leading `(?:^|[\s,{[])` is what stops a longer key that merely ENDS in the same text
// (`my-continue-on-error:`) from matching — `-` is not in that character class.
//
// Deliberate imprecision, in the fail-CLOSED direction: a `run:` line whose text happens to contain
// `continue-on-error:` is reported. Noise a human resolves in one look; a missed soft tier is not.
const SOFT_KEY_RE = /(?:^|[\s,{[])["']?continue-on-error["']?\s*:\s*([^,}\]]*)/g;

// Reasons are an ENUM, never prose (P5 — membership, not classification).
const REASON = {
  SOFT_TIER: "soft-tier-declared", // a continue-on-error key is present, whatever its value
  UNREADABLE: "unreadable-file", // could not stat/read (e.g. a dangling symlink)
};

function emit(obj, code) {
  // NOT process.exit(): stdout is ASYNC on a pipe, and exiting truncates it. Setting exitCode lets
  // the write drain and Node exit naturally — the lesson check-action-pins.mjs records at its emit().
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exitCode = code;
}

const isYaml = (f) => /\.ya?ml$/i.test(f); // case-INsensitive: `CI.YML` must not be silently dropped

// lstat, not stat: a DANGLING symlink makes stat throw ENOENT, which would crash the walk before
// any JSON is emitted.
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

// Pull EVERY continue-on-error declaration out of one line. Returns [] when the line declares none.
//
// VALUE-BLINDNESS IS THE DESIGN, NOT AN OVERSIGHT. `continue-on-error: false` is rejected alongside
// `true`, for three reasons: (1) reading the value would make the verdict depend on untrusted file
// content, where `violations.length > 0` depends on nothing; (2) `false` restates a default and buys
// nothing, while sitting one character from `true` in a future diff; (3) it catches the
// experimental-cell laundering shape `continue-on-error: ${{ matrix.experimental }}` without this
// scanner ever having to learn what `matrix.experimental` is. The value is CAPTURED for the human's
// report and never consulted for the verdict.
function parseSoftTier(raw) {
  if (raw.trimStart().startsWith("#")) return []; // a commented-out example is not a declaration

  const out = [];
  SOFT_KEY_RE.lastIndex = 0; // the regex is /g and shared: reset before each line
  let m;
  while ((m = SOFT_KEY_RE.exec(raw)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function main() {
  const target = process.argv[2] || process.cwd();
  const { found, unreadable } = collectFiles(target);

  const violations = [];
  let lines = 0;

  // An entry we cannot read is a VIOLATION, not a skip: "I could not look" must never render as
  // "there was nothing to find".
  for (const u of unreadable) {
    violations.push({ file: u.rel.split(sep).join("/"), line: 0, value: "", reason: REASON.UNREADABLE });
  }

  for (const f of found) {
    const rel = f.rel.split(sep).join("/");
    let fileLines;
    try {
      fileLines = readFileSync(f.abs, "utf8").split(LINE_SPLIT_RE);
    } catch {
      violations.push({ file: rel, line: 0, value: "", reason: REASON.UNREADABLE });
      continue;
    }
    lines += fileLines.length;

    fileLines.forEach((raw, i) => {
      for (const value of parseSoftTier(raw)) {
        violations.push({ file: rel, line: i + 1, value, reason: REASON.SOFT_TIER });
      }
    });
  }

  emit(
    {
      checked: found.length,
      lines,
      files: found.map((f) => f.rel.split(sep).join("/")),
      violations,
    },
    violations.length > 0 ? 1 : 0,
  );
}

main();
