# SHIP — degit-exact-pin

## Stages run

| Stage      | Verdict source                        | Result |
| ---------- | ------------------------------------- | ------ |
| plan       | human (GATE 1)                        | approved via the invoking brief |
| grill      | advisory, gates nothing               | folded into the plan's live-state divergences |
| build      | `node .dev/floor/validate.mjs .` exit | **0 (GREEN)** |
| regress    | `npm run check` gates at HEAD         | 47 files / 899 tests pass; no gate flipped |
| verify     | six CI gates re-run locally           | **PASS** — format:check, lint, lint:md, typecheck, test(+coverage), build |
| review     | advisory                              | see below |

## Structural verdicts, verbatim

- `.dev/floor/validate.mjs .` -> `FLOOR: GREEN — 0 capabilities checked in .`, exit **0**.
- `npm run check` -> format:check GREEN, lint GREEN (0 warnings), typecheck GREEN (both configs),
  test GREEN (47 files, 899 tests).
- `npm run test:coverage` -> statements 95.52%, branches 89.62%, functions 98.29%, lines 96.77%
  (floors: 90 / 82 / 95 / 92).
- `npm run lint:md` -> 0 issues in 23 files.
- `npm run build` -> succeeded; `dist/index.js` still carries `import degit from"degit"` (external).

## What landed

`tests/degit-pin.test.ts` (new, written first and RED on all 5 cases before the fix) pins:
exact-version shape, lockfile agreement, and the literal `degit@3.6.6` in `THREAT-MODEL.md`,
`LIMITS.md`, and `src/lib/repo.ts`. `package.json` `^3.6.1` -> `3.6.6`; the lockfile moved
3.8.0 -> 3.6.6 at the integrity hash the brief named. Prose corrected in `THREAT-MODEL.md`,
`docs/troubleshooting.md`, `docs/contributing.md` (new "Bumping `degit`" note), `CHANGELOG.md`,
plus four now-false in-code comments asserting a declared range.

## Advisory review notes

- The measured 9-version set (`MEASURED_DEGIT_VERSIONS`, 3.6.1-3.8.0) was deliberately NOT narrowed
  to the pin. It is now wider than the pin on purpose: degit is `external` and no lockfile is
  published, so an `overrides` entry, a monorepo hoist, or a non-npm resolver can seat a neighbour.
  Narrowing it would make the runtime notice hedge where it currently has real measurements.
- The prior `### Changed` CHANGELOG entry (which moved the lockfile UP to 3.8.0 and explicitly left
  narrowing "a separate decision") is superseded by this PR. Both were unreleased, so it was
  rewritten to describe the net state rather than leaving self-contradicting release notes.
- `tests/proxy-env-format.test.ts` keeps `3.8.0` as its representative measured version. Deliberate:
  it proves the gate keys on set MEMBERSHIP, not on equality with the pin.

## Standing limit (P0)

`tests/degit-pin.test.ts` proves the documents NAME the installed version. It can never prove the
measured prose is still TRUE of those bytes — only a human re-reading degit's source can. It also
says nothing about what a consumer's install tree resolves.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
