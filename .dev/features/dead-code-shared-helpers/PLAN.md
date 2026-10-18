# PLAN — dead-code-shared-helpers (F-46 part A)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256 of ARCHITECTURE.md, read this run
- increment: Behaviour-preserving cleanup — delete code only tests reach, delete `..` checks a preceding allowlist already makes unreachable, and single-source four duplicated helpers (the ENOTDIR-tolerant symlink walk, the C0/DEL/C1 control-char range, the bounded-read→JSON.parse step, `list`'s own config check).
- layer(s): product (`pharn` CLI, `src/`) + its tests + CLAUDE.md + CHANGELOG. No user-visible behaviour change except one named hardening (item 6).
- constitution_refs: [P2, P3, P5, P7]

## Context (live reads, this run, branch from origin/main c320671)

Every item was re-checked against current main; the verdict per item is below.

1. **Dead code.**
   - `src/lib/confirm.ts` `warnAndConfirm` (the brief said `steps/`; it lives in `lib/`) — zero `src/` callers; only `tests/confirm.test.ts` (its `describe` block). **Remove.**
   - `src/lib/archetype.ts:440` `detectArchetypes(pkg)` = `archetypesFromSignals(packageSignals(pkg))` — zero `src/` callers; `tests/archetype.test.ts` uses it ~20× as the harness for the package-name rule. **Remove**, and keep those cases by testing the same composition through a file-local test helper (the rule's coverage must not drop with the wrapper).
   - `ArchetypeDetection.packageJsonFound` (`detect-archetype.ts:68`) — no `src/` reader (init reads `archetypes`/`evidence`/`truncated`). The LOCAL value from `readPackageFacts` still feeds `jsProject` — kept. ~75 test assertions in `tests/detect-archetype.test.ts` observe it (manifest usable / FIFO / oversize / BOM / non-object). **Remove from the interface**; export `readPackageFacts` (the actual package.json boundary, the way `scanFileTree` is already exported) and point those assertions at it, so the bounded-read cases stay pinned. `tests/init.test.ts:41` drops the field from its mock.
   - `detect-archetype.ts:327` `.env*` file skip — **KEEP (live).** It is reachable (any `.env`/`.env.local` file), it runs BEFORE `budget -= 1`, so removing it would make `.env*` files spend the walk budget and change `truncated`; `tests/detect-archetype.test.ts` "entries the walk skips anyway never trip it" pins it with `.env.local`. It also keeps a `.env.sql` / `.env.tsx` from ever being a signal. Add a one-line comment saying so.
   - `src/types.ts` `Constitution` / `InstalledModule` / `InstalledSkill` — no reader in `src/` or `tests/`. **Remove the three types**; `PharnConfig.constitution?`, `modules`, `installedSkills?` become `unknown` / `unknown[]` / `unknown`. P7 holds: `readPharnConfig` spreads the raw object verbatim, never reconstructs these fields, and the load guard only tests `Array.isArray(raw.modules)`; `CLI_OWNED_KEYS` is keyed on `keyof PharnConfig`, unchanged.
   - `assertNoDotDot` — all four calls follow an `assertSafeString` against a regex that cannot match `..`: `capability-index.ts:124` and `install-capabilities.ts:130` (`CAPABILITY_NAME_RE = ^[a-z0-9]+(-[a-z0-9]+)*$`, no `.` at all), `install-capabilities.ts:564` and `install-manifest.ts:240` (`COPY_FILENAME_RE = ^[a-z0-9]+(-[a-z0-9]+)*\.(md|cjs|mjs|json)$`, exactly one `.`, preceded by `[a-z0-9]`). **Remove the four calls, then the function (no other caller) and its `tests/validate.test.ts` block.** A new test asserts both regexes refuse every `..`-bearing candidate, so the reason the deletion is safe is pinned, not assumed.
2. **`modules: []`** — **KEEP writing it; document why.** Every released CLI (v0.7.1, v0.9.0, v0.10.0, v0.11.0, v0.12.0 — `git grep` this run) has `if (typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules)) return null;` in `readPharnConfig`. A config without `modules` therefore reads as NO config to every older CLI: `status`/`update`/`add`/`remove`/`list` say "No pharn.config.json found. Run `pharn init` first." and exit 1, and a re-run `init` carries nothing over (manual adds lost). Projects pin CLI versions (`npx @pharn-dev/pharn@0.12.0`), so dropping the key would break them. The guard is also left as is (a config without `modules` keeps reading as "run init", unchanged); only the comments change: `install-archetype.ts` and `pharn-config.ts` say `modules: []` is a compatibility key for older CLIs' load guard.
3. **One ENOTDIR-tolerant symlink walk.** `capability-dir.ts` `linkedComponent` (catch → `null`), `install-capabilities.ts` `symlinkedComponent` (catch → `null`), `dest-drift.ts` `symlinkComponent` (catch → `UNREADABLE`). All three catch EVERY throw (ENOTDIR, EACCES, ELOOP), not only ENOTDIR. New `findSymlinkComponentOr<T>(base, rel, unwalkable: T): string | null | T` in `lib/symlink-guard.ts` — the walk, with any throw returned as the caller's `unwalkable` value. The two private wrappers are deleted and their call sites call it with `null` / `UNREADABLE`; `linkedComponent` stays (it also builds the rel; `remove` and `capability-removal` import it) and delegates. Each caller's outcome is byte-for-byte what it is now (add's ENOTDIR stays a skip via `UNREADABLE`).
4. **One control-char definition.** `validate.ts:44` and `pharn-config.ts:274` are the identical C0+DEL+C1 class `[\x00-\x1f\x7f-\x9f]` (the latter `/g`). `validate.ts` exports `CONTROL_CHARS_RE`; `pharn-config.ts` derives its global copy (`new RegExp(CONTROL_CHARS_RE.source, 'g')`) and its "three copies … not done here" comment is replaced. `terminal-safe.ts` DIFFERS on purpose — `+\p{Cf}` (bidi/zero-width, display only), a keep-`\t\n` variant, and `+U+2028/2029` for the escaper — so it keeps its own sets, with a comment naming the difference from `CONTROL_CHARS_RE`.
5. **`readJsonBounded(path, maxBytes?)`** in `lib/bounded-read.ts`: `readBoundedFile` → (`ok`) `JSON.parse(bytes.toString('utf8'))`, returning `absent` / `unusable` (as now) / `ok {value}` / `invalid-json {error}` — never throws. Callers keep their own failure shape: `overwrite-check.ts` `recordedSkillsVersion` (all non-ok → `null`), `install-records.ts` `readRecords` (named `invalid` messages unchanged), `pharn-config.ts` `readPharnConfig` (unreadable → `null`; invalid JSON → `ConfigParseError` with `parseLocation(error)` — the error object is carried for that), `init-plan.ts` `readCarriedEntries` (→ `{}`), `upstream-models.ts` (reasons unchanged, its 256 KiB cap passed through). `configFingerprint` stays on raw bytes (it hashes them). `project-lock.ts` / `repo.ts` untouched.
6. **`list` → `loadArchetypeConfigOrExit(cwd, { json })`.** Same messages, same exit 1, same streams (non-json: `logError` both before and after; json: plain `console.error`). One deliberate difference, named in CHANGELOG: under `--json` the line now goes through `logErrorPlain`, which strips control characters (`terminalSafe`) — list was the one `--json` load path printing a config error raw. `tests/list.test.ts` mocks the whole `pharn-config` module, so the shared loader cannot be reached through it; the config-error cases move to real files in a temp cwd (the inventory cases keep the mock or move too — whichever keeps the assertions unchanged).

Out of scope (other agents/PRs): moving update renderers / the add picker, CHANGELOG archive, `project-lock.ts`, `repo.ts`.

## Files

- `src/lib/confirm.ts` — drop `warnAndConfirm` (+ now-unused imports) — product
- `src/lib/archetype.ts` — drop `detectArchetypes` — product
- `src/lib/detect-archetype.ts` — drop `ArchetypeDetection.packageJsonFound`, export `readPackageFacts`, `.env*` comment — product
- `src/types.ts` — drop `Constitution`/`InstalledModule`/`InstalledSkill`, legacy fields typed `unknown` — product
- `src/lib/validate.ts` — drop `assertNoDotDot`, export `CONTROL_CHARS_RE` — product
- `src/lib/capability-index.ts` — drop the unreachable `assertNoDotDot` call — product
- `src/lib/install-capabilities.ts` — drop 2 unreachable calls, drop `symlinkedComponent`, use `findSymlinkComponentOr` — product
- `src/lib/install-manifest.ts` — drop the unreachable call — product
- `src/lib/symlink-guard.ts` — add `findSymlinkComponentOr` — product
- `src/lib/capability-dir.ts` — `linkedComponent` delegates — product
- `src/lib/dest-drift.ts` — drop `symlinkComponent`, use `findSymlinkComponentOr` — product
- `src/lib/pharn-config.ts` — derived control-char regex, `readJsonBounded`, comments (modules, list) — product
- `src/lib/terminal-safe.ts` — comment naming the difference — product
- `src/lib/bounded-read.ts` — add `readJsonBounded` — product
- `src/steps/overwrite-check.ts` — use `readJsonBounded` — product
- `src/lib/install-records.ts` — use `readJsonBounded` — product
- `src/lib/init-plan.ts` — use `readJsonBounded` — product
- `src/lib/upstream-models.ts` — use `readJsonBounded` — product
- `src/steps/install-archetype.ts` — comment on `modules: []` — product
- `src/commands/list.ts` — `loadArchetypeConfigOrExit` — product
- `tests/confirm.test.ts` — drop the `warnAndConfirm` block — test
- `tests/archetype.test.ts` — package-rule cases via a local helper — test
- `tests/detect-archetype.test.ts` — `packageJsonFound` observed through `readPackageFacts` — test
- `tests/init.test.ts` — drop the field from the detection mock — test
- `tests/validate.test.ts` — drop `assertNoDotDot`; add the "regexes admit no `..`" test — test
- `tests/symlink-guard.test.ts` — `findSymlinkComponentOr` cases (null, symlink, ENOTDIR → fallback, both fallbacks) — test
- `tests/bounded-read.test.ts` — `readJsonBounded` cases (ok, absent, unusable, invalid-json carries the error, cap passed through) — test
- `tests/list.test.ts` — config-error cases through the shared loader; control-char stripping under `--json` — test
- `tests/pharn-config.test.ts` — only if a pinned comment/assertion references a moved symbol — test
- `CLAUDE.md` — fix every sentence naming a removed/renamed symbol (`list` "own json-aware check" ×2, `linkedComponent`, `checked for ..`, `modules: []` reason) — docs
- `CHANGELOG.md` — `### Changed` (contributors) entry under `[Unreleased]` — docs
- `.dev/features/dead-code-shared-helpers/BUILD.md` — build note — stage artifact

## Contracts satisfied

- None new. CLAUDE.md's existing invariants are preserved: `safeJoin`/`findSymlinkComponent` split (validate.ts / symlink-guard.ts), each caller owns its failure shape, `bounded-read.ts` never throws, P7 legacy config fields still load, `--json` keeps stdout pure.

## Evals to write (P1)

- `findSymlinkComponentOr` → clean path → `null`; symlinked parent → that component; component below a regular file (ENOTDIR) → the passed fallback (`null` and a sentinel both).
- `readJsonBounded` → valid JSON → `ok` with the value; absent → `absent`; FIFO/dir → `unusable` with the same code/reason as `readBoundedFile`; bad JSON → `invalid-json` carrying the `SyntaxError`; `maxBytes` honoured.
- `CAPABILITY_NAME_RE` / `COPY_FILENAME_RE` → every `..`-bearing candidate (`..`, `a..b`, `../x.md`, `a..md`, `x/../y.cjs`) rejected — the reason the deleted check was dead.
- `list --json` with a config whose error text carries an ESC → stderr line has it stripped, stdout empty, exit 1; non-json/legacy/no-config messages unchanged.
- Existing suites (`dest-drift`, `add`, `capability-removal`, `remove`, `install-capabilities`, `install-records`, `upstream-models`, `init-plan`, `overwrite-check`, `pharn-config`) pass UNCHANGED — that is the behaviour-preservation proof.

## Guarantee audit (P0)

- "behaviour preserved" → floor: the existing test suites pass unmodified (except where a test addressed a removed symbol) + `npm run check`; advisory: the per-item reasoning above.
- "the deleted `..` checks were unreachable" → floor: enum-regex test over both allowlists.
- "each symlink-walk caller keeps its outcome" → floor: existing dest-drift/add/remove/init pre-flight tests unchanged + new unit tests of the fallback.
- "older CLIs still read new configs" → floor: `modules: []` still written (existing install-archetype tests); the version survey is advisory (git grep of released tags, recorded above).

## Trust audit (P2)

- No new input. `readJsonBounded` parses the same local files with the same bound; parsed values stay `unknown` and every caller keeps its own validation. The `list --json` change narrows what reaches stderr (control chars stripped), never widens it.

## Determinism audit (P5)

- No new branches beyond membership tests (`kind` discriminants); every fallback is an explicit caller-chosen value.

## Resolved at GATE 1 (human, 2026-10-18)

- Approved as planned: KEEP writing `modules: []` and the guard (comment names the older-CLI reason); KEEP the `.env*` skip (comment explains it); ACCEPT the `list --json` control-char stripping (CHANGELOG notes it).
- Extra: `findSymlinkComponentOr` keeps each caller's CURRENT catch breadth exactly. Verified: all three wrappers use a bare `catch {}` (every throw), so the helper catches every throw.
- Rebased on origin/main 294598e (#300) before building; none of this plan's files were touched by it.
