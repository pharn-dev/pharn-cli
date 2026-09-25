# PLAN — review-cleanups (detector skips, fence parity, update's backup notice, one subtree helper, CHANGELOG + CLAUDE.md catch-up, raw invisible characters)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the small findings left from the PHARN-01..18 review, in one PR, as the human grouped
  them (plan F):
  - F22: the detector skips `vendor`/`target`/`venv`/`.venv` only where they are that ecosystem's
    tree.
  - F23: the frontmatter fence rule matches upstream's validator.
  - F21: update's backup notice is printed with no spinner running, and once per stream.
  - The role → subtree ternary lives in one place.
  - F26: `CHANGELOG.md` gets its missing entries for PHARN-01..18.
  - `CLAUDE.md` catches up with #215–#223.
  - Amended after GATE 1 (same kind of cleanup, found while shipping A–E and B): raw invisible
    characters in two test files become escapes, a test keeps `src/` and `tests/` free of them, and a
    stale function name in comments is corrected.
- layer(s): the CLI itself (`src/lib/detect-archetype.ts`, `src/lib/capability-index.ts`,
  `src/commands/update.ts`, `src/lib/layout.ts` + 5 callers, `src/lib/symlink-guard.ts` comments),
  tests, docs
- constitution_refs: [P1, P3, P4, P5, P6]

## Discovery — verified this run (P6), code read on HEAD after #223

- **F22.** `SKIP_DIRS` (`detect-archetype.ts:77-104`) is matched at every depth, case-insensitively
  (`:157`). PHARN-15 (#209) added `.venv`, `venv`, `__pycache__`, `vendor`, `target`, `.yarn`, and
  its comment says "package.json still backstops it". That holds for `ssr`/`spa`, not for `backend`,
  whose signal is structural (`app/**/route.ts`, migrations, `.sql`). So a Next.js route at
  `app/target/route.ts` or `app/vendor/route.ts` goes dark: `[ssr, backend]` → `[ssr]`, reproduced
  by the review on the same tree. `__pycache__` and `.yarn` are never hand-authored JS.
  `target`/`vendor`/`venv` are ordinary route or folder names.
- **F23.** `extractFrontmatter` (`capability-index.ts:232-241`) requires `lines[0] === '---'` and
  closes at the first `/^---[ \t]*$/` line. This repo's copy of the upstream validator
  (`.dev/floor/validate.mjs:69-73`) opens on `startsWith("---")` and closes at the first
  `"\n---"`, which is any line STARTING with `---` (`----`, `--- note`). So a capability upstream's
  own CI passes becomes `unknown` here. If the body later holds a column-0 field, the reason shown
  is a misleading duplicate-key error. Both parsers handle the empty block `---\n---` the same way.
- **F21.** `update.ts:343` prints the backup notice (`printBackupNotice`) from `onBackup` while
  spinner `s2` is still animating, so the note's `│` is glued to the spinner frame, and below ~50
  columns `stop` erases its last row (the review captured this with clack 1.8.1). On a later throw,
  `:396` prints the same two lines again on stderr. `add` stops its spinner before its backup
  (`add.ts:217-219`, then its backup).
- **Subtree ternary.** `role === 'griller' ? paths.grillers : paths.lenses` appears at
  `install-records.ts:369`, `install-manifest.ts:142,285`, `install-capabilities.ts:129`,
  `update.ts:601`, and `remove.ts:150` (`capabilityRelDir`): six copies. `LayoutPaths` lives in
  `layout.ts:40`.
- **F26.** `[Unreleased]` has entries only for #213 onward. None of the 18 PHARN commits (#195–#212,
  after the 0.5.0 release) added one.
