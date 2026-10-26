# PLAN — default-channel-latest

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md @ 33d0ec9)
- increment: make the newest verified pharn-oss release (`--ref latest`) the default channel of a fresh
  `pharn init`; keep every existing `main` install on `main` with a one-line opt-in notice from `update`;
  show the channel in `status`; release 0.15.0.
- layer(s): CLI library (`src/lib`), commands (`src/commands`, `src/steps`), dispatch help (`src/index.ts`),
  tests, user docs.
- constitution_refs: [P0, P2, P4, P5, P6, P7]
- base: `origin/main` @ `33d0ec9` (fetched 2026-10-26); branch `claude/default-channel-latest`, clean.

## Discovery (P6) — what the live state says

- **pharn-oss publishes verified releases now.** `GET repos/pharn-dev/pharn-oss/releases/latest` →
  `v7.1.3`, `draft: false`, `prerelease: false`, published 2026-10-26T19:26:34Z (`v7.1.2` also tagged).
  `commits/v7.1.3` (sha media type) → `35202ff8…`; `SKILLS_VERSION` at that tag = `7.1.3` = tag, and at
  `main` = `7.1.3`. pharn-oss has `.github/workflows/release.yml`. `MIN_CLI` at the tag = `0.14.0`.
- **`update` already never switches channel by itself.** `commands/update.ts:172` runs
  `opts.ref ?? channelOf(config)`, and `channelOf` (`lib/release.ts:73`) maps anything but `"latest"` —
  including an absent `ref` — to `main`. So item 1's "update keeps main" already holds; what is missing
  is the notice. The default that actually changes is `init`'s (`commands/init.ts:150`, `opts.ref ?? 'main'`).
- **"Recorded `main`" does not exist today.** Only the literal `"latest"` is ever written
  (`steps/install-archetype.ts:329`, `commands/update.ts:933`) or kept at load (`lib/pharn-config.ts:481`
  deletes any other value). An install made with `--ref main` and one made before `--ref` existed are the
  same bytes. → Q1.
