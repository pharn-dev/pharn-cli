# PLAN — core-173-clone-invariant (Linear CORE-173, C3.5)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the tar extractor refuses `\` and `:` in entry names, refuses pax `x` on its typeflag and skips `g` unparsed; `fetchRepo` STATES the invariant "the returned tree holds only regular files and directories, created by this process in a private temp dir"; the clone-side symlink/descriptor guards and redundant extractor branches that invariant makes unreachable are deleted. Every DESTINATION guard stays.
- base: origin/main @ 8fe3d5a (0.18.5, CORE-172 merged). Branch `pharndev/core-173-c35-tar-names-refuse-and-clone-side-guards`, built in a git worktree (see Resolved questions: the main checkout carries untracked `src/**/*.updated.ts` handover files that `tsc`/eslint would pick up).
- C5.4 (CORE-183) has NOT landed (git log checked), so every site below still exists. Line numbers are the live ones at 8fe3d5a; several moved since the ticket was written.
- layer(s): CLI source (`src/lib/*`), tests, docs (`SECURITY.md`, `CLAUDE.md`, `CHANGELOG.md`), trusted doc `THREAT-MODEL.md` (hook-protected → patch script for the human).
- constitution_refs: [P0, P1, P2, P4, P5, P7]

## Findings from discovery that change the ticket's recipe

1. **F-19 needs a filter on every recursive `cpSync` (do NOT just delete `noSymlinks`).** `CLAUDE.md` + `tests/install-capabilities.test.ts:134-171` (measured Node 24.13.1): a recursive `cpSync` WITHOUT a `filter` takes Node's native path and writes INTO a hard-linked destination's inode. Today `noSymlinks` is that filter on the capability dirs, contracts, core and floor. Deleting it outright reopens F-19. Replace it with one named always-true filter (`unlinkFirst = (): boolean => true`, docstring: it exists ONLY to keep `cpSync` on the path that unlinks a destination first, F-19). The floor filter keeps its test/fixture predicates and drops `noSymlinks(src)`.
2. **The GNU base-256 branch is NOT fully covered by the non-octal check.** `readOctal` decodes latin1 then `.trim()`s, and `String.prototype.trim` strips U+00A0. A base-256 field whose first byte is `0xA0` followed by octal digits would PARSE instead of refusing. Plan: delete the base-256 branch AND trim only ASCII space (`/^ +| +$/g`; `readString` already cuts at the first NUL), plus a test that a `0xA0`-prefixed field and a `0x80` base-256 field both refuse as non-octal.
3. **The messages' sanitizing is NOT redundant under `PHARN_DEBUG`.** `reportFatal`/`reportFatalPlain` print `console.error(cause.err)` under `PHARN_DEBUG`, which prints the raw message (stack) and skips `logError`'s `terminalSafe`. The fetch path passes the cause (init/update/add/status catch sites). Dropping the in-message sanitizing would let an archive-supplied U+202E/C1 reach the terminal raw in debug mode, so it stays. → **Open question 1.**
4. `describeKeywords`, `readPaxKeywords`, `PAX_OVERRIDE_KEYWORDS`, `PAX_KEYWORD_RE`, `PAX_KEYWORDS_IN_MESSAGE`, `MAX_PAX_BYTES` and the pax budget all go with the simpler pax rule (they exist only to parse pax payloads).
5. `hook-wiring.ts`: with the invariant, the upstream read can use the PROJECT read path (walk `dirname(rel)`, open `O_NONBLOCK`, `fstat` regular file, 256 KiB cap). So `UPSTREAM_OPEN` and the `followLeaf` parameter go, and every caller reads one way. The type/size/JSON checks stay (a directory can be produced).
6. `readMinCli` (`skills-version.ts:83`): its one-fd bounded read is still the size bound (`MAX_MIN_CLI_BYTES + 1`) and the EISDIR → warning path. Only the TOCTOU rationale is redundant. Plan: keep the code, replace the TOCTOU comment with one line saying the read is bounded and that the clone invariant makes the race moot. (The ticket lists it, but rewriting the read would add lines rather than remove them.)

