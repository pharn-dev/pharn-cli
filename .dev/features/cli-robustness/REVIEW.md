# REVIEW — cli-robustness

PHARN reviewing PHARN. Four lenses, each citing a principle. **Floor-gate findings block; advisory
findings do not.** Severity below is **LLM-assigned and advisory** (`pharn-contracts/finding-shape.md`)
— it is not a floor verdict and cannot flip one. The only floor-grade content here is
`.dev/floor/validate.mjs` GREEN, which `/pharn-dev-build` and `/pharn-dev-verify` already gated.

**Floor-gate findings: 0.** Seven advisory findings, all resolved or accepted-and-named below.

---

## Lens 1 — Guarantee honesty (P0: floor-or-advisory)

Every claim this increment makes was checked for a floor reduction.

| Claim | Reduction | Verdict |
| --- | --- | --- |
| An unknown option can never be silently ignored | minimist's `unknown` callback fires for every undeclared key; the collected list gates `exit(1)` before dispatch | **FLOOR** (membership) |
| An extra positional can never be silently dropped | `argv._.length > MAX_POSITIONALS.get(cmd)` | **FLOOR** (integer compare) |
| A numeric positional reaches `parseCapabilityArg` as text | minimist's `flags.strings._` branch, re-measured against the installed 1.2.8 | **FLOOR** |
| Error-level output goes to stderr | `{ output: process.stderr }` at the one call boundary | **FLOOR at the boundary**, **best-effort** structurally |
| The `PHARN_DEBUG` hint prints at every exception-derived fatal exit | holds by construction (`err !== undefined`), but nothing on the floor forces a future `catch` to pass its error | **ADVISORY** |
| An offline run names the host | the wrap covers exactly two expressions; it cannot guarantee the runtime produced a useful `cause` | **FLOOR for those two, honestly scoped** |
| Exit codes are unchanged | no checker compares them run-to-run; each site kept its own `process.exit`, pinned by the per-command tests | **ADVISORY** |

### F1 — "no `log.error(` outside the helper" is a TEXT scan · advisory · low · `tests/report-error.test.ts`

The three structural pins read source text, so `const e = log.error; e(msg)` or a renamed import
would slip past. Same honest scope `tests/init.test.ts`'s `isTTY` pin already carries. **Accepted and
labeled in the test's own comment**, not sold as absolute. It reduces the regression class it exists
for — a hand-rolled copy re-appearing — and that is the claim made.

### F2 — `pharn init --force` still parses and is ignored · advisory · low · `src/index.ts`

Per-command flag scoping was offered as **optional** by the brief and declined, to keep the diff
reviewable. Named as a limit in `PLAN.md`, `GRILL.md`, the CHANGELOG and `docs/troubleshooting.md`
rather than half-shipped (P7). Nothing claims flags are command-scoped.

---

## Lens 2 — Untrusted input is data (P2)

Two untrusted sources cross this diff.

**`process.argv`.** Every offending token is `JSON.stringify`-escaped before printing — verified at
the byte level with `od -c`: an argument holding a tab and a bell emits the literal characters `\t`
and `\u0007`, never the control characters. The token reaches exactly one sink (a `console.error`
template). It never reaches a path join, a filesystem call, a network call, or any branch other than
"is this in the declared set" and "is `_.length` within arity". Dispatch still reads only `_[0]`
(matched against a closed `switch`) and `_[1]`.

**Remote-influenced error text** (`err.message` / `err.cause` from undici). The wrap adds **no new
sink**: both consumers already printed `err.message`. What it gains is the URL (a pharn constant) and
the `cause` text, which `PHARN_DEBUG` could already print. No allowlist loosened, no new fetch, no
new write.

### F3 — The arity table resolved `Object.prototype` keys · advisory · medium · **FIXED in this increment**

`cmd` is untrusted argv, and `MAX_POSITIONALS['toString']` on an object literal returns a **function**,
not `undefined`. The subsequent `n > fn` is `n > NaN`, which is `false` — so the outcome was right
**by accident**, not by the membership test the code claims to be. Changed to a `Map` and pinned by
a test (`pharn toString x y` must say "Unknown command", never "Unexpected argument"). No exploit
existed; the objection is that a determinism claim rested on a coincidence (P5).

