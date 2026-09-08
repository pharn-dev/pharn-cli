# REVIEW — npm-run-dev

## Lens 1 — P4 (cite, do not restate)

**PASS.** Adding the script leaves `README.md:134` and `docs/contributing.md:16` correct **without
editing them**, so the fix removes a contradiction instead of propagating a new sentence to three
files. `CLAUDE.md:14` now shows the documented form and the equivalent one-liner on one line rather
than asserting a negative that has to be maintained.

## Lens 2 — P3 (one gate, one responsibility)

**PASS.** `dev` is a local convenience script and stays out of CI. The negative pin (`dev` is not one
of the six gate scripts) states that at the package.json end, where a contributor adding a script
will look — `tests/ci-workflow.test.ts` only guards the workflow end.

**Advisory finding (low).** `CI_GATE_SCRIPTS` in the new test duplicates the gate list that
`tests/ci-workflow.test.ts` already holds as `EXPECTED_GATES`. Two copies can drift. Sharing them
would mean a `tests/*` → `tests/*` import for a four-line constant, which the repo avoids elsewhere;
and `5.6d` is the prompt that revisits the ruleset pins, so the consolidation belongs there if
anywhere. Left as-is, deliberately.

## Lens 3 — P0 (do not claim more than is verified)

**PASS, with the claim explicitly downgraded.** The spec's argument for this option is that
`npm run dev -- init` "forwards `init` through to minimist exactly like the built binary". No test
proves that; the plan's guarantee audit marks it PARTIAL and `VERIFY.md` records the manual check
that does. A reader must not take the green suite as evidence the CLI ran.

## Lens 4 — regression surface

**PASS.** `package.json`'s only change is one added key — `files: ["dist"]`, `prepack`
(`npm run build`) and `prepublishOnly` (`npm run check`) are untouched, so nothing about publishing
or the shipped package moves. A script is not a published artifact.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build` green; `validate.mjs` exit 0.
- **Advisory:** one low finding (the duplicated gate list), deliberately deferred to `5.6d`.
