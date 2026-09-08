# PLAN — one filename trust floor across both write paths

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Validate the product-command and hook basenames enumerated by `collectExpectedInstallPaths` with the same `assertSafeString(COPY_FILENAME_RE)` + `assertNoDotDot` that `copyFilteredDir` already applies, so `pharn init` (installer) and `pharn update` (manifest-driven writer) enforce ONE trust floor over the same untrusted clone.
- layer(s): `src/lib` (install manifest — the read-only mirror), `tests`
- constitution_refs: [P0, P1, P2, P5]

## Discovery (P6 — read live this run)

- `src/lib/install-manifest.ts:86-94` — `addDir(relDir, keep?)` filters by shape only; `:101-115` — the two call sites that mirror `copyFilteredDir` pass `endsWith`/`startsWith` predicates and nothing else.
- `src/lib/install-capabilities.ts:189-232` — `copyFilteredDir` validates every KEPT basename with `assertSafeString(entry.name, …, COPY_FILENAME_RE)` + `assertNoDotDot`, after `keep`, before any path-join; its docstring pins "hard-fails (P2), never silently skipped".
- `src/lib/validate.ts:18` — `COPY_FILENAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.(md|cjs|mjs|json)$/`; `:77-97` — `assertSafeString` additionally rejects control characters; `:99-103` — `assertNoDotDot`.
- `src/commands/update.ts:364` — `collectExpectedInstallPaths` is called inside `applyUpdate`, itself called at `:246` inside the try whose catch reports and exits 1. `src/commands/status.ts:92,130` — catches and exits via `reportError`. `src/commands/init.ts` — named failure branch.
- `tests/install-manifest.test.ts:319-353` (`⟷ installCapabilities`) and `:355-400` (`⟷ the update writer`) — the two mirror pins.

## Files

- `src/lib/install-manifest.ts` — add an optional `validate` hook to `addDir`, run AFTER `keep` and BEFORE `add`; pass the `COPY_FILENAME_RE` validator at the commands and hooks call sites only; extend the header comment's MIRROR framing to say name validation now mirrors `copyFilteredDir` for those two surfaces and that `status` therefore hard-fails (rather than reporting drift) on such a clone — layer `lib`
- `tests/install-manifest.test.ts` — adversarial-name cases in both mirror describes + negative controls + a scope proof for capability/contract/floor names — layer `tests`
- `tests/update.test.ts` — end-to-end: a clone carrying such a command file makes `pharn update` fail with the named error and write nothing — layer `tests`

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — untouched; this increment adds no finding surface.
- The manifest↔installer MIRROR property already pinned at `tests/install-manifest.test.ts:319` / `:355` — this change makes the two agree MORE (both now refuse the same clone), never less.

## Evals to write (P1)

- `collectExpectedInstallPaths` + `installCapabilities`, `.claude/commands/pharn-Weird_Name.md` in the clone → BOTH throw `ManifestValidationError`.
- `collectExpectedInstallPaths` + `installCapabilities`, `.claude/hooks/Set-Writes-Scope.cjs` (uppercase) in the clone → BOTH throw `ManifestValidationError`.
- Negative control: `.claude/commands/README.md` and `.claude/commands/pharn-dev-Weird.md` (both fail `keep`) → nothing throws, nothing contributed.
- Scope proof: capability / `pharn-contracts` / `.dev/floor` names outside `COPY_FILENAME_RE` (uppercase, extra dots, `.txt`) are still enumerated.
- `pharn update` against a clone with `.claude/commands/pharn-Weird_Name.md` → exit 1 with the named error, project tree unchanged (nothing written).

## Guarantee audit (P0)

- "a command/hook basename from the clone that fails the allowlist is refused on BOTH write paths" → **floor: enum-regex** (`COPY_FILENAME_RE` + `CONTROL_CHARS_RE` inside `assertSafeString`), pinned by test.
- "the refusal is a hard-fail, never a silent skip" → **floor**: the validator throws; no catch is added inside the manifest.
- "validation is scoped to the two `copyFilteredDir` surfaces" → **floor: test** (the scope-proof case asserts capability/contract/floor names outside the regex still enumerate).
- "the manifest stays read-only" → **floor: code shape** (no write API is added; `addDir` only reads).
- "the mirror keys ∪ settings.json equal a real install's writes" → **floor: existing mirror tests**, unchanged and still green.

## Trust audit (P2)

- Input: the degit-fetched clone (untrusted). Today its command/hook basenames reach `add()` unvalidated and become manifest KEYS, which `applyWrites` then uses as write destinations — taint reaches a filesystem write with only `safeJoin` containment and the symlink walk between it and the disk.
- After: the same basenames are gated by the regex+control-char allowlist before they are path-joined into a key, so the taint is cut at the same point `copyFilteredDir` cuts it. `safeJoin` containment and `findSymlinkComponent` are unchanged and remain the containment backstop.
- Capability dir contents, `pharn-contracts/`, `pharn-core/`, `.dev/floor/` and the trusted docs are DELIBERATELY not name-validated — `cpSync` copies them verbatim with no name check, so validating them in the mirror would BREAK the mirror property and reject legitimate `evals/` fixtures. Their containment stays `safeJoin` + the symlink guards.

## Determinism audit (P5)

- The new branch is a regex/enum membership test (`COPY_FILENAME_RE`, `CONTROL_CHARS_RE`) with a hard-fail terminal — never a classification, never a silent fallback.
- Ordering is fixed and mirrors `copyFilteredDir` exactly: `keep` first, then validate. A name that fails `keep` (a `README.md`, a `pharn-dev-*` command) can never throw.

## Out of scope (P7)

- Making the floor `*.test.*` exclusion basename-vs-full-path identical between installer and mirror.
- Any change to `COPY_FILENAME_RE` itself, or name validation for capability directory contents.
- `pharn.records.json` key validation (the sibling change already in `main`, deliberately the opposite direction — do not harmonize).

## Open questions (HALT)

- None. Every branch point above was read from disk this run; the prompt spec (`prompts/5.1d-manifest-filename-validation.md`) fixes the design choices this plan would otherwise have to ask about.