- **CLAUDE.md** (not hook-protected; `protect-trusted-paths.cjs:58`):
  - The init step-5 passage still describes init's carry-over as "keep manual entries the index
    still has", from before #216. It does not mention the kept unparseable entries, the
    `frozenCapabilities` carry, the named drop, the fingerprint re-check under the lock, or #215's
    preserved user keys.
  - The update paragraph never mentions `frozenCapabilities` (PHARN-13/#217): 0 hits.
  - The `add` passage calls the drift scan `collectDestDrift`; it is `scanDest`.
- **Raw invisible characters (new).** `tests/tar-extract.test.ts:653` holds a raw U+FEFF (from
  #218), `tests/terminal-safe.test.ts:8-9` a raw U+202E and U+200B. An editor or a diff view shows
  nothing there, and the same slip reached plan D's files before it was caught. No check covers
  `src/` or `tests/` for this.
- **Stale name (new).** `symlink-guard.ts:45,51` name `collectDestDrift` for what is `scanDest`.

## Files

- `src/lib/detect-archetype.ts` — layer CLI/lib. `SKIP_DIRS` keeps the always-skipped set (caches,
  VCS, `__pycache__`, `.yarn`). A new `ECOSYSTEM_DIRS` map skips a dir only when its marker holds:
  - target: a sibling Cargo.toml, pom.xml or build.sbt;
  - vendor: a sibling go.mod, composer.json or Gemfile;
  - venv and .venv: a pyvenv.cfg inside.

  The sibling test is a membership check over the parent's already-read `entries`, so it costs no
  extra read. The venv test is one `lstat`. The dir name is matched case-insensitively, as
  `SKIP_DIRS` is today; the marker names exactly as each tool writes them (grill).
- `tests/detect-archetype.test.ts` — layer tests:
  - A route at app/target/route.ts with no sibling marker → `backend` detected. FAILS on base.
  - A route at app/vendor/route.ts → the same. FAILS on base.
  - A target/ dir next to Cargo.toml holding more entries than the budget → still skipped, no budget
    spent (guard).
  - A .venv/ dir holding pyvenv.cfg → skipped (guard).
  - The existing pins adjust to the conditional members.
- `src/lib/capability-index.ts` — layer CLI/lib. The fence is upstream's slice, ported literally:
  the text must start with `---`, and the frontmatter is everything from the fourth character up to
  the first newline followed by `---` at or after it — so it closes at the next line that STARTS
  with `---`, and the rest of the opening line counts as frontmatter (grill). The comment cites
  `validate.mjs`.
- `tests/capability-index.test.ts` — layer tests:
  - A closing `----` parses. FAILS on base.
  - A closing `--- note` parses. FAILS on base.
  - A body horizontal rule after a proper close changes nothing (guard).
  - The empty block is still refused for missing fields (guard).
  - A differential case runs every fence shape through a verbatim copy of upstream's
    `parseFrontmatter` and requires the same accept/refuse verdict. The shapes include a field on
    the opening line itself.
- `src/commands/update.ts` — layer CLI/commands:
  - The backup callback first stops `s2` with a neutral phrase (the notice right after it names
    the count and the directory), prints the notice, then starts `s3` for the writes
    (`spinnerRef` follows it).
  - The aborted path keeps the part-way warning (`log.warn`) and the backup pointer (`log.info`) on
    stderr, and drops only the repeated `.gitignore` hint (grill: an existing test pins both
    stderr levels).
- `tests/update.test.ts` — layer tests:
  - The spinner is stopped before the notice prints: a recording spinner mock keeps one ordered
    log of stop/info/warn calls, behavior-compatible for every other case. FAILS on base.
  - An aborted `--force` run prints the `.gitignore` hint once, and the backup dir once on stdout
    and once on stderr. FAILS on base.
  - The two existing abort tests keep their stderr assertions.
- `src/lib/layout.ts` — layer CLI/lib. `capabilitySubtree(paths, role)`, the one role → subtree
  mapping (refactor, no behavior change). Its callers follow.
- `src/lib/install-records.ts` — layer CLI/lib. Calls `capabilitySubtree`.
- `src/lib/install-manifest.ts` — layer CLI/lib. Calls `capabilitySubtree` (two sites).
- `src/lib/install-capabilities.ts` — layer CLI/lib. Calls `capabilitySubtree`.
- `src/commands/remove.ts` — layer CLI/commands. `capabilityRelDir` delegates to `capabilitySubtree`.
- `tests/layout.test.ts` — layer tests. `capabilitySubtree` for both roles × both layouts.
- `src/lib/symlink-guard.ts` — layer CLI/lib. Comments only: `collectDestDrift` → `scanDest`.
- `tests/tar-extract.test.ts` — layer tests. The raw U+FEFF becomes a `\uFEFF` escape; the bytes
  under test are identical.
- `tests/terminal-safe.test.ts` — layer tests. The raw U+202E / U+200B become escapes; the strings
  under test are identical.
- `tests/source-hygiene.test.ts` — layer tests. New: no file under `src/` or `tests/` contains a raw
  C0 (other than tab, LF, CR), C1, Unicode format (Cf) or U+2028/2029 character. FAILS on base (the
  three above).
- `CHANGELOG.md` — `[Unreleased]`: backfilled entries for PHARN-01..18, in the existing
  Fixed/Security/Changed sections plus `### Added`, one user-facing sentence or two each, written
  from each commit's diff rather than its title. A change that a later entry already describes, or
  that this plan changes again, gets ONE entry for the net behavior since 0.5.0 (grill): PHARN-02
  and -16 with #223, -04 and -17 with #222, -06 with #219, -10 with #220, -11 with #216/#223, -12
  with #221, -13 with #217, -14 with F23, -15 with F22, -18 with #218.
- `CLAUDE.md` — the init step-5 carry-over sentence describes #216 and #215; a `frozenCapabilities`
  sentence goes in the update paragraph; the `add` passage names `scanDest`; the detect-archetype,
  frontmatter-fence and subtree-helper mentions match this change.
- `docs/commands/init.md` — layer docs. The skip list says `target`/`vendor`/`venv` are skipped only
  beside their ecosystem's marker.
- `docs/troubleshooting.md` — layer docs. The same, in the monorepo paragraph.

## Contracts satisfied

- PHARN-14's "the CLI reads what upstream ships". The fence rule is now the one upstream's CI
  enforces (cited, P4).
- PHARN-10's "the backup pointer is printed the moment it exists" is kept. Only its framing changes.

## Evals to write (P1)

- Listed under Files. Seven cases FAIL on the base. The refactor is covered by the existing suites
  plus `layout.test.ts`.

## Guarantee audit (P0)

- "a hand-authored route under `target/`/`vendor/` is scanned" → floor: detector tests.
- "the CLI accepts every fence upstream's validator accepts" → floor: a differential test against a
  pinned copy of upstream's parser. The residual is named: a future upstream parser change is not
  seen until that copy is refreshed.
- "no log line is printed while a spinner animates in update's apply" → floor: a call-order test.
- "no raw invisible character in `src/` or `tests/`" → floor: the hygiene test.
- CHANGELOG / CLAUDE.md accuracy → advisory (a human reads it). markdownlint is the only floor.

## Trust audit (P2)

- The fence change widens what the untrusted-frontmatter parser accepts to exactly upstream's
  rule. The field reader, the enums and the duplicate-key refusal are unchanged, and only
  `name`/`role`/`applies` are read.

## Determinism audit (P5)

- Name membership (sibling markers), line-prefix tests, a code-point class. No fallback guessing.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. F22 rule. (a) Skip `target`/`vendor`/`venv`/`.venv` only beside their ecosystem's marker, at any
   depth — recommended. This keeps PHARN-15's budget protection for nested Maven, PHP or Python
   trees. (b) Skip those four only at the project root. That is simpler, but a nested PHP `vendor/`
   exhausts the walk budget again. (c) Leave it and document the tradeoff.
2. F23 direction. (a) Match upstream's `startsWith('---')` rule — recommended. The CLI must accept
   what upstream ships. (b) Stay strict and give a clearer reason. Upstream-valid capabilities are
   then still skipped.
