// .dev/floor/check-run-pins.test.mjs — tests for the deterministic run-line pin floor check.
//
// NO `claude -p`, NO git, NO network. Three kinds of test, deliberately mixed (the split
// check-action-pins.test.mjs makes, plus one addition forced by this gate's shape):
//
//   1. HERMETIC — each builds a small repo in an os.tmpdir() scratch dir and asserts the public
//      surface (exit code + stdout JSON) by subprocess.
//   2. LIVE REPO-CONSISTENCY (the ★) — validates the COMMITTED tree against REALITY. This is what
//      makes a floating install a BUILD FAILURE rather than a property someone has to remember to
//      re-grep: floor.yml's `node --test ".dev/**/*.test.mjs"` collects this file on every
//      pull_request and every push to main, so the gate needs no workflow change to be wired.
//   3. POSITIVE CONTROL (the ★★) — the addition. This repo's live numbers are `checked: 0`,
//      because after the publish fix NO workflow line contains a pinned install at all. A live
//      assertion of `violations: []` over `checked: 0` is therefore weak in exactly the way exit 0
//      is weak: it is ALSO what a checker returns when it finds nothing to inspect. So the live
//      workflow text is read from disk, ONE line is mutated back to the `npm install -g npm@latest`
//      this increment deleted, and the checker must flag it — proving the scanner fires on THIS
//      repo's own file shape, not merely on synthetic fixtures.
//
// The ✱ tests are the defects found by running the first version of this checker against a fixture
// covering every planned case. Each was reproduced before being fixed:
//   ✱ `pkg@${{ inputs.v }}`  → whitespace-tokenized into THREE findings for one spec
//   ✱ `- {name: n, run: …}`  → the spec was reported as `flow@latest}` with the flow brace attached
//   ✱ `$(npm i -g x@latest)` → the `$(` prefix hid the head entirely — a silent MISS, not noise
//   ✱ `npm i ./local`        → counted `skipped` twice (path exemption + empty-args exemption)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // .dev/floor
const REPO = join(here, "..", ".."); // repo root
const CAP = join(here, "check-run-pins.mjs");
const SIBLING = join(here, "check-action-pins.mjs");

