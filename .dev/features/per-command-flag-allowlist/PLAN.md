# PLAN — per-command flag allowlist (audit P-13)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Flags are declared **globally** in `src/index.ts`, so a flag that belongs to another
  command is parsed, dropped, and the run exits 0 — `pharn status --json`, `pharn list --strict`,
  `pharn add --json`. Add a per-command allowed-flag `Map` beside the existing `MAX_POSITIONALS`
  arity `Map`, refuse an unsupported flag with exit 1 through the existing `refuse()`, and rewrite
  the four prose sites that currently pin the tolerated behaviour (including the CLAUDE.md sentence
  that explicitly assigned this refusal to "a per-command allowlist").
- layer(s): `src` (dispatch), `tests`, `docs`
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## GATE 1 — human decisions (approved, folded in below)

The plan was approved with **one change** and three answered questions. All four are now reflected in
the sections that follow; this block records the decision so the reasoning is not lost.

1. **CHANGE — close the `--help` residual.** The gate moves **above** the `--help` / `--version`
   short-circuits, so `pharn status --help --json` **refuses (exit 1)** instead of printing help and
   exiting 0. Rationale (human): `src/index.ts:112-119` already rules that _"A genuine --help does not
   license an unknown sibling"_ — leaving a **known-but-misapplied** sibling swallowed there is the
   inconsistency this increment should close, not inherit. Supersedes the original Residual 1.
2. **APPROVED — dedupe `refuse()`'s offender list.** `pharn status -xz` prints `"-xz", "-xz"` today.
   One expression (`[...new Set(offenders)]`), fixes both labels.
3. **APPROVED — `--archetype` becomes `init`-only.** Narrowing a documented no-op alias retained for
   one release is the point of the table.
4. **APPROVED — value-shape validation is explicitly OUT of scope** (`--json=false`). Decided, not
   missed; to be stated in the PR body.

The full flip list below is approved as-is, including the no-command-word trio (`pharn --json` /
`--force` / `--strict`), which is to be named explicitly in the CHANGELOG and the PR body.

## Discovery (P6 — read live this run)

Every anchor below was re-read from disk on this branch (`main` = `377e1f5`).

**The audit's three line references all resolve.** `src/index.ts:77-86` is the global `boolean: [...]`
array; `:120` is `if (unknownOptions.length > 0) refuse('Unknown option', unknownOptions);`;
`:150-157` is the `case 'remove'` comment ending _"Turning it INTO a refusal is a per-command
allowlist's job, not this switch's."_

**Reproduced live** (`npx tsx src/index.ts` in a fixture project holding a valid archetype
`pharn.config.json`):

```text
$ pharn list --strict
┌  pharn list
│
◇  INSTALLED (archetype) ──────────────╮
…
$ echo $?
0
```

`--strict` was accepted, dropped, and the run exited 0. `pharn status --json` likewise renders
`┌  pharn status` on **stdout** — the finding's CI trap (`… | jq`) verbatim.

**What each command actually reads** (`grep -n "export async function run" src/commands/*.ts`):

| command      | signature                                        | flags read     |
| ------------ | ------------------------------------------------ | -------------- |
| `init`       | `runInit()`                                      | none           |
| `add`        | `runAdd(capabilityArg)`                          | none           |
| `remove`/`rm`| `runRemove(arg)`                                 | none           |
| `update`     | `runUpdate({force, yes})`                        | `force`, `yes` |
| `list`       | `runList({json})`                                | `json`         |
| `status`     | `runStatus({strict, drift})`                     | `strict`, `drift` |

`--archetype` is read by **nobody** — it is a retained no-op alias for one release
(`src/index.ts:93-95`, `docs/commands/init.md:13`, `tests/index.test.ts:52`), and it is `init`'s.

**Why "which flags were present" cannot be read off the parsed `argv` (measured, not assumed).**
minimist assigns `false` to **every** declared boolean whether or not it was passed:

```text
$ minimist([], {boolean:['help','version','json','yes','strict','drift','archetype','force'], …})
{"_":[],"help":false,"h":false,"version":false,"v":false,"json":false,"yes":false,"y":false,
 "strict":false,"drift":true,"archetype":false,"force":false}
```

