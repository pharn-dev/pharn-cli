# PLAN — ci-matrix-os-node (M7)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Expand `ci.yml` from one cell (`ubuntu-latest` × node 20) to a 5-cell OS×Node matrix, pin source bytes to LF, turn "no soft tier" from discipline into a floor gate, and **measure** the result by pushing a draft PR and reading the real cells before deciding the final shape.
- layer(s): repo tooling / CI definitions + `.dev/floor` (repo infrastructure — the same layer as `floor.yml` and the `check-*-pins` gates that fence it; outside `ARCHITECTURE.md §4`'s product tree)
- constitution_refs: [P0, P1, P5, P6, P7]
- status: **APPROVED at GATE 1** (2026-08-11) with three amendments — recorded in "GATE 1 decisions" below.

## Live state read this run (P6 — nothing asserted from memory)

| Fact | Measured | How |
| --- | --- | --- |
| Base | `21db522`, `origin/main` synced (identical SHAs) | `git rev-parse HEAD origin/main` |
| Brief's base `dd8af18` | **is an ancestor** of HEAD; 6 intervening commits | `git merge-base --is-ancestor` |
| Drift in `.github/` since `dd8af18` | **none** — `git diff --stat dd8af18..HEAD -- .github/` is empty | `git diff` |
| Intervening commits | 5 dependency bumps (#83–#87) + `3d5052e` M5 lint-gate (#90) + its loop artifacts | `git log` |
| `ci.yml` shape | ONE job `check`, `ubuntu-latest`, `node-version: 20`, six gates via `always() && steps.install.outcome == 'success'`, `Test` = `npm run test:coverage` | read `.github/workflows/ci.yml` |
| Action digests | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`, `persist-credentials: false` | read `ci.yml:15-21` |
| CRLF in tracked files | **zero** — `git grep -I -l $'\r'` returns empty | `git grep` |
| `.gitattributes` | **absent** | `ls` |
| `continue-on-error` in `.github/**` | **zero occurrences** — the new gate starts from a clean tree | `grep -rn .github/` (exit 1) |
| `.github/actions/` | **does not exist** — so the gate's composite-action walk is *vacuous on this repo today* (covered by hermetic fixtures, not by the live tree) | `ls -d` |
| `engines` | `{ "node": ">=20" }`; version `0.4.0` | read `package.json` |
| Workflows present | `ci.yml`, `codeql.yml`, `floor.yml`, `gitleaks.yml`, `publish.yml` | `ls .github/workflows/` |

**Base drift verdict: NOT material.** The brief's §0 description of `ci.yml`, the six-gate pattern, `engines`, and the `.gitattributes` absence all match byte-for-byte. The CRLF check is empty, so the `.gitattributes` renormalization is still a verified no-op. No HALT condition from §5 is tripped by the base.

**One fact the brief predates** (landed in `3d5052e`, after `dd8af18`): `tests/lint-gate.test.ts` resolves the repo root from `import.meta.url` **and** spawns eslint against scratch files. It is both a repo-bytes reader and a spawn-based self-test — i.e. it sits in *two* of the risk classes this matrix exists to measure, and no runner has ever executed it outside `ubuntu × 20`. Recorded as an added reason the probe is worth running, not as a predicted failure.

## GATE 1 decisions (human, 2026-08-11 — these amend the pre-approval draft)

1. **Approved as written**, and the outward-facing step is authorized: create branch → push → open a **draft** PR. Nothing further — no merge, no ready-for-review flip, no branch-protection change.
2. **The soft-tier fence IS built in this increment** (draft recommended deferring; overruled). The whitelist widens by one named item — `.dev/floor/check-soft-tier.mjs` + its `.test.mjs`. "No soft tier" stops being a promise and becomes floor primitive #3.
3. **Coverage runs on EVERY cell** (draft proposed canonical-cell-only; overruled). Consequences, all simplifications: no `matrix.coverage` key, all six steps uniform across cells, and **`CLAUDE.md:23` is dropped from the whitelist** — `(CI runs this)` stays true unedited.
4. **`fail-fast: false` is permanent**, not probe-only.

## Files

- `.github/workflows/ci.yml` — replace the single `check` job with a 5-cell `strategy.matrix` (`fail-fast: false`), explicit `name: ${{ matrix.os }} / node ${{ matrix.node }}`, six gates reused verbatim — layer: repo CI definition
- `.gitattributes` — **new**, one line `* text=auto eol=lf` — layer: repo-wide byte policy
- `.dev/floor/check-soft-tier.mjs` — **new**, deterministic scanner: no `continue-on-error` key anywhere in `.github/workflows/*.{yml,yaml}` or `.github/actions/**/action.{yml,yaml}` — layer: floor (primitive #3)
- `.dev/floor/check-soft-tier.test.mjs` — **new**, hermetic fixtures + a `★ LIVE REPO-CONSISTENCY` block against the real tree (P1) — layer: floor test
- `CHANGELOG.md` — one entry under `## [Unreleased] → ### Added`, following the `:279` "Repo-health tooling" precedent — layer: docs
- `src/lib/apply-update.ts` — **HALT-1 line-item R1, approved 2026-08-11.** Make `readDiskState`'s absent-vs-unreadable split errno-free, fixing the Windows red cell — layer: `lib/`

### The proposed `ci.yml` shape

```yaml
jobs:
  check:
    name: ${{ matrix.os }} / node ${{ matrix.node }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: ubuntu-latest, node: 20 }
          - { os: ubuntu-latest, node: 22 }
          - { os: ubuntu-latest, node: 24 }
          - { os: windows-latest, node: 24 }
          - { os: macos-latest, node: 24 }
```

The six steps stay **byte-identical in body** to today's — `npm ci`, then `format:check` / `lint` / `lint:md` / `typecheck` / `test:coverage` / `build`, each behind `if: ${{ always() && steps.install.outcome == 'success' }}`. Only `runs-on` and `node-version` become expressions. With coverage now uniform (decision 3), the "six-gate pattern preserved verbatim" claim is exactly true — per cell **and** per file; the draft's seventh-step caveat is gone.

**The explicit `name:` is load-bearing, not decoration.** Without it GitHub derives each check's name from *every* matrix key — so any future key added to `include` would silently rename all five required checks and re-break branch protection. Pinning `name:` to `os` + `node` fixes the check identity against that.

### The soft-tier gate — shape, enforcement, and honest residuals

`check-soft-tier.mjs` follows the house style of its two neighbours exactly: Node stdlib only, no network, no `child_process`, no dynamic import; a **line scanner**, not a YAML parser; unrecognised shapes fail **toward flagging**.

- **Enumerates** the same two sets `check-action-pins.mjs` does, for the same reason: `.github/workflows/*.{yml,yaml}` (non-recursive, mirroring GitHub) **and** `.github/actions/**/action.{yml,yaml}` (recursive) — a composite action is a laundering path if only call sites are scanned.
- **Violation = the presence of a `continue-on-error:` key, value-blind.** `false` is rejected along with `true`. This is deliberate: reading the value would make the verdict depend on untrusted file content, whereas `violations.length > 0` is an integer test (the same P2/fix-#1 discipline `check-action-pins.mjs` states for its `ref` field). It also catches the experimental-cell laundering shape `continue-on-error: ${{ matrix.experimental }}` without needing to know what `matrix.experimental` is.
- **Enforcement (outside the scanned workflow surface):** `floor.yml` runs `node .dev/floor/check-soft-tier.mjs .` directly (not only via its test file), and the `main protection` ruleset requires the `floor` status check. The `★ LIVE REPO-CONSISTENCY` block in `check-soft-tier.test.mjs` is retained as a third anti-vacuity residual on top of both wires.
- **Named residuals** (stated, never claimed closed):
  - **R1 — other required checks are still a REPO-SETTINGS property.** This gate guarantees no workflow *asks* to be soft, and `floor` itself is now required on `main`; a *different* job left out of the required list (e.g. a matrix cell) remains invisible to this scanner. The operational note for those names still goes to the human by hand.
  - **R2 — SHELL-LEVEL SWALLOWING.** `run: npm test || true`, `set +e`, a trailing `|| exit 0` — a soft tier written in bash rather than YAML. Detecting it is classification, which P5 forbids. Out of contract by construction.
  - **R3 — ENUMERATOR DUPLICATION.** `collectFiles`/`isYaml`/`safeLstat` are duplicated from `check-action-pins.mjs`, because **no floor script imports another** and that isolation is a safety property (one module's bug cannot take down two gates) — the identical trade `check-run-pins.mjs` documents as its R2. Mitigated the same way: the test cross-checks that this scanner's `files[]` equals `check-action-pins.mjs`'s for this repo, so the two walkers cannot drift silently.

## Contracts satisfied

- None in `pharn-contracts`. This increment adds no Capability, no `rule_id`, and no inter-layer contract — it changes where the **existing** gates execute, and adds one floor gate. Recorded explicitly so the absence is a finding, not an omission (P4).

## Evals to write (P1)

The matrix and `.gitattributes` add no product behavior — `src/**` is untouched, and every gate the matrix runs is an existing, already-tested gate. **The soft-tier gate does add behavior, so P1 binds it**, and it is tested in the `.mjs` floor-test style its two neighbours established (collected by `floor.yml`'s `node --test`, not by vitest — matching precedent, not inventing a home):

- clean workflow fixture → exit 0, `violations: []`
- `continue-on-error: true` on a step → exit 1, violation carries `{file, line}`
- `continue-on-error: false` → exit 1 — **pins the value-blind choice**, so a later "helpful" relaxation is a test failure, not a silent drift
- `continue-on-error: ${{ matrix.experimental }}` → exit 1 — the experimental-cell laundering shape
- quoted-key and leading-whitespace variants → flagged (line-scanner tolerance)
- a violation inside `.github/actions/x/action.yml` → flagged — pins that the composite-action laundering path is walked
- a non-YAML file, and a file in a *subdirectory* of `.github/workflows/` → skipped (mirrors GitHub's own non-recursive rule)
- `★ LIVE REPO-CONSISTENCY` — run against the **real repo**: exit 0, and `files[]` enumerates the live workflow directory (an anti-vacuity **lower bound**, so adding a workflow later never silently shrinks coverage)
- `★` cross-check — `files[]` is deep-equal to `check-action-pins.mjs`'s for this repo (the R3 anti-drift)

**What is deliberately NOT written:** a vitest test asserting `ci.yml` contains `"windows-latest"`. That asserts the file says what the file says — a tautology wearing a test's clothes, and precisely the "written in the config" mistaken for "guaranteed" disease P0 exists to prevent. **The execution proof is the probe**: five green cells on a real PR. That is why Phase A is empirical and HALT 1 is a results table.

## Guarantee audit (P0)

| Claim | Reduction |
| --- | --- |
| "The tests execute on Windows, macOS, and node 20/22/24" | **FLOOR — the runner's, not this repo's.** GitHub executes the matrix; the proof is five green cells on the probe PR, an observed artifact. Until the probe returns this claim is **unmeasured** and is stated nowhere. |
| "No workflow in this repo declares a soft tier" | **FLOOR — primitive #3 (enum/regex), NEW in this increment.** `check-soft-tier.mjs`, verdict = `violations.length > 0`, an integer test. Bounded by R1/R2/R3 above. |
| "Both action digests stay pinned by 40-hex + full semver" | **FLOOR** — `check-action-pins.mjs`, executed against the real tree by its own `★` self-test. |
| "No `run:` line I add installs a floating package" | **FLOOR** — `check-run-pins.mjs`, same `★` mechanism. Both new-shape `run:` lines are `npm run <script>`, which that checker's R1 names as out of contract by construction. |
| "Source bytes are LF on every OS at checkout" | **FLOOR — git's, declared, and NARROWER than it sounds.** `* text=auto eol=lf` governs **tracked** files at checkout. Runtime-written fixtures (`writeFileSync`) are untouched, as is anything a test synthesizes. Scoped this way, not sold as "line endings can never break a test". |
| "The renormalization is a no-op today" | **FLOOR** — `git add --renormalize . && git diff --cached --stat` must be **empty**; pasted in Phase C. Measured, not assumed. |
| "Every cell gates the merge" | **ADVISORY — and NOT verifiable from this sandbox.** Repo settings are unreadable here; `check-soft-tier.mjs` R1 names the same wall. Both branches of the required-checks question go to the human verbatim at HALT 2. This is the increment's single largest operational risk and is never stated as closed. |
| "The matrix results are the node-version-policy ticket's evidence base" | **ADVISORY** — a scoping statement for the PR description, not a guarantee. |

## Trust audit (P2)

No untrusted artifact is ingested. The increment fetches nothing, parses no remote frontmatter, and adds no network call. `check-soft-tier.mjs` reads files this repo owns, and — per the fix-#1 discipline — **no decision reads their content**: the verdict is an integer count, and the offending line text is copied verbatim into output as data only. `.gitattributes` is a git-side byte policy over tracked files; it moves no trust boundary.

One second-order note, recorded because it is real rather than because it is dangerous: `on: pull_request` (unchanged, and **not** `pull_request_target`) means a fork PR's contents can run these gates. That was already true for the single cell; the matrix multiplies the runners, not the privilege. `permissions: contents: read` is preserved verbatim, no secrets are added, and `persist-credentials: false` stays on every checkout — so the blast radius per cell is identical to today's.

## Determinism audit (P5)

Every branch this increment introduces is a membership/equality test, never a classification. In `ci.yml`: `steps.install.outcome == 'success'` is the existing equality test reused verbatim; `matrix.os`/`matrix.node` are literal values from an explicit `include` list. In `check-soft-tier.mjs`: the verdict is `violations.length > 0`, and "is this a violation" is a regex key-match that never inspects the value.

The **triage** step at HALT 1 is where P5 bites hardest, and the brief already fixes it: a red cell is classified into §3's taxonomy, which carries an explicit **`Unclassified`** row whose handling is *"fail toward flagging — never squeeze a novel red into the nearest existing row."* That is P5's terminal "ask" written into the process, and it is honored literally: any red I cannot place lands at HALT 1 as a proposed **new** class, unhandled.

## Process (probe-first — the structural novelty)

- **Phase A** — branch, write the five files, push, open a **draft PR**, let all five cells finish (`fail-fast: false`). → **HALT 1: the results table** (one row per cell: `os / node / result / wall time`; for every red cell the **verbatim first failure**, its §3 class, and a proposed handling as a **named line-item**).
- **Phase B** — apply only HALT-1-approved handling, each its own declared whitelist item. → **HALT 2:** final diff + all-green runs + the required-checks note verbatim.
- **Phase C** — paste the checks summary; paste the empty `git add --renormalize` proof; `npm run check` green locally; commit `chore(ci): test on windows/macos and node 22/24; pin source bytes to LF`.

## HALT 1 — the probe's measurement (2026-08-11, PR #91, run 31520548206)

| os / node | result | wall |
| --- | --- | --- |
| `ubuntu-latest` / 20 | pass | 39s |
| `ubuntu-latest` / 22 | pass | 28s |
| `ubuntu-latest` / 24 | pass | 29s |
| `macos-latest` / 24 | pass | 40s |
| `windows-latest` / 24 | **fail** | 62s |

On Windows **5 of 6 gates passed** — `Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Build`. Only `Test` failed, so the six-gate pattern isolated the failure without any log archaeology.

**Predictions that did NOT materialize** (recorded because negative results are results): the **CRLF class was dead on arrival** — `.gitattributes` shipped in the probe and both text-reading gates passed on Windows; the grill's **coverage-threshold** concern did not fire (zero threshold errors); and the `@esbuild`/`@rolldown` lockfile class held on all three platforms.

**The red cell — 3 failures, ONE root cause. New class: `errno-shape divergence` (accepted by the human at HALT 1).**

`src/lib/apply-update.ts:52` uses `lstatSync(dest, { throwIfNoEntry: false })`, whose suppression covers **ENOENT only** — a POSIX-only truth stated in that line's own comment. POSIX raises `ENOTDIR` for a path whose parent is a regular file, so it escapes the suppression and is correctly classified `unreadable`; **Windows raises `ENOENT`**, so it is suppressed and the path is classified `absent`. (The errno was deduced, not assumed: `absent` is reachable only via that suppression.)

Shipped, user-visible consequence: on Windows `pharn status` reports such a path as **Missing** — implying it can be restored, when a regular file squats on its parent and it cannot exist — and `pharn update` then plans a restore and **exits 1** instead of emitting the named skip. The "Unreadable" fourth drift category, the headline entry in this CHANGELOG's Unreleased section, has been POSIX-only correct since it shipped.

The class is distinct from §3's `path-shape residue`: no path string is compared and `toPosix`/`safeJoin` are irrelevant. Signature: assertions about error **classification** failing only on Windows.

**Approved handling — line-item R1:** fix product-side in `src/lib/apply-update.ts` **only**; classify the not-found branch by walking the parent chain (any intermediate component that exists and is not a directory → `unreadable`, else `absent`) rather than by errno. **No test file is edited** — the three failing tests assert the correct behavior, which is the strongest evidence this is a product fix and not a test accommodation.

## Open questions (HALT)

All four pre-build questions were resolved at GATE 1; both HALT 1 questions were resolved by the human on 2026-08-11. None remain open.