- **`status` already resolves the channel's source on BOTH paths** (`commands/status.ts:119`, `:144`,
  `:246`, `:268`): on `latest`, `resolveSource` makes two bounded GETs (release, then the tag's commit),
  even under `--no-drift`, and `printArchetypeVersion` (`:348`) already prints `Source: verified release
  vX` and `vA → vB (update available…)`. `status --json` already carries `version.channel`. What is
  missing is an explicit channel row and the release-specific wording. → Q2 (what `--no-drift` does).
- **A re-run `init` never carries the replaced config's `ref`** (documented, `docs/commands/init.md:39`).
  With the new default, re-running `init` on a `main` install would move it to releases without a word,
  and if that install came from a `main` ahead of the newest release, re-install older content. → Q3.
- **`LIMITS.md` is hook-protected** (`.claude/hooks/protect-trusted-paths.cjs:58`). Per the 2026-10-25
  precedent (root-footprint-consolidation Q4) its §1d/§3b/§3e changes ship as a draft
  `.dev/features/default-channel-latest/LIMITS.updated.md` for the human to apply; the original is not
  edited. `THREAT-MODEL.md:60` ("`@main` HEAD (or release, on the `--ref latest` channel)") stays true and
  is not touched.
- **Test fallout is wide.** `tests/commands-integration.test.ts` runs a real `runInit --yes` with only
  `fetch` stubbed to serve a codeload tarball; with the new default it would also hit
  `api.github.com/…/releases/latest`. The stub learns the two release endpoints (so the default path is
  exercised for real), rather than every test pinning `ref: 'main'`.

## Design

### A. The default (`lib/release.ts`, `commands/init.ts`, `src/index.ts`)

- New `export const DEFAULT_INIT_REF: RefChoice = 'latest'`; `runInit` uses `opts.ref ?? DEFAULT_INIT_REF`.
  `update`, `add`, `status` keep `channelOf(config)` — the recorded channel, `main` when none is recorded.
- Header comment of `release.ts` rewritten: `latest` is the default for new installs; `main` is the explicit
  contributor channel and what an install with no recorded `ref` keeps.
- `--ref` help splits per command (the `uses` array already allows it): init — `"latest" (the newest
  verified pharn-oss release — the default) or "main" (its tip, for contributors); recorded`; update —
  `switch to "latest" (verified releases) or "main" (the tip); recorded — without it, update follows the
  channel the install records (main when none is)`. `REF_CHOICES` order is unchanged (the invalid-value
  message is pinned).

### B. Fail-closed stays (`lib/release.ts`)

- No behaviour change: 404 / 403 / 429 / unreachable / malformed / draft / prerelease → `ReleaseResolveError`,
  exit 1, nothing written; `fetchRepo`'s SKILLS_VERSION-equals-tag refusal untouched. Only `refusal()`'s
  wording changes: "This install follows verified releases (the default, or `--ref latest`) … To install the
  tip of main instead (the contributor channel), run `pharn init --ref main` (or `pharn update --ref main`
  …)". It must still name `--ref main` (tests assert it).

### C. The `update` notice (`commands/update.ts`, `lib/update-render.ts`)

- `defaultChannelNoticeLine()` in `update-render.ts` (pure wording): `Verified releases are now the default
  for new installs. This install keeps following pharn-oss main; run \`pharn update --ref latest\` to switch
  (recorded on first use).`
- Printed ONCE per run (`log.info`) when the channel came from the config (`opts.ref === undefined`) and is
  `main`; before the version-check spinner, so it also shows on the up-to-date / ahead early returns and in
  `--dry-run`. Not printed with an explicit `--ref` (the user just chose), nor on `latest`. Under `--json`
  nothing is printed (the report already carries `channel: "main"`; the `legacyBackupNotice` precedent).
- Recording per Q1.

### D. `status` (`commands/status.ts`, maybe `lib/release.ts`)

- VERSION note gains a `Channel` row before `Source`: `latest (verified releases)` or `main (the pharn-oss
  tip — run \`pharn update --ref latest\` for verified releases)`; wording per Q1 if `main` is recorded.
- On `latest`, the skills line says `vA → vB (newer verified release vB — run \`pharn update\`)` /
  `(no newer verified release)`; `main` wording unchanged. Same data, no new request on the drift path.
- `--no-drift` per Q2. `status --json` keys unchanged (`version.channel` exists); `schemaVersion` stays 1.
  Channel and release wording are NOT `--strict` inputs (`strictFails` unchanged).

### E. Re-run `init` (per Q3; `lib/init-plan.ts`, `steps/archetype-summary.ts`)

- Recommended: the summary prints `previously followed: main — pass --ref main to keep it` when the replaced
  config (read tolerantly, `readPreviousConfig`) follows `main` and this run's channel is `latest` (and no
  `--ref` was passed), plus `(installed vA is newer than release vB — this re-install goes back)` when
  `versionStatus` says ahead. Same line in the real run, `--yes` and the text dry run (`archetypeSummaryLines`
  path, like `previously recorded:`). `init --dry-run --json`: no new key (P7).

### F. Docs and release

- `README.md` (Fetch row), `docs/getting-started.md`, `docs/commands/{init,update,status}.md`,
  `docs/troubleshooting.md` (the "pharn-oss has not published a release" statements become false; the
  refusal section keeps its causes), `docs/contributing.md:95`, `CLAUDE.md` (the `lib/release.ts` paragraph).
- `CHANGELOG.md` `## [0.15.0] — 2026-10-26` (Changed: default; Added: update notice, status channel row).
  `npm version --no-git-tag-version 0.15.0`.
- `LIMITS.updated.md` draft (§1d wording, §3b: `latest` is the default channel so the two GETs fail closed
  by default; `main` keeps its float; §3e: "the default channel installs whatever merged last" becomes the
  `main`-channel statement).

### Delivery

Commit on `claude/default-channel-latest`, push, open a PR whose body states the pharn-oss follow-ups
(below). No merge, no release — those are the human's at GATE 2.