So `Object.keys(argv)` cannot distinguish "passed" from "defaulted", and a value-differs heuristic
(`argv.json !== false`) misclassifies `--json=false` as absent — a guess where P5 demands a
membership test.

**The mechanism that does work (measured).** Re-parse the same argv under **this command's**
declarations and let minimist's own `unknown` callback name the offenders. Probed directly:

```text
p2(status set) ['status','--json']        → offenders ['--json']
p2(status set) ['status','--no-drift']    → offenders []          (declared boolean, not an offender)
p2(remove set) ['remove','a11y','-y']     → offenders ['-y']      (the alias goes through the table)
p2(add set)    ['add','--json','a11y']    → offenders ['--json']
p2(any set)    ['add','--','--json']      → offenders []          (`--` terminator honoured)
```

The tokenizer stays minimist's, so `--no-x`, `=value`, short bundles and `--` are classified exactly
as the real parse classifies them. Only the **offender list** is kept; the dispatch keeps reading the
global first-pass `argv`, so `pharn --force update` still finds its command word.

**Pre-existing wart, measured, NOT introduced here:** a short bundle whose letters are all unknown is
reported twice by minimist — `pharn status -xz` already prints `Unknown option: "-xz", "-xz"` on
`main`. See **Open questions**.

**Prose sites that pin the behaviour being flipped** (all read this run):

- `CLAUDE.md:64` — _"`--yes` stays a declared minimist boolean only because it is `update`'s flag;
  that is what keeps `pharn remove --yes` a harmless parse rather than an unknown-option refusal, and
  turning it into a refusal belongs to a per-command allowlist, not to the dispatch."_
- `docs/troubleshooting.md:361-362` — _"Flags are parsed globally, so a flag that belongs to another
  command still parses and is ignored (`pharn init --force` is accepted and does nothing). Only
  _unrecognised_ options are refused."_
- `docs/commands/remove.md:43-46` — _"`--yes` / `-y` is an [`update`](update.md) flag, and `remove`
  ignores it."_
- `src/index.ts:150-157` + `tests/index.test.ts:71-84` — the code comment and the test
  `accepts \`remove --yes\` and drops it — it is an update flag`.

Historical `CHANGELOG.md` entries (`:152`, `:465`) describing the old contract are a **record** and
are left untouched — the same precedent `.dev/features/remove-yes-contract/PLAN.md:167` set.

## Files

- `src/index.ts` — the `ALLOWED_FLAGS` Map + a single `ALIASES` table + the **derived** global
  boolean list + `unsupportedFlags()` + the gate (**moved above the `--help`/`--version`
  short-circuits per GATE 1**, which also moves `const cmd = …` up) + the `refuse()` dedupe + the
  rescoped `USAGE` option lines — layer `src`
- `tests/index.test.ts` — the new refusal pins; the `remove --yes` test flips from accept to refuse —
  layer `tests`
- `CLAUDE.md` — **§Architecture ¶"`pharn remove` addressing" (line 64)**: replace the "harmless
  parse … belongs to a per-command allowlist" sentence with the shipped contract (`remove` accepts no
  flags; `pharn remove --yes` now exits 1 naming `--yes`). **§Architecture ¶"`src/index.ts` parses
  argv" (line 46)**: add the per-command gate to the dispatch description, beside the arity table.
- `docs/troubleshooting.md` — the "Flags are parsed globally … only _unrecognised_ options are
  refused" bullet (now false); **the `--help` bullet directly above it** (`:359-360`), which after
  GATE 1 is narrower than the code — per GRILL F5, the pair must move together; the exit-code table
  row; a new subsection for the new message
- `docs/commands/remove.md` — the `--yes` / `-y` "and `remove` ignores it" paragraph (now false)
- `docs/commands/init.md` — one clause: "no `--yes` for `init`" is now **enforced**, not merely absent
- `CHANGELOG.md` — one `## Unreleased` entry naming every flip

**Not touched** (sibling PRs own them): `README.md`, `SECURITY.md`, `.github/workflows/ci.yml`,
`src/lib/constants.ts`, `src/lib/install-manifest.ts`, `src/commands/{add,init,update}.ts`.
`README.md:102-104` already scopes each flag to its command and needs no edit.