---

## Lens 3 — One axis per file, membership over guesswork (P3, P5)

`src/lib/report-error.ts` owns exactly one reason to change: how a failure reaches the user. It
imports nothing from `lib/`, so no cycle; commands reach it directly and never each other.

The **two-function split** (`logError` verbatim / `reportFatal` with the glyph and the debug axis) is
what let 24 call sites convert without a single message being reworded — fifteen of them never had a
`⚠` prefix, and a one-function reporter would have added one to "No pharn.config.json found" and to
every non-TTY refusal.

Each new branch ends in a named message plus a hard-fail; none ends in a fallback or a guess. The
hint's presence is one boolean (`err !== undefined`), never an inspection of the message text.

### F4 — `reportFatal` is not used at `add.ts`'s per-pick error · advisory · informational

That branch logs and **continues the loop**. It calls `logError` with the glyph inlined, so the
output is byte-identical while the name stops claiming an exit that does not happen. Called out here
because it is the one deliberate asymmetry in the conversion.

### F5 — `update -yf` names the whole token, not the unknown letter · advisory · low

minimist hands the handler `-yf`, so the message says `-yf` rather than `-f`. Echoing what the user
actually typed is arguably the better message, and inventing "-f" would mean re-implementing
minimist's short-flag expansion. Accepted.

---

## Lens 4 — Tests are the spec; docs cite code (P1, P4, P7)

**P1.** 19 new cases across five files. Confirmed **red against the baseline source**: with `src/`
stashed, 18 of them fail (the 19th is the prototype-key case, added after that measurement and
verified against the Map change). They demonstrate the behavior rather than asserting it exists —
the numeric-positional cases assert the runtime **type**, because `toHaveBeenCalledWith('123')` alone
would not distinguish a coerced number, and the stream cases assert the exact `{ output: process.stderr }`
argument, because every command suite mocks `log.error` with a `vi.fn()` that swallows a missing
option silently.

**P4.** `docs/troubleshooting.md` gains a Streams section, an exit-code row, an "Unknown option"
section, the wrapped transport-message shape, and a subsection on exactly when the `PHARN_DEBUG`
hint appears — including that a policy refusal deliberately gets none. Every statement cites behavior
that exists in this diff; the two behavior changes (`--help --bogus` refusing, `init --force` still
parsing) are both stated rather than glossed.

**P7.** No flag semantics moved. `--archetype` is still a parsing no-op; `--no-drift` still flips the
drift default; `update --yes` still skips only the confirm and does not imply `--force`;
`remove --yes` is still the passthrough, now carrying a comment naming FABLE 4.07 as its owner so
that decision stays findable rather than pre-empted.

### F6 — `pharn --help --bogus` now exits 1 · advisory · medium · user-visible behavior change

This is the behavior the gate's placement buys and it is in the brief's acceptance list, so it is
intended. But it is a **change**, not pure hardening: a script that tolerated junk after `--version`
now fails. Documented in the CHANGELOG and in `docs/troubleshooting.md` rather than shipped quietly.

### F7 — `.catch()` does not cover a synchronous throw from `fetch` · advisory · informational

`rethrowUnreachable` is attached to the fetch **expression**, so a hypothetical synchronous throw
(rather than a rejection) would propagate unwrapped. Undici rejects rather than throwing
synchronously, and the alternative — a `try` around the block — is exactly the mistake this shape
avoids, since it would re-label the three deliberate throws. Named, not fixed.

---

## Lessons fed forward

- **A conversion that "changes only the stream" is a wording change unless the prefixes are
  inventoried first.** The 9-vs-15 `⚠` split was invisible until the sites were counted; it is what
  forced the two-function shape.
- **An exact-args assertion is the only thing that survives a `vi.fn()` mock gaining an argument.**
  `tests/list.test.ts:89` was the single pre-existing assertion the change broke, and turning it into
  the proof was cheaper than adding a new test.
- **A membership claim over untrusted input needs a prototype-free container.** F3's outcome was
  correct only because `n > NaN` is false.
