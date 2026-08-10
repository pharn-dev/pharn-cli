#!/usr/bin/env node
// .dev/floor/check-run-pins.mjs — deterministic floor check over the SHELL COMMANDS the GitHub
// Actions definitions in this repo execute: every package a `run:` line installs or execs must be
// pinned to an EXACT semver. A floating spec (`@latest`, `@next`, `^1.2.3`) or a bare name is a
// violation.
//
// NON-LLM, dependency-free (Node stdlib only). No network, no child_process, no eval, no dynamic import.
//
// WHY IT EXISTS (P7 — a real, already-observed drift, not a hypothetical): publish.yml ran
// `npm install -g npm@latest` INSIDE the release job — the one job holding `id-token: write` and the
// `npm-publish` environment — so whatever npm shipped that day executed the release. It had silently
// crossed a major: the registry `latest` dist-tag was npm 12.0.2 while the step was written against
// 11.x. `check-action-pins.mjs` could never have caught it: its contract is `uses:` refs, and this
// was a `run:` line. That gap is what this file closes.
//
// WHAT IS GUARANTEED (P0 — floor primitive #3, enum/regex; ARCHITECTURE.md §2):
//   the FORM of every package spec this scanner ENUMERATES — an exact `MAJOR.MINOR.PATCH` version.
// WHAT IS NOT (named residuals, never claimed):
//   • R1 — NON-PACKAGE-MANAGER PULLS. `curl … | sh`, a raw binary download, `pip`/`go install`/
//     `cargo install`/`brew`. gitleaks.yml's `curl` is DELIBERATELY out of contract: it is version-
//     AND SHA-256-pinned, and teaching this checker to recognise "that curl is checksum-verified"
//     would be a CLASSIFICATION, which P5 forbids. Out of scope by construction, not by oversight.
//     Also out of contract, and of the same laundering shape .github/actions/** had before it was
//     walked: `run: npm run <script>` executes a package.json script, which could itself pull a
//     floating package. This scanner reads .github/** only and can never see it.
//   • R2 — ENUMERATOR DUPLICATION. collectFiles/safeLstat/isYaml/LINE_SPLIT_RE/emit are duplicated
//     from check-action-pins.mjs, so a walker fix must be applied twice. A shared module was
//     rejected: NO floor script imports another, and that isolation is a safety property (one
//     module's bug cannot take down two gates). check-run-pins.test.mjs cross-checks that both
//     checkers enumerate the SAME files[] for this repo, so the two walkers cannot drift silently.
//   • R3 — SHELL INDIRECTION. A package name in a variable (`npm i -g "$PKG"`), `eval`, a heredoc,
//     or base64 defeats a line scanner. `$`-bearing specs are reported as `unpinnable-version`;
//     a name assembled out of sight is not seen at all.
//   • R4 — VALUE-SEPARATED FLAGS. `npm i --some-flag value pkg@1.2.3` may read `value` as a package
//     spec. URLs (`://`) and paths are excluded; other flag values are not. Fail-CLOSED noise.
//   • R5 — the ASSERT's PRESENCE, covered NEXT DOOR rather than here. THIS checker enforces only
//     that no floating install exists; it classifies specs it finds, so deleting publish.yml's
//     `Assert npm floor` step outright would trip nothing in this file. That other half is asserted
//     by check-run-pins.test.mjs (the step and its 11.5.1 floor value must be present), which the
//     same floor.yml `node --test` run collects — so the guarantee is whole, but it is NOT this
//     program's doing. Named so the split is visible.
//   • R7 — CONTINUATION IS BACKSLASH-ONLY. Trailing `\\` joins the next physical line before
//     parsing (first line number kept for findings). A `run: |` block without `\\` is still one
//     shell line per YAML line — correct. Heredocs, quotes spanning lines, and other multi-line
//     shell forms are not reconstructed.
//   • R6 — SYMLINK ASYMMETRY, INHERITED. A symlink under .github/workflows/ is reported as
//     `unreadable-file`, but a symlinked .github/actions/**/action.yml is skipped SILENTLY by the
//     walk. check-action-pins.mjs behaves identically (verified against the same fixture), so this
//     is inherited, not introduced — and fixing it belongs in a change that touches BOTH walkers,
//     which is a different axis than this gate. check-run-pins.test.mjs pins the asymmetry with an
//     assertion that both gates agree, so neither can change it unilaterally or silently.
//   • Total YAML fidelity. This is a LINE SCANNER, not a YAML parser (stdlib-only; js-yaml is a
//     transitive dep, not ours). Every line of every enumerated file is scanned, which is why no
//     block-scalar scope tracking is needed — and why an unrecognised shape fails TOWARD flagging.
//
// WHAT IT ENUMERATES (identical to check-action-pins — both are executed by GitHub):
//   1. `.github/workflows/*.{yml,yaml}` — non-recursive, mirroring GitHub.
//   2. `.github/actions/**/action.{yml,yaml}` — LOCAL composite/docker action definitions, walked
//      recursively. A composite action's `runs.steps[].run:` is a real shell command running with
//      the job's token; scanning only workflows would make it a laundering path.
//
// Usage:  node .dev/floor/check-run-pins.mjs [targetDir]      (default: cwd)
// Output: {"checked":<int>,"skipped":<int>,"files":[...],"violations":[{file,line,ref,reason}]}
// Exit:   0 clean · 1 >=1 violation
//
// Every output field is enum-gated / path-resolved (paths, ints, an enum `reason`). The `ref` value
// is copied verbatim from the scanned file, so it inherits that file's trust — but NO decision reads
// it: the verdict is `violations.length > 0`, an integer test (P2, fix #1). The field is named `ref`,
// not `spec`, so this checker's records are shape-identical to check-action-pins'.