## The table (derived from what each command READS)

```ts
// Accepted by every command in the table below.
const GLOBAL_FLAGS = ['help', 'version'] as const;
const ALIASES = { h: 'help', v: 'version', y: 'yes' } as const;

const ALLOWED_FLAGS = new Map<string, readonly string[]>([
  ['init',   ['archetype']],
  ['add',    []],
  ['remove', []],
  ['rm',     []],
  ['update', ['force', 'yes']],
  ['list',   ['json']],
  ['status', ['strict', 'drift']],
]);
```

- A **`Map`**, for the same reason `MAX_POSITIONALS` is one: `cmd` is untrusted argv, and an object
  lookup resolves `Object.prototype` keys (`ALLOWED_FLAGS['toString']` would hand back a FUNCTION,
  and `fn.includes` would throw). A Map makes "absent from the table" mean exactly that (P5).
- **Absent from the table → no flag check at all**, exactly like the arity table — which is what
  keeps `pharn bogus --json` on the more useful `Unknown command` path.
- **Short aliases go through the same table**, not a second one. `ALIASES` is single-sourced: the
  global first pass uses it whole, the per-command pass uses the entries whose canonical target is in
  that command's set. So `-y` is accepted exactly where `--yes` is, by construction.
- `drift` (not `no-drift`) is the canonical key, so `--no-drift` and `--drift` both parse on `status`
  and only there.
- The **global `boolean: [...]` list becomes derived** — `[...GLOBAL_FLAGS, ...every value in
  ALLOWED_FLAGS]` — instead of hand-maintained. This makes P-13's shape (a flag declared globally
  that no command reads) unrepresentable rather than merely fixed.

## The refusal

Order in `main()` after this increment (GATE 1 decision 1):

1. one global minimist pass (unchanged)
2. `Unknown option` gate for globally-undeclared flags — **unchanged, still first**
3. `const cmd = argv._[0] ?? 'init'` — **moved up**
4. **the new per-command flag gate**
5. `--version` short-circuit, then `--help` short-circuit — **now downstream of the gate**
6. `Unexpected argument` arity gate — unchanged position

So `pharn status --help --json` refuses; `pharn status --help` still prints usage, because `help` and
`version` are in every command's allowed set. The refusal:

```text
Unsupported option for `status`: "--json"

Usage: …
```

- **Exit 1, stderr, usage text appended, offenders `JSON.stringify`-escaped** — all of it the
  existing `refuse()` verbatim; no new machinery and no new stream behaviour.
- **The label is what differs from `Unknown option`, and deliberately.** `--json` is a flag pharn
  knows; a shared label would say the opposite and send the user hunting for a typo. `--sctrict`
  still gets `Unknown option`, from the untouched gate at `:120`.
- The command name is interpolated into the label **only after** `ALLOWED_FLAGS.get(cmd) !==
  undefined` — i.e. after `cmd` has passed a membership test against seven literals — so no untrusted
  argv reaches the label unescaped (P2).