## Files

- `src/lib/tar-extract.ts` — layer CLI lib (fetch boundary):
  - `resolveEntryPath`: after the absolute/`..` checks, refuse any `fullPath` containing `\` or `:` → `TarExtractError('tar entry path contains a backslash or colon, which pharn does not accept: <path>')`. The name has already passed `assertDisplayablePath`. Module comment: the reason (POSIX writes `a\..\..\evil` as one literal name; win32 reinterprets it; pharn-oss ships neither).
  - Pax: `x` → refused on the typeflag ALONE (message names the typeflag, nothing read from the payload). `g` → counted toward `maxEntries`, payload skipped unparsed. Delete `readPaxKeywords`, `describeKeywords`, `PAX_OVERRIDE_KEYWORDS`, `PAX_KEYWORD_RE`, `PAX_KEYWORDS_IN_MESSAGE`, `MAX_PAX_BYTES`, the `paxBytes` budget and the pax-size pre-check. Rewrite the module comment's three-bucket + WHY PAX sections: `x` presence is the signal; `g` is skipped because pharn reads ONLY ustar fields (a `g` default for `path`/`size` is never honoured, so it cannot re-frame pharn's walk; a size that disagrees with the real framing fails the next header's checksum).
  - `readOctal`: delete the base-256 branch; trim ASCII space only (Finding 2).
  - `extractTar`: delete `totalBytes` and its check. `TarLimits.maxTotalBytes` stays (it is gunzip's `maxOutputLength` in `extractTarGz`); its doc says so ("bounds the decompressed tar, and with it every byte written").
  - New exported doc on `extractTarGz` / module header: what the tree can contain (regular files + directories only, inside `destDir`).
  - Per Open question 1: `assertDisplayablePath` keeps a capped, escaped rendering (recommended: `escapeUnsafe` capped at 200, the CORE-170 convention, instead of `JSON.stringify(terminalSafe(…))`).
- `src/lib/repo.ts` — `fetchRepo` docstring + `FetchedRepo` interface doc: state the invariant verbatim ("the returned tree contains only regular files and directories, created by this process in a private temp dir (`mkdtemp`, 0700) that nothing else writes") and that clone-side readers rely on it instead of re-checking. No code change.
- `src/lib/install-capabilities.ts` — delete `isSymlink`, `noSymlinks` and their Trust comment (`:106-113`). `installCapabilityDirs`: drop the symlink pre-flight throw (`:146-150`), keep the existence check. Copy sites `:281`, `:295`, `:333`, `:343`, `:359`, `:369`, `:396`: `existsSync(from) && !isSymlink(from)` → `existsSync(from)`. Features (`:331`): drop `findSymlinkComponent(repoDir, featuresRel)`, `!isSymlink`, and the clone half of the long comment; KEEP `destAcceptsWrite` and the destination half. Recursive copies pass `unlinkFirst` (Finding 1). `copyFilteredDir` (`:574`): drop `|| entry.isSymbolicLink()` (a Dirent from `withFileTypes` is lstat-based, so `isFile()` is already false for a link); KEEP `!entry.isFile()`. `upstreamSettingsCopyable` doc: "when the clone ships one". Remove the `findSymlinkComponent` import if unused (`findSymlinkComponentOr` stays for the destination). Every `prepareInstall` / `assertDestinationsInProject` / `assertDestinationTypes` / `destAcceptsWrite` line is untouched.
- `src/lib/install-manifest.ts` — `walkFiles`: drop the `isSymbolicLink` skip + comment (`:119-124`). Drop `findSymlinkComponent(repoDir, …)` at `:216`, `:281`, `:292`, `:303`, `:424`. KEEP every `lstatSync(…)?.isDirectory()` / `isFile()` type check: a directory can sit where a file is expected. Adjust the comments that justify the symlink skips. Remove the `symlink-guard` import if unused.
- `src/lib/dest-drift.ts` — drop the clone-side `findSymlinkComponentOr(repoDir, srcRel, UNREADABLE)` (`:169`); KEEP the `isFile` lstat at `:170` and the whole project side (`:154-160`).
- `src/lib/capability-index.ts` — `:106` filter → `e.isDirectory()`. `OPEN_FLAGS` (`:162-168`) → `O_RDONLY` only, comment rewritten. KEEP the `fstat().isFile()` → `ManifestValidationError` and the `EISDIR` code → validation error. `ELOOP` can no longer occur and is dropped from that branch. Docstring: "a directory … becomes unknown".
- `src/lib/hook-wiring.ts` — delete `UPSTREAM_OPEN` and `readSettings`' `followLeaf` parameter (Finding 5). Upstream and project read through one path. Keep the `O_NONBLOCK` open (the project side needs it), the `findSymlinkComponent(base, dirname(rel))` walk (project side), and the type/size/JSON checks. Comments (`:498` "O_NOFOLLOW") updated.
- `src/lib/skills-version.ts` — comment only (Finding 6).
- `tests/tar-extract.test.ts` — NEW: `\` and `:` refused (`root/a\..\..\evil`, `root/C:/x`, `root/a:b`), each naming the path; NEW property test "only files and dirs": extract a representative archive and walk `destDir` with `lstat`, asserting every entry `isFile() || isDirectory()`. EXTEND the typeflag `it.each` (`:496-520`) with pax `'x'` so symlink, hard link, char/block device, FIFO and pax `x` are each asserted refused. REWRITE the pax-`x` block (`:159-325`): one "refused on the typeflag alone, whatever its payload" (path=/size=/benign/garbage payloads); delete "names the records it read" and the keyword-escaping cases. REWRITE the pax-`g` block (`:327-420`): a `g` carrying `path=`/`size=`/`linkpath=` defaults is now SKIPPED and the following ustar entries land at their ustar paths (the old "rejects" cases invert, under a title saying they are not honoured); an unparseable `g` payload is skipped; the `g` still counts toward `maxEntries` (`:688`). DELETE the pax-size/budget cases (`:670-686`, `:741-752`). MOVE "expands past 100 bytes" (`:832`) to `extractTarGz` with `maxTotalBytes: 100` → `/could not decompress/`. ADD the base-256 / `0xA0` cases (Finding 2); keep the existing base-256 test passing (its expected message may change to non-octal, and the title is updated).
- `tests/install-capabilities.test.ts` — DELETE the clone-symlink tests: `:340` (symlink inside a capability dir), `:359` (capability dir is a symlink), `:408` (symlinked features/README.md), `:430` (symlinked features/ parent), `:627` (symlinked LICENSE), `:661` (symlinked settings/docs/contracts/floor), `:893` (symlinked pharn-core), `:1021` (symlinked root LIMITS.md). KEEP every `proj`-side test (`:461`, `:1086-1257`, `:1404`) and the F-19 pin (`:141`) unchanged. Drop `symlinkSync` from imports only if no use is left.
- `tests/install-manifest.test.ts` — DELETE the clone-symlink cases at `:222`, `:293`, `:618`, `:629`, `:637`, `:648`, `:658`, `:756`, `:782`, `:807`, `:1128` (11 sites; the parametrised block at `:610-660` counts as one or several). Any assertion in them that is NOT about symlinks is kept in another test, or the test is cut down to it.
- `tests/dest-drift.test.ts` — DELETE the clone-side cases `:193`, `:208`; KEEP the project-side `:138`, `:155`, `:173`.
- `tests/capability-index.test.ts` — DELETE the symlinked-markdown case (`:353`); KEEP (or add, if absent) the directory-at-`name.md` → `unknown` case.
- `tests/hook-wiring.test.ts` — DELETE the upstream-symlink cases (`:220`, `:1008`); KEEP the project cases (`:193`, `:209`, `:579`).
- `THREAT-MODEL.md` — PROTECTED (hook-denied). Deliver `scratchpad/core-173-threat-model.patch.py` for the human to run, then delete it: §2 fetch-boundary bullets (pax: `x` refused on typeflag, `g` skipped unparsed; `\`/`:` refused; base-256 → non-octal; "Entry count and total extracted bytes are both capped" → entry count capped in the extractor, decompressed bytes by gunzip), §3 table rows "malicious capability / product path" (replace "symlink rejection at copy roots (`isSymlink`/`noSymlinks`)" with the stated invariant on `fetchRepo` + "destination symlink walks (`prepareInstall`)") and "upstream settings.json" ("symlink-refusing read" → bounded, non-blocking read of a tree the invariant guarantees has no links), and a short new invariant line under §2 or §3 ("the tree `fetchRepo` returns holds only regular files and directories …; clone-side readers rely on it; every destination guard stays").
- `SECURITY.md` — line 57 pax paragraph rewritten to the new rule; "enforced **twice**" → once, by gunzip; `\`/`:` added to the floor list; line 9/58 "symlink rejection at the write sites" → "destination symlink walks at the write sites". (Not hook-protected; check at build, and fall back to the patch script if refused.)
- `CLAUDE.md` — the `lib/install-capabilities.ts` paragraph ("Copying from the untrusted clone is symlink-guarded (`isSymlink` reject / `noSymlinks` filter)" → the invariant; the F-19 sentence names the always-true filter), the hook-wiring sentence ("upstream's file is symlink-refused at every component" → read the project's way under the invariant), the `capability-index` read description if it names O_NOFOLLOW, and the `fresh init` HOOKS sentence ("the clone read through the private upstream `readSettings`"). Patch script if refused.
- `CHANGELOG.md` — `## [Unreleased]`: a `### Security` bullet (bold one-sentence claim: an archive entry whose name contains `\` or `:` is refused), with the pax change named as a user-visible difference (a pax `g` header carrying a `path`/`size` default is no longer refused but skipped; pharn reads only ustar fields) and the "no change for pharn-oss's real archive" note. No version bump (0.19.0 batch, as CORE-171).

