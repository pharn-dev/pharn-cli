# PLAN — init-preflight-first (refuse an unfinishable install before asking to overwrite)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn init` runs its read-only destination pre-flight before the overwrite prompt,
  so a project the install cannot finish in is refused without first asking "Continue and
  overwrite?". The checks that already run under the lock stay; they remain the authoritative ones.
- layer(s): the CLI itself (`src/commands/init.ts`, `src/steps/install-archetype.ts`), docs
- constitution_refs: [P0, P5, P6]

## Discovery — verified this run (P6), code read on HEAD `9d2d574`

- `init.ts:197-205` builds the install manifest once (`installManifest`), then calls
  `confirmWriteTargets`, and only after a yes calls `runInstallArchetype` under the lock.
- `runInstallArchetype` runs `prepareInstall` first (#223), and `installCapabilities` runs it again
  just before copying. Both are after the prompt, so a user who answers yes can still be told
  "Refusing to install: … is in the way" — the question was never real.
- `prepareInstall` (`install-capabilities.ts`) is read-only and throws `ManifestValidationError`,
  which lands in `init`'s existing catch: reported, exit 1, the clone cleaned up in the `finally`
  first. No new failure path is needed.
- `init.ts` may not import any `*manifest.js` module (a static guard in `tests/init.test.ts`), and
  `tests/init.test.ts` mocks the install step by name — so the call goes through the step module
  init already uses, as `installManifest` does.

## Files

- `src/steps/install-archetype.ts` — layer CLI/steps. Exports `preflightInstall(repoDir, cwd,
  selection, manifest)`, a thin call to `prepareInstall` over the manifest init built.
- `src/commands/init.ts` — layer CLI/commands. Calls it after the manifest and before the prompt.
  The comment names the lock-time checks as the authoritative ones: the tree can change while the
  prompt is open.
- `tests/init.test.ts` — layer tests. The mock gains `preflightInstall`. A refusal exits 1 without
  calling `confirmWriteTargets` or `runInstallArchetype`, and still cleans up the clone. On a
  normal run it is called with the same manifest, before the prompt.
- `tests/init-archetype.test.ts` — layer tests. A whole `runInit` over a project with a type
  collision and an existing install: the overwrite prompt is never shown, and the run exits 1
  naming the collision. FAILS on base (the prompt is shown first).
- `docs/commands/init.md` — layer docs. "When `init` refuses to install" says the check runs
  before the overwrite prompt.
- `docs/troubleshooting.md` — layer docs. The same, in "Something in your project is in the way".
- `CLAUDE.md` — layer docs. The init step-5 passage.
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed`, one entry.

## Contracts satisfied

- #223's "a refused install writes nothing" is unchanged; this adds "and asks nothing first".

## Evals to write (P1)

- Listed under Files. The whole-`runInit` case FAILS on the base.

## Guarantee audit (P0)

- "an install the pre-flight refuses never shows the overwrite prompt" → floor: the call order plus
  two tests. The check under the lock stays the guarantee that nothing is written; this earlier run
  only changes when the refusal arrives.

## Trust audit (P2)

- No new input; the pre-flight already reads the same paths.

## Determinism audit (P5)

- Same checks, earlier. No new branches beyond the existing throw.

## Open questions (HALT)

None — the behavior was proposed in #223's review (REVIEW.md, advisory finding 7) and asked for by
the human ("fix all 3").