- **Flag gate before arity gate**, matching the file's existing precedence: today `pharn status
  --sctrict extra` already names the flag, not the positional. Pinned by a test.
- **The two gates now sit on opposite sides of the short-circuits, deliberately.** The flag gate moved
  above them (GATE 1); the arity gate did **not**, because moving it is a separate user-visible flip
  (`pharn status extra --help` would start refusing) that nobody approved. Named in Residuals, not
  smuggled.
- `refuse()` gains `[...new Set(offenders)]` (GATE 1 decision 2), so a short bundle whose letters are
  all unknown is named once rather than once per letter. Applies to **both** labels.

## Behaviour that FLIPS (exit 0 → exit 1) — the list being approved

`help` / `version` are allowed on every command and never flip **on their own**. Every other
globally-declared flag now refuses on every command that does not read it:

| command       | now refused (was accepted + ignored, exit 0)                                        |
| ------------- | ----------------------------------------------------------------------------------- |
| `init`        | `--json`, `--yes`/`-y`, `--strict`, `--drift`/`--no-drift`, `--force`                 |
| `add`         | `--json`, `--yes`/`-y`, `--strict`, `--drift`/`--no-drift`, `--force`, `--archetype`  |
| `remove`/`rm` | **`--yes`/`-y`**, `--json`, `--strict`, `--drift`/`--no-drift`, `--force`, `--archetype` |
| `update`      | `--json`, `--strict`, `--drift`/`--no-drift`, `--archetype`                           |
| `list`        | `--strict`, `--yes`/`-y`, `--drift`/`--no-drift`, `--force`, `--archetype`            |
| `status`      | `--json`, `--yes`/`-y`, `--force`, `--archetype`                                      |

Plus two flips that are not per-command rows:

- **With no command word** (`cmd` defaults to `init`): `pharn --json`, `pharn --force`,
  `pharn --strict` — which today run a **full install** ignoring the flag. The sharpest flip in the
  set; named explicitly in the CHANGELOG and the PR body.
- **`--help` / `--version` no longer license a misapplied sibling** (GATE 1): `pharn status --help
  --json` and `pharn list --version --force` now exit 1 instead of printing help / the version.
  `pharn status --help` alone is unchanged.

One further user-visible change that is **not** an exit-code flip (added per GRILL F4): the
`refuse()` dedupe alters the EXISTING `Unknown option` output — `pharn status -xz` prints
`Unknown option: "-xz"` where it printed `"-xz", "-xz"`. Same exit code, same stream; the message is
shorter.

**`pharn remove --yes` is the one flip that contradicts a documented contract.** It is sanctioned:
`CLAUDE.md:64` and `src/index.ts:156` both name a per-command allowlist as its owner. Its
justification is unchanged and still true — `remove`'s named path never confirms, and its picker's
one confirm may not be skipped — so `remove` gains no `--yes`; the flag is now **refused** instead of
**silently dropped**.

**Unchanged, and pinned so:** every documented per-command flag; `--help`/`--version`; `pharn --help
--bogus` still refuses; `Unknown option` for typos; `Unexpected argument` for extra positionals;
`Unknown command` for `pharn bogus --json`.

## Evals to write (P1) — `tests/index.test.ts`

- `status --json` → exit 1; stderr contains `--json`, `status`, and `Usage:`; stdout empty; no command ran
- `list --strict` → exit 1 naming `--strict`
- `add --json` → exit 1 naming `--json`
- `remove --yes` → exit 1 naming `--yes` **(replaces the current accept-and-drop test)**
- `remove -y` → exit 1 naming `-y` (the alias is gated by the same table)
- `init --force` → exit 1 naming `--force`
- `update --json` → exit 1 (a command that HAS flags still refuses one that is not its)
- `pharn --json` (no command word) → exit 1; `runInit` not called
- `status --strict --no-drift` → still routes `{strict:true, drift:false}` (no false positive)
- `update -y --force` → still routes `{force:true, yes:true}` (allowed alias survives)
- `init --archetype` → still routes (existing test, kept)
- **still-routes set added per GRILL F3** (a false positive breaks a WORKING command, which is worse
  than the bug being fixed): `add lens:n-plus-one` (positional containing `:`), `add -- --json` (the
  terminator), `rm a11y` (the alias), `update --force --yes` **and** `--yes --force` (both orders),
  bare `pharn` with no argv at all
- **table-vs-dispatch agreement (GRILL F1)**: the keys `runUpdate`/`runList`/`runStatus` are called
  with equal their `ALLOWED_FLAGS` rows, and `runInit`/`runAdd`/`runRemove` take no option object —
  so a table row that grants a flag no command reads cannot pass silently
- `bogus --json` → still `Unknown command`, **not** the new label (table-absent precedence)
- `toString --json` → still `Unknown command` (prototype-safety of the new Map, mirroring the arity pin)
- `status --sctrict` → still `Unknown option`, **not** the new label (the two labels stay distinct)
- `status --json extra` → names `--json`, not `extra` (flag-gate-before-arity precedence)
- **`status --help --json` → exit 1, stdout has no `Usage:` (GATE 1: `--help` no longer licenses a
  misapplied sibling — the pin that stops this silently reverting)**
- **`list --version --force` → exit 1, no version on stdout** (same rule via the `--version` path)
- `status --help` → still prints usage, exit 0 (`help` is allowed on every command)
- `bogus --help` → still prints usage, exit 0 (table-absent → no flag check)
- `status -xz` → offender named **once**, not twice (the `refuse()` dedupe, GATE 1 decision 2)
- USAGE text: `--json\s+list:`, `--strict\s+status:`, `--no-drift\s+status:` join the existing
  `-y, --yes\s+update:` / `--force\s+update:` pins

## Guarantee audit (P0)

- "A flag not in this command's set is refused, exit 1, before any command runs" → **FLOOR:
  enum/membership.** `ALLOWED_FLAGS.get(cmd)` is a `Map` lookup; the offender list is produced by
  minimist's own `unknown` callback (a declared-key membership test), not by a pattern guess. Pinned
  by the evals above (P1).
- "The table is prototype-safe" → **FLOOR: `Map` lookup**, plus the `toString --json` eval.
- "No untrusted argv reaches the error label unescaped" → **FLOOR: `JSON.stringify` on offenders
  (existing `refuse`) + the membership test that gates the interpolated `cmd`.**
- "The per-command pass classifies tokens identically to the real parse" → **FLOOR: same tokenizer
  (minimist) on the same argv** — not a re-implemented scanner. The only thing kept from the second
  pass is the offender list; its `_` is discarded (measured: `['status','--json','extra']` yields
  `_=['status']` there vs `['status','extra']` in the real parse — discarded, so it cannot mislead).
- "Every globally-declared flag belongs to some command" → **FLOOR: derived list.** The `boolean:`
  array is computed from `ALLOWED_FLAGS`, so the two cannot diverge.
- "…and the command actually READS the flag its row grants" → **FLOOR: an eval, added per GRILL F1.**
  The derivation alone proves only list agreement; a mistyped row (`['list', ['strict']]`) would be
  self-consistent and silently re-open P-13. A test asserts the option-object keys the `switch`
  threads into `runUpdate`/`runList`/`runStatus` equal those commands' table entries, and that the
  three no-flag commands are called with their positional alone.
- "`--json=false` on `list` is still accepted" → **advisory / declared limit.** The allowlist keys on
  the flag NAME, never the value. See Residuals.
- "The docs no longer contradict the code" → **advisory** (P4 discipline; no floor check greps prose).

## Trust audit (P2)

`process.argv` is untrusted text. It is (a) tokenized by minimist in both passes — never `eval`'d,
never used to index an object literal, never used to build a path; (b) echoed only through
`refuse()`, which `JSON.stringify`-escapes each offender, so a control character is printed as
`\u0007` (existing test, `tests/index.test.ts:356`); (c) used to select the flag set only via a
`Map.get` membership test. The interpolated command name in the new label is one of seven literals
by construction, because the interpolation is unreachable unless the `Map.get` hit.

## Determinism audit (P5)

Every new branch is a membership test: `ALLOWED_FLAGS.get(cmd) !== undefined`, and minimist's
declared-key check inside `unknown`. There is no classification, no prefix heuristic, no
"looks-like-a-flag" regex beyond the existing `arg.startsWith('-')` positional guard (reused
verbatim). The fallback is a **hard fail naming the offender**, never a silent drop — which is the
defect being closed.

## Residuals (declared limits, P7 — named, not hidden)

1. **Value shape is out of scope** (GATE 1 decision 4 — decided, not missed). `pharn list
   --json=false` and `pharn status --strict=false` still parse and exit 0; minimist coerces
   `--json=foo` to `true` and `--json=false` to `false` (measured). The allowlist answers "may this
   command take this flag", never "is this value sane" — a second axis (P3), and one that needs a
   per-flag type table this increment does not build. To be stated in the PR body.
2. **Extra positionals after `--help` are still swallowed** (`pharn status extra --help`) — unchanged
   from `main`. The arity gate stays below the short-circuits; only the flag gate moved. Tightening it
   is a separate, unapproved flip.
3. **A command absent from `ALLOWED_FLAGS` gets no flag check at all** — `pharn bogus --json` reaches
   the `Unknown command` path with its flags unexamined, by design (it is the more useful message).
   The same shape `MAX_POSITIONALS` already has.

## Open questions — RESOLVED at GATE 1

All four were answered by the human before build; see **GATE 1 — human decisions** at the top. None
remain open.
