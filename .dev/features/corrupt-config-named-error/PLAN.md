# PLAN — corrupt-config-named-error (a corrupt config is reported as corrupt, not as absent)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: `readPharnConfig` stops collapsing a **JSON-parse failure** into the same `null` that
  means "no file", so a corrupt `pharn.config.json` is reported as **corrupt, naming the path and
  (when V8 gives one) the line/column** — instead of "No pharn.config.json found. Run `pharn init`
  first.", which is both false and a prescription that **overwrites the file it is complaining about**.
- layer(s): pharn — `lib/` (the config loader). No command, step, contract, or floor file changes.
- constitution_refs: [P0, P1, P2, P3, P5, P7]
- audit finding: **P-7 (MED, Dim F)** — `pharn-config.ts:75` (`existsSync` → null) and `:80-82`
  (`JSON.parse` catch → null) are indistinguishable at the call sites. Reproduced.

## The bug, precisely

`readPharnConfig` returns `null` for four different situations; the two call sites
(`loadConfigOrExit:140`, `commands/list.ts:53`) can only print one message for all four:

```text
No pharn.config.json found. Run `pharn init` first.
```

For a config with a stray comma this is **two lies in one line**: the file exists, and the
prescribed remedy destroys it. `pharn init` rewrites `pharn.config.json` wholesale — resetting
hand-edited `models`/`seam` blocks to defaults and re-stamping every capability `source: 'auto'`,
which discards the manual-`pharn add` provenance **only this file remembers** (`commands/add.ts`
writes `source: 'manual'`; `lib/merge-capabilities.ts` reads it to keep a manual add sticky across
`update`). That is data loss prescribed by an error message, which is why this is MED and not a
cosmetic wording nit.

`src/lib/atomic-write.ts:8-15` already describes this exact failure in prose — as the reason the
config write is atomic. The reader half of it was never fixed.

## Decision — the named-error route, NOT the audit's "branch at the call site"

The audit proposed the minimal-diff shape: _"branch the message on `existsSync` at the call site —
no return-type change."_ **Rejected, on this module's own design.** The alternative chosen is the
pattern this file already established one screen up (`:60-71`, `:16-31`): a **named error that
propagates**, joins `isConfigValidationError`'s union, and is reported verbatim by the call sites
that already catch that union. Reasons, in order of weight:

1. **P3 — there are TWO call sites, not one.** `loadConfigOrExit:140` and `commands/list.ts:53`
   each print that message independently (`list` keeps its own path so `--json` diagnostics stay on
   stderr). A call-site branch is therefore duplicated in both, or needs a helper back in
   `pharn-config.ts` — at which point the "call site" framing has already collapsed into this
   module. The named error single-sources the message **and needs zero call-site edits**: both sites
   already have the `isConfigValidationError` catch wired and print `err.message`.
2. **It cannot carry the location.** By the time control reaches a call site, the `SyntaxError` has
   been discarded by the `catch {}`. A stray comma is much cheaper to fix when the message says
   _line 3, column 5_ — and that is only reachable where the error is caught.
3. **`existsSync` at the call site would print a NEW lie.** `existsSync` is equally true for the
   two OTHER null-returns — `!isPlainObject(raw)` (`:84`) and the light shape guard (`:87-89`). A
   call-site branch keyed on file presence would tell a user whose config parses fine but has
   `modules: "oops"` that it "could not be parsed". The named error distinguishes parse-failure from
   wrong-shape **by construction**, because it is thrown at the point that actually knows.
4. **It re-derives state instead of reporting it, and races it.** A second `existsSync` at the call
   site asks the disk a question `readPharnConfig` already answered; between the two stats the file
   can be created or deleted, so the message can disagree with the read that produced it.

**Scope honesty (P7):** the named-error route is _conceptually_ wider than "branch a message" — it
changes `readPharnConfig`'s contract for one input class (malformed JSON: `null` → throw). But its
**diff is strictly narrower**: it touches `src/lib/pharn-config.ts` only, where the audit's shape
touches this module _plus_ one or both call sites. It uses **less** of the approved scope, not more.

