# PLAN — core-170-one-sanitizer (Linear CORE-170, C3.2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: untrusted text from `pharn.records.json` is escaped before it reaches the terminal, and every unsafe-character test in `src/` derives from ONE set in `src/lib/terminal-safe.ts`.
- base: origin/main @ acac112 (0.18.5); branch `pharndev/core-170-c32-untrusted-text-is-always-escaped`
- layer(s): CLI source (`src/lib`), tests, docs (CLAUDE.md, THREAT-MODEL.md, CHANGELOG.md)
- constitution_refs: [P0, P1, P2, P4, P5, P7]

## Defect (verified at acac112)

`reportOutcome` (`src/lib/update-render.ts:201`) and `reportDryRun` (`:355`) print `recordsNote` raw via `log.warn`. The note is built in `src/lib/install-records.ts` from the hand-editable store (`readRecords` messages at :175/:208/:214, `stampMismatches` at :315) with `JSON.stringify`, which escapes ESC but leaves U+009B (8-bit CSI) and U+202E (RLO) raw. `uninstall.ts:164` already escapes the same message.

## Files

- `src/lib/terminal-safe.ts` — ONE unsafe set (C0, DEL, C1, U+2028, U+2029 as code-point ranges + `\p{Cf}`), built once into a class source with no raw character; `terminalSafe` strips it (keeps `\t`/`\n` inside the replace callback under `keepNewlines`; no `v` flag), `hasUnsafeChars` is a non-global test from the same source, `escapeUnsafe` unchanged in behaviour. Header rewritten.
- `src/lib/validate.ts` — delete `CONTROL_CHARS_RE` (+ its eslint-disable and comment); `assertSafeString` rejects early through `hasUnsafeChars` and passes BOTH messages through `escapeUnsafe` (the label interpolates untrusted names at capability-index.ts:122, install-capabilities.ts:133, :560).
- `src/lib/pharn-config.ts` — drop `CONTROL_CHARS_GLOBAL_RE`; `displayPath` = `escapeUnsafe(path)` (`\x1b` → `\u001b`); comment keeps "escaped, not stripped, not capped".
- `src/lib/update-render.ts` — `log.warn(`⚠ ${escapeUnsafe(recordsNote)}`)` at both sites (value, never the whole line).
- `src/lib/install-records.ts` — comment only: `stampMismatches` no longer claims JSON.stringify "escapes the rest"; the print sites escape.
- `tests/terminal-safe.test.ts` — the one set in all three functions (C0, DEL, C1, U+202E, U+2028/2029); static test: no `src/**/*.ts` except terminal-safe.ts holds a control-range class (`\xNN-\xNN` / `\u00NN-\u00NN` spellings) or a `\p{Cf}`/`\p{Cc}` class; `DISPLACED_LEAD_RE` in capability-index.ts is the one named exemption (asserted present, so it cannot rot); the detector itself is checked against the old literals.
- `tests/update-render.test.ts` — `reportOutcome` / `reportDryRun` with a hostile `recordsNote` print `\u009b`/`\u202e`/`\u001b`, no raw character.
- `tests/validate.test.ts` — remove the `CONTROL_CHARS_RE` block; add: U+202E / U+2028 rejected early; neither message echoes a raw character from a hostile label.
- `tests/tar-extract.test.ts` — an entry name holding U+2028 is refused (the accepted side effect; GRILL P1).
- `tests/install-records.test.ts` — the stamp note keeps a C1 character raw as DATA, and `escapeUnsafe` makes it inert (pharn-ci TESTS_NOT_EXERCISING_CHANGES).
- `tests/pharn-config.test.ts` — :952/:958 expectations `\x1b`/`\x0a` → `\u001b`/`\u000a`.
- `tests/commands-integration.test.ts` — the repro, real modules: (a) hostile STAMP at the same upstream version → `update --dry-run`, `update --yes` print escaped; `update --dry-run --json` keeps the raw characters in `plan.recordsNote` (no double escape) while stdout holds none; (b) hostile KEY (valid key, bad hash → invalid store) with upstream NEWER → `update --dry-run`, `update --yes` print escaped; `uninstall --yes` refuses with it escaped.
- `CLAUDE.md` — rewrite the :66 `CONTROL_CHARS_RE` clause (one set in terminal-safe.ts; `assertSafeString` rejects through `hasUnsafeChars`).
- `THREAT-MODEL.md` — §3 table row: hostile `pharn.records.json` keys/stamp → note escaped with `escapeUnsafe` at print; one unsafe set in `terminal-safe.ts`. Row :144 control-char wording kept accurate.
- `CHANGELOG.md` — `## [Unreleased]` → `### Security` entry, incl. the `\x1b` → `\u001b` config-path change and the two side effects (terminalSafe strips U+2028/2029; tar-extract refuses names holding them). No version bump (epic batches C3 into 0.19.0).

