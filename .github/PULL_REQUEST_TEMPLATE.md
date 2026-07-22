<!--
Thanks for contributing to pharn! Please read CONTRIBUTING.md and CLAUDE.md first.
Keep one logical change per PR; split mechanical reformat from real edits.
-->

## What this changes

A short description of the change and the problem it solves.

Closes #<!-- issue number -->

## Type of change

- [ ] `feat` — new stack option, wizard step, or command capability
- [ ] `fix` — bug fix
- [ ] `docs` — docs-only change
- [ ] `chore` / `refactor` — tooling or internal restructure, no behavior change

## Area(s) touched

<!-- commands/init | steps/* | lib/github | lib/validate | types | docs | repo tooling -->

## Checklist

- [ ] Read the existing file(s) before editing; followed the ESM `.js`-extension import convention.
- [ ] Updated the matching `tests/*.test.ts` when wizard behavior changed (tests mirror step/lib files one-to-one).
- [ ] Updated the relevant `docs/` page (see the "Documentation maintenance" table in `CONTRIBUTING.md`); unimplemented behavior is marked **Coming soon** or linked to `docs/roadmap.md`.
- [ ] Preserved the security invariants in `src/lib/github.ts` / `src/lib/validate.ts` (regex allowlists, `..` checks, `redirect: 'error'`, timeout/size caps, `schemaVersion === 1`) if I touched remote-input handling.

## Quality gates

- [ ] `npm run check` passes locally (`format:check` + `lint` + `typecheck` + `test`).
- [ ] `npm run build` succeeds.
- [ ] `npm run test:coverage` passes (coverage thresholds met).

## Notes for the reviewer

Anything the reviewer should look at first.
