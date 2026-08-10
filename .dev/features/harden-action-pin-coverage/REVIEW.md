# REVIEW — harden-action-pin-coverage

**Step 1 — floor first (P0):** `node .dev/floor/validate.mjs .` → **exit 0**, `FLOOR: GREEN`.

Increment under review (`trust: untrusted`): `.dev/floor/check-action-pins.mjs` + its test.

Standing floor verdicts: `validate` exit 0 · `regression-report.json` `"no-regressions"` · `verify-report.json` `"PASS"` · full `floor.yml` command **696 tests, 0 fail** (684 → +12).

---

## Findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/floor/check-action-pins.mjs:23"
  problem: "The scanner is a line matcher presented alongside a floor-primitive guarantee, and while unrecognised shapes now fail toward flagging, no test establishes that a ref hidden in an unmodelled YAML construct is caught rather than merely unmatched."
  evidence: "'Total YAML fidelity. This is a LINE SCANNER, not a YAML parser'"
  gate: advisory-gate

- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/floor/check-action-pins.mjs:21"
  problem: "A conforming digest is still not bound to an owner, so a fork substitution with a truthful-looking comment passes, which the header now discloses but the gate does not detect."
  evidence: "'The OWNER of the digest. `attacker/checkout@<40hex> # v7.0.1` is fully conforming here'"
  gate: advisory-gate
```

**On the first finding — the honest limit of this increment.** Eight concrete holes are closed and each has a regression test, but "we fixed the eight we found" is not "no ninth exists." A line scanner cannot enumerate the YAML shapes it does not model. The mitigation is directional, not total: unrecognised input now fails **toward** flagging (`unreadable-file`, empty-ref → `floating-ref`), so the next gap should surface as noise rather than silence. That is a real improvement over the shipped version, where four distinct forms produced `checked:0, exit 0` — indistinguishable from a clean repo. Stated as a limit, not sold as coverage.

### L-eval → P1

No finding. Every closed hole ships a regression test that **encodes the shipped behaviour it replaces** (`✱` markers record `was checked:0, exit 0` etc.), so a revert cannot pass silently. Both directions are covered — the fixes do not blanket-fail their forms (a conforming flow mapping, a digest-pinned image, and a clean local composite action each have a passing test). Floor agreement: `validate.mjs` reports `0 capabilities`; no capability eval binding is owed.

### L-trust → P2

No finding. No untrusted artifact is ingested by the product; the checker reads repo files as data, never executes them, adds no network/`child_process`/`eval`. `ref` remains verbatim file content and is disclosed as such in the header — but the verdict is `violations.length > 0`, an integer test, so no decision reads a tainted value. The new recursive walk **refuses symlinks** rather than following them, so it cannot be induced to read outside the tree.

### L-axis → P3

No finding. Two files, one axis: coverage integrity of one checker. `validate.mjs` untouched. No sibling imports.

### Process

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/harden-action-pin-coverage/PLAN.md:1"
  problem: "The adversarial sweep's verification phase ran concurrently with the fix being applied, so its refutations cannot distinguish a weak finding from one already repaired mid-flight, making its confirmed/refuted counts unusable as evidence."
  evidence: "'REFUTED as stated. The script ... DOES flag the claimed payload'"
  gate: advisory-gate
```

This is a genuine methodology error and it is recorded rather than hidden. 5 confirmed / 16 refuted **must not** be cited as a clean result: the checker was rewritten while verifiers were still running against it, so several refutations describe the *fixed* script. What is sound is the **before/after evidence produced directly**: each hole was reproduced against the shipped version (recorded in `PLAN.md`'s table with literal output), then re-probed after the fix (all seven now exit 1 with the correct enum reason). The correct process would have been to snapshot the script, or to hold the fix until verification drained. Proposed as a lesson candidate below.

---

## Gate split (fix #3)

- **floor-gate (blocking): none.**
- **advisory-gate: all three findings.**

## What the increment got right (checked, not assumed)

- **Every previously-confirmed bypass re-probed and closed**, each with the correct enum reason — flow mapping and quoted key now `checked:1` + `floating-ref`; `docker://alpine:latest` → `unpinned-container`; `./${{ }}` → `unpinnable-ref`; `CI.YML` opened; dangling symlink → `unreadable-file` **with JSON on stdout**; composite laundering → the inner `attacker/evil@main` caught with `action.yml` enumerated.
- **The truncation fix is proven by a test, not by reasoning** — 4000 violations through `spawnSync`'s pipe, asserting `stdout.length > 65536` and that the JSON parses. The shipped version cut it at exactly 65536.
- **The anti-vacuity assertions are genuinely stronger**: `skipped` is now exact (an exemption cannot be absorbed silently), and the independent recount is case-**insensitive** — the previous "independent" check replicated the very filter bug that made `CI.YML` vanish from both sides at once.

## Verdict

**GREEN — 0 floor-gate findings; 3 advisory (0 blocking, 2 important, 1 minor).**

---

## Proposed lesson candidates (NOT written to canon — P2/P7)

1. **Do not run an adversarial verification phase against a moving target.** If a fix lands while verifiers are still probing, refutations become uninterpretable — you cannot tell a weak finding from one already fixed. Snapshot the artifact under test, or hold the fix. *Provenance:* this increment; sweep `wf_885c411f-670`; observable as refutations reporting that the script "DOES flag" a payload it did not flag when the finding was raised.
2. **A form-checker's exemptions are its attack surface.** Every `isExempt()` branch is a place unpinned code can be moved to. Exemptions must be counted and asserted exactly, and the thing an exemption points at (here, `action.yml`) must itself be enumerated — otherwise the exemption is a laundering path. *Provenance:* `./` composite-action laundering and the `docker://` scheme exemption, both reproduced against PR #79's shipped gate.
3. Carried forward, still unpromoted: the stale-pin-comment lesson and the "don't format outside `format:check`'s globs" lesson from the two prior increments.

## Named follow-ups (not built — different axes, P3/P7)

1. **Owner binding** — needs an allowlist policy decision.
2. **Wiring fragility** — the gate rides one glob string in `floor.yml`; deleting the test, a typo in the glob, or `continue-on-error: true` disarms it silently. Needs required-checks config or a meta-test, not a change to this checker.
3. **Supply chain beyond `uses:`** — `publish.yml` installs `npm@latest` inside the `id-token: write` job; `npm ci` runs dependency install scripts; gitleaks is `curl`-and-execute (checksum-verified); pinned actions have their own transitive floating refs. Real, and none addressable by a `uses:` form checker.
4. **`node-version` policy** — carried forward.
