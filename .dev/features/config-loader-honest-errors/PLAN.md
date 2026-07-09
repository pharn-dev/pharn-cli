# PLAN — config-loader-honest-errors (all four bugs; strict + honest config load)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Make the config load+validate surface honest AND strict — (1) the loader surfaces, never
  swallows, the named validator errors and stops lying "run init"; (2) the validators REJECT unknown
  keys, duplicate steps, and a dead threshold, naming the offender; (3) the loader returns the
  validators' typed result, not `raw`; keeping the CLI validators, the parallel floor validator, and
  the seam contract in lockstep.
- layer(s): pharn-cli — lib/ (loader + both validators) · commands/ + steps/ (callers) · pharn-contracts
  (seam SoT) · .dev/floor (parallel validator) · docs/ (P4).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]
- scope note: LARGE but coherent — one theme (honest+strict config load/validate). Human directed "fix
  everything, best way"; BUG 2/BUG 4 are validator-acceptance changes, so the seam contract + floor
  validator move WITH them (lockstep is mandatory, not optional).

## Best-way decisions (the human delegated the "how")

1. **BUG 2 — reject unknown keys (`models`, `models.stages.<s>` values, `seam`), naming them.** As
   directed. This REVERSES the seam SoT's current "extra fields ignored" P2 stance, so I update
   `pharn-contracts/seam-config.md` + `.dev/floor/check-seam-config.mjs` + flip `seam-config.test.ts:128`
   IN LOCKSTEP. **P2 is preserved and made stronger, not weakened:** an unknown/instruction-looking key
   now flips the verdict only toward **RED (fail-closed)** — never a wrong-GREEN, never executed (the key
   name is echoed as JSON-escaped DATA). Rejection is strictly more fail-closed than ignoring.
2. **BUG 4 — reject duplicate `resolutionOrder` steps and a `modelConfidenceThreshold` with no `model`
   step (cross-field), naming them.** This promotes two "wasteful but valid" cases into hard rejects —
   a deliberate shift from "safety-minimal floor + advisory lints" toward "strict config validation."
   Documented as such in the contract so the floor/advisory split stays honest (P0). The ONE original
   floor invariant (`resolutionOrder` must contain `ask`) is untouched.
3. **BUG 1 — throw on invalid, null only on absent/parse/shape.** Split the loader's single try so
   `JSON.parse`/shape guards still return `null` (→ "run init") but the validators' throw propagates.
   A shared `loadConfigOrExit` (in `pharn-config.ts`, mirroring `cancelAndExit` in `lib/confirm.ts`)
   turns a thrown `ModelRoutingError`/`SeamConfigError` into `log.error(err.message)` + `exit(1)` — the
   loud, offender-naming message, NOT "run init". `init`/`install` tolerate the throw (warn + proceed;
   overwrite is their job — they must NAME the broken config, never clobber it silently).
4. **BUG 3 — return the validators' typed result for `models`/`seam`; top-level passthrough preserved.**
   Post-BUG-2 the sub-blocks are already unknown-key-free; returning the validated object (not `raw`)
   makes that structural. Unknown **top-level** `PharnConfig` keys still pass through — this preserves
   P7 (a config carrying a since-removed field like `vendorSkills` must still load;
   `pharn-config.test.ts:131`). The strict/reject posture is deliberately scoped to `models`/`seam`.

**Forward-compat note (P7, stated honestly).** Rejecting unknown keys in `models`/`seam` means a FUTURE
schema field there is rejected by an OLDER CLI. Acceptable because: this schema is CLI-owned (P3) and
written+read by the same CLI version on install; a future additive field lands by bumping the validator
allowlist in lockstep (the field becomes "known"). Legacy configs simply OMIT `models`/`seam` (absent ⇒
fine, unchanged), so no legacy config breaks. This tradeoff is written into the contract, not hidden.

## Files (grouped by bug)

**Loader + callers (BUG 1, BUG 3)**

- `src/lib/pharn-config.ts` — split the try (parse/shape → `null`; validators throw → propagate);
  return `{ ...raw, models?, seam? }` from the validators' returns; add `loadConfigOrExit(cwd)` that
  catches **only** `ModelRoutingError`/`SeamConfigError` (→ `log.error(e.message)` + `exit(1)`) and
  **rethrows every other error** — NO bare catch (grill P5: must not recreate the swallow). — lib
