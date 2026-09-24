# PLAN — terminal-safe-text (PHARN-17: upstream-derived text never reaches the terminal raw)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: three layers. (1) The extractor REFUSES a tar entry whose path contains a C0/C1 control
  character or a Unicode format character (`\p{Cf}`: U+202E, U+200B, …) — upstream has none (2161 paths
  checked in the review), so nothing with such a name is ever installed or later printed by
  `status`/`update`. (2) One shared sanitizer, `lib/terminal-safe.ts`, strips C0/C1 + `\p{Cf}` and caps
  length; `unknown-capabilities.ts` uses it (gaining `\p{Cf}`), and every extractor message that
  interpolates an entry name or typeflag renders it through it. (3) The fatal sink `logError`
  (`report-error.ts`) sanitizes its whole message (keeping `\n`/`\t`), so no fatal path — present or
  future — can print a raw escape sequence.
- layer(s): the CLI itself (`src/lib/*`)
- constitution_refs: [P1, P2, P3, P5]

## Discovery — verified this run (P6)

Review repro: `unsupported type '2': pharn-oss-…/n^[[2K^M^[[32mOK` printed by `reportFatal` in
`init`/`status` (a faked "OK", line erase, OSC 52 clipboard write possible). `unknown-capabilities.ts`
strips `[\x00-\x1f\x7f-\x9f]` but not U+202E/U+200B. `resolveEntryPath` (`tar-extract.ts`) checks `..`,
absolute, root only. `logError` passes messages verbatim; no caller passes colored text (grep: 31 call
sites, none with `pc.`/ANSI).

## Files

- `src/lib/terminal-safe.ts` — NEW: `terminalSafe(value, opts)` (strip C0/C1 + `\p{Cf}`, optional keep
  `\n`/`\t`, optional length cap) + `hasUnsafeChars(value)` — layer CLI/lib
- `src/lib/unknown-capabilities.ts` — use the shared sanitizer — layer CLI/lib
- `src/lib/report-error.ts` — `logError` sanitizes (keeps newlines/tabs) — layer CLI/lib
- `src/lib/tar-extract.ts` — reject unsafe entry paths; render interpolated names/typeflags safely — layer CLI/lib
- `tests/terminal-safe.test.ts` — NEW: ESC/CSI, OSC, C1, U+202E, U+200B stripped; newline policy; cap
- `tests/unknown-capabilities.test.ts` — a U+202E name is neutralised
- `tests/report-error.test.ts` — an ESC sequence in a fatal message never reaches stderr raw
- `tests/tar-extract.test.ts` — entry paths with ESC / U+202E refused; the unsupported-type message
  carries no raw control byte

## Contracts satisfied

- `unknown-capabilities.ts` header: "control characters are stripped … BEFORE it reaches the terminal" —
  now including format characters, and extended to the fatal path.

## Evals to write (P1)

- listed above; the extractor, sink and U+202E cases fail on the base source.

## Guarantee audit (P0)

- "no upstream-derived byte in {C0, C1, Cf} reaches stderr through the fatal sink" → floor: regex strip
  at `logError` + refusal at extraction.

## Trust audit (P2)

- Narrows accepted archive names; sanitizes display only (never used for paths).

## Determinism audit (P5)

- Pure string functions.

## Open questions (HALT)

- none
