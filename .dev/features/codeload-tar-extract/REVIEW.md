# REVIEW — codeload-tar-extract

## Lens 1 — P0 (a guarantee must not exceed what is verified)

**PASS, with one claim deliberately withheld.** The spec frames this as a perf fix ("~0.5 s"). No
speedup is claimed anywhere in the change, because no controlled comparison was run — the live probe
measures the new path only. What IS claimed is structural and each part is pinned: one resolve
instead of two (a call-count assertion), non-tip commits fetchable (why the second resolve failed),
no cache, rejection instead of skipping, no `git` binary.

The most important P0 move is in the other direction: `THREAT-MODEL.md` §4b previously read "the
clone is delegated, and pharn bounds none of it". That residual is now closed, and the rewrite says
which parts became floor **and** which did not — the bytes are still unverified, and extraction is
still not transactional.

## Lens 2 — P3 (one axis; guarantees belong where they can be tested)

**PASS, and it is the increment's thesis.** The spec offers a vetted tar dependency as an
alternative. Taking it would re-import the exact problem: `THREAT-MODEL.md` would again state
*measured properties of a dependency*, which a transitive bump can move with no pharn test noticing —
which is what `tests/degit-pin.test.ts` existed to manage and why that test had four separate inputs
to keep in sync. `tar-extract.ts` is ~230 lines with 23 tests, adds no transitive dependencies to a
four-dependency package, and every rejection it makes is pharn's own floor.

The split within it holds too: `extractTarGz` (decompress) vs `extractTar` (walk) is what lets the
tests build tar bytes directly, and `proxy-env.ts` vs `proxy-env-format.ts` keeps its logic/wording
separation through the rewrite.

## Lens 3 — P2 (untrusted input at a boundary)

**PASS, and strictly stronger than what it replaces.** The previous extractor **skipped** a malformed
entry and resolved successfully. Every one of those is now a throw. The three-bucket sort is the
subtle part — `SKIP` for pax metadata is not leniency, it is required for correctness, and getting it
wrong fails every real archive while passing every naive fixture (grill F2).

**Advisory finding (low).** `downloadArchive` buffers the whole archive in memory before
decompressing, rather than streaming into the extractor. Bounded by `MAX_ARCHIVE_BYTES` (32 MB) so it
is not a DoS, and it is what makes the extractor a pure function over a `Buffer` — which is what makes
the 23 adversarial cases cheap to write. A streaming rewrite would trade that testability for memory
that is already capped. Recorded, not taken.

## Lens 4 — scope discipline (P7)

**PASS, with one unavoidable widening.** The spec's step-5 list predates `lib/proxy-env.ts`, which
`require()`s degit's package.json at runtime on every network command. Removing the dependency
invalidates two modules, two test files and five call sites — not adjacent work folded in, but work
the deletion forces. It is named in the plan, the PR body, and here rather than slipped in.

Deliberately NOT done: no pharn-side cache, no SIGINT handling (`5.2c`), no retries or mirror, no
active deletion of leftover degit caches (`5.3b`'s docs half — documented, not executed), no change
to what gets installed or to any command's flags or exit codes.

**Advisory finding (low).** `vitest.config.ts` lost its `exclude: ['src/degit.d.ts']` line because the
file is gone. That file is otherwise `5.6c`'s exclusive property; this is a deletion forced by the
removal, not a threshold edit — the thresholds are untouched.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build`; `validate.mjs` 0; coverage 97.1% over a 90 threshold; the
  live probe against the real remote.
- **Advisory:** two low findings above (in-memory buffering, the vitest.config.ts deletion). Neither
  blocks.