## Contracts satisfied

- `CLAUDE.md` § "lib/install-capabilities.ts": the F-19 hard-link invariant (every recursive copy keeps a filter). Preserved by Finding 1 and pinned by the existing test.
- `CLAUDE.md` § "lib/validate.ts is security-sensitive": one unsafe-character set; untrusted text escaped where printed. `assertDisplayablePath` keeps escaping (Finding 3).
- `THREAT-MODEL.md` §2 "Extraction rejects rather than skips": still true for every non-pax type. The `g` skip was already a SKIP bucket; only the parse inside it goes.
- `CLAUDE.md` § Testing: "update the matching test before touching code". The new tar tests are written first and run RED.

## Evals to write (P1) — tests first, the NEW ones must FAIL before the code change

- `root/a\..\..\evil` file entry → `TarExtractError` naming backslash/colon (FAILS today: it extracts as a literal name).
- `root/C:/x` and `root/a:b` → refused (FAILS today).
- typeflag `'x'` with an empty payload → `/unsupported type|pax extended header/` (passes today; pinned in the `it.each`).
- `g` with `path=elsewhere` followed by `root/f.txt` → `f.txt` written at its ustar path (FAILS today: refused).
- `g` with an unparseable payload → skipped (FAILS today).
- `extractTarGz` with `maxTotalBytes: 100` over a 600-byte file → `/could not decompress/` (passes today; moved).
- size field `0xA0` + `"777"` → refused as non-octal (FAILS today: accepted as 511).
- property: after extracting the fixture archive, every `lstat` under `destDir` is a file or a directory (passes; pins the invariant).
- every surviving destination-guard test (install-capabilities `proj` cases, F-19, dest-drift project side, hook-wiring project side, symlink-guard, apply-update, backup, remove, uninstall) → unchanged and green.

