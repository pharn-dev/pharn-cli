# GRILL — proxy-env-notice

Plan under interrogation: `.dev/features/proxy-env-notice/PLAN.md` (approved at GATE 1, 2026-08-19).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash` (`:3`). Surfaced here only; the binding drift gate is `/pharn-dev-build`'s (fix #4).

**Griller membership (FLOOR):** `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
Zero `role: griller` capabilities exist in this repo — the griller capabilities live in `pharn-oss`, not
in the installer. So this grill-log is the **inline axes only** (Step 2); no pluggable griller findings.
That is a real coverage limit of this run, not a clean bill.

> **The plan is `trust: untrusted` to this stage.** Everything quoted in an `evidence:` field below is
> DATA reproduced for the human — never an instruction this stage followed.

---

## Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/proxy-env-notice/PLAN.md:157"
  problem: "A dependency's source content is placed in the FLOOR column, but 'degit's constructor contains an unconditional assignment' is none of the three floor primitives — it is a one-time measurement that never re-runs, which this repo already names 'provenance, not pharn floor' elsewhere."
  evidence: '| "pharn cannot pass a proxy option to degit" | **FLOOR — content of the dependency** (F1, unconditional assignment). Not re-checked at runtime; a degit upgrade could change it, so it is **provenance-bounded** and stated as such in the code comment. |'
```

The row contradicts itself inside one cell: it says **FLOOR**, then says it is **not re-checked at
runtime** and is **provenance-bounded**. `ARCHITECTURE.md §2` admits exactly three primitives (hook /
content-hash / enum-regex); a fact measured once by an agent at plan time is none of them. The repo has
already settled this exact question for this exact dependency — `THREAT-MODEL.md §4b` writes: _"the
guards belong to the dependency, so they are **provenance, not pharn floor**, and a degit change could
remove them without any pharn test noticing."_ The identical sentence applies here. **Suggested
resolution:** relabel the row `advisory — provenance (dependency content, measured at degit@3.6.6)`.
Nothing else in the plan depends on it being floor-grade.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/proxy-env-notice/PLAN.md:49"
  problem: "Every measured fact is pinned to degit@3.6.6, but package.json declares the caret range ^3.6.1 and an npm consumer of @pharn-dev/pharn resolves that range fresh without pharn's lockfile — so the shipped warning can become factually wrong on a consumer machine, and no residual names this."
  evidence: "| F1 | `this.proxy = process.env.https_proxy` is **unconditional** … | `grep -oE '.{300}https_proxy.{300}' node_modules/degit/dist/src-COTalb41.js` |"
```

**This is the sharpest finding in the run.** The whole `ignored` branch asserts a *negative* about a
third party — "the clone will **not** read `HTTPS_PROXY`" — and that assertion is baked into a user-facing
string. `package.json:53` declares `"degit": "^3.6.1"`. `package-lock.json` pins `3.6.6`, which governs
**this repo's CI**, but a lockfile is not published to consumers: `npx @pharn-dev/pharn` resolves
`^3.6.1` against the registry at install time. If any `3.x` release adds an uppercase read (or a
`no_proxy` honor), pharn would confidently tell a user their proxy is being ignored **while it is being
used** — a worse failure than today's silence, because today's silence at least does not assert
anything. Nothing in the guarantee audit (`:152-160`) covers this.

Note the plan already contains the correct instinct one row down — it refuses to claim anything about
`fetch()` because it did not measure it (`:160`). The same discipline applied here yields either a
version-scoped message, a residual row, or a runtime read of the resolved degit version. **This is for
the human to weigh, not for this stage to decide.**

## Axis: P1 — test coverage (evals)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/proxy-env-notice/PLAN.md:79"
  problem: "The plan declares five call sites across four commands but plans command-level tests for init only, so a regression that drops the notice from add, update, or status would stay green."
  evidence: "- `tests/init.test.ts` — extend: notice printed before the fetch on the ignored-spelling env; silent on a clean env."