function run(targetDir, capPath = CAP) {
  return spawnSync(process.execPath, [capPath, targetDir], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function json(r) {
  return JSON.parse(r.stdout);
}
function scratch() {
  return mkdtempSync(join(tmpdir(), "pharn-runpins-"));
}
function reasons(r) {
  return json(r).violations.map((v) => v.reason);
}
function refs(r) {
  return json(r).violations.map((v) => v.ref);
}

// Build a scratch repo whose single workflow contains `body` verbatim under a steps: list.
function repoWith(body, { name = "ci.yml" } = {}) {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", name), `name: t\njobs:\n  j:\n    steps:\n${body}\n`);
  return root;
}
// The same, but writing the file bytes exactly as given (for line-ending fixtures).
function repoWithRaw(bytes, { name = "ci.yml" } = {}) {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", name), bytes);
  return root;
}

// ---------------------------------------------------------------------------
// Conforming shapes

test("an EXACT semver pin → exit 0, checked counts it", () => {
  const r = run(repoWith("      - run: npm install -g npm@11.5.1"));
  assert.equal(r.status, 0);
  assert.deepEqual(json(r).violations, []);
  assert.equal(json(r).checked, 1);
});

test("a prerelease / build-metadata version is still an exact pin", () => {
  for (const v of ["1.2.3-rc.1", "1.2.3+build.5", "1.2.3-beta.2+exp"]) {
    const r = run(repoWith(`      - run: npm i -g pkg@${v}`));
    assert.equal(r.status, 0, `expected ${v} to conform`);
  }
});

test("`npm ci` is a lockfile install → exit 0, counted in skipped (never a silent pass)", () => {
  const r = run(repoWith("      - run: npm ci"));
  assert.equal(r.status, 0);
  assert.equal(json(r).skipped, 1);
  assert.equal(json(r).checked, 0);
});

test("bare `npm install` (zero package args) is a lockfile install → skipped, not a violation", () => {
  const r = run(repoWith("      - run: npm install"));
  assert.equal(r.status, 0);
  assert.equal(json(r).skipped, 1);
});

test("`npm run <script>` and `npm publish` are not installs and are never classified", () => {
  const r = run(repoWith("      - run: npm run build\n      - run: npm publish --provenance --access public"));
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  assert.equal(json(r).skipped, 0);
});

test("a local path / file: / tarball arg pulls nothing from a registry → exempt, counted in skipped", () => {
  const r = run(repoWith("      - run: npm i ./local\n      - run: npm i file:../x\n      - run: npm i ./p.tgz"));
  assert.equal(r.status, 0);
  assert.deepEqual(json(r).violations, []);
  // ✱ each of the three counts ONCE — the path exemption must not also fire the empty-args exemption.
  assert.equal(json(r).skipped, 3);
});

// ---------------------------------------------------------------------------
// Violating shapes — the enum

test("`npm install -g npm@latest` → exit 1, floating-version (the exact line this increment deleted)", () => {
  const r = run(repoWith("      - run: npm install -g npm@latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["floating-version"]);
  assert.deepEqual(refs(r), ["npm@latest"]);
});

test("every floating specifier form is floating-version, not just a dist-tag", () => {
  for (const v of ["latest", "next", "beta", "^1.2.3", "~1.2", "1.x", ">=2", "1.2"]) {
    const r = run(repoWith(`      - run: npm i -g pkg@${v}`));
    assert.equal(r.status, 1, `expected @${v} to be flagged`);
    assert.deepEqual(reasons(r), ["floating-version"], `wrong reason for @${v}`);
  }
});

test("a bare package name → unpinned-package", () => {
  assert.deepEqual(reasons(run(repoWith("      - run: npm i -g typescript"))), ["unpinned-package"]);
});

test("a git / github spec has no version → unpinned-package", () => {
  assert.deepEqual(reasons(run(repoWith("      - run: npm i -g github:user/repo"))), ["unpinned-package"]);
});

test("✱ a ${{ }} expression version → ONE unpinnable-version finding, not three tokens", () => {
  const r = run(repoWith("      - run: npm i -g pkg@${{ inputs.version }}"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unpinnable-version"]);
});

test("a shell variable version → unpinnable-version (not mislabeled floating)", () => {
  assert.deepEqual(reasons(run(repoWith("      - run: npm i -g pkg@$VERSION"))), ["unpinnable-version"]);
});

// ---------------------------------------------------------------------------
// Scoped packages — the `@` boundary

test("@scope/pkg@1.2.3 conforms; @scope/pkg alone is unpinned (the scope sigil is not a separator)", () => {
  assert.equal(run(repoWith("      - run: npm i -g @scope/pkg@1.2.3")).status, 0);
  const r = run(repoWith("      - run: npm i -g @scope/pkg"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unpinned-package"]);
  assert.deepEqual(refs(r), ["@scope/pkg"]);
});

// ---------------------------------------------------------------------------
// exec-kind — only the package position is a spec

test("`npx tsx@4.7.0 src/index.ts` → exit 0: the script argument is NOT a package", () => {
  const r = run(repoWith("      - run: npx tsx@4.7.0 src/index.ts"));
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 1); // exactly one spec classified, not two
});

test("`npx tsx src/index.ts` → exit 1 on the package only", () => {
  const r = run(repoWith("      - run: npx tsx src/index.ts"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["tsx"]);
});

test("`npx -p pkg@1.5.0 cmd` reads the -p VALUE as the package and the positional as the command", () => {
  const r = run(repoWith("      - run: npx -p cowsay@1.5.0 cowsay hi"));
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 1);
});

test("`npx --package=pkg cmd` with no version → unpinned-package on the flag value", () => {
  const r = run(repoWith("      - run: npx --package=cowsay cowsay hi"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["cowsay"]);
});

test("the head table is not npm-only — pnpm / yarn / bun / bunx / dlx are all recognised", () => {
  const cases = [
    ["pnpm add -g a@latest", "floating-version"],
    ["pnpm dlx b", "unpinned-package"],
    ["yarn global add c@next", "floating-version"],
    ["yarn add d", "unpinned-package"],
    ["yarn dlx e", "unpinned-package"],
    ["bun add -g f@latest", "floating-version"],
    ["bunx g", "unpinned-package"],
    ["npm exec h", "unpinned-package"],
  ];
  for (const [cmd, reason] of cases) {
    const r = run(repoWith(`      - run: ${cmd}`));
    assert.equal(r.status, 1, `expected \`${cmd}\` to be flagged`);
    assert.deepEqual(reasons(r), [reason], `wrong reason for \`${cmd}\``);
  }
});

// ---------------------------------------------------------------------------
// Line-shape handling

test("chained commands are split — the SECOND command is not hidden by the first", () => {
  const r = run(repoWith("      - run: npm ci && npm i -g x@latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["x@latest"]);
  assert.equal(json(r).skipped, 1); // the `npm ci` half still counted
});

test("a `sudo` / `env` prefix does not hide the command (the head is matched at any position)", () => {
  assert.equal(run(repoWith("      - run: sudo npm i -g p@latest")).status, 1);
  assert.equal(run(repoWith("      - run: env FOO=1 npm i -g p@latest")).status, 1);
});

test("✱ a $( ) command substitution does not hide the head (this was a silent MISS)", () => {
  const r = run(repoWith("      - run: $(npm i -g hidden@latest)"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["hidden@latest"]);
});

test("✱ a flow-mapping step reports the spec WITHOUT the trailing brace", () => {
  const r = run(repoWith("      - {name: n, run: npm i -g flow@latest}"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["flow@latest"]);
});

test("a quoted spec cannot smuggle a floating version past the version test", () => {
  assert.deepEqual(reasons(run(repoWith(`      - run: npm i -g "pkg@latest"`))), ["floating-version"]);
  assert.deepEqual(reasons(run(repoWith(`      - run: npm i -g 'pkg@latest'`))), ["floating-version"]);
});

test("a run: | block scalar body is scanned with no scope tracking (every line is scanned)", () => {
  const r = run(repoWith("      - run: |\n          set -e\n          npm i -g deep@latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["deep@latest"]);
});

test("shell continuation lines (trailing \\) are joined — package args on the next line classify", () => {
  const r = run(repoWith("      - run: npm install \\\n          pkg@latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["pkg@latest"]);
  assert.equal(json(r).violations[0].line, 5); // first physical line of the continued command
});

test("a continued exact pin conforms", () => {
  const r = run(repoWith("      - run: npm install -g \\\n          npm@11.5.1"));
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 1);
});

test("continuation inside a run: | block is joined before parsing", () => {
  const r = run(repoWith("      - run: |\n          npm i -g \\\n              deep@latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["deep@latest"]);
});

// ---------------------------------------------------------------------------
// Deterministic exclusions — and the fail-OPEN holes they must NOT create

test("★ a YAML comment is never executed → exit 0 (this protects publish.yml's own comment block)", () => {
  const r = run(repoWith("      # npm install -g npm@latest"));
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
});

test("★ a step NAME is never executed → exit 0; but the same line with a run key IS scanned", () => {
  assert.equal(run(repoWith("      - name: npm install -g inprose@latest")).status, 0);
  assert.equal(run(repoWith("      - {name: n, run: npm i -g flow@latest}")).status, 1);
});

test("★ the name-exclusion is ANCHORED — `echo \"name: x\" && npm i -g p@latest` is NOT skipped", () => {
  // An unanchored `name:` test would swallow this whole line: a fail-OPEN miss, not noise.
  const r = run(repoWith(`      - run: echo "name: x" && npm i -g sneaky@latest`));
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["sneaky@latest"]);
});

// ---------------------------------------------------------------------------
// File enumeration — inherited hard-won behavior

test("CRLF line endings do not hide a violation (whole file was invisible in the sibling gate)", () => {
  const root = repoWithRaw("name: t\r\njobs:\r\n  j:\r\n    steps:\r\n      - run: npm i -g p@latest\r\n");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["p@latest"]);
});

test("lone-CR (classic Mac) line endings do not collapse the file into one invisible line", () => {
  const root = repoWithRaw("name: t\rjobs:\r  j:\r    steps:\r      - run: npm i -g p@latest\r");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["p@latest"]);
});

test("an UPPERCASE workflow filename is still opened", () => {
  const r = run(repoWith("      - run: npm i -g p@latest", { name: "CI.YML" }));
  assert.equal(r.status, 1);
  assert.equal(json(r).files.length, 1);
});

test("a local composite action's run: is walked — it is not a laundering path", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "actions", "setup"), { recursive: true });
  writeFileSync(
    join(root, ".github", "actions", "setup", "action.yml"),
    "name: setup\nruns:\n  using: composite\n  steps:\n    - run: npm i -g sneaky@latest\n      shell: bash\n",
  );
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(refs(r), ["sneaky@latest"]);
});

test("a dangling symlink in workflows/ is a VIOLATION, not a skip, and JSON is still emitted", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  symlinkSync(join(root, "nope"), join(root, ".github", "workflows", "d.yml"));
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unreadable-file"]);
  assert.deepEqual(json(r).files, []); // it was never opened, and says so
});

// This pins CURRENT, INHERITED behavior rather than desired behavior — see the R6 residual in
// check-run-pins.mjs. A symlinked action.yml is skipped SILENTLY by the .github/actions/** walk,
// while the same symlink under .github/workflows/ is reported. Both gates agree (verified by
// running check-action-pins.mjs against the identical fixture), so this test exists to make the
// asymmetry VISIBLE and to fail loudly if either gate changes it unilaterally.
test("a symlinked action.yml is currently skipped silently — asymmetry pinned, both gates agree", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "actions", "x"), { recursive: true });
  symlinkSync(join(root, "nope"), join(root, ".github", "actions", "x", "action.yml"));

  const mine = run(root);
  const sibling = run(root, SIBLING);
  assert.equal(mine.status, 0);
  assert.deepEqual(json(mine), { checked: 0, skipped: 0, files: [], violations: [] });
  assert.equal(sibling.status, 0);
  assert.deepEqual(json(mine).violations, json(sibling).violations, "the two gates must agree on symlink handling");
});

test("a repo with no .github at all emits valid JSON and exits 0", () => {
  const r = run(scratch());
  assert.equal(r.status, 0);
  assert.deepEqual(json(r), { checked: 0, skipped: 0, files: [], violations: [] });
});

test("a large violation set survives the pipe (stdout must not be truncated)", () => {
  const body = Array.from({ length: 2000 }, (_, i) => `      - run: npm i -g pkg${i}@latest`).join("\n");
  const r = run(repoWith(body));
  assert.equal(r.status, 1);
  assert.equal(json(r).violations.length, 2000);
});

// ---------------------------------------------------------------------------
// ★ LIVE REPO-CONSISTENCY — the committed tree, not a fixture

test("★ the live repo has NO floating install in any workflow run: line", () => {
  const r = run(REPO);
  const d = json(r);
  assert.deepEqual(d.violations, [], `unexpected violations: ${JSON.stringify(d.violations)}`);
  assert.equal(r.status, 0);

  // `npm ci` in ci.yml (one per gate job) and publish.yml — asserted EXACTLY, so an exemption can
  // never become a silent hole. If this number changes, a lockfile install was added or removed on purpose.
  assert.equal(d.skipped, 7);

  // Independent recount of the enumerated workflow files, case-insensitively — exit 0 is also what
  // a checker returns when it opened nothing.
  const expected = readdirSync(join(REPO, ".github", "workflows"))
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((f) => `.github/workflows/${f}`);
  assert.deepEqual(d.files, expected);
  assert.ok(expected.length >= 5, "expected at least five workflows in this repo");
});

test("★ publish.yml carries no `npm install -g` and no `@latest` at all", () => {
  const text = readFileSync(join(REPO, ".github", "workflows", "publish.yml"), "utf8");
  const code = text
    .split(/\r\n|\r|\n/)
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");
  assert.ok(!/install\s+-g/.test(code), "publish.yml reintroduced a global install");
  assert.ok(!/@latest/.test(code), "publish.yml reintroduced an @latest ref");
});

// Closes residual R5. The CHECKER cannot enforce that a step EXISTS — it only classifies package
// specs it finds, so deleting the assert outright would trip nothing in check-run-pins.mjs. This
// assertion covers the other half, in the same place and by the same runner (floor.yml's
// `node --test`), so the increment's headline guarantee is protected against BOTH reversion to a
// floating install AND plain deletion. It reads the committed file; it never executes it.
test("★ publish.yml still ENFORCES the npm floor — the assert step and its floor value are present", () => {
  const text = readFileSync(join(REPO, ".github", "workflows", "publish.yml"), "utf8");
  const code = text
    .split(/\r\n|\r|\n/)
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  assert.match(code, /- name: Assert npm floor$/m, "the `Assert npm floor` step was removed from publish.yml");
  assert.match(code, /"\$\(npm --version\)" 11\.5\.1/, "the assert no longer compares npm --version against 11.5.1");
  // The floor value must agree with npm's documented Trusted Publishing minimum. If npm ever raises
  // it, this fails loudly rather than letting publish.yml assert a stale number.
  assert.ok(code.includes("11.5.1"), "the 11.5.1 Trusted Publishing floor is no longer named in publish.yml");
});

// ---------------------------------------------------------------------------
// ★★ POSITIVE CONTROL — prove the scanner fires on THIS repo's own file shape.
// The live assertions above pass with `checked: 0`, which is also what a broken scanner reports.

test("★★ mutating the live publish.yml back to `npm install -g npm@latest` IS caught", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  const live = readFileSync(join(REPO, ".github", "workflows", "publish.yml"), "utf8");

  // Re-insert the deleted step verbatim, into the real file's real surroundings.
  const mutated = live.replace(
    /^(\s*)- name: Assert npm floor$/m,
    "$1- name: Update npm\n$1  run: npm install -g npm@latest\n$1- name: Assert npm floor",
  );
  assert.notEqual(mutated, live, "the anchor step was not found — this control is not exercising anything");
  writeFileSync(join(root, ".github", "workflows", "publish.yml"), mutated);

  const r = run(root);
  assert.equal(r.status, 1, "the gate did NOT catch the very line this increment removed");
  assert.deepEqual(reasons(r), ["floating-version"]);
  assert.deepEqual(refs(r), ["npm@latest"]);
});

// ---------------------------------------------------------------------------
// R2 backstop — the two duplicated walkers must not drift apart silently

test("★ this gate and check-action-pins enumerate the SAME files for the live repo", () => {
  assert.deepEqual(json(run(REPO)).files, json(run(REPO, SIBLING)).files);
});

// ---------------------------------------------------------------------------
// Cleanup: scratch dirs live under os.tmpdir(); remove the ones this file made.

test("cleanup", () => {
  for (const d of readdirSync(tmpdir())) {
    if (d.startsWith("pharn-runpins-")) rmSync(join(tmpdir(), d), { recursive: true, force: true });
  }
});
