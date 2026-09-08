# PLAN — document the leftover degit cache's unbounded growth

- spec_content_hash: 7897a1cdceb02202fcbbe5fc045cd7a37d1e2c61aae3cdce30b6dd039b4240fe # fix #4
- increment: **Option A only.** The spec offers a docs fix and an active prune. `5.3a` landed first and removed degit entirely, so Option B would be dead code by construction. What remains is the half of Option A that `5.3a` did not cover: WHY the cache grew without bound, and how to size it.
- layer(s): `docs`
- constitution_refs: [P0, P4, P7]

## Discovery (P6 — read live this run)

- `grep -rn degit src/` → **zero hits.** `5.3a` (#146) removed the dependency; `fetchRepo` downloads
  from codeload and extracts with `lib/tar-extract.ts`. There is no cache to prune.
- `docs/troubleshooting.md` already has "A leftover cache you may want to delete" — added by `5.3a`.
  It names all three platform paths and says pharn will not clean it up. **It does not say the
  directory grew by one tarball per commit, or why**, which is the actual finding.
- `THREAT-MODEL.md` §2's "No cache, anywhere." bullet describes the removed cache's *security*
  properties (filename-keyed reuse, cache-as-resolver) but not its size behaviour.
- `src/lib/repo.ts:69` — the spec's third edit site **no longer exists**; the whole cache comment
  went with the dependency.

## The spec's own instruction, followed

> "Option A is the right default if `5.3a` is queued, because that change removes degit entirely and
> the growth stops at the source — but caches already on disk still need the escape hatch documented."

`5.3a` is not queued, it is merged. So: Option A, no code.

## Files

- `docs/troubleshooting.md` — the growth mechanism, a `du` command, and a warning not to delete the
  whole shared directory if another tool uses degit — layer `docs`
- `THREAT-MODEL.md` — one paragraph under the "No cache, anywhere." bullet — layer `docs`
- `CHANGELOG.md` — layer `docs`

## Evals to write (P1)

**None, and that is the honest answer.** This increment adds no behaviour: it explains a directory
pharn no longer touches. There is nothing to assert that would not be an assertion about prose. The
spec's test criteria are all conditioned on "If Option B", which is not what shipped.

## Guarantee audit (P0)

- "the docs now explain the growth" → **ADVISORY.** Prose review only; `lint:md` checks formatting,
  never truth.
- "pharn no longer grows the cache" → **FLOOR, and it belongs to `5.3a`**, not here: `grep -rn degit
  src/` is empty and `dist/index.js` contains no occurrence. This increment claims none of it.
- "the escape hatch works" → **NOT VERIFIED.** No test deletes a user's cache directory, and none
  should.

## Trust audit (P2)

No input, no code. The documented `du` command is read-only; the deletion advice is scoped to
`degit/github/pharn-dev/pharn-oss` for anyone sharing the directory with another tool.

## Determinism audit (P5)

Not applicable — no logic.

## Out of scope (P7)

- **Option B (the active prune).** Dead code after `5.3a`: nothing writes the cache, so a prune could
  only ever operate on a directory pharn will never add to again. Shipping a helper plus tests for a
  function that cannot fire is precisely what the spec's own retention-rule warning is about.
- Deleting the cache on the user's behalf — pharn deletes nothing outside the user's project.
- Any new CLI surface (`--clean-cache`), a pharn-owned cache, or degit `warn` listeners.

## Open questions (HALT)

- None.
