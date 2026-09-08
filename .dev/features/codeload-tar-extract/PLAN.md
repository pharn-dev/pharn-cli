# PLAN — fetch the tarball from codeload directly, and own the extraction

- spec_content_hash: b244f467758bddaad3fa27a44e0488c91c1adebe650a3a0ef0d01bcf74622e67 # fix #4
- increment: Replace `degit` with one REST resolve + a direct codeload tarball download, extracted by pharn's own strict ustar reader. Retire the dependency and rewrite every doc that describes it.
- layer(s): `src/lib` (fetch + new extractor + proxy notice), `src/commands` (notice call sites), `tests`, `docs`, build config
- constitution_refs: [P0, P2, P3, P5, P7]

## Discovery (P6 — read live this run)

- `src/lib/repo.ts:70-95` — `fetchCommitSha()` resolves the ref, then `degit(REPO#ref)` resolves it
  AGAIN before its cached-tarball check.
- `grep -rln degit src tests docs *.md` → 27 files. Far more surface than the spec's list, because
  **`lib/proxy-env.ts` + `lib/proxy-env-format.ts` landed after the spec was written** (commit
  0afcd55). They exist solely to describe degit's lowercase-only `https_proxy` read, and
  `resolveDegitProxyRead()` does `createRequire('degit/package.json')` **at runtime** — so removing
  the dependency is not optional-adjacent here, it invalidates two modules, two test files and five
  call sites.
- `vitest.config.ts:10` excludes `src/degit.d.ts` from coverage; `scripts/build.mjs:15` marks degit
  `external`; `tests/degit-pin.test.ts` asserts the exact pin across four inputs this change deletes.
- Live probe of the extracted tree (this run, after the rewrite): **1,640 files**, `SKILLS_VERSION`
  3.0.1, layout `pharn`, 153 entries under `.dev/features`. The spec measured 1,467 — upstream grew.

## Files

- `src/lib/tar-extract.ts` — NEW: the strict ustar reader — layer `lib`
- `src/lib/repo.ts` — one resolve + `downloadArchive` + `extractTarGz`; comment rewritten — layer `lib`
- `src/lib/proxy-env.ts`, `src/lib/proxy-env-format.ts` — collapsed to one situation — layer `lib`
- `src/commands/{init,add,update,status}.ts` — the notice call sites — layer `commands`
- `tests/tar-extract.test.ts` — NEW, 23 cases — layer `tests`
- `tests/repo.test.ts` — rewritten against real archive bytes — layer `tests`
- `tests/proxy-env.test.ts`, `tests/proxy-env-format.test.ts` — rewritten — layer `tests`
- `tests/{init,add,status,update}.test.ts` — the proxy wiring assertions — layer `tests`
- DELETED: `src/degit.d.ts`, `tests/degit-pin.test.ts`
- `package.json` / `package-lock.json` / `scripts/build.mjs` / `vitest.config.ts` — retire the dep
- `THREAT-MODEL.md`, `LIMITS.md`, `docs/{troubleshooting,getting-started,contributing}.md`,
  `docs/commands/init.md`, `CLAUDE.md`, `CHANGELOG.md` — layer `docs`

## Evals to write (P1)

- Extraction: strip-1 happy path; **a leading `pax_global_header` extracts normally**; a path split
  across `prefix`+`name` lands at its full path; `..`, absolute, second-root, and every non-file /
  non-dir typeflag rejected; entry and byte caps; truncated archive; forged header checksum; GNU
  base-256 rejected; corrupt gzip; a decompressed-size cap that a compressed-size cap would miss.
- Fetch: exactly TWO requests (resolve, download) — never a second resolve; the codeload URL carries
  the SHA; `refs/heads/<branch>` in the degraded mode; `redirect:'error'` + a signal on the download;
  a malformed SHA rejected BEFORE any download; and no temp dir left behind on non-200, on a
  non-extractable archive, or on a missing body.

## Guarantee audit (P0)

- "one resolve, not two" → **FLOOR**: `expect(mock).toHaveBeenCalledTimes(2)` plus the URL assertion.
- "the extractor rejects what degit skipped" → **FLOOR**: six typeflag cases + checksum + base-256.
- "recorded commit == fetched bytes" → **FLOOR by construction** (one value, two uses) + a test.
- "no temp dir survives a failure" → **FLOOR**, via a per-test `TMPDIR` sandbox. Scanning the real
  tmpdir would be flaky: vitest runs files in parallel and several create `pharn-`-prefixed dirs.
- "**it is faster**" → **NOT CLAIMED.** The live probe measured 1.2-1.6 s for resolve + download +
  extract of 1,640 files. The spec's 222 ms + 1,061 ms was a different tree on a different day; no
  controlled A/B was run, so no speedup is asserted. The wins claimed are structural: one resolve,
  non-tip commits fetchable, no cache, stricter extraction, no `git` binary.
- "the archive's CONTENTS are safe" → **NOT CLAIMED** — provenance is by-SHA, not cryptographic.

## Trust audit (P2)

The archive is untrusted remote bytes. Every accepted path is reassembled from `prefix`+`name`,
checked for absoluteness and `..`, stripped of one component, checked against a single expected root,
and resolved through `safeJoin`. Both caps bound a hostile archive; `redirect:'error'` bounds the
host. Contents are written verbatim, never executed, and only structurally-filtered subsets ever
leave the temp dir.

## Determinism audit (P5)

The extractor is a byte walk with membership tests over typeflags — no heuristics. `detectProxyNotice`
keeps its deterministic variant ordering.

## Out of scope (P7)

- A pharn-side tarball cache (a digest-unverified cache is the residual this removes).
- What gets installed, layout resolution, config schema, command flags/exit codes.
- SIGINT handling (`5.2c`), retries, a mirror/failover host.
- Actively deleting leftover degit caches — `5.3b`'s docs half. Documented, not executed.

## Open questions (HALT)

- None.
