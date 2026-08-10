# PLAN — harden check-action-pins: make the gate see what it claims to see

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Close the coverage holes in `.dev/floor/check-action-pins.mjs` — refs it never sees, exemptions it grants silently, and output it truncates — so a clean exit means "every executed ref was inspected", not "every ref I happened to parse".
- layer(s): `.dev/floor/` (deterministic floor)
- constitution_refs: [P0, P1, P3, P5, P7]

## Files

- `.dev/floor/check-action-pins.mjs` — discovery + parse + classification hardening
- `.dev/floor/check-action-pins.test.mjs` — a regression test per hole, plus strengthened live assertions

Stacked on `chore/pin-action-digests` (PR #79): the checker exists only on that branch.

## Why this increment exists (P7 — real, reproduced, not hypothetical)

PR #79 shipped a gate that reports clean while unpinned third-party code executes. Every row below was **reproduced by running the shipped checker** this run, not inferred:

| probe | shipped behaviour | why it matters |
| --- | --- | --- |
| `- {uses: actions/checkout@main}` | `checked:0`, exit 0 | valid YAML flow mapping; GitHub executes it, the gate never classifies it |
| `- "uses": actions/checkout@v1` | `checked:0`, exit 0 | valid quoted key; same |
| `CI.YML` (uppercase ext) | `files:[]`, exit 0 | whole file skipped — **and the test's "independent" recount replicates the same case-sensitive filter, so it is not independent on this axis** |
| `docker://alpine:latest` | `skipped:1`, exit 0 | a fully mutable image tag is remote code, blanket-exempted by scheme |
| `./${{ … }}` | `skipped:1`, exit 0 | `isExempt()` runs **before** `classify()`, so the prefix defeats the `unpinnable-ref` rule |
| dangling symlink `*.yml` | exit 1, **no JSON** | uncaught ENOENT inside `Array.filter` — no report at all |
| 4000 violations through a pipe | truncated at 65536 B | `process.exit()` after `stdout.write` — JSON unparseable by any consumer |

Two more, found the same way, deliberately **out of scope** (see follow-ups): local composite actions were also never walked, which this plan fixes, but **owner binding** and **wiring fragility** are separate axes.

## The changes

**A. Nothing executes invisibly.**

1. Recognise all three `uses:` spellings — bare key, quoted key (`"uses":`), and flow-mapping entries (`{uses: …}`) — instead of only a line-initial bare key.
2. Also walk **local action definitions**: `.github/actions/**/action.{yml,yaml}` (bounded, symlink-safe recursion). GitHub executes a composite action's `runs.steps[].uses:`, so a `./` wrapper was previously a laundering path — exempt at the call site and never scanned at the definition.
3. Extension match becomes **case-insensitive**.
4. A file that cannot be stat'ed or read (dangling symlink) becomes a **violation** (`unreadable-file`), never a crash and never a silent skip.

**B. No silent exemption.**

1. `classify()` runs the `${{ }}` test **before** exemption, so `./${{ … }}` and `docker://${{ … }}` are `unpinnable-ref`.
2. `docker://` must be digest-pinned (`@sha256:<64 hex>`); a tag is `unpinned-container`.
3. A `./` ref containing a `..` segment is `escaping-local-ref` — the exemption covers genuinely-local paths only.
4. The live test asserts `skipped` **exactly**, so any future exemption use is surfaced rather than absorbed.

**C. Output integrity.**

1. `emit()` sets `process.exitCode` and returns instead of calling `process.exit()`, so stdout drains. Reproduced: 400 KB of JSON truncated to exactly 65536 B through a pipe and via `spawnSync`.

## Evals to write (P1)

One hermetic regression per row of the table above, plus: conforming flow-mapping and quoted-key refs pass; `docker://img@sha256:<64hex>` passes; `./local-action` still passes when its `action.yml` is clean; a composite `action.yml` with a floating ref is **caught**; large output survives a pipe intact. Live: `violations == []`, `skipped == 0` exactly, `checked >= 10`, and the workflow file set matches a **case-insensitive** independent recount.

## Guarantee audit (P0)

| Claim | Reduction |
| --- | --- |
| "Every `uses:` GitHub executes from this repo's workflows and local actions is inspected" | **FLOOR — regex/enum over an enumerated file set.** Strictly wider than what shipped; each previously-invisible form now has a regression test. |
| "No ref is exempted without leaving a trace" | **FLOOR** — `skipped` asserted exactly in the live test. |
| "The report survives a pipe" | **FLOOR — reproduced** both before (truncated) and after. |
| "The digest belongs to the *intended* owner" | **NOT GUARANTEED — named.** `attacker/checkout@<40hex> # v7.0.1` conforms today. Binding owners needs an allowlist policy; out of scope. |
| "The comment is TRUE" | **NOT GUARANTEED — unchanged.** Needs network; floor scripts are network-free. |
| "No YAML form can hide a ref" | **ADVISORY.** This is a line scanner, not a YAML parser (floor scripts are stdlib-only, and `js-yaml` is transitive, not a dependency). Unrecognised shapes now fail **toward** flagging, but exotic YAML (block scalars, anchors) is a known imprecision — documented, fail-closed in direction. |

## Determinism audit (P5)

Every branch is a regex match, a set membership, or a path test; `reason` stays an enum; unreadable input becomes a violation rather than a skip. No classification, no guessing fallback.

## Out of axis — named, NOT in this increment (P3/P7)

1. **Owner binding** — `attacker/checkout@<valid digest>` conforms. Needs an allowlist policy decision.
2. **Wiring fragility** — the gate rides one glob string in `floor.yml`; deleting the test file, a typo in the glob, or `continue-on-error: true` all silently disarm it. Needs a different mechanism (required checks / a meta-test), not a change to this checker.
3. **Supply chain beyond `uses:`** — `publish.yml` installs `npm@latest` inside the `id-token: write` job; `npm ci` runs dependency install scripts; the gitleaks step is `curl`-and-execute (checksum-verified today); pinned actions have their own transitive floating refs. All real, none addressable by a `uses:` form checker.
4. **`node-version` policy** — carried forward, still open.

## Open questions (HALT)

None blocking. Scope grew from the three items originally described to the full coverage class because the sweep reproduced seven distinct holes; the growth is recorded here rather than absorbed silently, and everything outside the coverage axis is listed above instead of being fixed opportunistically.
