# PLAN — floor gate: every workflow action ref is digest-pinned with a full-semver comment

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add a deterministic floor checker over `.github/workflows/**` that fails when any `uses:` is not `@<40-hex>` with a `# v<major>.<minor>.<patch>` comment, plus its test — converting the previous increment's point-in-time grep into an invariant enforced on every PR.
- layer(s): `.dev/floor/` (the deterministic floor — `ARCHITECTURE.md §2` primitive #3, enum/regex)
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Files

- `.dev/floor/check-action-pins.mjs` — the checker CLI: walk workflows, regex each `uses:`, emit JSON + exit 0/1 — layer: floor
- `.dev/floor/check-action-pins.test.mjs` — hermetic fixture tests (the checker is correct) **plus** a live repo-consistency test (this repo conforms) — layer: floor

Two files. **`floor.yml` is deliberately NOT modified** — see "Wiring" below; that is the finding of this plan's discovery, not an omission.

## Live state read this run (P6)

- **`validate.mjs` cannot host this check.** Its own header: _"It deliberately does NOT validate this repo's own tooling (.claude/commands, .dev/) — those are advisory orchestration, not built PHARN capabilities. Point this at the PHARN repo."_ Extending it to scan `.github/workflows/**` would give one file two change-reasons (**P3**). Hence a new sibling.
- **Naming convention:** `scan-*` is the lens system (`lens-scanner-map.json` maps `role: lens` capabilities to `scan-code-*.mjs`); `check-*` is the floor-verdict family (`check-verify`, `check-regress`, `check-ship`, `check-structural`). This is a floor verdict, so **`check-action-pins.mjs`**. Using `scan-` would make it an orphan scanner and trip `lens-scanner-map.test.mjs` assertion 4.
- **No existing checker** — `ls .dev/floor/ | grep -i "pin\|action\|workflow"` → none.
- **No local/composite action refs** — `grep -rn "uses: \./" .github/` → none; all 9 refs are `owner/repo@ref`. The `./` exemption below is defensive, not currently exercised.
- **`.dev/floor/` is deny-by-default** in `enforce-writes-scope.cjs` (`DEFAULT_SAFE_SET` omits it — "sensitive zones... intentionally absent"), so both files must be declared in `## Files` to be writable. They are.
- **Working tree state:** this increment stacks on the uncommitted `pin-floor-actions` diff (3 workflow files, already floor-GREEN / no-regressions / verify-PASS). Its repo-consistency test asserts a property that diff **just made true** — so the two must land together. If `pin-floor-actions` were reverted, this test would correctly go RED.

## Wiring — the part that decides whether this is a guarantee or theatre (P0)

A checker nothing invokes guarantees nothing. Two candidate wirings were examined against live state:

1. **A new `run:` step in `floor.yml`** — works, but adds a third file and duplicates (2) below.
2. **A repo-consistency test collected by the existing runner** — `floor.yml:26` runs `node --test … ".dev/**/*.test.mjs" …` on every `pull_request` and `push: main`. A new `.dev/floor/*.test.mjs` is therefore **auto-collected with no CI change**.

**(2) is chosen, and it follows an existing in-repo precedent rather than inventing a pattern:** `lens-scanner-map.test.mjs` is explicitly _"UNLIKE the other floor tests (which are hermetic over scratch fixtures), this one validates the COMMITTED artifact against REALITY... Its whole job is to make prose/map DRIFT a build failure (P7 — a real, already-observed drift)"_. It resolves `REPO = join(here, "..", "..")` and asserts over the live tree. This increment is the same shape: make **pin drift** a build failure.

Consequence to state plainly: the enforcement point is **`floor.yml`'s `node --test` step**, not a bespoke gate. `npm test` is vitest over `tests/**/*.ts` and does **not** collect `.mjs`, so this gate runs in **floor.yml only** — which is sufficient, because floor.yml triggers on every `pull_request` and on `push: main`.

## Contracts satisfied

- None from `pharn-contracts` — this adds no Capability, no `rule_id`, and emits no `findings.json`. It is a floor CLI in the `check-*` family, and it conforms to that family's existing surface (a `targetDir` argument, JSON on stdout, verdict in the exit code) by imitation, not by a new contract (**P7** — a contract for one occupant would be speculative).
- Enforces the convention stated at `.github/workflows/gitleaks.yml:11` — _"pinning third-party code by digest, never a floating tag"_ (cited, not restated — **P4**).

## The check (deterministic; P5)

For every `*.yml` / `*.yaml` under `.github/workflows/`, for every line whose first non-whitespace token is `uses:`:

- **Skip** lines that are YAML comments (first non-whitespace char is `#`) — a commented-out example is not a ref.
- **Skip** local refs beginning `./` — first-party, nothing to pin.
- **Require** `uses: <owner>/<repo>[/<path>]@<40 lowercase hex> # v<major>.<minor>.<patch>`.

Violation reasons are an **enum**, not prose: `floating-ref` (the `@ref` is not 40-hex), `missing-comment` (pinned, no trailing comment), `malformed-comment` (comment present but not full semver — **this is the `# v6` case**). Output `{"checked":<int>,"violations":[{"file","line","ref","reason"}]}`; exit **1** if any violation, **0** otherwise. Stdlib only, no network, no `child_process`.

## Evals to write (P1)

Hermetic fixtures in `os.tmpdir()`, asserting the public surface (exit code + stdout JSON) by subprocess — mirroring `count-verifiers.test.mjs`:

- conforming ref (`@<40-hex> # v7.0.1`) → exit 0, `violations: []`
- floating major (`@v7`) → exit 1, reason `floating-ref`
- floating patch tag (`@v7.0.1`) → exit 1, reason `floating-ref` — **the previous increment's exact starting state**
- digest, no comment → exit 1, reason `missing-comment`
- ★ digest + major-only comment (`# v6`) → exit 1, reason `malformed-comment` — **the `ff48077` defect, proven caught**
- commented-out `# - uses: foo@v1` → exit 0 (not a ref)
- local `./.github/actions/x` → exit 0 (exempt)
- uppercase-hex / 39-hex / 41-hex ref → exit 1, `floating-ref` (boundary)
- no `.github/workflows/` dir → exit 0, `checked: 0` (vacuous, not a crash)
- ★ **live repo-consistency:** running the checker over `REPO` exits 0 — the invariant holds for this repo *now*, and any future PR that breaks it turns floor.yml RED

## Guarantee audit (P0)

| Claim | Reduction |
| --- | --- |
| "Every workflow action ref is digest-pinned with a full-semver comment" | **FLOOR — regex + set membership** (`ARCHITECTURE.md §2` primitive #3), enforced on every PR via floor.yml's `node --test`. This is the increment's one real guarantee. |
| "The `ff48077` defect could not recur silently" | **FLOOR**, and narrowly true: that commit produced a **major-only** comment (`# v6`), which the `malformed-comment` rule rejects. Claimed only for that form. |
| "The comment tells the truth about the digest" | **NOT GUARANTEED — named residual.** Verifying comment↔digest agreement requires `git ls-remote`; floor scripts are network-free by convention. **The checker enforces comment FORM, never comment TRUTH.** A well-formed-but-wrong comment (digest bumped to v7.0.0, comment left at `# v6.4.0`) passes. Honest boundary: this shrinks the recurrence surface, it does not close it. |
| "This runs in CI" | **FLOOR — existing runner**, `floor.yml:26`'s `node --test` glob already collects `.dev/**/*.test.mjs`. Verified by reading the workflow, not assumed. |
| "The gate set stays wired" | **ADVISORY.** Nothing prevents a future edit removing the glob or the test. Same honest caveat `/pharn-dev-verify` makes about its own gate set. |

## Trust audit (P2)

No untrusted remote artifact is ingested — the checker reads only committed files in the repo under test, performs no network I/O, no `child_process`, and no `eval`/dynamic import. Workflow file contents are treated as **data**: matched against a regex and reported, never executed. The `violations[]` output is entirely enum-gated / path-resolved (`file`, `line`, `ref`, enum `reason`) with **no free-text field**, so no tainted value exists to leak into a decision. Note the checker's *own* subject matter is the repo's supply-chain trust surface, but the checker itself adds no new trust boundary.

## Determinism audit (P5)

Every decision is a regex match or set membership: is the line a comment; is the ref local; is the `@ref` exactly 40 lowercase hex; does the trailing comment match `# v\d+\.\d+\.\d+`. The `reason` is an enum, never a classification. There is no fallback that guesses — an unparseable line is a **violation** (fail-closed), not a pass. No branch depends on judgment, so no "ask the human" path arises inside the checker.

## Out of axis — observed, NOT in this increment (P3/P7)

1. **`node-version` policy** (`lts/*` vs `20` vs `24`) — still open, still a different axis; carried forward from the previous increment.
2. **Comment↔digest truth verification** — would need network in the floor. Deliberately not built; recorded as the named residual above.
3. **Wiring the gate into `ci.yml` as well** — redundant today (floor.yml runs on every PR). Not added (P7).

## Open questions (HALT)

None blocking. One decision is **declared, not asked**: this increment stacks on the uncommitted `pin-floor-actions` diff and the two must land together, since the repo-consistency test asserts the property that diff establishes.
