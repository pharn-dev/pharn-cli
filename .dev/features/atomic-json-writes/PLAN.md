# PLAN — atomic writes for the two CLI-owned JSON files

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Replace the plain `writeFile` in `writePharnConfig` and `writeRecords` with one shared write-temp-then-rename helper, so a write torn by power loss or SIGKILL can no longer leave truncated JSON at either path.
- layer(s): `src/lib` (a new one-axis primitive + its two callers), `src/commands` (comment only), `tests`, root docs
- constitution_refs: [P0, P1, P2, P3, P7]

## Discovery (P6 — read live this run)

- `src/lib/pharn-config.ts:161-170` — `writePharnConfig` is a bare `await writeFile(configPath(cwd), …)`.
- `src/lib/install-records.ts:237` — `writeRecords`' write is the same shape.
- `src/lib/pharn-config.ts:79-83` — malformed JSON takes the `JSON.parse` catch and `readPharnConfig` returns `null`; `:139-141` renders that as `No pharn.config.json found. Run \`pharn init\` first.` So a torn config file reports as ABSENT, and the prescribed re-init resets hand-edited `models`/`seam` and re-stamps every capability `source: 'auto'` — destroying manual-add provenance.
- `src/commands/remove.ts:216-224` and `CLAUDE.md:64` both state the write is "a plain `writeFile`" as the reason their ordering argument is benignity rather than atomicity. Both must stop saying that while keeping the cross-file claim unchanged.
- `src/lib/install-records.ts` has no header sentence repeating the plain-`writeFile` fact (checked: the only `writeFile` mentions are the import and the call), so nothing to correct there.

## Files

- `src/lib/atomic-write.ts` — NEW. `writeJsonAtomic(path, value)`: serialize, write a sibling temp, `rename` over the target; best-effort unlink of the temp on any failure, then rethrow. One axis: atomic replacement of a JSON file — layer `lib`
- `src/lib/pharn-config.ts` — `writePharnConfig` delegates to it; bytes unchanged — layer `lib`
- `src/lib/install-records.ts` — `writeRecords` delegates to it; bytes unchanged — layer `lib`
- `src/commands/remove.ts` — the ordering comment no longer calls the write a plain `writeFile`, and still says the two-file sequence is a benignity argument, not a transaction — layer `commands`
- `CLAUDE.md` — the same clause in the `pharn remove` paragraph — layer `docs`
- `tests/atomic-write.test.ts` — NEW. The helper's own contract — layer `tests`
- `tests/pharn-config.test.ts` — round-trip, no temp litter, overwrite-in-place, and the failure path — layer `tests`
- `tests/install-records.test.ts` — the same two cases for `writeRecords` — layer `tests`

## Contracts satisfied

- No `pharn-contracts` contract governs CLI-owned state files; this is a `src/lib` primitive.
- The config schema contract (additive, P7) is untouched: only the write mechanism changes, never the bytes.

## Evals to write (P1)

- `writeJsonAtomic` writes exactly `JSON.stringify(v, null, 2)` + `\n`, utf8 → byte-identical to the old output.
- `writeJsonAtomic` over an EXISTING file replaces it in place and leaves no `*.tmp` sibling.
- `writeJsonAtomic` failure: a **directory** planted at the temp path makes the write throw; the pre-existing target is left unchanged and parseable, and the planted directory is untouched (the best-effort unlink swallows its own error rather than masking the real one).
- The temp path is a SIBLING of the target (same directory), derived from the target path.
- `writePharnConfig` round-trips through `readPharnConfig`, leaves no temp sibling, overwrites in place; on the planted-directory failure the old config still loads.
- `writeRecords` — the same two cases, with the existing read-back assertions still green.
- Existing `update` / `remove` write-order and stamp assertions stay green untouched.

## Guarantee audit (P0)

- "a torn write can no longer leave truncated JSON at either path" → **floor: `rename(2)`** — atomic within a filesystem on POSIX, and Node's `fs.promises.rename` replaces an existing destination on win32; the sibling temp is what keeps both true. Pinned by the failure-path test (target unchanged after a failed write).
- "no temp litter survives a failure" → **floor: test** (the no-`*.tmp`-sibling assertions), with the honest caveat that a SIGKILL between create and unlink can still leave one — stated, not hidden.
- "the two files are written atomically **as a pair**" → **NOT CLAIMED.** Per-file atomicity does not make records+config transactional. A crash between them still leaves a stamp mismatch, which `recordsBaseline` (`install-records.ts:163-180`) already reports by name and treats as records-unavailable. The comments must not be upgraded past this.
- "this addresses concurrent `pharn` processes" → **NOT CLAIMED.** No lock file; cross-process exclusion is a separate increment.

## Trust audit (P2)

No untrusted input is ingested. The paths come from `configPath(cwd)` / `recordsPath(cwd)`, both `resolve(cwd, …)`; the temp path is DERIVED from those by suffix, never caller-supplied, so it cannot be steered outside the project root. The serialized value is CLI-owned state, not fetched content.

## Determinism audit (P5)

No new branch is introduced on any classification. The only branch is the try/catch around the temp write, whose failure terminal is a rethrow of the ORIGINAL error — never a swallow, never a guess. The unlink's own error IS swallowed, deliberately, so a cleanup failure cannot mask the real cause.

## Out of scope (P7)

- Any lock file / `O_EXCL` cross-process mutual exclusion.
- Improving the `No pharn.config.json found` message to distinguish absent-from-malformed (it is user-visible and pinned by tests; a separate change).
- Changing what `init` writes into the config — the all-`auto` stamp is correct for a fresh install.
- `fsync` before rename (durability against power loss at the block layer, as distinct from torn content). Not claimed, not added; naming it here so the limit is explicit rather than implied away.

## Open questions (HALT)

- None. The spec (`prompts/5.1e-atomic-config-writes.md`) fixes the design choices, and every precondition above was read from disk this run.
