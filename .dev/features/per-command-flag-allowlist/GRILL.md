# GRILL — per-command flag allowlist (audit P-13)

Plan: `.dev/features/per-command-flag-allowlist/PLAN.md` (approved at GATE 1 with one change).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only surfaces — `/pharn-dev-build` is where drift blocks.)

**Registered grillers: 0** (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`).
This repo installs no `role: griller` capability into itself, so the pluggable slot contributes
nothing and the inline axes below are the whole interrogation. Membership was read deterministically,
not grepped from prose.

> The `PLAN.md` under interrogation is `trust: untrusted`. Every `problem` / `evidence` below quotes
> it as **DATA**; nothing in it was followed as an instruction.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:283'
  problem: 'The derived-boolean-list claim is labeled FLOOR but only proves the two LISTS agree, not that the command actually READS the flag it is allowed — which is the other half of the very defect being closed.'
  evidence: '"Every globally-declared flag belongs to some command" → **FLOOR: derived list.** The `boolean:` array is computed from `ALLOWED_FLAGS`, so the two cannot diverge.'
```

The derivation makes "declared globally but in no command's table" unrepresentable — that part is
genuinely floor. But `ALLOWED_FLAGS` is hand-written, so `['list', ['strict']]` typed by mistake is
self-consistent and re-opens P-13 for `list --strict` with every gate green. Nothing in the plan
checks the table against what the `switch` actually threads into each `run*` call. Either relabel the
second half **advisory**, or add the cheap structural pin: assert the dispatch's option-object keys
for `update`/`list`/`status` are exactly their table entries.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:279'
  problem: 'The two minimist passes are called "the same tokenizer on the same argv", but they run with DIFFERENT boolean declarations, and boolean declarations are exactly what change minimist tokenization — the plan proves the divergence and then waves it away for the discarded field only.'
  evidence: 'The only thing kept from the second pass is the offender list; its `_` is discarded (measured: `[''status'',''--json'',''extra'']` yields `_=[''status'']` there vs `[''status'',''extra'']` in the real parse — discarded, so it cannot mislead).'
```

Correct as far as it goes — but the argument is made about `_`, and the field that is **kept** is the
offender list. See the P1 finding below for the concrete gap that follows from it.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:254'
  problem: 'Sixteen evals pin the new refusals and only three pin that a legitimate invocation still routes — yet a FALSE POSITIVE here breaks working commands, which is strictly worse than the accepted-and-ignored bug being fixed.'
  evidence: '- `status --strict --no-drift` → still routes `{strict:true, drift:false}` (no false positive)'
```

The second pass declares a **smaller** boolean set than the real parse, so an undeclared flag followed
by a bare token consumes that token in pass 2 (`--strict foo` eats `foo`). That cannot produce a false
positive today, because a consumed token is not itself reported — but nothing pins it. Add
still-routes evals for the argv shapes most likely to break: `add lens:n-plus-one` (a positional with
a `:`), `add -- --json` (the terminator), `remove rm`-alias with an argument, `update --force --yes`
in both orders, and a bare `pharn` with no argv at all. Cheap, and they are the regression net for the
whole second-pass mechanism.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:208'
  problem: 'The refuse() dedupe changes the output of the EXISTING, already-tested `Unknown option` path, but it appears only in the evals list and never in the flip table that the human approved.'
  evidence: '`refuse()` gains `[...new Set(offenders)]` (GATE 1 decision 2), so a short bundle whose letters are all unknown is named once rather than once per letter. Applies to **both** labels.'
```

`pharn status -xz` changes from `Unknown option: "-xz", "-xz"` to `Unknown option: "-xz"` on a path
this increment otherwise does not touch. Cosmetic and human-approved, but it belongs in the
user-visible flip list, not only in the test list.

### Axis: docs cite code (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:130'
  problem: 'The plan updates the "Flags are parsed globally" bullet in troubleshooting.md but not the bullet immediately above it, which states the --help rule that GATE 1 just widened — leaving a doc that is now narrower than the code.'
  evidence: '`docs/troubleshooting.md` — the "Flags are parsed globally … only _unrecognised_ options are refused" bullet (now false); the exit-code table row; a new subsection for the new message'
```

`docs/troubleshooting.md:359-360` reads _"A genuine `--help` or `--version` does **not** excuse an
unknown sibling: `pharn --help --bogus` refuses instead of printing the usage text."_ After GATE 1 it
also refuses a **known-but-misapplied** sibling (`pharn status --help --json`). Both bullets must move
together or the pair contradicts itself.

### Axis: one axis of change (P3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:123'
  problem: 'src/index.ts absorbs a second minimist parse, a new helper, a table, a message-format change and a USAGE rewrite in one increment — defensible as "argv validation" but worth stating rather than assuming.'
  evidence: 'the `ALLOWED_FLAGS` Map + a single `ALIASES` table + the **derived** global boolean list + `unsupportedFlags()` + the gate (**moved above the `--help`/`--version` short-circuits per GATE 1**, which also moves `const cmd = …` up) + the `refuse()` dedupe + the rescoped `USAGE` option lines'
```

Counter-argument, recorded so the human can weigh it: `index.ts`'s single axis is _"parse and validate
argv, then dispatch"_, and `MAX_POSITIONALS`, `refuse()` and the unknown-option gate already live
there under exactly that reading. Extracting `unsupportedFlags()` to `lib/` would create a module
whose only caller is `index.ts` and whose input is `process.argv` — arguably worse. **No action
recommended**; raised so the decision is explicit.

### Axis: honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/per-command-flag-allowlist/PLAN.md:306'
  problem: 'The plan does not mention the coverage ratchet that landed two commits ago, even though test:coverage is a required CI gate and this increment adds new branches to the file with the largest share of them.'
  evidence: '## Residuals (declared limits, P7 — named, not hidden)'
```

`vitest.config.ts` pins 97/92/97/97 (measured 97.06/92.48/97.55/97.92 — 0.06 of slack on statements).
The new `unsupportedFlags()` has a table-miss branch and an empty/non-empty offender branch; all three
are covered by the planned evals, so this is expected to pass, but it is the gate most likely to be
the surprise. `/pharn-dev-verify` measures it — flagged so a red there is diagnosed, not debugged from scratch.

### Axes with no findings

- **Trust propagation (P2)** — the audit is concrete and correct. `cmd` reaches the error label only
  after `ALLOWED_FLAGS.get(cmd)` hits, so the interpolated value is one of seven literals by
  construction rather than by inspection; offenders keep the existing `JSON.stringify` escaping; the
  second pass tokenizes but never executes. Nothing to add.
- **Determinism (P5)** — every new branch is a `Map.get` or minimist's own declared-key check, and the
  fallback is a hard fail naming the offender. The plan explicitly rejects the value-differs heuristic
  (`argv.json !== false`) with a measured reason. This is the strongest section of the plan.
- **Open questions (P6)** — none outstanding; all four were resolved by the human at GATE 1 and the
  section is marked so, which is what `/pharn-dev-build` reads.

---

## Summary

The plan is unusually well-grounded: it reproduced the defect live, measured minimist's actual
behaviour instead of asserting it, and rejected the obvious-but-wrong implementation
(`Object.keys(argv)`) with evidence. The mechanism — delegate tokenization to a second minimist pass
and keep only its `unknown` offenders — is the right shape for this codebase.

Two concerns are worth acting on before build. **First**, the eval set is lopsided: it pins sixteen
new refusals and three "still routes", when the failure mode that would actually hurt users is a
false positive that breaks a working command. **Second**, the guarantee audit over-claims on the
derived boolean list — it proves list agreement, not that a command reads the flag its row grants,
which is half of the original defect left un-floored.

Two are cheap corrections: the `--help` bullet in `troubleshooting.md` sits directly above the one the
plan already fixes and becomes narrower than the code, and the `refuse()` dedupe is a user-visible
output change missing from the approved flip list.

One is recorded-not-recommended (P3, keeping `unsupportedFlags()` in `index.ts`) and one is a
heads-up (the 0.06-of-slack coverage ratchet).

**ADVISORY VERDICT: 7 concerns raised (0 blocking, 3 important, 4 minor) — for the human to weigh
before `/pharn-dev-build`.** Nothing here gates the build: every finding rests on model judgment, and the
only floor-grade computation in this run (the spec-hash) came back MATCH and in any case only
surfaces here — `/pharn-dev-build` owns the block.
