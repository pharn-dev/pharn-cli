# PLAN — ship-completion-retry (single build-completion retry in /pharn-ship)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 (sha256 of ARCHITECTURE.md, read this run)
- increment: Give /pharn-verify a deterministic INCOMPLETE signal (a plan-declared `## Files` path is absent after build), then let /pharn-ship return to /pharn-build EXACTLY ONCE on that signal, re-run regress+verify, and STOP for the human if it is still not green.
- layer(s): tooling — floor checkers (`.dev/floor/`) + product-pipeline commands (`.claude/commands/`). NOT a `pharn-*` library layer; both dirs are floor-ignored by `validate.mjs` (they are this repo's own apparatus). ARCHITECTURE.md §4 layers are for the product tree; this increment touches the pipeline tooling that consumes it.
- constitution_refs: [P0, P2, P3, P4, P5, P6, P7]

## The gap this closes (discovery, read live this run — P6)

`/pharn-verify` today CANNOT distinguish an **incomplete build** from an **other failure**, and in fact
cannot detect incompleteness at all:

- `.dev/floor/check-verify.mjs` computes `verdict = failing.length ? "FAIL" : "PASS"` over a
  `{ "<gate-id>": <exit-int> }` map; the enum is `{PASS, FAIL, INCONCLUSIVE}` (INCONCLUSIVE = bad input only).
- `/pharn-verify` Step 3 assembles that map from (a) the project's whole-repo gates (`test`/`lint`/…) and
  (b) one `structural:<expected>` gate **per committed eval pair that EXISTS**.
- A path the plan's `## Files` **declared but the build never wrote** yields **no gate** (its `structural:*`
  pair is absent → "absent pair → no gate"; nothing else references it). So an incomplete build either
  **PASSes verify** (a real hole — verify green over a half-built plan) or **FAILs for a coincidental
  whole-repo reason indistinguishable from a genuine bug.**

Therefore the retry the intent asks for has **nothing deterministic to gate on**. Per the intent's own
DECIDE + "HALT if verify can't determine 'incomplete' deterministically", the **first thing to add** is a
deterministic completeness signal in verify. Only then can /pharn-ship read it and retry.

## Files (ONE increment, one PR — Q1–Q4 resolved below)

- `.dev/floor/check-build-complete.mjs` — NEW floor checker (its own axis, P3): parse the PLAN's `## Files`
  concrete back-tick paths, assert each `existsSync` in the target repo; emit `{ complete, missing[] }`;
  exit `0` complete · `1` incomplete · `2` inconclusive (no `## Files` / bad input, fail-closed). Reduces to
  ARCHITECTURE.md §2 primitive #3 (path-set membership + existence). — layer tooling/floor
- `.dev/floor/check-build-complete.test.mjs` — NEW hermetic `node --test` suite (the P1-equivalent for floor
  infra; floor checkers ship `.test.mjs`, not `evals/`). — layer tooling/floor
