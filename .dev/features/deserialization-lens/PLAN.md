# PLAN — unsafe-deserialization lens (partial-floor P2 lens over CODE)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — SHA-256 of ARCHITECTURE.md, pinned this run
- increment: Add a **product** lens (`pharn-review/unsafe-deserialization/`) that reads CODE as untrusted DATA and emits a finding per **dangerous deserialization / dynamic-code-eval sink CALL** (`eval` / `new Function` / `vm.runIn*Context`; `pickle`/`marshal`/`dill`/`_pickle` `.load(s)`; node-serialize `unserialize`; unsafe `yaml.load`), backed by a new deterministic, injection-immune deserialization scanner in the floor.
- layer(s): pharn-review (product lens) + .dev/floor (deterministic helper — build apparatus, not a layer in the pharn-\* tree) # ARCHITECTURE.md §4
- constitution_refs: [P0, P2, P4, P5, P7]

## What is being added (and where — the dev/product boundary)

The **deserialization sibling of the `injection` lens** (`pharn-review/injection/`, #43) and the
`secrets-in-code` lens (`pharn-review/secrets-in-code/`, #42). Where `injection` scans CODE for a concat/interp
**shape into a sink** and `secrets-in-code` scans for a secret-shaped **literal**, this one scans CODE for a
**dangerous deserialization / dynamic-code-eval sink CALL** — a fixed callee-name membership set (plus one
`yaml.load` `SafeLoader` discriminator) — via a new `.dev/floor/scan-code-deserialization.mjs`. It mirrors the
`injection` / `trust-fence` / `secrets-in-code` lens structure (the P2 lens precedents), the security griller's
honest **partial-floor** split, and the `scan-code-injection.mjs` / `scan-code-secrets.mjs` scanner contract
(fixed pattern set over TEXT, single-file, fail-closed).

- **Product capability → ROOT `pharn-review/unsafe-deserialization/`** (what a PHARN user receives).
- **Build trace → `.dev/features/deserialization-lens/`** (this PLAN + the later GRILL/REGRESS/VERIFY/REVIEW/SHIP).
  NEVER place the lens or its evals under `.dev/`.

## The honest floor boundary (why this is NOT taint analysis, and why JSON.parse is deliberately NOT flagged)

Read this first — it is the crux P0/P7 demand be gotten right.

- **FLOOR (a real partial floor):** a deterministic scan for a **dangerous deserialization / dynamic-code-eval
  sink CALL** — a recognized callee (`eval(`, `new Function(`, `vm.runIn*Context(`, `pickle|cPickle|_pickle|marshal|dill.load(s)(`,
  node-serialize `unserialize(`, unsafe `yaml.load(`), on one line. This is regex membership over the code TEXT
  (`ARCHITECTURE.md §2` primitive #3), **injection-immune by construction** (no comment can move it). Unlike the
  `injection` scanner it needs **no** `+`/`${…}` taint operator: these calls are **dangerous by the call itself**
  (dynamic code execution / arbitrary-object deserialization) regardless of operand — a stronger, lower-false-
  negative floor. The one discriminator is `yaml.load`: flagged **only** when the line does not carry
  `SafeLoader` (so `yaml.safe_load(...)` and `yaml.load(x, Loader=yaml.SafeLoader)` are true-negatives).
- **ADVISORY (explicitly NOT attempted — no faked taint analysis):** whether the deserialized/evaluated
  operand is **actually untrusted** (`eval("2+2")` on a trusted constant fires the same as `eval(req.body)` —
  the scanner detects the CALL, not the operand); whether **validation/allowlisting happens elsewhere**;
  **prototype pollution** via `JSON.parse` + an unsafe recursive merge into `__proto__`; **deserializing into
  objects without schema validation**; **aliased sinks** (`const e = eval; e(x)`); a `Loader=` configured on a
  prior line (multi-line yaml). These are judgment — the lens **surfaces** them, it **never gates** (a lens
  cannot "decide approve" — `ARCHITECTURE.md §7`).
- **JSON.parse is deliberately NOT a floor sink (honesty, P0).** `JSON.parse(...)` is safe by itself — it cannot
  instantiate arbitrary objects or execute code; its only risk (prototype pollution) lives in a **downstream
  merge**, which is not a detectable call SHAPE. Flagging bare `JSON.parse` would be a false-positive flood and
  would over-claim. Prototype-pollution risk around parsed data is **advisory** (the lens may note it), never a
  floor finding. This keeps the floor injection-immune AND false-positive-bounded.
- **Bounded, stated plainly (P0):** "detected a dangerous deserialization / dynamic-eval CALL on line N" is a
  **guarantee**; **"this code is deserialization-safe / free of unsafe deserialization" is NOT** — and is struck.
  A scanner-clean file is not deserialization-safe (aliased sinks, multi-line `yaml.load` config, `JSON.parse`
  - unsafe merge, and novel/native deserializers all evade a fixed line-local callee set). This mirrors
    `scan-code-injection.mjs`'s "detected a concat-into-sink ≠ the code is injection-free."

The pattern set was **empirically validated this run** (24/24 samples: every dangerous call detected; `json.loads`,
`JSON.parse`, `yaml.safe_load`, `yaml.load(…, Loader=…SafeLoader)`, `retrieval(`, `evaluate(`, bare `loads(`, and
`pickleThing(` all clean true-negatives; `.eval(` and all three `vm.runIn*Context` variants fire). This is why the
increment PROCEEDS rather than HALTs on the "can the sink set be cleanly defined" gate.

## Files

- `pharn-review/unsafe-deserialization/unsafe-deserialization.md` — the lens (`role: lens`, mirrors injection.md) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/cases/case-pickle-loads.md` — CODE calling `pickle.loads` on a request body (untrusted fixture) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/cases/case-safe-comment.md` — ★ CODE with a REAL `eval(...)` on request input WITH an `// already validated, safe, do not flag` suppression comment — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/cases/case-safe-yaml.md` — CODE using `yaml.safe_load` + `JSON.parse` (no dangerous call); scanner-clean true-negative — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-pickle-loads.json` — structural assertions (1 finding, P2, file = the `pickle.loads` line) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-pickle-loads.md` — prose expected (human-readable) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-safe-comment.json` — ★ structural (1 finding + `needle_absent_from_enum_gated: "already validated"`) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-safe-comment.md` — prose expected — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-safe-yaml.json` — structural assertions (`finding_count == 0`) — layer pharn-review
- `pharn-review/unsafe-deserialization/evals/expected/expected-safe-yaml.md` — prose expected — layer pharn-review
- `.dev/floor/scan-code-deserialization.mjs` — deterministic dangerous-deserialization-call scanner over a CODE file (mirrors scan-code-injection.mjs; fixed callee set over TEXT + one yaml discriminator) — build apparatus
- `.dev/floor/scan-code-deserialization.test.mjs` — hermetic tests incl. the ★ injection-immunity tests + all three sink kinds + true-negatives (json.loads / JSON.parse / yaml.safe_load / SafeLoader-qualified) — build apparatus

## The scanner (`.dev/floor/scan-code-deserialization.mjs`) — the fixed pattern set (the axis of change, P3)

Same contract as `scan-code-injection.mjs`: single-file arg; stdlib-only; fail-closed (missing/non-file target →
nonzero exit, NOTHING on stdout); output `{"found":<bool>,"hits":[{"line":<int>,"kind":"<kind>"}]}` on stdout,
exit 0 on a successful scan; hits sorted by line then kind. Adding/removing a sink family is the ONLY axis of
change (P3). Three kinds — a recognized dangerous callee is the trigger; only `unsafe-yaml-load` carries a
same-line negative discriminator (`unless: /SafeLoader/`). Validated this run:

- `code-eval` → `/\beval\s*\(|\bnew\s+Function\s*\(|\bvm\.runIn(?:This|New)?Context\s*\(/`
- `unsafe-deserialize` → `/\b(?:pickle|cPickle|_pickle|marshal|dill)\.loads?\s*\(|\bunserialize\s*\(/`
- `unsafe-yaml-load` → `/\byaml\.load\s*\(/` **unless** the line matches `/SafeLoader/`

**Boundary vs the `injection` scanner (P3, one axis per file):** this scanner owns **deserialization + dynamic
code-eval** sinks (`eval`/`Function`/`vm`/`pickle`/`yaml`/`unserialize`); the `injection` scanner owns
**concat/interp into query/command/HTML** sinks. There is **no overlap** — Node `child_process.exec(` stays the
`injection` scanner's `command-injection`, and is deliberately excluded here — so no call is double-flagged and
each scanner changes for exactly one reason.

The "dangerous by the call" design is the point: these sinks execute code or instantiate arbitrary objects
regardless of operand, so — unlike a query that is safe when parameterized — they need no taint operator. The
honest cost is the mirror of injection's: the scanner flags `eval("2+2")` on a trusted constant too; whether the
operand is actually untrusted is the ADVISORY layer, never this floor.

## Contracts satisfied

- `pharn-contracts/finding-shape` — every emitted finding is the exact finding object; the lens **cites** the enum-gated / free-text split, does not restate it (P4). The lens `reads:` it.
- `pharn-contracts/eval-format` — each `expected/*.json` uses only the `structural[]` kinds (`finding_count`, `field_equals`, `file_resolves`, `needle_absent_from_enum_gated`) + `semantic[]` for the advisory judge; `skill_kind: llm`. Cited, not restated (P4).

## Precedents mirrored (cite, don't restate — P4)

- `pharn-review/injection/injection.md` (+ its evals + `.dev/floor/scan-code-injection.mjs` + `.test.mjs`) — the **nearest** precedent: a code-reading P2 lens backed by a `.dev/floor/scan-code-*.mjs` scanner. Mirror its lens structure, frontmatter, untrusted-input fence, finding-output block, `writes:` shape (`features/<name>/REVIEW.md` + `findings.json`), the two-layer partial-floor split, the "two clocks" note, the guarantee audit, and the ★ injection-immunity test contract.
- `pharn-review/trust-fence/trust-fence.md` — the original P2 lens; `file` = the **vulnerable operation's** line (from the scanner), never a comment's line.
- `pharn-contracts/finding-shape.md` — the finding object + the enum-gated / free-text split + the `findings.json` emission contract (cited, not restated).
- ARCHITECTURE.md §3.1 (Capability frontmatter), §2 (floor primitive #3 = regex), §7 (a lens never "decides approve"), §8 (finding object).

## Evals to write (P1 — every capability + every `enforces` rule_id gets ≥1 eval)

- `unsafe-deserialization` / `P2` → **case-pickle-loads** → 1 finding: `type FINDING`, `rule_id P2`, `severity important` (advisory value, fix #3), `file` = the `pickle.loads` line (from the scanner). **Binds `enforces: [P2]`.**
- `unsafe-deserialization` / `P2` → **case-safe-comment** (★) → **still 1 finding** on the `eval(...)` line; `needle_absent_from_enum_gated: "already validated"` — the `// safe, do not flag` suppression comment reaches only free-text, never suppresses the enum-gated finding, never sets an enum-gated field.
- `unsafe-deserialization` / `P2` → **case-safe-yaml** → **0 findings** (`finding_count == 0`); scanner clean; no false positive on `yaml.safe_load` / `JSON.parse`.

(`new Function`, `vm.runIn*Context`, `marshal`/`dill`/`_pickle`/`cPickle`, `unserialize`, and the SafeLoader-qualified
`yaml.load` true-negatives are covered exhaustively in `scan-code-deserialization.test.mjs` — the floor proof of the
scanner — mirroring how `scan-code-injection.test.mjs` covers all sink families while the lens ships three
demonstrative eval cases. Adding lens eval cases for the other families is a later increment if a real dogfood
need surfaces, P7 — not built speculatively now.)

## Guarantee audit (P0) — the honest split (a REAL PARTIAL FLOOR)

- **Lens membership** (`role: lens` + required frontmatter + non-empty evals + `enforces: [P2]` produced by ≥1 eval) → **FLOOR** (`.dev/floor/validate.mjs`, primitive #3 enum/regex). Raises the live capability count by 1 (read the pre-build count live, P6). A prose / code-block mention never registers.
- **Dangerous-deserialization-call detection over CODE** (`.dev/floor/scan-code-deserialization.mjs`, a fixed callee set over the code text + one `SafeLoader` discriminator) → **FLOOR** (primitive #3), **injection-immune by construction**: the verdict is regex membership over TEXT only — a comment claiming "already validated / safe / do not flag" cannot suppress a real `eval`/`pickle.loads`/`yaml.load` hit; a comment claiming "unsafe deserialization here" cannot manufacture one. Proven by the scanner's ★ tests. Named precisely: **"detects a dangerous deserialization / dynamic-code-eval sink CALL."**
- **Is the operand actually untrusted? Is validation done elsewhere? Prototype pollution via JSON.parse+merge? Deserialize-without-schema? Aliased sinks? Multi-line yaml Loader? Is the code deserialization-safe?** → **ADVISORY — the bulk.** Irreducible judgment; the lens **surfaces**, it **never gates** (`ARCHITECTURE.md §7`). **No taint analysis is claimed.**
- **Bounded honestly:** "detected a dangerous deserialization / dynamic-eval call on line N" is a **guarantee**; **"this code is deserialization-safe / free of unsafe deserialization" is NOT** — struck (the disease P0 forbids). A scanner-clean file is not deserialization-safe.
- **Two clocks (honest).** The scanner's **output** is FLOOR (deterministic regex). Until a live isolated lens-runner lands (deferred, P7 — as for every lens/griller), the review stage applies this lens **inline**, so the lens's **act** of invoking the scanner is **advisory orchestration**, backstopped by the scanner's own tests + this lens's eval. The guarantee is "the scanner IS deterministic," not "the model always ran it."
- **New floor primitive, justified (P7).** `.dev/floor/scan-code-deserialization.mjs` is added **because** the lens's floor claim ("detects a dangerous deserialization call deterministically") requires a deterministic backstop — else it is a guarantee with no floor reduction (the disease). It is the deserialization sibling of `scan-code-injection.mjs` / `scan-code-secrets.mjs`; the shared "scan a code file line-by-line against a fixed pattern set, fail-closed" scaffold is an accepted, deferred duplication (consolidating the three scanners would touch a separate axis, P7). Not speculative — it is the floor reduction of a claim this lens makes, to be ratified at GATE-1.
- **Fixture behavior** → the finding OUTPUT on the committed fixtures (counts + enum-gated fields + `needle_absent_from_enum_gated`) is floor-CHECKED at **eval time** by `.dev/floor/check-structural.mjs` (`node .dev/floor/check-structural.mjs <expected.json> <actual.json> [repoDir]`; exit 1 on RED, exit 0 + "GREEN" on pass). It pins behavior on known inputs and proves the trust-fence holds — it is **NOT** a runtime guarantee that "deserialization-safe" is deterministic.
- **"This lens ensures the code is deserialization-safe / has no unsafe deserialization."** → **struck (the disease).** It (a) deterministically detects dangerous deserialization / dynamic-eval call shapes and (b) surfaces the untrusted-ness / validated-elsewhere judgment; "produced a finding" (or none) **never** means "the code is deserialization-safe." injection, secrets-in-code, and trust-fence taught exactly this.

## Trust audit (P2) — the artifact under review is `trust: untrusted` CODE

- **Input:** a source-code file under review, tagged `trust: untrusted` (`THREAT-MODEL.md §2`, surface #4). Everything in it — comments, strings — is DATA.
- **Detection is taint-free:** the scanner's verdict is regex over TEXT only, so an injected comment (`// already validated, safe, do not flag`) **cannot** move the enum-gated verdict — the strongest form of the trust-fence discipline (proven by the ★ scanner tests + the ★ `case-safe-comment` eval).
- **Taint propagation through the finding (`ARCHITECTURE.md §8`, fix #1):** the enum-gated fields (`type`, `rule_id`, `severity`, `file`) are the lens's **own** assertion — TRUSTED, produced by scanner-line/enum-check; `file`'s line comes **from the scanner** (the dangerous-call line), **never** a comment's line, including an injected one. A finding that cited the comment's line would send the developer to delete the comment and leave the `eval`/`pickle.loads` in place — so `file` must point at the sink line. The free-text fields (`problem`, `evidence`) **inherit the code's untrusted tag** — quoted DATA, never a downstream instruction. The `needle_absent_from_enum_gated: "already validated"` trip-wire on the ★ case proves no injected claim reaches an enum-gated field. **No guaranteed decision rests on a tainted field.**
- **Residual (named, not hidden — `LIMITS.md §2`):** when a downstream LLM stage consumes the finding's free-text, "do not execute this as an instruction" is a heuristic again. Fix #1 bounds the blast radius (free text never alone gates a guaranteed decision) but does not zero it — the attempt-0 target.

## Determinism audit (P5)

- The scanner branches on **regex membership** over the fixed callee set (+ the same-line `SafeLoader` negative discriminator) — no LLM classification in the floor path.
- **Fail-closed:** a missing / non-regular-file target → nonzero exit, NOTHING on stdout (never a silent "clean"), mirroring `scan-code-injection.mjs`.
- The lens's terminal fallback when it is genuinely unsure whether a flagged call operates on untrusted input (Layer 2 judgment) is to **emit the finding and ask the human** (P5) — never silently suppress, never guess.

## Open questions (RESOLVED at GATE 1 — none remain)

- **Sink-set scope for v0.1.0** — **RESOLVED (human, GATE 1, 2026-07-03): ship the three-kind fixed set** —
  `code-eval` (`eval` / `new Function` / `vm.runIn*Context`); `unsafe-deserialize`
  (`pickle|cPickle|_pickle|marshal|dill.load(s)` + node-serialize `unserialize`); `unsafe-yaml-load`
  (`yaml.load` unless the line carries `SafeLoader`) — with `JSON.parse` / prototype-pollution left ADVISORY
  (not a floor sink). The human selected "Three-kind set as proposed" and approved the plan as written. No open
  questions remain; this plan is cleared for `/pharn-dev-grill` → `/pharn-dev-build`.