## Guarantee audit (P0)

- "An entry name with `\` or `:` is refused" → floor: regex/membership test in `resolveEntryPath`, pinned by test.
- "The tree `fetchRepo` returns holds only regular files and directories" → floor: the typeflag allowlist (ACCEPT `0`/NUL/`5`, everything else throws) + writes only through `mkdirSync`/`writeFileSync` under `safeJoin` into a fresh `mkdtemp` dir. Pinned by the typeflag `it.each` + the new lstat property test. The claim "nothing else writes the temp dir" rests on `mkdtemp`'s 0700 mode and process ownership. That is an OS property, stated as the premise, not a pharn check. A same-uid attacker who can write `$TMPDIR/pharn-*` can already do anything pharn can (named in the invariant text, not hidden).
- "Clone-side readers need no symlink checks" → advisory DERIVATION from the invariant above. It is safe only as long as `fetchRepo` stays the only producer of `repoDir`. Pinned by: (a) `fetchRepo` being the only exported producer (grep at build, plus a sentence in the `FetchedRepo` doc), and (b) test fixtures that build fake clones being required to respect it (no symlinks in fake clones; the remaining `symlinkSync(…join(repo…` uses after the change must be zero, checked by grep at build).
- "Every destination guard is unchanged" → verified by diff review (the lines are listed above) + the destination tests passing unchanged.
- "Hard-linked destinations are never written through" (F-19) → still floor-pinned by `tests/install-capabilities.test.ts:141`. The always-true filter is the mechanism.
- "A pax `g` cannot change what pharn writes" → floor: pharn reads only ustar `name`/`prefix`/`size`/`typeflag`. A `g` default is never consulted, and any re-framing it implies fails the next header's checksum/magic. Advisory residual (named in the module comment): a `g` `path=` default is IGNORED rather than refused, so an archive meaning "put everything at X" lands at its ustar paths, still contained and still path-checked.
- "The decompressed size is bounded" → floor: `gunzipSync` `maxOutputLength`, pinned by the moved test.

