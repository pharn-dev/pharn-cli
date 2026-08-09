# REVIEW — nontty-gate

**Step 1 — floor first:** `node .dev/floor/validate.mjs .` → **GREEN** (exit 0). The increment was
entitled to reach review. Everything below the floor line is **advisory** (P0).

> The increment under review is `trust: untrusted`. Nothing in it attempted to instruct this review;
> the one class of content that could have — the two new refusal strings — is checked under L-trust.

---

## Findings

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/commands/init.ts:15'
  problem: "The load-bearing non-goal 'init has no --yes' is unpinned: minimist parses --yes globally, so `pharn init --yes` is a real invocation, and nothing fails if a future change gives runInit an opts parameter and wires it up."
  evidence: 'export async function runInit(): Promise<void> {'
```

> **Verified live during this review** (so the gap is coverage, not behavior): `echo "" | pharn init --yes`
> → **exit 1**, and `-y` likewise → **exit 1**. `runInit()` takes no parameters, so it is *structurally*
> incapable of reading the flag today. That structural safety is exactly what makes the gap easy to
> lose: adding an `opts` argument to `runInit` for any unrelated reason would silently make `--yes`
> reachable, and the whole documented rationale ("auto-confirming file overwrites in CI is the hazard
> the prompt exists to prevent") would quietly stop being true. **Cheapest close: one ~6-line test**
> asserting `runInit()` still exits 1 under a non-TTY regardless of argv, in the init suite's existing
> `non-interactive (TTY gate)` describe.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'docs/commands/update.md:153'
  problem: "The user-facing doc states the universal negative unqualified, while the plan's own guarantee audit correctly labels that same claim ADVISORY — the two disagree in strength."
  evidence: '`--yes` skips **the confirmation prompt and nothing else**. Everything else is byte-identical to an'
```

> Weighed honestly rather than inflated: the sentence is immediately followed by an **enumeration** (the
> note prints, the decision table applies, edited files are still skipped, the version is still withheld,
> exit codes unchanged) and each enumerated item **is** test-pinned — so the doc's practical content
> reduces to the floor. What does not reduce is the unbounded "nothing else", which no test can prove.
> `PLAN.md`'s audit gets this right; the doc is simply written in user register. Recorded as **minor**
> because relabelling user documentation "advisory" would be worse writing, not better honesty — but the
> human should know the two artifacts state it at different strengths.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/commands/update.ts:14'
  problem: "A general interactivity predicate is imported from a module named for capability pickers, so capability-picker.ts now changes for two unrelated reasons and its name no longer describes all its exports."
  evidence: "import { interactiveAllowed } from '../lib/capability-picker.js';"
```

> `interactiveAllowed` has nothing to do with capabilities or picking — it is a two-boolean AND over
> stream flags. This increment did not create the smell (the predicate already lived there for
> `add`/`remove`) but it **doubles the blast radius**, 2 callers → 4, and it was explicitly out of scope:
> the brief's non-goals forbade editing `capability-picker.ts`, and reusing the existing export was
> invariant 6's whole point. A later increment could move it to `lib/tty.ts` (or `lib/confirm.ts`, next
> to `cancelAndExit`, whose semantics it now guards) — a pure move, four import lines. **Not** actionable
> inside this increment's declared scope. See the lessons candidate below.

### L-trust → P2 — no findings

- The increment **ingests no untrusted artifact**. It adds two reads of `process.std*.isTTY` (local
  runtime flags, `Boolean()`-coerced inside `interactiveAllowed`) and one read of `argv.yes` (local CLI
  input, `Boolean()`-coerced at the dispatch). Neither reaches a filesystem path, a fetch URL, or a copy
  target; both are consumed only as branch conditions.
- **Both new refusal messages are static string literals** (`init.ts:42`, `update.ts:80`) — no
  interpolation of config, argv, or remote content, so a hostile `pharn.config.json` cannot get text
  into the user's terminal through this path. (Contrast the pre-existing `log.error` sites at
  `init.ts:74`/`update.ts:123`, which interpolate error messages — unchanged by this increment.)
- The gates **strictly reduce** network reach: they add a refusal that returns before
  `fetchRemoteSkillsVersion` and `fetchRepo`. The `redirect: 'error'` + 8s timeout + 256KB cap guards
  are untouched.
- **No instruction-looking content in the reviewed increment changed this review's behavior.** Nothing
  in it attempted to.

---

## Gate split (fix #3)

- **floor-gate (blocking): NONE.** No P0 guarantee lacks a reduction or an `advisory` label; no eval
  binding the floor can confirm is missing; no sibling reference exists (`grep "from '../commands/"`
  over `src/commands/*.ts` → empty). `validate.mjs` GREEN.
- **advisory-gate (warn): 3** — one `important` (P1, the unpinned init `--yes` non-goal) and two `minor`
  (P0 doc register, P3 predicate home). Each rests on this reviewer's judgment of severity and is
  **never** a sole basis for blocking.

## Verdict

**GREEN — 0 floor-gate findings; 3 advisory findings (1 important, 2 minor).**

The increment does what it set out to do and the floor agrees. The one finding worth acting on before
merge is the P1 coverage gap: the "no `--yes` for init" non-goal is currently protected by an accident
of function arity rather than by a test, and it is ~6 lines to fix. The two minor findings are register
and module-naming observations, neither actionable inside the declared scope.

`severity` above is an **LLM assignment — advisory** (`finding-shape.md`; fix #3). This verdict is not
a floor verdict and does not certify the increment; the floor verdicts are `/pharn-dev-build`'s
`validate` exit 0, `/pharn-dev-regress`'s `no-regressions`, and `/pharn-dev-verify`'s `PASS`.

---

## Proposed lesson (candidate only — NOT written to canon)

`/pharn-dev-review` writes no `.dev/memory-bank/**` path. This is a **proposal** for a separate, human-gated
`/pharn-dev-memory-promote` run.

- **candidate:** *A shared predicate extracted for one caller keeps that caller's module name, and the
  name silently becomes wrong at the third and fourth adopter. When a second command imports a helper
  from a module named for the first command's feature, that is the moment to move it — not after N
  callers make the move an N-line diff.*
- **provenance:** increment `nontty-gate`; `interactiveAllowed` in `src/lib/capability-picker.ts:110`,
  imported by `add.ts:16`, `remove.ts:16`, and now `init.ts` + `update.ts:14` (2 → 4 callers in one
  increment).
- **real, not hypothetical (P7):** the same shape already recurred in this increment's *tests* — `setTTY`
  was copy-pasted in `add.test.ts` and `remove.test.ts`, and this increment would have made four copies
  before it was promoted to `tests/helpers.ts` at GATE 1. Two independent instances of one pattern in a
  single increment is the recurrence bar, met.