**This deliberately revises one line of a previous increment's guarantee audit.**
`.dev/features/config-loader-honest-errors/PLAN.md` recorded _"Absent/malformed/wrong-shape → null →
'run init'." → floor: existsSync + parse-catch + shape test._ That increment fixed the same lie for
`models`/`seam` and left **malformed** inside the null bucket. This increment moves **malformed**
out of it. Absent and wrong-shape stay exactly where they were.

## Files

- `src/lib/pharn-config.ts` — add `ConfigParseError`; split the single `try` so `readFileSync`
  failure keeps returning `null` (unchanged) while `JSON.parse` failure throws the named error; add
  `parseLocation()` (a `$`-anchored regex over the V8 message, digits only); add `ConfigParseError`
  to `isConfigValidationError`'s union + type; update the three doc comments that assert the old
  behaviour (`:60-71`, `:117-127`, `:145-150`). — lib
- `tests/pharn-config.test.ts` — invert `:80` ("returns null on malformed JSON"); add the
  `ConfigParseError` cases below; refresh the now-stale block comment at `:425-431`. — test
- `CHANGELOG.md` — one entry under the existing `## [Unreleased]`. User-visible message change on a
  published CLI (P4). — docs
- `docs/troubleshooting.md` — **added in review round 2** (see below): correct the
  _"`add` / `update` say to run init first"_ section, which now covers one case fewer, and document
  the new diagnostic + its move-aside recovery under _"A command rejects an invalid config"_. — docs

### Scope amendments after the first review round

Two changes to the file list, both human-directed after the PR was opened:

