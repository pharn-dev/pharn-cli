# VERIFY — corrupt-config-named-error

## FLOOR layer — the deterministic gates (these OWN the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate.mjs` | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`check-verify.mjs` → **`PASS`** (exit 0), `failing_gates: []`.

No `structural:*` gate: this increment ships no committed eval pair (it is a TypeScript module, not a
markdown Capability), so `validate.mjs` is vacuously green — `FLOOR: GREEN — 0 capabilities checked`.
The feature-specific correctness signal is therefore carried entirely by the increment's own vitest
cases inside the `test` gate: **1189 tests across 56 files**, of which the twelve new/changed ones are
in `tests/pharn-config.test.ts` (46 in that file).

Beyond the six gates, the CI-only `test:coverage` gate was run at head: **exit 0**, measuring
97.28 / 92.85 / 97.66 / 98.14 against the 97 / 92 / 97 / 97 ratchet. Recorded here rather than in the
map because it is not one of the gates `check-verify.mjs` was handed — it is extra evidence, not part
of the verdict.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` —
**no verifiers registered; floor gates only.** Step 2 is a no-op and nothing annotated this report.

## What the new tests actually pin (for the human, not the verdict)

The gates above say "green with this in it"; they cannot say what was checked. The increment's own
cases assert, on the message a user now sees for a corrupt `pharn.config.json`:

- it names the file by absolute path and says it **is not valid JSON**;
- it does **not** contain `No pharn.config.json found`, and it does contain both the "Do NOT run
  pharn init" warning and the "move it aside first" remedy — i.e. the message never prescribes the
  command that would destroy the file it reports on;
- it carries `(line 3, column 1)` when V8 supplies a position, and **omits** the clause entirely when
  V8 supplies none (empty file) rather than inventing one;
- it leaks **no file content** — a config beginning with a raw ESC byte produces a message containing
  neither that byte nor the word planted after it (the P2 escape-injection case);
- it **cannot** be tricked into echoing a location literal planted inside the file (the `$`-anchor);
- it escapes control characters in the **path** too — a project directory whose name carries an ESC
  byte or a newline is rendered `\x1b` / `\x0a`, so neither the terminal nor a forged stderr line can
  be driven through the one part of the message that is not fixed English. Added in review round 2:
  the increment closed this channel for V8's message and left it open for the path beside it, which
  made its own stated principle half-true. Both new cases were **mutation-checked** — reverting the
  single `displayPath(path)` call turns exactly those two red and leaves the other 44 green;
- `readPharnConfig` still returns `null` — and `loadConfigOrExit` still says to run init — for
  an absent config, an **unreadable** one (a directory at the path), and a wrong-shape one. Those are
  the boundaries this increment deliberately did **not** move, pinned so a later widening is a
  deliberate act rather than a drift.

## Verdict

**VERIFIED: floor gates PASS.**

Honest residual (P0/P7): verified = **the named gates passed**. This is **not** a guarantee of
correctness beyond what those gates check — a defect no test, lint rule or type covers is invisible
to this verdict, and the advisory verifier layer that might have noticed one is empty today. The
wording of the new message in particular is checked only by the assertions listed above: they pin
that the destructive advice is gone and the non-destructive remedy is present, not that the sentence
is the best possible sentence. That judgment is the human's at the post-review gate.