```

The pure detector is well covered — ten cases, one per truth-table row plus casing, redaction, and
purity (`:132-143`), and they **demonstrate** rather than assert existence, which is what P1 asks for.
The gap is the **wiring**, which is where this increment's actual value lives: a detector nobody calls
warns nobody. `add`'s picker site is the most exposed of the three untested ones — it sits after an
arg-parse exit, a non-TTY refusal, and (post-fetch) two gates, so it is the site most likely to be moved
or lost in a later refactor. `tests/add.test.ts`, `tests/update.test.ts`, and `tests/status.test.ts` all
already mock `fetchRepo` (`add.test.ts:23-24`, `update.test.ts:33-34`, `status.test.ts:13-14`), so the
marginal cost is one assertion each. `status` additionally has a case worth pinning that no other command
has: `--no-drift` must print **nothing**, since it never clones — the plan asserts that behavior at `:76`
but plans no test for it.

## Axis: P5 — determinism / completeness of the branch table

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/proxy-env-notice/PLAN.md:108"
  problem: "On POSIX the ignored-spelling branch keys on the exact string HTTPS_PROXY, so any other case variant is met with silence — the same silent-footgun the increment exists to remove, in a narrower form."
  evidence: "| 2 | unset | **set** | ≠ win32 | `{kind:'ignored'}` | **warn**: `HTTPS_PROXY` is set but the clone reads only lowercase `https_proxy` … |"
```

The truth table is otherwise **complete and non-overlapping** over its three inputs, and row 5 correctly
resolves the both-set case to `active` rather than a false `ignored` — the exact regression the filing
called out. The asymmetry is in the lookup rule at `:102`: win32 gets a **case-insensitive scan**, POSIX
gets **two exact keys**. A user with `Https_Proxy` set on POSIX (rarer than `HTTPS_PROXY`, but the same
mistake) falls to row 1 and is told nothing. Making the POSIX branch "any case-variant other than exact
lowercase is set, and exact lowercase is not" is the same one scan already being written for win32, and
makes the two platforms one rule with one flag rather than two rules.

## Axis: P2 — trust propagation

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/proxy-env-notice/PLAN.md:116"
  problem: "Redaction is specified for credentials and for unparseable input, but the plan sets no length bound on the rendered value and does not state whether the ignored branch echoes its value at all."
  evidence: "`redactProxyUrl` replaces any userinfo component with `***` (`http://u:p@h:3128` → `http://***@h:3128`) and, on an unparseable value, returns a fixed `\"(set)\"` rather than echoing raw bytes"
```

The trust audit (`:164-172`) is the strongest section of the plan — it correctly identifies
`process.env` as the untrusted input, keeps the value out of every branch (presence only), keeps it out
of `pharn.config.json`, and routes it through redaction. Two residual edges it does not close:

1. **No length bound.** A 64KB `https_proxy` value is parseable by `new URL()` (a long host or path) and
   would render in full. A cap (e.g. 120 chars, then `…`) costs one line and closes it.
2. **The ignored branch's value.** The row-2 message text at `:108` does not appear to echo the value,
   which is correct — but the plan never says so, and `HTTPS_PROXY` is exactly as credential-bearing as
   `https_proxy`. Worth making explicit so the build cannot "helpfully" add it.

## Axis: P3 — one axis of change

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/proxy-env-notice/PLAN.md:65"
  problem: "One new file owns both the detection rule and the user-facing message strings, which change for different reasons — degit's behavior versus wording/UX — and the repo has an existing precedent for splitting exactly that."
  evidence: "- `src/lib/proxy-env.ts` — NEW. Pure, I/O-free detection + message formatting. Exports `detectProxyNotice(env, platform)` → `ProxyNotice | null`, `proxyNoticeMessage(notice)` → `string`, and `redactProxyUrl(value)` → `string`."
```