- `src/commands/add.ts` — swap the `readPharnConfig`+null-check for `loadConfigOrExit(cwd)`. — command
- `src/commands/status.ts` — swap the `readPharnConfig`+null-check for `loadConfigOrExit(cwd)`. — command
- `src/commands/update.ts` — swap the `readPharnConfig`+null-check for `loadConfigOrExit(cwd)`. — command
- `src/commands/remove.ts` — swap the `readPharnConfig`+null-check for `loadConfigOrExit(cwd)`. — command
- `src/commands/list.ts` — `--json`-aware `try/catch` (its own, since it emits via `emitError` to
  stderr): caught validator error → `emitError(e.message, json)` + exit; `null` → the existing
  "run init" `emitError`. — command
- `src/commands/init.ts` — `confirmOverwriteIfExists`: wrap `readPharnConfig` in `try/catch`; on throw
  `log.warn("Existing pharn.config.json is invalid: " + e.message)` then proceed to the overwrite
  confirm (name it, don't crash, don't silently treat-as-absent). — command
- `src/steps/install.ts` — same tolerate-and-warn around `readPharnConfig(cwd)` at line 29. — step

**Validators — reject unknown/duplicate/dead (BUG 2, BUG 4)**

- `src/lib/model-routing.ts` — `validateModelRouting`: after reading `default`/`stages`, reject any
  other top-level key (e.g. `stgaes`), naming it. `assertStageModel`: reject any key beyond
  `model`/`effort`, naming it. (Unknown STAGE keys already reject — keep.) — lib
- `src/lib/seam-config.ts` — `validateSeamConfig`: reject unknown top-level keys beyond
  `{resolutionOrder, modelConfidenceThreshold, haltOnUnknown}` (BUG 2); reject a `resolutionOrder` with
  duplicate steps, naming the dup (BUG 4a); reject a present `modelConfidenceThreshold` when
  `resolutionOrder` lacks `model` (BUG 4b). Keep: enum/`ask`-presence/type checks. — lib

**Contract + parallel floor validator — lockstep (BUG 2, BUG 4)**

- `pharn-contracts/seam-config.md` — replace the "extra fields ignored" P2 language with the reject
  posture (still fail-closed, still no wrong-GREEN); add duplicate-step + threshold-requires-model as
  named invariants; add the forward-compat note; keep the terminal-`ask` invariant. — pharn-contracts
- `.dev/floor/check-seam-config.mjs` — add: unknown-key RED, duplicate-step RED, threshold-without-model
  RED (JSON-escaped names). Mirrors the TS validator exactly. — .dev/floor
- `.dev/floor/check-seam-config.test.mjs` — cases for each new RED + still-GREEN valid. — .dev/floor

**Docs (P4)**

