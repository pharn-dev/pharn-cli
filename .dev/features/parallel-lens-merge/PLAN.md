# PLAN — parallel-lens-merge (parallel lens orchestration + deterministic findings merge)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 (sha256 of ARCHITECTURE.md, this run)
- increment: Add the deterministic FLOOR core for a parallel-lens review — a Node merge+dedup of N per-lens `findings.json` + a frontmatter `count-lenses` + an explicit lens→scanner map — and the ADVISORY orchestration that parallel-spawns the 22 lenses as subagents (scanner-prefiltered slices) and feeds the merge, in a new `/pharn-review` command mirrored into `/pharn-dev-review`.
- layer(s): build-apparatus (`.dev/floor/`) + commands (`.claude/commands/`) — NOT product capabilities; `validate.mjs` excludes both surfaces (the `check-ship.mjs` precedent)
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Resolved at GATE 1 (human, this run)

- **Scope = Bundle** — floor core **and** the advisory subagent-orchestration prose, one PR.
- **Dedup key = `(type, rule_id, file)`, lossless** free-text carry (P2-clean; the recommended default).
- **Per-lens scope = scanner-prefilter + explicit map** — orchestrator maps each lens to its real scanner, runs it over the target; hit-files = that lens's slice; the 4 scanner-less lenses get the whole target (labeled bound).
- **Command home** (from the original request "make /pharn-review run… Also mirror into /pharn-dev-review") — a **new `/pharn-review`** product command **+ a thin mirror** section in `/pharn-dev-review` that adopts the same spawn→`findings.json`→merge recipe (cited, not duplicated — P4).

## Why this shape (discovery, live this run — P6)