import { readFileSync, readdirSync, existsSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";

// An EXACT version: MAJOR.MINOR.PATCH, with optional prerelease / build metadata. Anything else —
// `latest`, `next`, `^1.2.3`, `~1.2`, `1.x`, `>=2`, `beta` — is floating by definition.
const EXACT_SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Split on ALL THREE line-ending conventions. Splitting on "\n" alone leaves a trailing "\r" on
// every line of a CRLF file, which defeats line-anchored matching and makes the WHOLE FILE
// invisible — exit 0, checked:0, byte-identical to a clean repo. Reachable BY ACCIDENT via
// core.autocrlf; this repo has no .gitattributes and prettier's globs exclude .github/**.
// (The same root cause cost check-action-pins a silent hole; it is fixed here by construction.)
const LINE_SPLIT_RE = /\r\n|\r|\n/;

// Shell command separators. A single line legitimately carries several commands
// (`npm ci && npm i -g x@latest`), and scanning only the first would hide the rest.
const SEGMENT_SPLIT_RE = /&&|\|\||;|\|/;

// A `name:` key in KEY POSITION — line start, after an optional YAML sequence dash. Anchoring is
// load-bearing and deliberate: an UNANCHORED test would also match a `run:` body line such as
// `echo "name: x" && npm i -g y@latest`, and skipping that line would be a fail-OPEN miss. Anchored,
// only a genuine step-name line is skipped.
const NAME_KEY_START_RE = /^\s*-?\s*["']?name["']?\s*:/;
// A `run` key ANYWHERE — this is what keeps the flow-mapping form `- {name: n, run: npm i -g p}`
// in scope even though it opens with a name-ish key.
const RUN_KEY_RE = /(?:^|[\s,{[])["']?run["']?\s*:/;

// Reasons are an ENUM, never prose (P5 — membership, not classification).
const REASON = {
  FLOATING: "floating-version", // `pkg@latest`, `pkg@^1.2.3` — resolves differently over time
  UNPINNED: "unpinned-package", // `pkg`, `@scope/pkg`, `github:user/repo` — no version at all
  UNPINNABLE: "unpinnable-version", // a ${{ }} expression or $VAR — no fixed identity to pin
  UNREADABLE: "unreadable-file", // could not stat/read (e.g. a dangling symlink)
};

// Recognised command heads, matched as an exact token sequence. LONGEST FIRST at each position, so
// `yarn global add` is never mis-read as `yarn` + junk.
//   install  — every non-flag argument is a package spec
//   exec     — the package is resolved and RUN; only the package position is a spec
//   lockfile — resolves from a committed lockfile, so it is deterministic without a version
const HEADS = [
  { tokens: ["yarn", "global", "add"], kind: "install" },
  { tokens: ["npm", "install"], kind: "install" },
  { tokens: ["npm", "i"], kind: "install" },
  { tokens: ["npm", "add"], kind: "install" },
  { tokens: ["npm", "exec"], kind: "exec" },
  { tokens: ["npm", "ci"], kind: "lockfile" },
  { tokens: ["pnpm", "install"], kind: "install" },
  { tokens: ["pnpm", "i"], kind: "install" },
  { tokens: ["pnpm", "add"], kind: "install" },
  { tokens: ["pnpm", "dlx"], kind: "exec" },
  { tokens: ["yarn", "add"], kind: "install" },
  { tokens: ["yarn", "dlx"], kind: "exec" },
  { tokens: ["bun", "install"], kind: "install" },
  { tokens: ["bun", "i"], kind: "install" },
  { tokens: ["bun", "add"], kind: "install" },
  { tokens: ["npx"], kind: "exec" },
  { tokens: ["bunx"], kind: "exec" },
].sort((a, b) => b.tokens.length - a.tokens.length);

// An argument that pulls nothing from a registry: a local path, a file: spec, a tarball, or a URL
// (the common shape of a value-separated flag such as `--registry https://…`).
const NOT_A_REGISTRY_SPEC_RE = /^(?:\.\.?[/\\]|[/\\]|~[/\\]|file:)|\.(?:tgz|tar\.gz)$|:\/\//;

function emit(obj, code) {
  // NOT process.exit(): stdout is ASYNC on a pipe, and exiting truncates it — a large violation set
  // was cut at exactly 65536 bytes through `| cat`, leaving consumers with unparseable output.
  // Setting exitCode lets the write drain and Node exit naturally.
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exitCode = code;
}

const isYaml = (f) => /\.ya?ml$/i.test(f); // case-INsensitive: `CI.YML` must not be silently dropped

// lstat, not stat: a DANGLING symlink makes stat throw ENOENT, which would crash the walk before any
// JSON is emitted.
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

// A `${{ … }}` expression contains SPACES, so a naive whitespace tokenizer shatters
// `pkg@${{ inputs.v }}` into three tokens and reports three findings for one spec. Collapsing the
// expression to a space-free placeholder BEFORE tokenizing keeps it one spec — and the placeholder
// still carries `$`, so classifySpec reports it as unpinnable rather than conforming.
const collapseExpressions = (line) => line.replace(/\$\{\{.*?\}\}/g, "${{...}}");

// Normalise ONE token: drop surrounding quotes (which must not smuggle a floating spec past the
// tests), a leading `$(`/`(` from a command substitution, and trailing shell / YAML-flow punctuation
// (`flow@latest}` inside `- {name: n, run: …}` is the spec `flow@latest`).
const normalizeToken = (t) =>
  t
    .replace(/^["']|["']$/g, "")
    .replace(/^\$\(|^\(/, "")
    .replace(/[),;\]}]+$/, "")
    .replace(/^["']|["']$/g, "");

// Classify ONE package spec. Returns a REASON, or null when it conforms.
// ORDER IS LOAD-BEARING: the expression test runs FIRST, so `pkg@${{ inputs.v }}` is reported as
// unpinnable rather than mislabeled floating.
function classifySpec(spec) {
  if (spec.includes("${{") || spec.includes("$")) return REASON.UNPINNABLE;

  // `@scope/name@1.2.3` — the LAST `@` separates the version. An `@` at index 0 is the scope
  // sigil, not a separator, so `@scope/name` correctly reads as having no version.
  const at = spec.lastIndexOf("@");
  if (at <= 0) return REASON.UNPINNED;

  const version = spec.slice(at + 1);
  if (version === "") return REASON.UNPINNED;
  return EXACT_SEMVER_RE.test(version) ? null : REASON.FLOATING;
}

// Pull the package-spec positions out of one command's arguments.
// Returns {specs, exempt} — `exempt` counts args deliberately excluded, so an exemption can never
// become a silent hole.
function specPositions(kind, args) {
  const specs = [];
  let exempt = 0;

  if (kind === "install") {
    for (const a of args) {
      if (a === "--" || a.startsWith("-")) continue; // flags are not packages
      if (NOT_A_REGISTRY_SPEC_RE.test(a)) {
        exempt += 1;
        continue;
      }
      specs.push(a);
    }
    return { specs, exempt };
  }

  // exec: the package is whatever the runner RESOLVES — the first positional, or the value of
  // -p/--package. Later positionals are the executed command and ITS arguments, never packages.
  let sawPackageFlag = false;
  let tookPositional = false;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === "--") continue;
    if (a === "-p" || a === "--package") {
      const v = args[j + 1];
      if (v !== undefined) {
        specs.push(v);
        j += 1;
      }
      sawPackageFlag = true;
      continue;
    }
    if (a.startsWith("--package=")) {
      specs.push(a.slice("--package=".length));
      sawPackageFlag = true;
      continue;
    }
    if (a.startsWith("-")) continue;
    // With an explicit -p/--package, the first positional is the COMMAND, not a package.
    if (!tookPositional && !sawPackageFlag) {
      specs.push(a);
      tookPositional = true;
    }
  }

  const kept = [];
  for (const s of specs) {
    if (NOT_A_REGISTRY_SPEC_RE.test(s)) exempt += 1;
    else kept.push(s);
  }
  return { specs: kept, exempt };
}

// Find the FIRST recognised command head in a token list. Scanning from any position (not just
// token 0) is what makes `run:`, `- run:`, `sudo`, and `env FOO=1` prefixes all work uniformly
// without enumerating them.
function findHead(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    for (const head of HEADS) {
      if (head.tokens.every((t, k) => tokens[i + k] === t)) {
        return { kind: head.kind, args: tokens.slice(i + head.tokens.length) };
      }
    }
  }
  return null;
}

// Parse ONE line into zero or more {reason, ref} records, plus an exempt count.
function parseLine(raw) {
  const out = [];
  let exempt = 0;

  if (raw.trimStart().startsWith("#")) return { out, exempt }; // a YAML comment is never executed
  // A step name is never executed — but only when the line does not ALSO declare a run key.
  if (NAME_KEY_START_RE.test(raw) && !RUN_KEY_RE.test(raw)) return { out, exempt };

  for (const segment of collapseExpressions(raw).split(SEGMENT_SPLIT_RE)) {
    const tokens = segment.split(/\s+/).filter(Boolean).map(normalizeToken).filter(Boolean);
    const head = findHead(tokens);
    if (head === null) continue;

    if (head.kind === "lockfile") {
      exempt += 1; // `npm ci` — deterministic from the committed lockfile
      continue;
    }

    const { specs, exempt: argExempt } = specPositions(head.kind, head.args);
    exempt += argExempt;

    // An install head with NO package argument is a lockfile install (`npm install` bare). Guard on
    // argExempt so an install whose only argument was an excluded PATH is counted once, not twice.
    if (specs.length === 0) {
      if (head.kind === "install" && argExempt === 0) exempt += 1;
      continue;
    }

    for (const spec of specs) out.push({ reason: classifySpec(spec), ref: spec });
  }

  return { out, exempt };
}


// Join shell continuation lines (trailing `\\`) into logical lines. The first physical line number
// is preserved for findings — a continued `npm install \\` / `pkg@latest` pair reports line 1.
function joinContinuations(lines) {
  const logical = [];
  let i = 0;
  while (i < lines.length) {
    const line = i + 1;
    let text = lines[i];
    i += 1;
    while (text.trimEnd().endsWith("\\") && i < lines.length) {
      text = `${text.trimEnd().slice(0, -1)} ${lines[i].trimStart()}`;
      i += 1;
    }
    logical.push({ text, line });
  }
  return logical;
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

    for (const { text, line } of joinContinuations(lines)) {
      const { out, exempt } = parseLine(text);
      skipped += exempt;
      for (const { reason, ref } of out) {
        checked += 1;
        if (reason !== null) violations.push({ file: rel, line, ref, reason });
      }
    }
  }

  emit(
    { checked, skipped, files: found.map((f) => f.rel.split(sep).join("/")), violations },
    violations.length > 0 ? 1 : 0,
  );
}

main();