- `docs/troubleshooting.md` — distinguish absent (→ "run init") from present-but-invalid (→ the loud
  `ModelRoutingError`/`SeamConfigError` message incl. unknown-key/duplicate/threshold; fix the named
  field, don't re-init). — docs
- `CHANGELOG.md` — entry (grill P4): invalid config now hard-errors naming the field instead of "run
  init"; unknown keys / duplicate `resolutionOrder` steps / a `modelConfidenceThreshold` with no
  `model` step in `models`/`seam` are now REJECTED — a user-visible strictness change on a published
  CLI. — docs

**Tests (P1) — declared here so they are in the build's writes-scope (detail in ## Evals)**

- `tests/pharn-config.test.ts` — BUG 1 throw-flip + `loadConfigOrExit` + BUG 3 + P7 passthrough. — test
- `tests/seam-config.test.ts` — reject unknown-key/duplicate/dead-threshold + lockstep RED + flip P2. — test
- `tests/model-routing.test.ts` — reject unknown sibling + unknown key inside StageModel. — test
- `tests/add.test.ts` — caller mock: `readPharnConfig` → `loadConfigOrExit` (no-config → ProcessExit). — test
- `tests/status.test.ts` — caller mock: `readPharnConfig` → `loadConfigOrExit`. — test
- `tests/update.test.ts` — caller mock: `readPharnConfig` → `loadConfigOrExit`. — test
- `tests/remove.test.ts` — caller mock: `readPharnConfig` → `loadConfigOrExit`. — test
- `tests/list.test.ts` — invalid-config → `emitError` + exit path (json + human); mock `isConfigValidationError`. — test

## Contracts satisfied

- `pharn-contracts/seam-config.md` — **evolved (this increment updates it).** New posture: unknown keys,
  duplicates, and a dead threshold are REJECTED (RED), naming the offender; terminal-`ask` invariant
  unchanged. The TS validator (`seam-config.ts`) and the floor validator (`check-seam-config.mjs`) both
  conform (P4 — cited + kept in lockstep, not restated).

## Evals to write (P1)

- `tests/pharn-config.test.ts` — **flip** `:59-69` and `:80-90` from "returns null" → "**throws**
  `ModelRoutingError`/`SeamConfigError`" naming the offender (`/gpt-4/`, `/ask/`). ADD `loadConfigOrExit`:
  invalid → exit(1) + message contains offender and NOT `/pharn init/`; absent → `/pharn init/` + exit(1);
  valid → returns it (`stubProcessExit`). ADD BUG 3: read-back has validated `seam`/`models` (typed);
  KEEP `:131` vendorSkills top-level passthrough GREEN (fix didn't over-reach).
- `tests/seam-config.test.ts` — **flip** `:128` P2 test → "rejects an extra field, naming it (fail-closed;
  verdict never wrong-GREEN)". ADD: reject unknown key `haltOnUnknwon`/`EXTRA` (named); reject duplicate
  `['model','model','ask']` (names dup); reject `modelConfidenceThreshold` with no `model` step (named);
  accept the canonical default + all valid cases still GREEN.
- `tests/model-routing.test.ts` — ADD: reject unknown sibling key `stgaes` (named); reject unknown key
  inside a `StageModel` (e.g. `{model,effort,modol}`, named); all existing accept/reject cases still hold.
- `.dev/floor/check-seam-config.test.mjs` — ADD the three new RED cases + a still-GREEN valid config.
- **Lockstep RED cross-check (grill P0/P1)** — the same bad seam configs (unknown key, duplicate step,
  threshold-without-`model`) must be **rejected in BOTH** the TS `validateSeamConfig` and the floor
  `check-seam-config.mjs`. Assert both directions so a future drift reds a test (not just the happy path).
- **Caller paths (grill P1)** — `list.ts`: an invalid config in `--json` mode → `emitError(message)` to
  stderr + exit(1) (not "run init"), message names the offender (tested directly). `init`/`install`
  share the SAME `isConfigValidationError` guard in a one-line `log.warn`-and-proceed branch; not given
  a dedicated driver test (runInit/runInstall are heavy) — covered structurally + by the passing
  coverage gate, noted honestly rather than over-claimed.
- **`isConfigValidationError` unit (grill P5)** — true for `ModelRoutingError`/`SeamConfigError`, false
  for a plain `Error` (locks the "config error vs bug" boundary `loadConfigOrExit` + `list` branch on).
- **JSON-escape (grill P2)** — an unknown key containing a control char is echoed **escaped** in the
  rejection message (not raw).

## Guarantee audit (P0)

- "Invalid `models`/`seam` (bad enum, unknown key, duplicate, dead threshold) → loud offender-naming
  error + non-zero exit, never 'run init'." → **floor**: enum/type/**set-membership**/set-cardinality
  tests (ARCHITECTURE §2 primitive #3) that throw the named error + deterministic propagation → exit(1).
- "`models`/`seam` sub-blocks in the runtime config contain only known, typed keys." → **floor**:
  reject-unknown-key + return-validated (structural).
- "Absent/malformed/wrong-shape → null → 'run init'." → **floor**: existsSync + parse-catch + shape test.
- "Unknown TOP-LEVEL keys still load (legacy/removed-field configs)." → **advisory-by-design (P7)**,
  backstopped by the shape guard; labeled, scoped deliberately away from the strict `models`/`seam` path.
- "CLI validator ≡ floor validator ≡ contract for `seam`." → **floor cross-check**: the existing
  `seam-config.test.ts` spawns `check-seam-config.mjs` on the default; both move together or the test reds.

## Trust audit (P2)

A `seam` block can originate untrusted (`THREAT-MODEL.md §2`). The verdict ranges only over
enum/type/key-set tests; an attacker-controlled unknown/extra key now yields **RED (fail-closed)**, never
a wrong-GREEN and never execution — the offending key/value is echoed **JSON-escaped as DATA** (as the
validators already do for values). Taint can flip the verdict only toward rejection. This is the same
fail-closed guarantee as before, strengthened (extra field: ignored → rejected). `pharn.config.json`
itself is local, not remote-fetched.

## Determinism audit (P5)

Every branch is a membership / type / existence / set-cardinality test, or a catch on a NAMED error
class: existsSync → parse (catch→null) → shape guard (→null) → validators (enum + key-set + dup +
cross-field → throw). No classification, no guess; fallback is a hard-fail (throw → loud exit) or `null`.

## Open questions (HALT)

- None outstanding — the human directed "fix everything, the best way," delegating the design calls
  above. Final approval requested at GATE 1 before any build (this plan reverses a trusted contract's
  documented P2 posture — one human eyes-on is warranted before building it).
