# PLAN — drop floating `npm@latest` from publish; assert the floor; gate floating installs

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: delete the `npm install -g npm@latest` step from `.github/workflows/publish.yml`, replace it with a dependency-free **Assert npm floor** step, and add a floor gate that makes the absence of floating installs in workflow `run:` lines **enforced** rather than verified-once.
- layer(s): repo CI (`.github/workflows/`) + the deterministic floor (`.dev/floor/`) + user-facing docs (`docs/`) — not a PHARN capability layer (`ARCHITECTURE.md §4` does not govern `.github/`)
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Scope decision recorded at GATE 1 (human, 2026-08-10)

The build prompt scoped this to two files and filed the gate extension as "offered, not bundled —
raise it at the HALT as a yes/no; do not build it here." Raised; the human answered **build it in
this PR**. That is the prompt's own mechanism resolving in favour of a wider scope, so the whitelist
is **deliberately expanded** from 2 files to 4. Recorded here rather than absorbed silently, because
the plan is the versioned intent record and `/pharn-dev-build` builds only what this file names.

Consequence stated plainly: this PR now carries **two axes** (fix the instance; enforce the class) —
the same shape as #79, and the third bend of the one-axis note (#76, #79, here). The
node-version-policy follow-up remains **out**.

## Discovery — live state read this run (P6)

Every claim below was read from disk or the network on 2026-08-10, this run. Nothing is asserted
from memory.

| # | Claim | How verified this run | Result |
| - | ----- | --------------------- | ------ |
| 1 | Base is latest `main`, `e08eb18` | `git log --oneline -3` | `e08eb18 fix(floor): close 14 coverage holes in the action-pin gate (#80)`; working tree clean |
| 2 | `publish.yml` matches the finding | `cat -n .github/workflows/publish.yml` | step at **`:32-33`** (`- name: Update npm # Trusted Publishing requires npm >= 11.5.1` / `run: npm install -g npm@latest`); OIDC comments `:6-10`; `permissions: id-token: write` `:17`; `environment: npm-publish` `:22`; `node-version: 24` `:29`; tag-check `:36-40`; `npm publish --provenance --access public` `:46` |
| 3 | **LOAD-BEARING** — the node the runner installs bundles npm >= 11.5.1 | `git ls-remote --tags https://github.com/nodejs/node 'v24.*'` → latest released tag; then `curl` that tag's `deps/npm/package.json` | tag **`v24.19.0`** → bundled npm **`11.17.0`** — **above** the 11.5.1 floor. **No HALT; the fallback branch is NOT taken.** |
| 4 | The floating step already crossed a major | `curl -s https://registry.npmjs.org/-/package/npm/dist-tags` | `"latest":"12.0.2"` — `@latest` has been resolving to a **major the workflow was never written against** |
| 5 | The 11.5.1 floor number itself is correct | `docs.npmjs.com/trusted-publishers` | *"Trusted publishing requires npm CLI version 11.5.1 or later and Node version 22.14.0 or higher."* — the workflow's own claim is **confirmed by npm**, not merely inherited. (Node 24 also clears the 22.14.0 half.) |
| 6 | This is the **only** floating tool pull in any workflow | `grep -rn "npm@latest\|install -g\|curl\|wget\|@latest" .github/workflows/` | exactly two hits: `publish.yml:33` (this finding) and `gitleaks.yml:37` — the latter is **pinned by version + SHA-256** (`GITLEAKS_VERSION`/`GITLEAKS_SHA256`, `sha256sum --check`), i.e. not floating. `npm ci` is lockfile-pinned everywhere. **No second floating pull.** |
| 7 | `docs/RELEASING.md` narrates the doomed step | `cat -n docs/RELEASING.md` | **line 48**: ``  `npm@latest` (Trusted Publishing needs npm >= 11.5.1), re-runs the full check `` — becomes false the moment the step is deleted |
| 8 | `check-action-pins` cannot cover a `run:` line, and IS live-wired | read `.dev/floor/check-action-pins.mjs` (`USES_KEY_RE` `:79`) + `.dev/features/floor-gate-action-pins/PLAN.md:29-33` | contract is `uses:` refs only. Wiring: its repo-consistency test is auto-collected by `floor.yml:28`'s `node --test ".dev/**/*.test.mjs"` glob on every PR — **the new gate inherits that wiring with zero workflow change**. Also: the checker deliberately treats a `run:` line containing the literal text `uses:` as a ref (fail-closed noise, `:76-78`) — so the new step's body must contain no `uses:` substring. |
| 9 | `ci.yml` must NOT get the assert | `cat -n .github/workflows/ci.yml` | `node-version: 20` (`:20`) → bundled npm ~10.x, **below** the floor **by design**. Adding the assert there would break CI. Confirms the "publish-only" constraint. |
| 10 | Formatting gates do not touch `.github/**` or `.dev/**` | `package.json` scripts + `.prettierignore` + `.markdownlint-cli2.jsonc` | `format:check` globs `src/**`, `tests/**`, `*.config.ts`; `lint` is `eslint src`; `lint:md` covers `docs/**/*.md` + `*.md`. So **only** the RELEASING.md edit faces a style gate |
| 11 | Floor checkers are standalone by convention | `grep -n "from \"\./" .dev/floor/*.mjs` | **zero** relative imports across all 40+ floor scripts — every checker is a self-contained, stdlib-only program. The new gate follows that convention (see residual R2) |
| 12 | The live repo is currently clean under the existing gate | `node .dev/floor/check-action-pins.mjs .` | `{"checked":10,"skipped":0,...,"violations":[]}` exit 0 — the baseline the new gate must not disturb |
| 13 | Every workflow `run:` line the new gate will see | `cat -n` of all five workflows | `npm ci` ×2 (lockfile), `npm run <script>` ×6 (not an install), `npm publish` ×1, the gitleaks `curl`/`tar`/`sha256sum` block, `node …` ×3. **Nothing in the live repo trips the new rule** — asserted, not assumed, by the gate's live test |

