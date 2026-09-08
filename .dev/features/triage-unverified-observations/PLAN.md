# PLAN — triage the nine unverified observations

- spec_content_hash: ea3317879ee1fe8f13a2caee2391fa72c9646c20078dcdef31570b0daad943cb # fix #4
- increment: Verify each of the nine against the current tree FIRST, then apply the named fix only if it holds. "Verified, no action, here is why" is an expected outcome. One commit per item.
- layer(s): `tests`, `src/lib` (comments only), `docs`
- constitution_refs: [P0, P4, P5, P7]

## Verdicts

| # | claim | verdict | action |
| --- | --- | --- | --- |
| 1 | walk bounds unpinned | **HOLDS** — no `MAX_DEPTH`/`MAX_ENTRIES` hit in the test file | 3 tests, mutation-verified |
| 2 | conflict set omits `pharn.records.json` | **HOLDS, but the code is right** | reword the prose, keep the exclusion |
| 3 | triple materialization | **defer** — `5.3a` merged as #146 and removed it at the source | confirmed only |
| 4 | picker re-parses per pick | **HOLDS, no action** (the spec's own recommendation) | recorded |
| 5 | `engines >=20` vs node-24 CI | **HOLDS** — a declared gap | documented, not closed |
| 6 | Conventional Commits unenforced | **HOLDS** — `45c4be8 changes (#97)` on `main` | reviewer-check line |
| 7 | hook's dev-repo posture | **HOLDS** — upstream | issue filed, nothing else |
| 8 | Windows implied, zero Windows CI | **HOLDS** — no `os` field | documented, not closed |
| 9 | coverage thresholds below measured | **defer** — `5.6c` owns the ratchet | confirmed still carried |

## Discovery (P6 — read live this run)

- Item 1: grepping the test file for `MAX_DEPTH` / `MAX_ENTRIES` / depth fixtures → **zero hits**.
- Item 2: `conflictingWriteTargets` adds only `PHARN_CONFIG_FILE`. The counter-evidence the spec told
  me to refute **survives**: `tests/install-manifest.test.ts`'s _CLI-owned metadata is outside the
  install set_ plants `pharn.records.json` + `.pharn-backup/` and asserts `[]`.
- Item 3: `grep -rn degit src/` → empty. #146 replaced the fetch layer entirely.
- Item 5/8: all six gates pin `node-version: 24`; `package.json` has no `os` field.
- Item 6: `git log --oneline` still shows `45c4be8 changes (#97)`.
- Item 7: the constant is at `:113` and used at `:311` — the spec cited `:71`/`:184`, both stale. The
  claim itself holds.
- Item 9: `vitest.config.ts` thresholds unchanged; `5.6c` is still queued and still carries the ratchet.

## The item that turned around

**Item 2 was the one worth verifying rather than fixing.** The claim ("the conflict set omits a real
write target") is TRUE, and the one-line fix the spec offers would have been wrong: the omission is
deliberate, commented, and pinned. `pharn.records.json` is CLI-owned derived state a re-install
regenerates, so listing it adds a line the user cannot act on to a warning whose whole value is that
every line is one of THEIR files. So the **prose** moved, not the set — widening the set would have
broken an existing pin on purpose in order to make a sentence true.

## Also fixed here, found by another ship, not one of the nine

Two claims of the same class — a statement that outlived the thing it described — surfaced while the
other prompts landed, and both are corrected on this branch:

- **`src/commands/{init,add,update,status}.ts`** still explained the proxy notice in `degit`'s terms
  ("degit reads process.env.https_proxy ITSELF … gated on the installed degit being a version pharn
  measured") after #146 removed the dependency and rewrote `lib/proxy-env.ts`. Found by the agent
  shipping `5.6b`, which noticed the comments contradict both `proxy-env.ts`'s own header and
  `tests/init.test.ts`, where the warning is asserted **not** to contain `degit`.
- **`tests/check-composition.test.ts`** — below.

`tests/check-composition.test.ts` claimed "If a seventh gate is ever added to CI, this fails". It does
not — its gate list is a local literal. Same class as the nine (a guarantee that holds because it was
written down), and it was mine, from the PR that added `lint:md` to `npm run check`.

## Files

- `tests/detect-archetype.test.ts` — item 1's three pins — layer `tests`
- `src/lib/install-manifest.ts`, `CLAUDE.md` — item 2's prose — layer `docs`
- `CONTRIBUTING.md`, `docs/contributing.md`, `CLAUDE.md` — items 5, 6, 8 — layer `docs`
- `tests/check-composition.test.ts` — the corrected overclaim — layer `tests`
- `src/commands/{init,add,update,status}.ts` — the stale degit proxy comments — layer `commands`

## Guarantee audit (P0)

- Item 1's pins → **FLOOR**, verified in **both** directions by mutation: raising `MAX_DEPTH` reddens
  the "not past it" case, lowering it reddens the "at it" case. A one-sided test would have passed
  with the walk stopping at depth 1.
- Items 2, 5, 6, 8 → **ADVISORY**. Prose. No gate can check a doc's honesty.
- Items 5 and 8 are **documented, not closed**, and the reason is recorded — the tempting fix
  (matrixing one of the six jobs) renames its reported context and blocks every PR.
- Item 7 → **no pharn-cli guarantee at all**; the filed issue is the entire deliverable.

## Out of scope (P7)

- Items 3 and 9 are other prompts' property; confirming they still carry it is the whole action.
- Item 4's refactor — the spec recommends no action and names why doing it partially is worse.
- Adding any CI job or touching `ci.yml` (items 5, 6 and 8 all tempt it).

## Open questions (HALT)

- None.
