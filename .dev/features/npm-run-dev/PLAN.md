# PLAN — add the documented-but-missing `npm run dev` script

- spec_content_hash: 62bdc0bf97dc5d4a8400bc40b3cf6b48e943e65d4ff098402d059f1e1a41e99b # fix #4
- increment: Two contributor docs tell you to run the CLI from source with `npm run dev`; `package.json` has no such script, so the command fails outright. Add `"dev": "tsx src/index.ts"`, pin its spelling in a test, and make `CLAUDE.md` stop asserting the script does not exist.
- layer(s): `package.json`, `tests`, `docs`
- constitution_refs: [P3, P4, P7]

## Discovery (P6 — read live this run)

- `grep -rn "npm run dev" README.md docs CLAUDE.md CONTRIBUTING.md` → exactly **two** hits:
  `README.md:134` and `docs/contributing.md:16`. (The spec cites `README.md:132`; the line has moved.)
- `package.json` `scripts` has no `dev` key. `npm run dev` → `npm error Missing script: "dev"`.
- `tsx` is a devDependency, so the script works as written.
- **Spec drift, corrected here:** the spec says `CLAUDE.md` "asserts in two places that no `dev` script
  exists". `grep -n` finds **one** — `CLAUDE.md:14`, the Commands block:
  `npx tsx src/index.ts init    # run the CLI from source via tsx (there is no `dev` script)`.
  One place is edited, not two.
- `tests/lint-gate.test.ts:35-47` is the in-repo precedent for pinning a script's spelling from
  `package.json` — read the file, split the script on whitespace, assert on tokens.
- `tests/ci-workflow.test.ts:19-26` holds the six gate-name→script pairs and asserts set equality over
  the workflow's jobs, so a new npm script cannot silently become a CI gate.

## Files

- `tests/dev-script.test.ts` — NEW: assert `scripts.dev` exists, runs `tsx` on `src/index.ts`, and is
  NOT a CI gate (the ci-workflow gate map must not gain it) — layer `tests`
- `package.json` — `"dev": "tsx src/index.ts"` beside `build` — layer `build`
- `CLAUDE.md` — line 14: document `npm run dev -- init`, keep `npx tsx src/index.ts` as the equivalent,
  drop the "(there is no `dev` script)" parenthetical — layer `docs`
- `CHANGELOG.md` — contributor-facing, not user-facing; a one-liner — layer `docs`

`README.md:134` and `docs/contributing.md:16` become correct **with no edit** — that is the argument
for adding the script over rewriting the docs, and it is also why this prompt lands before `5.5b`,
which rewrites the surrounding `docs/contributing.md` gate list.

## Evals to write (P1)

- `scripts.dev` is present, its tokens include `tsx` and `src/index.ts`.
- The script is a bare invocation — no `--watch`, no `NODE_ENV`, nothing that would make
  `npm run dev -- init` forward argv differently from the built binary.
- `dev` is NOT among the six CI gate scripts (guards the ruleset contract from the other direction:
  `tests/ci-workflow.test.ts` pins that the workflow has exactly six jobs; this pins that the new
  script did not become a seventh).
- The two docs that name `npm run dev` still name it (so a later "cleanup" that deletes the script
  without touching the docs re-opens the gap and is caught).

## Guarantee audit (P0)

- "a documented command now exists" → **FLOOR**: the script-presence assertion.
- "`npm run dev -- init` behaves like the built binary" → **PARTIAL.** The test pins the script's
  *spelling*, not its runtime behavior; it does not spawn the CLI. Asserting the forwarding would mean
  executing an interactive command in a test, which the repo does not do elsewhere. Stated, not
  claimed.
- "no CI gate was added" → **FLOOR**: the negative membership assertion plus the untouched
  `tests/ci-workflow.test.ts`.
- "nothing ships differently" → **FLOOR by construction**: `files: ["dist"]` is untouched, and a
  script is not a published artifact.

## Trust audit (P2)

No untrusted input. `package.json` is repo-owned; the test reads it with `JSON.parse` exactly as
`tests/lint-gate.test.ts` does.

## Determinism audit (P5)

Membership tests over a parsed JSON object only.

## Out of scope (P7)

- `npm run check` gaining `lint:md`, and the `CONTRIBUTING.md` gate list — that is `5.5b`, which lands
  next and also touches `docs/contributing.md`.
- The `docs/reference/pharn-config.md` overwrite rows — `5.5c`.
- The `test-app/` vs `test-*/` staleness at `README.md:136` / `docs/contributing.md:18` — the spec
  explicitly defers it to `5.5b` rather than fixing it twice.
- Any CLI behavior, argv parsing, or `scripts/build.mjs` change.

## Open questions (HALT)

- None.
