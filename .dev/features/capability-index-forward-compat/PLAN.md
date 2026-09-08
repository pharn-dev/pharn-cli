# PLAN — forward-compatibility contract at the capability-index boundary

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make `parseCapabilityIndex` **tolerate-and-report** an unparseable capability instead
  of throwing the whole index, keep every such capability out of every install/write path, protect
  `pharn update`'s merge + manifest from misreading the skip as a removal, and add an OPTIONAL
  `MIN_CLI` version handshake so upstream can refuse stale CLIs cleanly instead of bricking them.
- layer(s): the CLI's **fetch boundary** — `lib/capability-index.ts` (the untrusted-frontmatter →
  typed index parse), `lib/skills-version.ts` (the clone's version files), `lib/merge-capabilities.ts`
  (update's membership table), and the three fetching commands (`init`, `add`, `update`).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Discovery (live state, read this run — P6)

Verified in `/Users/pgalarowicz/Projects/pharn-cli` (clean tree, HEAD `64e5d28`, floor GREEN,
`package.json` version `0.4.0`):

- `src/lib/capability-index.ts:74-103` is ONE loop with **six** reachable hard-fail sites, every one
  of which kills the WHOLE index: the dir-name allowlist (`:76-77`), the missing capability markdown
  (`:80-84`), `extractFrontmatter`'s missing fence (`:115-123`), `readField`'s missing `role`/
  `applies` (`:130-139`), `assertRole` + the role/subtree cross-check (`:91-96`), and every
  `parseApplies` refusal (`:163-192`).
- The missing-subtree throw is OUTSIDE that loop (`:63-67`) — structural, and stays fatal.
- Every fetching command parses: `init` (`src/commands/init.ts:101`), `add`
  (`src/commands/add.ts:294` picker, `:384` named), `update` (`src/commands/update.ts:233`).
- The fetched ref is always `main` HEAD (`src/lib/repo.ts`, `REPO_BRANCH`), so a released CLI can
  never pin older content — one grammar change upstream is a fleet outage, and `add` is doubly
  wedged (its `versionGate` at `:167`/`:244` names `pharn update`, whose first act is the parse).
- `mergeCapabilities` (`src/lib/merge-capabilities.ts:123-126`) takes `(selection, previous)` only
  and derives index membership from `selected ∪ skipped`. The `source === 'auto'` drop branch
  (`:180-183`) runs BEFORE the `!inIndex` drop (`:200-203`), so patching only the latter still drops
  an auto entry — and mis-labels it.
- `update.ts:250` binds ONE array (`const capabilities = merged.capabilities`) that feeds BOTH
  `collectExpectedInstallPaths` (`:260`) and `writePharnConfig` (`:341`). `install-manifest.ts:93-97`
  walks `${subtree}/${cap.name}` for each — so a frozen entry left in that one array makes
  `update-decision.ts` classify the unparseable clone dir's files as `restored` and
  `apply-update.ts` copy an arbitrary WIP upstream directory into the user's project.
- `readSkillsVersion` (`src/lib/skills-version.ts:23-35`) THROWS on absent/malformed. Every command
  turns a throw inside its try into exit 1 (`add.ts:171-184`, `update.ts:205-219`,
  `init.ts:115-128`) — so a `MIN_CLI` reader that mirrored that throw would re-create the very
  outage it exists to prevent.
- `VERSION_RE` (`src/lib/validate.ts:10`) admits a trailing `-suffix`; `PHARN_VERSION`
  (`src/version.ts:9-11`) is read from `package.json` and is NOT validated anywhere.
- `LIMITS.md` §3 ends at **§3d**; §3c and §3d are cited by anchor elsewhere
  (`.claude/commands/pharn-dev-regress.md:132`), so the new residual APPENDS as §3e.
- `LIMITS.md` is in `protect-trusted-paths.cjs` `DEFAULT_PROTECTED` — Write/Edit are hard-denied;
  it is appended with a Bash heredoc, and the hook is never touched.

## Files

- `src/types.ts` — add `UnknownCapability` (`name`, `role`, `subtree`, `reason`) and the additive
  `unknown: UnknownCapability[]` field on `CapabilityIndex`; `role` is the **subtree's** role, the
  authoritative one — layer: CLI types
- `src/lib/capability-index.ts` — wrap the whole per-capability loop body in ONE
  `catch (ManifestValidationError)` that pushes an `unknown` entry and `continue`s; the missing
  subtree keeps throwing; update the module + function doc comments — layer: the fetch boundary
- `src/lib/unknown-capabilities.ts` (new) — `unknownCapabilitiesWarning(unknown)`: the ONE renderer
  every call site uses, control-char-sanitizing the untrusted name/subtree/reason; `null` for an
  empty list so zero unknowns print nothing — layer: reporting
- `src/lib/semver.ts` (new) — `compareVersionCore(a, b): -1 | 0 | 1 | null`, numeric core only, a
  prerelease EQUAL to its release, `null` when either side is unparseable — layer: pure primitive
- `src/lib/constants.ts` — `MIN_CLI_FILE = 'MIN_CLI'` beside `SKILLS_VERSION_FILE` — layer: constants
- `src/lib/skills-version.ts` — `readMinCli(repoDir): MinCliRead` beside `readSkillsVersion`:
  absent → no constraint, silent; unreadable/malformed → no constraint PLUS a named warning; NEVER
  a throw — layer: the clone's version files
- `src/lib/min-cli-gate.ts` (new) — `minCliGate(repoDir, cliVersion): {refusal, warning}`; only a
  well-formed value whose numeric core is GREATER than the installed CLI's ever refuses — layer:
  the upstream handshake policy
- `src/lib/merge-capabilities.ts` — third parameter `frozen: ReadonlySet<string>`; a new row 0 in
  the previous-entry loop, BEFORE the `source === 'auto'` branch, that KEEPS the entry verbatim and
  reports `kept-frozen`; extend `CapabilityChangeReason` and the decision-table doc-comment; correct
  the "no separate index parameter is needed" paragraph — layer: update's membership table
- `src/commands/init.ts` — `minCliGate` inside the existing try before the parse (refusal → a clean
  exit 1 after `repo.cleanup()`, no PHARN_DEBUG noise); surface `index.unknown` — layer: command
- `src/commands/add.ts` — `minCliGate` first in the `??` chain at BOTH call sites (`:167`, `:244`),
  its warning logged; surface `index.unknown` in both index-reading helpers — layer: command
- `src/commands/update.ts` — `minCliGate` inside the try before `applyUpdate`; surface
  `index.unknown`; split the one `capabilities` binding into `configCapabilities` (→
  `writePharnConfig`) and `manifestCapabilities` (→ `collectExpectedInstallPaths`, frozen excluded);
  thread the frozen key set into `mergeCapabilities`; add the `kept-frozen` row to `CHANGE_ORDER` —
  layer: command
- `src/commands/status.ts` — parse the index in the drift branch (inside the existing try), surface
  `index.unknown`, and exclude frozen entries from the capabilities handed to
  `diffInstalledCapabilities` so `status --strict` cannot report permanent, unfixable drift for a
  capability `update` will never write (added post-grill, GRILL.md F1) — layer: command
- `tests/capability-index.test.ts` — flip the eight per-capability hard-fail tests to skipped-and-
  reported; keep `:215` (missing subtree) throwing; add sorted/deterministic `unknown` assertions and
  a good-capability-survives-a-bad-sibling case — layer: tests
- `tests/skills-version.test.ts` — `readMinCli`: absent → no constraint; malformed → no constraint +
  warning; unreadable (a directory at the path) → no constraint + warning; valid → the version —
  layer: tests
- `tests/semver.test.ts` (new) — `compareVersionCore` incl. `0.10.0 > 0.9.0` and prerelease-equals-
  release in both directions — layer: tests
- `tests/min-cli-gate.test.ts` (new) — absent / satisfied / equal / newer → refusal shape / malformed
  → warning-not-refusal / unparseable installed version → warning-not-refusal — layer: tests
- `tests/unknown-capabilities.test.ts` (new) — empty → null; control chars stripped; deterministic —
  layer: tests
- `tests/merge-capabilities.test.ts` — row 0 pinned separately for `auto`, `manual` and a
  `source`-absent legacy entry: kept, NOT `dropped-unselected`, NOT `dropped-gone`, reported
  `kept-frozen` — layer: tests
- `tests/update.test.ts` — a frozen capability contributes ZERO plan files while its config entry
  survives; the same run still bumps `skillsVersion`/`commit`; a `MIN_CLI` refusal exits 1 before
  any write with the clone cleaned up — layer: tests
- `tests/status.test.ts` — a frozen capability's clone files are NOT reported missing and
  `--strict` stays 0; unknowns are surfaced (added post-grill, GRILL.md F1) — layer: tests
- `tests/add.test.ts` — `readMinCli` added to the mocked `skills-version` module; unknowns surfaced;
  `MIN_CLI` refusal wins over `versionGate` and exits 1 with cleanup — layer: tests
- `tests/init.test.ts` — `unknown: []` on the index mock; unknowns surfaced; `MIN_CLI` refusal exits
  1 before install with cleanup — layer: tests
- `tests/init-archetype.test.ts` — the real-fixture parse tolerates an md-less dir — layer: tests
- `tests/capability-picker.test.ts` — `unknown: []` on the typed `CapabilityIndex` literals — layer: tests
- `tests/resolve-capabilities.test.ts` — `unknown: []` in its typed `index()` helper — layer: tests
- `tests/constants.test.ts` — pin `MIN_CLI_FILE` — layer: tests
- `docs/troubleshooting.md` — two new symptom sections (skipped upstream capabilities; the CLI-too-old
  refusal) — layer: docs
- `docs/commands/update.md` — name the tolerate-and-report behaviour and the `kept-frozen` bucket — layer: docs
- `docs/commands/add.md` — name the skipped-capability warning and the CLI-too-old refusal — layer: docs
- `docs/commands/init.md` — name the skipped-capability warning — layer: docs
- `LIMITS.md` — APPEND §3e (Bash heredoc; the file is hook-protected) — layer: trusted docs
- `CHANGELOG.md` — an `[Unreleased]` entry — layer: docs

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — untrusted upstream content stays DATA: an `unknown` entry is
  reported to the human, never acted on. Cited, not restated (P4).
- `ARCHITECTURE.md §2` primitive #3 — the frozen set, the role/subtree cross-check, and the
  `MIN_CLI` compare are all membership/enum/integer operations, no classification.

## Evals to write (P1)

No new PHARN capability is authored (this is CLI code), so P1 is discharged by `vitest` tests, one
per behaviour — enumerated in `## Files` above and re-listed in the acceptance criteria of the
originating finding.

## Guarantee audit (P0)

- "an unparseable capability is never installed" → **floor**: it never enters `index.capabilities`,
  so `resolveCapabilities` cannot select it, `installCapabilities`/`installCapabilityDirs` never see
  it, and BOTH callers of `collectExpectedInstallPaths` exclude it — `update` via
  `manifestCapabilities` (the manifest is `update`'s ONLY write source: `apply-update.ts` writes
  exactly `plan.writes` ⊆ manifest keys) and `status` via the same frozen filter (GRILL.md F1).
- "an unparseable capability is never silently dropped" → **floor-adjacent, test-pinned**: every
  parse call site renders `unknownCapabilitiesWarning`, and `mergeCapabilities` reports
  `kept-frozen`. The floor part is that the list EXISTS and is non-empty; that a human reads the
  warning is advisory.
- "nothing unvalidated reaches the typed output or a path-join" → **floor**: `validate.ts` is
  untouched; `assertRole`/`assertAppliesToken` still hard-fail; the catch is scoped to ONE
  capability and always `continue`s — there is no path where a caught value is used.
- "`MIN_CLI` can never brick a CLI" → **floor**: `readMinCli` has no throw path (`existsSync` +
  `try/catch` around the read + a pure `VERSION_RE.test`), and only a well-formed value with a
  strictly greater numeric core produces a refusal.
- "`MIN_CLI` refuses a genuinely too-old CLI" → **advisory, contingent on upstream**: upstream ships
  no `MIN_CLI` today, so the lever is inert until it does. Stated, not sold.
- "the withheld-bump rule is unchanged" → **floor**: `versionWithheld = plan.counts.skipped > 0` is
  not touched, and a frozen capability contributes zero expected files, hence zero file-level skips.
- "a structural upstream break (a relocated subtree) is still a fleet outage" → **NOT closed** —
  named as `LIMITS.md` §3e.

## Trust audit (P2)

- **Input:** the degit-cloned pharn-oss tree — capability dir names, capability markdown bytes, and
  now an optional one-line `MIN_CLI` file. All untrusted.
- **Taint propagation:** an `unknown` entry carries three untrusted strings (`name`, `subtree`,
  `reason`) that reach the TERMINAL. They reach nothing else: no path-join, no copy, no config
  write, no control-flow branch other than "is this list empty". `unknownCapabilitiesWarning` strips
  control characters and length-caps before rendering, so a hostile dir name cannot repaint the
  terminal. `MIN_CLI`'s value is `VERSION_RE`-gated BEFORE it is compared or interpolated.
- **Not widened:** the allowlists are untouched; the tolerance is a `catch` in ONE file, never a
  loosened enum.

## Determinism audit (P5)

- `unknown` is built in the same sorted subtree-then-name enumeration as `capabilities`, so an
  identical clone yields an identical list.
- The frozen test is a `Set.has` over `role:name`; the `MIN_CLI` decision is a three-integer
  compare with an explicit `null` for unparseable input. No classification, no LLM, no third outcome.

## Consequences worth naming (not open questions)

- **`pharn update` will now report `kept-frozen` on EVERY run** while an unparseable capability sits
  on `main`. That is deliberate: the anomaly persists, so the report must, and the alternative
  (report once) would hide a live upstream break behind a steady-state silence.
- **A previously-fatal upstream typo becomes a warning.** A capability that used to abort `init` now
  silently does not get installed unless the user reads the warning. That is the intended trade —
  fail closed on INSTALLING, never on SEEING — and it is why the warning is non-optional at all four
  call sites.

## Out of scope (explicitly not in this increment)

- A third subtree/role or `pharn/pharn-core` in the index (FABLE §3.1 — already shipped as a fixed
  surface, PR #119).
- `fetchRemoteSkillsVersion`'s network guards and degit pinning (FABLE §4.1/§4.10).
- Any edit to `/Users/pgalarowicz/Projects/pharn-oss`, its CI, or its floor enums — the two upstream
  steps (ship a root `MIN_CLI`; gate pharn-oss merges on the released parser) are recorded in the PR
  description only.
- Tombstones / preventing resurrection.
- Changing the always-`main` ref policy in `repo.ts`.

**Plan approved by the human at GATE 1: the increment was specified in full by the human in the
`/pharn-dev-ship` invocation (task, fix steps 1-4, invariants, and acceptance criteria), and the same
message pre-authorised the post-review decision ("create pull request … merge pr"). Recorded
honestly: GATE 2 was delegated in advance, not self-issued.**