## Files

- `.github/workflows/publish.yml` — delete the `Update npm` step (`:32-33`); add the **Assert npm floor** step in its place — layer: repo CI
- `docs/RELEASING.md` — rewrite the step-5 narration (lines 47-52) so it describes the assert instead of the install — layer: user-facing docs
- `.dev/floor/check-run-pins.mjs` — **new.** The gate: walk the same workflow/action definitions, classify every package spec in a recognized install/exec invocation, emit JSON + exit 0/1 — layer: floor
- `.dev/floor/check-run-pins.test.mjs` — **new.** Hermetic fixture tests **plus** a live repo-consistency test (auto-collected by `floor.yml:28`) — layer: floor

Nothing else. **No `CHANGELOG.md`** (workflow-only precedent, re-verified against #79: `git show --stat df20555` touched no changelog). **No `floor.yml` change** — Discovery #8 shows the runner already collects the new test.

## Part 1 — the literal diff (publish.yml + RELEASING.md)

```diff
--- a/.github/workflows/publish.yml
+++ b/.github/workflows/publish.yml
@@ -29,8 +29,25 @@ jobs:
           node-version: 24
           cache: npm
           registry-url: https://registry.npmjs.org
-      - name: Update npm # Trusted Publishing requires npm >= 11.5.1
-        run: npm install -g npm@latest
+      # Trusted Publishing requires npm >= 11.5.1 (npm's own docs; it also requires
+      # node >= 22.14.0). node 24 already BUNDLES a satisfying npm — 11.17.0 at the
+      # released v24.19.0, checked 2026-08-10 — so the floor needs no install, only
+      # enforcement. This step therefore ASSERTS the floor instead of pulling
+      # `npm@latest` at publish time: the release job, which holds `id-token: write`
+      # and the `npm-publish` environment, now downloads no third-party tool at all.
+      # (The deleted step had silently crossed a major — the registry `latest`
+      # dist-tag is npm 12.0.2 as of 2026-08-10.) Pure node stdlib, no network.
+      - name: Assert npm floor
+        run: |
+          set -euo pipefail
+          node -e '
+            const parse = (v) => {
+              const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? "").trim());
+              if (!m) { console.error(`npm floor: unparseable version ${JSON.stringify(v)}`); process.exit(1); }
+              return m.slice(1, 4).map(Number);
+            };
+            const [found, floor] = process.argv.slice(1);
+            const f = parse(found), n = parse(floor);
+            if ((f[0] - n[0] || f[1] - n[1] || f[2] - n[2]) < 0) {
+              console.error(`npm floor NOT met: found ${found.trim()}, need >= ${floor} (npm Trusted Publishing minimum)`);
+              process.exit(1);
+            }
+            console.log(`npm floor OK: npm ${found.trim()} >= ${floor}`);
+          ' "$(npm --version)" 11.5.1
       - name: Install
         run: npm ci
```

```diff
--- a/docs/RELEASING.md
+++ b/docs/RELEASING.md
@@ -44,11 +44,13 @@
 4. **Cut a GitHub Release.** Tag it **`vX.Y.Z`**, where `X.Y.Z` **exactly
    matches** `package.json` `version`. A guard step in `publish.yml` fails the
    run if the tag (minus its leading `v`) does not equal the package version.
-5. **Publishing the Release triggers `publish.yml`.** It runs on node 24 with
-   `npm@latest` (Trusted Publishing needs npm >= 11.5.1), re-runs the full check
-   suite and build (via the `prepublishOnly` + `prepack` hooks), verifies the
-   tag, then runs `npm publish --provenance --access public`. The `--provenance`
-   flag overrides `publishConfig.provenance: false`, so the release carries a
-   signed provenance attestation.
+5. **Publishing the Release triggers `publish.yml`.** It runs on node 24, whose
+   bundled npm already satisfies the npm >= 11.5.1 that Trusted Publishing
+   needs — an **Assert npm floor** step enforces that and fails the run if it
+   ever stops being true, so nothing is installed at publish time. The run then
+   re-runs the full check suite and build (via the `prepublishOnly` + `prepack`
+   hooks), verifies the tag, and runs `npm publish --provenance --access
+   public`. The `--provenance` flag overrides `publishConfig.provenance: false`,
+   so the release carries a signed provenance attestation.
```

## Part 2 — the gate (`check-run-pins.mjs`), contract pinned before code

Deliberately modelled on `check-action-pins.mjs`: same file enumeration (workflows flat +
`.github/actions/**/action.y[a]ml` recursive, symlink-refusing, depth-bounded), same all-three-line-
endings split, same `{checked, skipped, files, violations}` output, same enum `reason`, same
`emit()` (set `exitCode`, never `process.exit`, so piped stdout cannot truncate).

**What it enumerates.** Every non-comment line of those files. It is a **line scanner, not a YAML
parser** — the same honest bound `check-action-pins` states, and it removes the entire block-scalar-
tracking bug class: a `run: |` body needs no scope tracking because *every* line is scanned.

**Recognized invocations** (longest-prefix token match, matched at ANY token position so `run:`,
`- run:`, `sudo`, `env FOO=1`, and `&&` chains all work uniformly):

| Kind | Heads | Package-spec positions |
| ---- | ----- | ---------------------- |
| `install` | `npm install`/`npm i`/`npm add`, `pnpm install`/`pnpm i`/`pnpm add`, `yarn add`, `yarn global add`, `bun install`/`bun i`/`bun add` | **every** non-flag arg |
| `exec` | `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx` | the **first** non-flag arg, plus the value of `-p`/`--package` |
| `lockfile` | `npm ci`, `pnpm ci`, and any `install` head with **zero** package args | none — counted in `skipped`, never a violation |

**Classification of one package spec** (`reason`, an enum — P5 membership, never prose):

| Spec | Reason |
| ---- | ------ |
| `pkg@1.2.3`, `@scope/pkg@1.2.3-rc.1`, `pkg@1.2.3+build` | *conforms* — exact semver |
| `pkg@latest`, `pkg@next`, `pkg@^1.2.3`, `pkg@~1.2`, `pkg@1.x`, `pkg@>=2` | `floating-version` |
| `pkg`, `@scope/pkg`, `github:user/repo` | `unpinned-package` |
| `pkg@${{ … }}`, `pkg@$VER` | `unpinnable-version` |
| a file the walk could not stat/read | `unreadable-file` |

**Deterministic exclusions, each with a reason** (P5 — enumerated, not judged):

1. A line whose first non-space char is `#` — a YAML comment is never executed. *(This is what keeps the new publish.yml comment block, which mentions `npm@latest` in prose, from tripping the gate — and the gate's own test asserts exactly that.)*
2. A line declaring a `name:` key **and no `run` key** — a step name is never executed. The second half is load-bearing: it keeps the flow-mapping form `- {name: x, run: npm i -g p@latest}` in scope.
3. Path-like args (`./`, `../`, `/`, `file:`, `*.tgz`, `*.tar.gz`) — a local install pulls nothing remote.

**What is NOT covered — named residuals, never claimed (P0):**

- **R1 — non-package-manager pulls.** `curl … | sh`, a raw binary download, `pip`/`go install`/`cargo install`/`brew`. `gitleaks.yml`'s `curl` is **deliberately** out of contract: it is version- *and* SHA-256-pinned, and teaching the gate to recognize "this curl is checksum-verified" would be a *classification*, which P5 forbids. Out of scope by construction, not by oversight.
- **R2 — enumerator duplication.** `collectFiles`/`safeLstat`/`isYaml`/`LINE_SPLIT_RE`/`emit` are duplicated from `check-action-pins.mjs`, so a future walker fix (the #80 class) must be applied twice. Extracting a shared module was rejected: Discovery #11 shows **zero** floor script imports another, and that isolation is itself a safety property (one module's bug cannot take down two gates). The cost is real and is named here, not hidden.
- **R3 — shell indirection.** A package name in a variable (`npm i -g "$PKG"`), `eval`, a heredoc, or base64 defeats a line scanner. Same class of residual `check-action-pins` names for exotic YAML.
- **R4 — the gate stays wired.** Nothing prevents a future edit deleting the test or `floor.yml:28`'s glob. Identical honest caveat to #79's.

**Direction of imprecision:** fail-**closed**, matching the house rule — an unrecognized shape is
reported, never silently passed. A `name:`-in-prose false positive is noise a human resolves.

## Contracts satisfied

- None in `pharn-contracts/` — this touches repo CI, the floor, and docs, not a PHARN capability or finding shape. Cited, not restated (P4).

## Evals to write (P1)

P1's vitest clause governs shipped CLI behavior (`tests/*.test.ts`); a workflow step and a floor
script are neither, and the floor's established test surface is `node:test` + `spawnSync` over the
CLI (`check-action-pins.test.mjs`). Both parts get real tests in that idiom.

**Part 1 — the assert** (the proof of record: `publish.yml` fires only on `release: published`, so a PR can never execute it):

- compare extracted **from `publish.yml` itself** → `11.5.0` → exit **1**; `11.5.1` → exit **0** (inclusive boundary); `11.17.0` → exit **0**; `12.0.2` → exit **0**. The program takes the version as `argv[1]`, so this needs no npm stubbing. *(Pre-verified against the candidate text this run: 1/0/0/0 as specified.)*

**Part 2 — `check-run-pins.test.mjs`** (hermetic fixtures, subprocess, `{exit, stdout JSON}` surface):

- `run: npm install -g npm@latest` → exit 1, `["floating-version"]` — **the exact line this PR deletes**
- `run: npm ci` → exit 0, `skipped: 1` — lockfile install is not a violation, and is **counted**
- `run: npm install` (bare) → exit 0, `skipped: 1` — zero package args = lockfile
- `run: npm install -g npm@11.5.1` → exit 0, `checked: 1` — an exact pin conforms
- `run: npm i -g typescript` → exit 1, `["unpinned-package"]`
- `run: npx tsx@4.7.0 x.ts` → exit 0 — exec-kind classifies the package, **not** the script arg
- `run: npx tsx x.ts` → exit 1, `["unpinned-package"]`
- `run: npm i -g pkg@${{ inputs.v }}` → exit 1, `["unpinnable-version"]` (not mislabeled floating)
- `run: pnpm add -g a@latest` / `yarn global add b@next` / `bunx c` → each exit 1 — the head table is real, not npm-only
- `run: npm ci && npm i -g x@latest` → exit 1 — `&&`-chained commands are split, the second is seen
- ★ `# npm install -g npm@latest` (a comment) → exit 0 — **the regression that protects this PR's own comment block**
- ★ `- name: npm install -g x@latest` (a step name, no `run`) → exit 0; but `- {name: n, run: npm i -g x@latest}` → exit 1 — exclusion #2's second half
- `@scope/pkg@1.2.3` → exit 0; `@scope/pkg` → exit 1 — the scoped-package `@` boundary
- `run: npm i ./local` and `file:../x` → exit 0 — path exclusion
- CRLF and lone-CR fixtures → the violation is still found (the ✱✱ regression class from #80, inherited by construction)
- a dangling symlink in `.github/actions/**` → exit 1, `unreadable-file`, JSON still emitted
- a composite `.github/actions/x/action.yml` with a floating install → exit 1 — the definition is walked, not just workflows
- ★ **live repo-consistency**: the checker over `REPO` exits 0, `violations: []`, with `checked`/`skipped` asserted **exactly** and the workflow-file list independently recounted — never bare exit 0, since exit 0 is also what a checker returns when it finds nothing to inspect

## Guarantee audit (P0)

| Claim | Reduction |
| ----- | --------- |
| "npm at publish time is >= 11.5.1" | **FLOOR — numeric membership test** (`ARCHITECTURE.md §2` primitive #3), executed *in the release job itself*: a three-part integer compare that exits non-zero naming both versions. Strictly stronger than what it replaces — an install whose success was never checked. |
| "No workflow `run:` line installs a floating package version" | **FLOOR — regex + enum** (primitive #3), enforced on **every PR** via `floor.yml:28`'s `node --test` glob (Discovery #8). This is the second real guarantee, and it is what converts the first part from a one-time fix into an invariant. **Bounded by R1/R3**: it covers the four JS package managers' install/exec forms, not every conceivable pull. |
| "The publish job downloads no third-party tool" | **FLOOR for the package-manager class** (the new gate); **ADVISORY beyond it** — R1 means a future `curl \| sh` would pass this gate. Verified absent today by grep; not guaranteed absent forever. Stated, not oversold. |
| "node 24 bundles npm 11.17.0" | **ADVISORY** — true at released `v24.19.0` on 2026-08-10 (Discovery #3), but `node-version: 24` floats within the major. Precisely why the assert exists: the advisory fact is **backstopped by the floor**, so no guaranteed decision rests on it (P0's two-part requirement). |
| "The assert program stays correct across future edits" | **ADVISORY** — the compare lives inline in the workflow; the new gate checks *installs*, not *asserts*, so nothing tests the inline text on future PRs. Phase C proves the shipped bytes once, against four inputs. Named, not hidden. |
| "`docs/RELEASING.md` describes what the workflow does" | **ADVISORY** (P4 discipline) — no gate ties prose to the workflow. |

## Trust audit (P2)

No untrusted artifact is ingested — this touches neither the pharn-oss fetch boundary nor
`lib/validate.ts`. The gate **reads** workflow files and copies the offending spec verbatim into its
`violations[].spec` output, so that string inherits the scanned file's trust — but **no decision
reads it**: the verdict is `violations.length > 0`, an integer test (the identical split
`check-action-pins.mjs:42-44` makes; fix #1). The increment moves P2's direction at the repo level:
it deletes the last place where the **highest-trust job** (`id-token: write` + the `npm-publish`
environment) executed third-party code resolved at run time. Residual: `runs-on: ubuntu-latest`
still floats — platform-level, out of this axis. `THREAT-MODEL.md` has **no CI/supply-chain
section** (grepped this run; its surfaces are the fetch boundary), so no trusted doc needs editing —
and none is agent-editable anyway (`protect-trusted-paths.cjs`).

## Determinism audit (P5)

- The assert's one branch is `(f[0]-n[0] || f[1]-n[1] || f[2]-n[2]) < 0` — integer comparison, never classification. Fallback is a **hard-fail, not a guess**: an unparseable `npm --version` exits 1 naming the raw value. No "ask" path exists or is appropriate — a release job has no human at the keyboard.
  - **CORRECTED after `/pharn-dev-grill` (P5 finding, disproven by execution).** This bullet originally also credited `set -euo pipefail` with killing the step if `npm --version` itself failed. It does not: a command substitution used as an **argument** does not trip `set -e` — `bash -c 'set -euo pipefail; echo "[$(nonexistent)]"; echo REACHED'` prints both lines and exits **0**. The fail-closed property rests **entirely on the parse**: a failing `npm --version` arrives as `""`, which is unparseable, which exits 1. `set -euo pipefail` is kept for `set -u` / `pipefail` hygiene, but it is **not** load-bearing here and is no longer claimed to be. The shipped `publish.yml` comment states this correctly.
- The gate's branches are all membership tests: head match against a fixed token table, arg against a fixed flag/path pattern, version against `EXACT_SEMVER_RE`. Every non-conforming shape lands in a **named enum reason**; nothing is classified by judgment, and the fallback is *report*, never *assume clean*.

## Named residual (do NOT fix here)

`node-version: 24` floats within the major, so the bundled npm floats across Node-vetted 11.x
releases. The assert catches any dip below the floor. Pinning node exactly is the
**node-version-policy follow-up**, now named a **third** time (M3, CI-matrix, here) — it has earned
its own ticket and is **not** this PR (P7).

## Open questions (HALT)

None — both were resolved at GATE 1: the compare ships **inline** (2-file whitelist for part 1), and
the gate extension **is built here** (whitelist expanded to 4 files, recorded above).