1. **`docs/troubleshooting.md` moved from "reported" to "in scope."** It was deferred only because a
   sibling PR (#161) owned the file. That PR has merged, so the P4 gap the grill raised as its one
   `important` finding is now closable here rather than being handed on.
2. **`src/lib/pharn-config.ts` gained `displayPath`** — a reviewer (greptile) found that the new
   message interpolates `configPath(cwd)` raw, so a working directory carrying ESC or a newline
   reaches `logError` and `list --json`'s `console.error` verbatim. This is the SAME channel
   `parseLocation` was written to close, with a different source: the increment refused V8's message
   because it echoes untrusted bytes, then echoed the path beside it. Closing one and not the other
   left the increment's own stated principle half-applied, which is the defect this repo cares about
   most. Fixed in place, with the same kind of test that pinned the `err.message` boundary.

**Still explicitly NOT touched** (reported, not edited): `src/lib/atomic-write.ts:11-15` (its comment
asserts the behaviour being changed and goes stale), `tests/list.test.ts:23-25` (it mocks
`isConfigValidationError` with a stale hand-rolled copy — see `REVIEW.md`), and
`src/lib/tar-extract.ts:146` (the one other message interpolating an untrusted-derived path raw).
Also untouched: `src/commands/*`, `src/index.ts`, `CLAUDE.md`.

## The message

```text
<abs path> is not valid JSON (line 3, column 5). The file exists — fix its syntax by hand.
Do NOT run `pharn init` to clear this: init OVERWRITES the config, discarding your recorded
capabilities, any manual `pharn add` provenance, and hand-edited models/seam blocks. If it is
beyond repair, move it aside first (`mv pharn.config.json pharn.config.json.bak`), then run
`pharn init`.
```

- **Where:** the absolute `configPath(cwd)`, so it is unambiguous from any cwd.
- **What:** _is not valid JSON_ — the same wording `lib/install-records.ts:133` already uses for the
  records store, so the CLI says one thing one way (P3/P4).
- **Remedy that does not lose data:** repair by hand; `init` is named only as the thing **not** to
  run, and is offered again only _after_ the file has been moved aside. This satisfies the hard
  requirement that the message never prescribe a command that destroys the file it complains about.
- `(line N, column M)` is appended only when V8 supplied one; otherwise the sentence closes after
  `is not valid JSON`. No invented location (P5 — degrade honestly, never guess).

## Location extraction — measured, and a trust boundary (P2)

Measured on node v24.13.1, the runtime CI pins:

| input                | `SyntaxError.message`                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| `{"a":1,}`           | `Expected double-quoted property name in JSON at position 7 (line 1 column 8)`  |
| `{"a":1,\n"b":2,\n}` | `Expected double-quoted property name in JSON at position 15 (line 3 column 1)` |
| `""` (empty)         | `Unexpected end of JSON input`                                                  |
| `oops`               | `Unexpected token 'o', "oops" is not valid JSON`                                |
| `<ESC>[31mRED`       | `Unexpected token '<ESC>', "<ESC>[31mRED" is not valid JSON`                    |

The last row is the reason `err.message` is **never** interpolated: V8 **echoes raw file bytes**
into that shape, control characters included. `pharn.config.json` is a local file, but it is
**not this CLI's own output** — it is hand-editable and can be planted, and this message goes
straight to a terminal. Echoing it verbatim is terminal-escape injection through an error message.
The repo already guards precisely this shape elsewhere (`steps/overwrite-check.ts` filters the
config's own `skillsVersion` through `VERSION_RE` before printing it).

So: `/\(line (\d{1,9}) column (\d{1,9})\)$/` over the message — **two integers, extracted, never
the message itself.** The `$` anchor is load-bearing, not decoration: the content-echoing shape
always ends `" is not valid JSON`, so a file crafted to contain the literal text
`(line 999 column 999)` **cannot** match. The regex can therefore only ever yield digits V8 itself
computed, and its worst case is no match at all.

## Blast radius (P6 — verified by reading, this run)

- Production callers of `readPharnConfig` are exactly two: `loadConfigOrExit` (`pharn-config.ts:130`)
  and `commands/list.ts:41`. **Both already catch `isConfigValidationError` and print `err.message`;
  `loadConfigOrExit` rethrows anything else.** Zero call-site edits.
- **`init` is unaffected — deliberately.** `steps/overwrite-check.ts:38-56` documents that it does
  **not** use this reader, precisely because "init IS the command you run to REPAIR a broken config":
  it has its own file-local, unexported, total-catch reader for the one cosmetic scalar it displays.
  So `pharn init` over a corrupt config still runs and still prompts. That is what makes the new
  message's "move it aside, then run `pharn init`" advice true.
- Existing `expect(readPharnConfig(proj)).toBeNull()` assertions in `tests/update.test.ts`
  (`:420`, `:445`, `:474`, `:1202`) are all **absent-file** assertions ("this run wrote no config") —
  unaffected. `tests/overwrite-check.test.ts:242` asserts the `ModelRoutingError` path — unaffected.
  The only test that changes meaning is `tests/pharn-config.test.ts:80`.

## Deliberately out of scope — recorded, NOT built (P7)

1. **The wrong-shape null-returns (`:84`, `:87-89`) tell the same lie.** A config that parses but is
   `[]`, or has `modules: "oops"`, still reports "not found". Same class; **not** the named finding;
   and widening there would change what a legacy config is allowed to load, which is a P7 axis of its
   own (`readPharnConfig`'s tolerance for legacy fields is a documented guarantee).
2. **An unreadable-but-present config (EACCES / EISDIR) still returns `null` → "run init".** The
   `readFileSync` failure keeps its current behaviour **by construction**: splitting the `try` is
   required so a permissions failure is not _newly_ mislabelled as a parse failure. Pre-existing,
   adjacent, not this finding.

## Evals to write (P1)

- `tests/pharn-config.test.ts`
  - **flip `:80`** — malformed JSON now `toThrow(ConfigParseError)`, not `toBeNull()`.
  - message content: contains the **absolute config path**; matches `/is not valid JSON/`; does
    **NOT** match `/No pharn\.config\.json found/` (the old lie); matches `/Do NOT run/` and
    `/move it aside/` (the non-destructive remedy is present, and `init` is named as a warning).
  - **location, present** — `'{"a":1,\n"b":2,\n}'` → message matches `/\(line 3, column 1\)/`.
  - **location, absent** — `''` (`Unexpected end of JSON input`) → throws, and the message contains
    **no** `line …, column …` clause. Degrades honestly, invents nothing.
  - **no raw echo (P2)** — a config whose bytes are `[31mBOOM` throws, and the message contains
    **neither** the ESC byte **nor** `BOOM`. This is the injection test, and it fails if anyone ever
    "improves" the message by appending `err.message`.
  - **`$`-anchor** — a config whose bytes are `oops (line 999 column 999)` throws with **no**
    `line 999` in the message. Pins the anchor as behaviour, not as a comment.
  - **absent still says "run init"** — `readPharnConfig` on an empty dir returns `null`, and
    `loadConfigOrExit` still emits the unchanged `'No pharn.config.json found. Run`pharn init`first.'`
    **to stderr**. The old message must survive for the case it is actually true for.
  - **wrong shape still returns null** — `{ skillsVersion, modules: 'oops' }` → `null` (the
    out-of-scope boundary, pinned so a later widening is a deliberate act and not a drift).
  - **`isConfigValidationError`** — `true` for `ConfigParseError`, still `false` for a plain `Error`.
  - **`loadConfigOrExit` end-to-end** — corrupt config → `ProcessExit(1)` with the parse message on
    `log.error`, and the message does **not** contain the "found"/"run init first" line.
- **`list --json` is covered by the union, not by a new test in `tests/list.test.ts`.**
  `commands/list.ts:46` branches on `isConfigValidationError(e)` — membership, not identity — so
  adding a member to the union is exercised by the union test above plus the existing `list` test for
  a different member. Stated rather than over-claimed (P0); adding a `list` test would also step
  outside the approved file scope.

## Guarantee audit (P0)

- _"A `pharn.config.json` that exists but is not parseable is reported as **not parseable**, naming
  its path, and never as absent."_ → **floor**: deterministic control flow — `existsSync` (existence
  test) → `readFileSync` (catch → `null`, unchanged) → `JSON.parse` (catch → **throw named**). The
  branch is `JSON.parse` succeeding or not; there is no classification and no guess.
- _"The message never prescribes a command that overwrites the file."_ → **advisory (wording)**,
  backstopped by a test asserting the message does not carry the old "Run `pharn init` first."
  sentence and does carry the move-aside remedy. Wording is not floor-reducible; the assertion is.
- _"The reported line/column is V8's own, never file content."_ → **floor**: a `$`-anchored
  `\d{1,9}` regex — pattern match, `ARCHITECTURE.md §2` primitive #3. Two integers or nothing.
- _"No raw parse-error text or file content reaches the terminal."_ → **floor**: structural — the
  `SyntaxError` message is bound to a local, matched, and discarded; there is no interpolation site.
  Backstopped by the ESC-byte test.
- _"Absent and wrong-shape behaviour is byte-identical to before."_ → **floor**: unchanged code
  paths, pinned by the two retained tests.
- _"Zero call-site changes are needed."_ → **floor**: both sites branch on
  `isConfigValidationError`, an `instanceof` union membership test the new class joins.

## Trust audit (P2)

Input: `pharn.config.json` — a local, hand-editable, plantable file (`LIMITS.md §1c` already calls it
an advisory record, not a guarantee). Taint enters through V8's `SyntaxError.message`, which
**embeds raw file bytes** in one of its shapes. Propagation is cut at a single point: the message is
matched against a `$`-anchored digits-only regex and **never** interpolated, stringified into output,
or attached as a `cause`. What reaches the user's terminal is: a path this CLI computed
(`resolve(cwd, …)`), fixed English, and at most two integers V8 produced. Taint therefore reaches
**no** output field. The escape-injection case has a dedicated test.

## Determinism audit (P5)

Every branch is an existence, success/failure, or pattern-match test: `existsSync` → read
succeeds/fails → `JSON.parse` succeeds/fails → regex matches/does not. The terminal fallback on the
parse path is a **named hard-fail** (throw → `exit(1)` with an offender-naming message), never a
guess; the terminal fallback on the location path is **omitting the clause**, never inventing a
position.

## Open questions (HALT)

- None. The human pre-approved GATE 1 for this shape, and the one design call the brief left open
  (audit's call-site branch vs. the module's own named-error pattern) is decided and justified above,
  against the file's design rather than the audit's phrasing. The two collateral files
  (`docs/troubleshooting.md`, `src/lib/atomic-write.ts`) are **reported, not edited**, per the scope.