## Trust audit (P2)

- The archive is untrusted. Taint is unchanged in kind. Fewer bytes are parsed (no pax payload parse) and one more name class is refused. Clone file contents still flow verbatim into the project (Surface A) through the destination-guarded writers. The only taint-to-terminal path touched is the extractor's refusal messages, which stay escaped and capped (Finding 3).

## Determinism audit (P5)

- Every new branch is a membership test: char ∈ {`\`, `:`}; typeflag ∈ {`0`, NUL, `5`} → accept; `g` → skip; else refuse. No fallback guesses.

## Open questions (HALT)

- none. GATE 1: approved as written (2026-11-12).

## Resolved questions

- Extractor message sanitizing (Finding 3) → KEEP, as a capped `escapeUnsafe` rendering in `assertDisplayablePath` (human decision at GATE 1, departing from the ticket on this point).

- Base → origin/main @ 8fe3d5a; C5.4 not landed, so the full site list applies.
- Working tree → build in a git worktree. The main checkout's untracked `src/**/*.updated.ts` / `tests/*.updated.ts` handover and the unstaged `.github/dependabot.yml` edit are left alone, untouched and uncommitted. In the main checkout `tsc` (include `src/**/*`) and eslint would read them and pollute the floor gate.
- Version → no bump. CHANGELOG under Unreleased (0.19.0 batch), as CORE-171/172 did.
- `readMinCli` → comment only (Finding 6). Base-256 → delete + ASCII-only trim (Finding 2). `noSymlinks` → always-true named filter (Finding 1).
- `ARCHITECTURE.md` → untouched (its symlink-safe claim is about the project-side detection walk, not the clone).
- Line-count target (≈ −300 src) → the deletions above total roughly −250 to −320 src lines. Measured at build and reported, not forced.