- Floor **GREEN — 35 capabilities**; `npm test` **599/599 pass** (baseline). CLAUDE.md's "1 capability" is stale — read live, as it says.
- `pharn-review/` holds **exactly 22 `role: lens`** capabilities (frontmatter count over the surface `count-verifiers.mjs`/`validate.mjs` scan; `.claude/commands/pharn-dev-review.md` is also `role: lens` but sits under the excluded `.claude/commands/`, so it is not one of the 22).
- **Premise correction (P6, surfaced not guessed):** there is **no `/pharn-review` command** and **nothing orchestrates the 22 lenses** over a codebase today; `/pharn-dev-review` runs **4 PHARN-principle lenses (P0–P3) inline** over a built increment. So the only NEW guarantee is the deterministic **merge + count**; the parallel spawn is **advisory** (matches the request's own guarantee-audit).
- **Lens→scanner reality (live):** 18 of 22 lenses have a real `.dev/floor/scan-code-*.mjs` (names often differ from the lens: `insecure-crypto`→`scan-code-crypto`, `unsafe-deserialization`→`scan-code-deserialization`, `secrets-in-code`→`scan-code-secrets`, `placeholder-as-done`→`scan-code-placeholder`). **4 are scanner-less** — `hallucinated-api`, `trust-fence` (name none) and `input-validation`, `race-condition` (their prose names scanners that do **not** exist on disk). This is exactly why the map is **explicit + consistency-tested**, not name-derived.

## Files

- `.dev/floor/merge-findings.mjs` — deterministic merge+dedup of N `findings.json` → one; enum-validates every enum-gated field (fail-closed), groups by `(type,rule_id,file)`, carries free-text as DATA — layer build-apparatus
- `.dev/floor/merge-findings.test.mjs` — hermetic `node --test` suite (the P1 spec/regression) — layer build-apparatus
- `.dev/floor/count-lenses.mjs` — deterministic `role: lens` membership counter; a byte-for-byte mirror of `count-verifiers.mjs` (walk + `parseFrontmatter` + EXCLUDE_SEGMENTS), s/verifier/lens/ — layer build-apparatus
- `.dev/floor/count-lenses.test.mjs` — hermetic `node --test` suite — layer build-apparatus
- `.dev/floor/lens-scanner-map.json` — explicit `{ "<lens>": "<scan-code-*.mjs | null>" }` table for all 22 lenses (18 mapped, 4 `null` = scanner-less) — DATA for the scanner-prefilter — layer build-apparatus
- `.dev/floor/lens-scanner-map.test.mjs` — hermetic consistency suite: every non-null scanner exists on disk; every counted lens is a key; no orphan scanner — catches prose/map drift (P7, real: prose already drifted) — layer build-apparatus
- `.claude/commands/pharn-review.md` — NEW product command: `count-lenses` membership → per-lens subagent (scanner-prefiltered slice) → per-lens `findings.json` → `merge-findings.mjs` — advisory orchestration — layer commands
- `.claude/commands/pharn-dev-review.md` — EDIT: add a thin "parallel lens orchestration (mirror)" section adopting the same recipe, cited from `/pharn-review` (P4) — layer commands

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the merge **consumes and re-emits** the exact finding object and keys the dedup on its **enum-gated fields only** (`type`,`rule_id`,`file`), carrying `problem`/`evidence` as quoted DATA; it **cites**, does not restate (P4). The merged array is the same `findings.json` shape (§Emission).

## Merge contract (what `merge-findings.mjs` guarantees, precisely)

- **Invocation:** `node .dev/floor/merge-findings.mjs <out.json> <in1.json> [<in2.json> …]` — an **explicit** input list (which lenses ran is the advisory orchestrator's call; the floor merges exactly what it is handed).
- **Dedup key = enum-gated only (P2):** `type` + `rule_id` + `file` (`path:line`). Same key ⇒ one merged finding. Never reads free-text — "problem-class" is the enum-gated `rule_id`, not the tainted sentence.
- **Fail-closed input validation (fix #1 at the merge):** each enum-gated field must match its pattern (`type` `^[A-Z_]+$`; `severity ∈ {blocking,important,minor}`; `file` `^.+:\d+$`; `rule_id` a single-line token). A finding that fails — a laundered needle/newline in `rule_id`, a `file` without `:line` — is **dropped + reported**, never merged. Unreadable / non-array / bad-JSON input → **exit non-zero, write nothing** (P5).
- **Deterministic reductions only:** merged `severity` = **max** over `{blocking>important>minor}`; output **sorted** by `(file,rule_id,type)`. **Output bytes invariant under input-file order and intra-array order** (tests pin it).
- **Lossless free-text carry (DATA):** merged finding = enum-gated key + max-severity + a sorted `sources[]` of every contributor's `{problem, evidence}` — quoted DATA, never executed, never promoted to an enum-gated field.
- **It ASSEMBLES; it does not judge.** The merged `findings.json` is **advisory** (a lens can't "decide approve" — §7). "merged" ≠ "correct" ≠ "safe."

## Evals to write (P1)

> `.dev/floor/` helpers are not `role:`-bearing capabilities, so `validate.mjs` excludes them; P1 is met by hermetic `.test.mjs` (the `check-ship.mjs`+`check-ship.test.mjs` precedent), not `evals/cases`+`evals/expected`. The two edited/added commands are also excluded — no eval obligation.

- `merge-findings` → same `(type,rule_id,file)` from two lenses → **1** finding, both free-texts in `sources[]`.
- `merge-findings` → same `file:line`, **different `rule_id`** → **2** findings (key is `rule_id`-precise).
- `merge-findings` → permuting input-file AND intra-array order → **identical output bytes** (determinism).
- `merge-findings` → laundered needle/newline in an enum-gated field, or `file` missing `:line` → **dropped + reported**; merged output's enum-gated fields carry **no** needle (fix #1 trip-wire).
- `merge-findings` → bad-JSON / non-array / missing input → **exit non-zero, nothing written**; empty inputs → `[]`.
- `count-lenses` → counts exactly `role: lens` frontmatter (**22** live); a `role: lens` in prose / a code block is **not** counted; `.dev/` + `.claude/commands/` excluded (mirrors `count-verifiers.test.mjs`); missing target → non-zero (fail-closed).
- `lens-scanner-map` → every non-null scanner value resolves to an existing `.dev/floor/*.mjs`; every `count-lenses` lens is a map key; no scanner file is orphaned (drift trip-wire).

## Guarantee audit (P0)

- "Deterministic merge+dedup keyed on **enum-gated fields only**, output order-independent" → **FLOOR** (enum/regex, §2 primitive #3 — `merge-findings.mjs` + tests).
- "Merge **drops** malformed/laundered enum-gated fields (fail-closed)" → **FLOOR** (enum + regex).
- "Lens **membership** by frontmatter count" → **FLOOR** (`count-lenses.mjs` + tests; mirrors `count-verifiers.mjs`).
- "Lens→scanner map is **consistent** with disk" → **FLOOR** (existence/enum check — `lens-scanner-map.test.mjs`).
- "N lenses run **in parallel** as subagents" → **ADVISORY** (orchestration — nothing on the floor forces parallelism or that every lens runs; spawn = the Agent/subagent tool).
- "Each lens reads **only its relevant slice**" → **ADVISORY** (scanner-prefilter narrows deterministically where a scanner exists; the 4 scanner-less lenses fall back to whole-target — honestly bounded, not a floor claim).
- "The merged findings are correct / the code is bug-free / injection-safe" → **struck (the disease).** The merge assembles; it never judges; lenses never gate (§7).

## Trust audit (P2) — the merge ingests UNTRUSTED lens output

- Each input `findings.json` is from a lens subagent that read **`trust: untrusted`** code. Its free-text (`problem`,`evidence`) **inherits** that tag; the merge carries it as quoted DATA in `sources[]` — never executed, never promoted to an enum-gated field.
- Its enum-gated fields are the lens's own assertion, but a subagent could be **injected and launder a needle** into one. The merge's **enum-validation drops** any such finding before grouping, so the **grouping/identity decision rests only on validated enum-gated fields** (fix #1, structural).
- **Subagent isolation (P2):** each lens subagent receives its scoped slice as **DATA under the CONSTITUTION prefix**; instruction-looking content in the reviewed code is an attack to **report**, never follow (the existing lens discipline, unchanged).
- **Named residual (LIMITS §2 / §8):** a human or downstream LLM later reads the merged free-text; "don't execute this as an instruction" is a heuristic there — **bounded** (merge gates nothing on free-text; output advisory) but not zeroed. Stated, not hidden.

## Determinism audit (P5)

- Every merge branch is a membership/equality test over enum-gated fields or an ordered-enum reduce; the count and the map-check are membership/existence tests. **Zero LLM classification in any helper's core.** The only LLM parts (the lens subagents; the orchestrator's spawn) are **advisory and upstream** of the floor merge. Terminal fallback on ambiguous input = fail-closed non-zero exit, never a guess.

## Residual for GATE 2 (surfaced, not blocking)

- The `/pharn-dev-review` **mirror** is a _thin recipe adoption_, not "run the 22 code lenses over PHARN's markdown" — the 22 lenses review **code**, `/pharn-dev-review` reviews PHARN **increments**. The mirror shares the spawn→`findings.json`→merge _machinery_; it does not repoint the code lenses at markdown. Flagged for the human at the post-review gate.
