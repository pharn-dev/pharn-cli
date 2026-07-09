---
name: seam-config
trust: trusted
layer: pharn-contracts
purpose: "Single source of truth for the seam-resolution config object (the confidence-gated chain's policy). Schema only, zero behavior, no role: (not a Capability — like finding-shape). Defines the resolutionOrder step enum and the one floor invariant — a terminal ask can never be configured away (ARCHITECTURE.md §5, §2; P0, P5)."
---

# Contract — seam-config

> A `pharn-contracts` schema (zero behavior, no `role:` — it is **not** a Capability, exactly like
> `finding-shape.md` and `eval-format.md`). It is the SoT for the **seam-resolution config** — the
> policy that governs how the agnostic resolver walks its confidence-gated chain when it hits a seam
> (a framework/library boundary it may not know reliably). It elaborates `ARCHITECTURE.md §5`
> ("The agnostic resolver resolves each needed seam once through a confidence-gated chain … terminal
> fallback is **ask**, P5") and reduces its one guaranteeable invariant to `ARCHITECTURE.md §2`
> primitive #3 (enum / presence). The principles (P0, P2, P5) live in `CONSTITUTION.md`; the
> deterministic validator (`.dev/floor/check-seam-config.mjs`) **cites** and **conforms** to this
> schema — it does not restate its semantics (P4).

## The object

A seam-resolution config is a JSON object (the `seam` block of a project's config):

```yaml
seam-config:
  resolutionOrder: ["official-skill", "pinned-docs", "model", "fetch", "ask"] # ordered walk; MUST contain "ask"
  modelConfidenceThreshold: low | medium | high # OPTIONAL — the gate at the "model" step
  haltOnUnknown: true | false # OPTIONAL — hard-stop on an unresolved seam
```

- **`resolutionOrder`** — a non-empty, ordered array of **steps**. At runtime the resolver walks it,
  stops at the first step that resolves the seam, else falls through to the next — the terminal step
  being **ask** (halt and ask the human). The **order is user-configurable** (reorder / drop steps);
  the **walk itself** is fixed. See "Relationship to ARCHITECTURE §5".
- **`modelConfidenceThreshold`** _(optional)_ — the confidence bar at the `model` step: if the model is
  **not** confident to this threshold (e.g. the package version is newer than its training, or the API
  is unknown), it **skips to the next step** rather than guessing. Absent ⇒ the runtime default applies.
- **`haltOnUnknown`** _(optional)_ — `true` hard-stops on a seam that no step resolved. Absent ⇒ the
  runtime default applies. (Belt-and-suspenders: with a terminal `ask` present, "unknown" already
  stops at `ask`.)

## The step enum

`resolutionOrder`'s elements are members of exactly this set — the sources named in
`ARCHITECTURE.md §5`'s chain (cited, not restated — P4):

| step             | `ARCHITECTURE.md §5` source | meaning                                             |
| ---------------- | --------------------------- | --------------------------------------------------- |
| `official-skill` | "official skill"            | a vendor skill exists for this seam → use it        |
| `pinned-docs`    | "pinned ai_docs"            | pinned docs for this seam → use them                |
| `fetch`          | "fetch+pin"                 | fetch + pin current docs → use them                 |
| `model`          | "model"                     | the model's own knowledge — gated by the threshold  |
| `ask`            | "ask" (terminal fallback)   | HALT and ask the human — the required terminal stop |

## The floor invariant (the ONE guaranteed thing — P0, P5)

**`resolutionOrder` MUST contain `"ask"`.** A config without `"ask"` is **REJECTED** (fail-closed).
This is the floor reduction of `ARCHITECTURE.md §5`'s "terminal fallback is **ask** (P5)": without a
terminal `ask`, an unknown seam has no defined stop, and the resolver would fall off the end of the
walk into a guess (a hallucinated API). `ask` always resolves (a human answers), so its **presence**
guarantees the walk always terminates at a stop — **regardless of its position**. The only unsafe
config is `ask` _absent_.

- **Presence, not last-ness, is the invariant.** A config with `ask` not last (steps after it) is
  merely wasteful (those steps are unreachable), **not** unsafe — so it is **valid**. "`ask` should be
  last" is a quality lint, **advisory**, never floor.
- Every element of `resolutionOrder` must be a member of the step enum, and `modelConfidenceThreshold`
  / `haltOnUnknown`, when present, must be well-typed (enum / boolean). These are enum / type checks
  (`ARCHITECTURE.md §2` primitive #3), fail-closed on any non-member.

### Strict-config rejections (the strict posture — BUG 2 / BUG 4)

Beyond the terminal-`ask` safety invariant, the validator **rejects** — naming the offender
(JSON-escaped as DATA, P2) — three hand-edit slips a behavior-driving config should not swallow. Each
is an enum / set-membership check (`ARCHITECTURE.md §2` primitive #3), fail-closed:

- **Unknown top-level key → REJECTED (BUG 2).** Only `resolutionOrder`, `modelConfidenceThreshold`,
  and `haltOnUnknown` are permitted; a typo'd knob (e.g. `haltOnUnknwon`) is named, not silently
  ignored — so it can never quietly disable the knob the user meant to set. This **supersedes** the
  earlier "extra fields ignored" stance (see "Trust class" + "Forward-compat").
- **Duplicate `resolutionOrder` step → REJECTED (BUG 4a).** Each step may appear at most once; a
  repeat is a copy-paste slip. (Distinct steps rendered unreachable by an earlier `ask` stay **valid**
  — see "Presence, not last-ness"; that is position, not repetition.)
- **`modelConfidenceThreshold` with no `model` step → REJECTED (BUG 4b).** The threshold gates the
  `model` step; with no `model` step it is a dead knob — add `model` or drop the threshold.

## The default (matches ARCHITECTURE §5)

`["official-skill", "pinned-docs", "model", "fetch", "ask"]` — the §5 chain order verbatim (model
before fetch). A project may reorder in its own config (e.g. `fetch` before `model`, if it prefers
fresh docs over training); the floor preserves the terminal `ask` under any reordering.

## Relationship to ARCHITECTURE §5 (an honest extension note — P0)

`ARCHITECTURE.md §5` states **one** confidence-gated chain. This schema **extends** it into a
**user-configurable** order and adds two optional policy knobs (`modelConfidenceThreshold`,
`haltOnUnknown`) that §5 does not name. The extension is **floor-safe**: configurability cannot weaken
§5's terminal-`ask` invariant, because the floor validator rejects any order lacking `ask` — so the
one thing §5 guarantees is guaranteed _harder_ under configuration, not softer. `ARCHITECTURE.md` is a
human-only doc (write-protected, fix #2); this note is surfaced for a human to reconcile §5's wording
if the configurable framing (or a fetch-before-model default) should become canonical. It is **not**
agent-edited into §5.

## Guarantee audit (P0) — what this contract does and does NOT guarantee

Honest scope, because the disease this repo exists to prevent is "written in the contract" mistaken
for "therefore guaranteed":

- **Config validity → floor (enforced by `.dev/floor/check-seam-config.mjs`, primitive #3).** A
  conforming config has a `resolutionOrder` that is a non-empty array of enum steps **containing
  `ask`**, with well-typed optional fields. This IS guaranteed the moment the validator runs GREEN.
- **Correct resolution at runtime → ADVISORY.** Whether the resolver, at the `model` step, actually
  _knows_ the API (vs a confident-but-wrong guess) is model judgment — backstopped by the
  confidence-gate (skip-if-not-confident → toward `ask`) and the terminal `ask`, **not** by this
  contract. "check-seam-config passed" must **never** read as "the seam was resolved correctly."
- **The walk executed faithfully at runtime → ADVISORY.** The runtime mechanism (walk / stop-at-first
  / confidence-gate / terminal ask) is the agent following an ordered instruction — a future
  `pharn-core` capability. Only the config validity that makes a _safe_ walk possible is floor here.

## Trust class (P2)

A seam config can originate in **untrusted** input (a forked/poisoned repo — `THREAT-MODEL.md §2`,
seam-resolver fetch fallback / seam-record poisoning). The validator's verdict ranges **only** over
enum-gated / key-set / type-checked fields (`resolutionOrder` steps ∈ enum, no duplicates, `ask`
presence, the threshold enum + its `model`-step cross-field, the boolean type, and the **allowed key
set**) — **never** over any free-text VALUE. A poisoned config can therefore only name an invalid step,
drop `ask`, duplicate a step, set a dead threshold, or **carry an unknown key** — every one of which is
a **RED (rejected, named)**. Taint can flip the verdict **only toward RED (fail-closed)**, **never** to
a wrong-GREEN, and the offending key/value is echoed **JSON-escaped as DATA**, never executed. This is
*stricter than* — and supersedes — the earlier "extra fields ignored" posture: rejecting an unknown key
is more fail-closed than ignoring it. (`finding-shape.md` keeps the ignore posture for finding
_ingestion_; a behavior-driving **config** is validated strictly — see "Forward-compat".)

## Forward-compat (P7 — an honest limit)

Rejecting unknown keys means a **future** schema field here is rejected by an **older** CLI that
predates it. Accepted tradeoff, not oversight: this schema is **CLI-owned** (P3) and written + read by
the **same** CLI version at install time, so a config never legitimately carries a key the reading CLI
does not know. A new optional field is introduced by **bumping the allowed key set in lockstep** — the
CLI validator (`src/lib/seam-config.ts`), this contract, and the floor validator
(`.dev/floor/check-seam-config.mjs`) together — at which point the field is "known". Legacy configs
simply **omit** the `seam` block (absent ⇒ fine), so no legacy config breaks (P7). Stated here, not hidden.

## Determinism (P5)

Every check is a membership / presence / type test; the terminal fallback on any non-member is a loud
**RED**, never a guess. Doubly P5: the artifact this schema governs (the resolver's config) is itself
required by the floor to keep a terminal **ask** — so both the checker and the thing it checks end
their fallback chains at "ask / RED," never at a guess.
