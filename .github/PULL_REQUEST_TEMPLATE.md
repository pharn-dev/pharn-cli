<!--
Thanks for contributing to pharn! Please read CONTRIBUTING.md and CLAUDE.md first.
Keep one logical change per PR; split mechanical reformat from real edits.
-->

## What this changes

A short description of the change and the problem it solves.

Closes #<!-- issue number -->

## Type of change

- [ ] `feat` — new command, option, or install behavior
- [ ] `fix` — bug fix
- [ ] `docs` — docs-only change
- [ ] `chore` / `refactor` — tooling or internal restructure, no behavior change

## Area(s) touched

<!-- commands/* | steps/* | lib/* (e.g. lib/repo, lib/validate) | types | docs | repo tooling -->

## Checklist

- [ ] Read the existing file(s) before editing; followed the ESM `.js`-extension import convention.
- [ ] Updated the matching `tests/*.test.ts` (or `tests/commands/*.test.ts`) when behavior changed.
- [ ] Updated the relevant `docs/` page (see the "Documentation maintenance" table in `CONTRIBUTING.md`); unimplemented behavior is marked **Coming soon** or linked to `docs/roadmap.md`.
- [ ] **Releasing?** Merging a version bump publishes to npm. Bump `package.json` + `package-lock.json` (`npm version --no-git-tag-version X.Y.Z`) and move the `[Unreleased]` entries under a `## [X.Y.Z] — YYYY-MM-DD` CHANGELOG heading (with its compare link) in this PR — see [`docs/RELEASING.md`](https://github.com/pharn-dev/pharn-cli/blob/main/docs/RELEASING.md). Not releasing? Leave the version alone and add to `[Unreleased]`.
- [ ] Preserved the security invariants in `src/lib/repo.ts` / `src/lib/fetch-capped.ts` / `src/lib/upstream-manifest.ts` / `src/lib/validate.ts` (regex allowlists, `..` checks, `redirect: 'error'`, timeout/size caps, `schemaVersion === 1`) if I touched remote-input handling.

## Quality gates

- [ ] `npm run check` passes locally (`format:check` + `lint` + `lint:md` + `typecheck` + `test`).
- [ ] `npm run build` succeeds.
- [ ] `npm run test:coverage` passes (coverage thresholds met).

## Notes for the reviewer

Anything the reviewer should look at first.