**pharn-oss follow-ups to state in the PR (not edited here):** README line 125 ("Without `--ref`, the
installer takes the tip of `main`") is false from 0.15.0 and should say the default is the newest release
(its `init --ref latest` examples stay valid). `MIN_CLI` (0.14.0) needs NO bump for correctness — older
CLIs keep working on `main`; bumping it to 0.15.0 is optional and would only force upgrades.

## Files

- `src/lib/release.ts` — `DEFAULT_INIT_REF`, header comment, refusal wording, one-GET version helper (Q2) — lib
- `src/commands/init.ts` — default channel; previous-channel summary input — command
- `src/commands/update.ts` — the notice — command
- `src/lib/update-render.ts` — notice wording — lib
- `src/commands/status.ts` — Channel row, release wording, `--no-drift` one GET (Q2) — command
- `src/lib/status-report.ts` — accepts the narrower status source type (no sha) — lib
- `src/index.ts` — per-command `--ref` help — dispatch
- `src/types.ts` — comment only: absent `ref` = `main`, no longer "the default" — types
- `src/lib/pharn-config.ts` — comment only: same — lib
- `src/lib/init-plan.ts` — previous channel for the summary (Q3) — lib
- `src/steps/archetype-summary.ts` — `previously followed:` line (Q3) — step
- `tests/support/tar-fixture.ts` — shared fetch helpers if needed — test
- `tests/release.test.ts` — default constant, refusal wording, one-GET helper — test
- `tests/init.test.ts` — default resolves latest — test
- `tests/init-archetype.test.ts` — default channel fallout — test
- `tests/init-yes.test.ts` — default channel fallout — test
- `tests/init-dry-run.test.ts` — default channel fallout, Q3 line — test
- `tests/init-dry-run-json.test.ts` — `channel` default — test
- `tests/init-report.test.ts` — `channel` default — test
- `tests/update.test.ts` — notice — test
- `tests/update-dry-run.test.ts` — notice — test
- `tests/update-dry-run-json.test.ts` — no notice under `--json` — test
- `tests/status.test.ts` — Channel row, `--no-drift` — test
- `tests/status-json.test.ts` — key set unchanged, `--no-drift` one GET — test
- `tests/status-report.test.ts` — narrower source type — test
- `tests/index.test.ts` — help text — test
- `tests/commands-integration.test.ts` — default path served for real, one `ref: 'main'` path kept — test
- `tests/archetype-summary.test.ts` — `previously followed:` line — test
- `tests/repo.test.ts` — refusal wording fallout only — test
- `tests/add.test.ts` — refusal wording fallout only — test
- `README.md` — Fetch row — docs
- `docs/getting-started.md` — default channel — docs
- `docs/commands/init.md` — default channel — docs
- `docs/commands/update.md` — notice, channel — docs
- `docs/commands/status.md` — Channel row, `--no-drift` — docs
- `docs/troubleshooting.md` — release now exists; refusal causes kept — docs
- `docs/contributing.md` — default channel line — docs
- `docs/reference/pharn-config.md` — `ref` row (review finding 3) — docs
- `CLAUDE.md` — `lib/release.ts` paragraph — docs
- `CHANGELOG.md` — 0.15.0 — docs
- `package.json` — version 0.15.0 — release
- `package-lock.json` — version 0.15.0 — release
- `tests/release-consistency.test.ts` — add the shipped `v0.14.1` to `KNOWN_TAGS` (the bump now links it) — release
- `tests/init-report.test.ts` — `channelLines` fixture field; not a report key — test
- `.dev/features/default-channel-latest/LIMITS.updated.md` — draft for the human (trusted doc) — docs

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — unchanged; no new untrusted free text is ingested (cite only, P4).
- The `pharn.config.json` schema stays additive (CLAUDE.md, P7): Q1=B adds nothing; Q1=A widens the
  accepted `ref` values from `{"latest"}` to `{"latest","main"}`, which every released CLI already reads as
  `main`.

## Evals to write (P1)

- fresh `runInit()` with no `--ref` → `resolveSource('latest')`, config records `"ref": "latest"`
  (integration: real init against the stubbed release endpoints + tarball).
- `runInit({ ref: 'main' })` → `resolveSource('main')`, no `ref` key (Q1=B) / `"ref": "main"` (Q1=A).
- default init, release 404 / 403 / unreachable → exit 1, nothing written, message names `--ref main`, the
  tip is never fetched (no codeload request without a release sha).
- release tag ≠ SKILLS_VERSION → still refused (existing `repo.test.ts` case kept green).
- `update` on a config with no `ref` → follows `main`, prints the notice exactly once (real run, `--dry-run`,
  and the up-to-date early return); with `"ref": "main"` (Q1=A) the same; with `"ref": "latest"` → no notice;
  with `--ref main` → no notice; `--json` → stdout is one object, notice absent.
- `status` text on `latest` → `Channel` row + "newer verified release" / "no newer" wording; on `main` → row
  with the opt-in hint; `--no-drift` on both per Q2 (request count asserted on the stubbed fetch).
- `status --json` key set unchanged on both channels.
- re-run `init` over a `main` config, no `--ref` → `previously followed: main` line (+ ahead wording when the
  replaced `skillsVersion` is newer than the release); with `--ref main` → no line.
- `pharn init --help` / `pharn update --help` → the new per-command `--ref` text.

## Guarantee audit (P0)

- "A fresh init installs only a verified release unless `--ref main`" → **floor: test** (default constant +
  integration test asserting the resolved source and the recorded `ref`). What "verified" means stays
  pharn-oss's promise (it tags after its CI passes) — **advisory** from this side; the CLI checks the tag
  shape, the tag→commit resolve and SKILLS_VERSION = tag (enum-regex + equality), not the CI verdict.
- "No release resolvable → refuse, never float" → **floor: test** (existing `release.test.ts` refusals +
  a default-path test that no tarball request is made).
- "An existing `main` / unrecorded install is never switched by `update`" → **floor: test** (`channelOf`
  membership test; update tests on absent and `main`).
- "The notice prints once" → **floor: test** (spy count). Its usefulness is advisory.
- "`status` says whether a newer release exists" → **floor: test** (`versionStatus` comparison, already the
  one comparator); a release published seconds later is invisible until the next run — advisory freshness.

## Trust audit (P2)

- New input: none beyond what `--ref latest` already ingests (`tag_name`, the tag's commit), still gated by
  `RELEASE_TAG_RE` / `COMMIT_RE` before display or use. If Q2=a adds a one-GET helper it reuses `get` /
  `parseRelease` / the same regex and byte cap; the tag reaches the terminal only after the regex.
- The replaced config's `skillsVersion` in the Q3 line is already `VERSION_RE`-validated at load and goes
  through `terminalSafe`.

## Determinism audit (P5)

- Channel choice: `opts.ref ?? DEFAULT_INIT_REF` (init) / `opts.ref ?? channelOf(config)` (others) —
  membership tests. Notice: `opts.ref === undefined && channel === 'main' && !json`. No fallback guesses.

## Open questions (HALT)

- Q1 — record `"ref": "main"` explicitly when a user chooses `--ref main`, or keep "absent = main"?
- Q2 — what `status --no-drift` does on `latest`.
- Q3 — what a re-run `init` without `--ref` does to an install that followed `main`.

## Resolved decisions (GATE 1, 2026-10-26 — human answers)

- Q1 → keep "absent = main". No schema change; `--ref main` writes no `ref` key. Every `main` install
  (explicit or pre-`--ref`) gets the update notice. The Q1=A rows are removed from `## Files` (the list was
  also reformatted to one path per line so the writes-scope parser reads every file; same set, plus
  `src/lib/status-report.ts` / `tests/status-report.test.ts` for grill finding 2 and test-fallout files).
- Q2 → `status --no-drift` on `latest` keeps the version check with ONE GET (`releases/latest` only — no
  commit resolve). The drift path is unchanged (it needs the commit to download).
- Q3 → re-run `init` follows the new default and the summary prints `previously followed: main — pass
  --ref main to keep it`, plus the go-back warning when the installed version is newer than the release.

Plan approved as written: "Approve as written".