## Contracts satisfied

- `CLAUDE.md` "lib/validate.ts is security-sensitive" + "Colour has one rule" (escape the value, never the line: our colour codes use ESC) — cited, not restated.
- JSON outputs keep `serializeJsonReport`'s lossless `escapeUnsafe`; `plan.recordsNote` is escaped ONCE (at serialization).

## Evals to write (P1) — tests first, each must fail before the code change

- terminal-safe: `terminalSafe('a\u2028b')` → `'ab'`; `hasUnsafeChars('\u2029')` → true; each class member in each function → stripped / true / `\uXXXX`.
- static: today's terminal-safe literals + CONTROL_CHARS_RE are detected by the detector; src scan → `[]` (fails today on validate.ts and pharn-config.ts's derivation? — validate.ts:49 literal, yes).
- update-render: hostile note → escapes present, raw absent (fails today: raw printed).
- validate: `assertSafeString('Nope', 'x\u009b', RE)` message → contains `\u009b`, no raw (fails today).
- pharn-config: hostile cwd → `\u001b` (fails today: `\x1b`).
- integration: (a)/(b) above (fail today on the update print sites).
- Byte pins UNCHANGED for ordinary input: status-json, status-report, update-dry-run-json, update-report, json-report.

## Guarantee audit (P0)

- "recordsNote never reaches the terminal raw in update" → floor: regex (`escapeUnsafe` over the one set) at both print sites, pinned by unit + integration tests.
- "one unsafe-character definition in src/" → floor: static test (regex scan of `src/`), with one named, asserted exemption.
- "JSON bytes unchanged for ordinary input" → floor: existing byte-pin tests.
- "no other records-note sink" → advisory: a grep audit this run (`recordsBaseline(...).note` reaches only update-plan → update-render; uninstall escapes; remove/add/status/init read `.records` only). Not mechanically pinned beyond the tests above.

## Trust audit (P2)

- `pharn.records.json` (committed, hand-editable, possibly hostile) → `readRecords` / `recordsBaseline` note (raw, data) → (1) terminal: `escapeUnsafe` at print; (2) `--dry-run --json`: `serializeJsonReport` escapes losslessly; (3) uninstall: `escapeUnsafe` then `logError`'s `terminalSafe`.
- capability/dir names from the fetched archive → `assertSafeString` label/value → error message escaped with `escapeUnsafe`.
- process cwd → `displayPath` → `escapeUnsafe`.

## Determinism audit (P5)

- Every check is set membership on code points; no classification.

## Resolved questions (none open)

- None blocking: the ticket's "escape where it is built (or terminalSafe at its two print sites)" is resolved by your decision 1 (escapeUnsafe at the print sites, to avoid double-escaping `plan.recordsNote`).
- Side effects accepted per your decision 2: `terminalSafe` also strips U+2028/2029; tar-extract refuses names holding them; `assertSafeString` now rejects a `\p{Cf}` / U+2028/9 value with "contains control characters" (before: "invalid format" with the value echoed).