- `.dev/floor/check-verify.mjs` — MODIFY: accept an OPTIONAL `--complete <int>` (check-build-complete's exit).
  New 4-valued precedence: any project/structural gate non-zero → `FAIL`; else `--complete != 0` → new
  `INCOMPLETE`; else `PASS`. **Backward-compatible: `--complete` ABSENT ⇒ today's exact 3-valued behavior**
  (so dev `/pharn-dev-verify`, which passes no `--complete`, and `check-ship.mjs` are untouched). — layer tooling/floor
- `.dev/floor/check-verify.test.mjs` — MODIFY: add cases for `--complete` (INCOMPLETE; FAIL-precedence when a
  real gate is also red; absent-flag regression guard; malformed `--complete` → INCONCLUSIVE). — layer tooling/floor
- `.claude/commands/pharn-verify.md` — MODIFY: Step 3 runs `check-build-complete.mjs <PLAN> .`, passes its
  exit as `--complete` to `check-verify.mjs` (Step 5), and surfaces `missing[]` + the `INCOMPLETE` verdict in
  `verify-report.json` (a new `.completeness` block, additive) and `VERIFY.md`. Update the guarantee / trust /
  determinism audits. — layer tooling/command
- `.claude/commands/pharn-ship.md` — MODIFY: after step 6, add the SINGLE retry branch (below). Update the
  guarantee audit + "What /pharn-ship does NOT do". — layer tooling/command

### The /pharn-ship retry branch (straight-line, no loop)

After step 6 reads `verify-report.json` `.verdict`:

- `PASS` → GATE 2 (unchanged).
- `FAIL` / `INCONCLUSIVE` → **STOP**, present, hand to human (unchanged — a real failure is NEVER retried).
- `INCOMPLETE` (new) → **retry ONCE**: re-invoke `/pharn-build <name>` → re-run `/pharn-regress` → re-run
  `/pharn-verify`, then re-read the two verdicts **once**:
  - re-verify `PASS` ∧ re-regress `no-regressions` → GATE 2.
  - anything else (still `INCOMPLETE`, now `FAIL`/`INCONCLUSIVE`, or a regression) → **STOP**, hand to human.
    **No second retry** — the retry block has no back-edge.

## Contracts satisfied (cite, do not restate — P4)

- ARCHITECTURE.md §2 primitive #3 (enum / membership / path-resolution) — `check-build-complete.mjs`'s
  existence test and `check-verify.mjs`'s 4-valued threshold both reduce to it.
- ARCHITECTURE.md §6 verify-report artifact + §8 finding object — the `INCOMPLETE` verdict and the
  `.completeness.missing[]` are the **enum-gated / floor-verifiable** class (deterministic filesystem facts);
  any human-facing prose in `VERIFY.md` renders `trust: untrusted` as DATA.
- `/pharn-ship`, `/pharn-verify`, `/pharn-build`, `/pharn-regress` are REUSED verbatim (STANDARD: reuse, no
  reimplementation); the retry adds one branch that reads existing `.verdict`s.

## Evals to write (P1 — floor infra ⇒ `.test.mjs`, the eval-equivalent)

- `check-build-complete` → all `## Files` paths exist → `complete`, exit 0.
- `check-build-complete` → one declared path missing → `incomplete`, exit 1, `missing[]` names exactly it.
- `check-build-complete` → glob/placeholder `## Files` entry (e.g. `<capDir>/…`, `*`) → skipped, not counted
  missing (parity with `set-writes-scope`'s `isConcrete` filter).
- `check-build-complete` → no `## Files` heading / unreadable PLAN → `inconclusive`, exit 2 (fail-closed).
- `check-verify` → `--complete 0` + all gates 0 → `PASS`; `--complete 1` + all gates 0 → `INCOMPLETE`.
- `check-verify` → `--complete 1` + one gate `1` → `FAIL` (precedence: a real failure beats incompleteness).
- `check-verify` → NO `--complete` flag → verbatim today's 3-valued verdict (regression guard for the shared
  checker's other consumers).
- `check-verify` → malformed `--complete` (non-int) → `INCONCLUSIVE` (fail-closed).

## Guarantee audit (P0)

- "verify deterministically distinguishes an incomplete build (a declared `## Files` path absent) from a
  real gate failure" → **floor: enum/membership + path-existence** (`check-build-complete.mjs` +
  `check-verify.mjs` precedence).
- "the single retry FIRES only on a deterministic `INCOMPLETE` verdict" → **floor: enum** (reads
  `verify-report.json` `.verdict`, an enum string — never a free-text field).
- "a `FAIL` / `INCONCLUSIVE` verify is NEVER retried" → **floor: enum** (only `INCOMPLETE` is the retry gate).
- "the retry re-runs build→regress→verify and proceeds only on `PASS` ∧ `no-regressions`" → the **verdicts**
  are floor (`check-verify` / `check-regress` exits); /pharn-ship's act of reading+obeying is **advisory**
  orchestration (two clocks — same split as gated /pharn-ship today).
- "at most ONE retry — no loop" → **advisory / structural.** The /pharn-ship prose has a single retry block
  with **no back-edge**; there is no iteration to floor-cap (unlike `--loop`'s `check-ship.mjs iter>=cap`).
  Labeled honestly — NOT sold as a floor cap. (A floor cap would be a P7-speculative loop-helper for a
  non-loop — see Open questions if you want it anyway.)
- NOT a claim (struck as the P0 disease): "the retry makes the build complete / correct." The retry
  re-invokes **advisory** /pharn-build; whether the rebuild actually finishes is model work, re-checked by
  the deterministic re-verify. The floor guarantees only: retry **at most once**, **only** on a deterministic
  `INCOMPLETE`, and re-read deterministic verdicts.

## Trust audit (P2)

- The retry decision and the verdict read **only** the enum-gated / floor-verifiable class:
  `verify-report.json` `.verdict` (enum), `.completeness.missing[]` (deterministic filesystem paths), and
  `check-regress` `.verdict` (enum). **No proceed/stop/retry decision rests on any free-text field.**
- `check-build-complete.mjs` reads the PLAN's `## Files` back-tick paths — `trust: untrusted` DATA — and uses
  them **only** as `existsSync` operands (never eval'd, executed, spawned, imported, or sent anywhere). A
  crafted path can at most change WHICH paths are existence-checked (a coverage question surfaced in
  `VERIFY.md`), never inject a command or flip a guaranteed decision beyond the deterministic existence fact.
  Same bounded PLAN-`## Files`-derived-paths pattern `/pharn-regress` + `set-writes-scope` already use; the
  Step-2 hash-chain gate ensures the PLAN is current + human-approved before its paths are read.
- The retry re-invokes /pharn-build, which re-runs **its own** fix #7 writes-scope + hash-chain gates — the
  rebuild cannot escape scope or build a stale plan regardless of the retry.
- Residual (named, `LIMITS.md §2`): completeness = "declared concrete paths exist" — a deterministic proxy,
  NOT semantic ("the code does what the plan intended"); that stays advisory/verifier + human. Stated, not hidden.

## Determinism audit (P5)

- Every branch reads an exit code / enum: `check-build-complete` exit, `check-verify` `.verdict`,
  `check-regress` `.verdict`. No LLM classification drives the retry.
- Terminal fallback is always STOP → hand to the human (a still-not-green retry, a `FAIL`, an
  `INCONCLUSIVE`) — never a guess, never a second retry. The `≤1` bound is structural (no back-edge).

## Resolved decisions (Q1–Q4 — human-selected this run; no open questions remain)

- **Q1 — Scope → ONE increment, one PR.** Completeness signal + ship retry together (the 6 files above).
- **Q2 — Encoding → NEW `.verdict` value `INCOMPLETE`.** Precedence in the floor: any real project/structural
  gate red → `FAIL`; else declared-path-missing (`--complete != 0`) → `INCOMPLETE`; else `PASS`. `--complete`
  is OPTIONAL and passed ONLY by product `/pharn-verify`, so the shared `check-verify.mjs` stays byte-behaviour
  identical for dev `/pharn-dev-verify` / `check-ship.mjs` when the flag is absent (regression-guarded by an eval).
- **Q3 — `## Files` extractor → RE-IMPLEMENT in `check-build-complete.mjs` + a parity test** locking it to
  `set-writes-scope.cjs`'s `pathsFromPlanFiles` output. Does NOT touch the fix #7 hook. Residual (shared with
  the setter): an inline-marked ``- `path` — not touched`` item is a path-item to both parsers.
- **Q4 — Retry bound → STRUCTURAL (no back-edge), honestly labeled advisory.** No floor cap helper (a
  loop-cap for a non-loop would be P7-speculative). The retry FIRING stays floor-gated on the `INCOMPLETE`
  verdict; only the `≤1` count is structural.