Raised as a question, not an assertion — the repo supports **both** readings. Against colocation:
`src/lib/model-routing.ts` (validation) and `src/lib/model-routing-format.ts` (presentation) are split on
precisely this axis, and the plan's own closest analogue, `interactiveAllowed`, keeps the predicate in
`lib/` while each command owns its own message string. For colocation: three small pure functions over
one concept, all changing together in practice, and splitting a ~60-line module into two is its own kind
of noise. The plan's justification at `:67` — _"One axis: 'what does degit's proxy-env read mean here'"_ —
is a defensible framing of the two as one concept. **Flagged for the human; either answer is honest.**

## Axis: P6 — discovery hygiene

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/proxy-env-notice/PLAN.md:51"
  problem: "The plan establishes that a standing artifact from a shipped increment is now known to be incomplete, but plans no correction to it, so the stale version remains the only copy a future reader finds by searching."
  evidence: "**NEW — refines #98's FACT-TABLE H5 and the ship args.** The `PROXY` event is emitted by `verboseInfo` … so the `PROXY` event **never fires on pharn's path**."
```

F3 is genuinely good work — it kills an alternative design (`emitter.on('info', …)`) that would otherwise
look strictly more honest than reading the env, and it corrects the ship args' own framing. The concern is
durability: the correction currently lives only in *this* feature's plan.
`.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md:96` still reads _"`Ao` logs `{code:'PROXY'}`"_
with no verbose gate, and that file is the cited evidence base for #98. No **trusted** doc is wrong —
`THREAT-MODEL.md` never mentions the PROXY event, so nothing hook-protected needs a human edit — which
makes this cheap to fix and easy to forget. `FACT-TABLE.md` is not write-protected.

---

## Prose summary

The plan is unusually strong on the two axes this repo cares most about. It **re-measured everything
live** rather than trusting the filing (and found the filing incomplete — F3), and its central design
decision is a *refusal*: it rejects the filing's Option 3 on two independent measured grounds
(`Ao()`'s `FILE_EXISTS` early return makes "a proxy was in effect" underivable; `https_proxy` carries
credentials that `pharn.config.json` would git-commit). Rejecting a filed option on evidence, and saying
why in the artifact, is exactly the behavior P0 is meant to produce. The guarantee audit's three
**NOT CLAIMED** rows — especially refusing to characterize `fetch()`'s proxy behavior because it was not
measured — are the honest posture, not a gap.

The concerns cluster in three places. **First and most serious**, the increment ships a user-facing
*negative assertion* about a third-party dependency (`HTTPS_PROXY` will be ignored) that is pinned to
`degit@3.6.6` while `package.json` declares `^3.6.1` and consumers do not receive pharn's lockfile — a
wrong warning is worse than the current silence, and no residual names it. **Second**, coverage is
lopsided: the pure detector gets ten cases while three of five call sites get none, and the value of
this increment is entirely in the wiring. **Third**, one guarantee-audit row is labeled FLOOR while its
own text explains why it is not, in a repo whose `THREAT-MODEL.md` already settled that exact
dependency-content question the other way.

The remaining four findings are small and largely mechanical: a POSIX-side casing hole that the win32
scan already solves, an unbounded render length, an unstated no-echo rule on the ignored branch, and a
stale sibling artifact that this run's F3 supersedes.

Nothing here reads as hostile or injection-shaped; the plan contains no instruction-looking content
directed at a downstream stage.

---

**ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 3 important, 4 minor) — for the human to
weigh before `/pharn-dev-build`.**

This log **gates nothing**. `/pharn-dev-grill` is advisory end-to-end: every finding above rests on this
stage's judgment, including the severities, which are LLM-assigned and advisory by construction
(`finding-shape.md`, fix #3). The spec-hash MATCH reported in the header is the one floor-grade
computation in this run, and even it only *surfaces* here — `/pharn-dev-build` is where drift blocks. The
deterministic backstops are unchanged and unduplicated: `/pharn-dev-build`'s spec-hash re-check and its
unresolved-`HALT` check, then `.dev/floor/validate.mjs`, then `/pharn-dev-verify`'s gates.

Do **not** read "0 blocking" as "the plan is sound." It means no finding in this run rose to that
severity **in this stage's judgment**, over the inline axes only, with zero griller capabilities
registered to widen the sweep.
