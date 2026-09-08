# PLAN — pin `update`'s two network-failure exits by EFFECT, not by wording

- spec_content_hash: 60b4f73a5354e2ce3b6fbbc9f5ace88cb5abd2f45556b9aea6387d8436afb400 # fix #4
- increment: two tests in `tests/update.test.ts` pinning what `pharn update` LEAVES BEHIND and how
  far it got when either of its two network calls fails. Tests only — `src/**` is not touched.
- layer(s): `tests/` only
- constitution_refs: [P0, P1, P3, P4, P6, P7]

## Discovery (P6 — read live this run)

The spec (`prompts/5.6a-update-network-exit-tests.md`) predates several merged PRs. Everything below
was read from disk at base `47b1f98`, not from the spec.

**Spec claim vs live state:**

| spec claim                                                     | live state                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| catches at `update.ts:121-126` and `:181-186`                   | `:142-149` and `:210-216`                                                         |
| each catch is `log.error(...)` + `if (process.env.PHARN_DEBUG)` | each catch is `reportFatal(errorMessage(err), { err })` — 4.06 landed as PR 4    |
| "`tests/update.test.ts` … never rejects either"                 | **FALSE** — it rejects both, in `describe('fatal-error reporting')`              |
| "both catches are dead to the suite"                            | **FALSE** — both `exit(1)`s are already pinned                                    |
| installs "via degit"                                            | `fetchRepo` downloads a codeload tarball via `lib/tar-extract.ts` (PR #146)      |

Live source, verbatim (`src/commands/update.ts:142-149`, `:210-216`):

```ts
  try {
    latest = await fetchRemoteSkillsVersion();
    s.stop(`Latest skills v${latest}`);
  } catch (err) {
    s.stop('Failed to check for updates');
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }
```

```ts
  try {
    repo = await fetchRepo();
  } catch (err) {
    s2.stop('Update failed');
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }
```

Live tests that ALREADY reject these two mocks (`tests/update.test.ts:249`, `:269`, `:301`):

```ts
    it('prints the PHARN_DEBUG hint when the version check throws, on stderr', async () => {
      await installed();
      fetchRemoteSkillsVersion.mockRejectedValueOnce(
        new Error('Could not reach raw.githubusercontent.com: fetch failed'),
      );
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
```

```ts
    it('prints the hint when the clone throws', async () => {
      await installed();
      fetchRepo.mockRejectedValueOnce(new Error('fetch exploded'));
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
```

**So the gap this increment closes is NOT the one the spec describes.** The exit CODE is pinned. What
is unpinned is:

1. **Ordering.** Nothing asserts that the version check precedes the confirm and the clone. Verified
   by breaking it: hoisting the confirm above the version read leaves the entire 77-test suite green.
2. **Effects.** Neither existing test asserts that a failed run wrote nothing. Verified by breaking
   it: stamping `pharn.config.json` before the clone leaves both `fatal-error reporting` clone tests
   green.

Also read live, and load-bearing for the design:

- `src/lib/repo.ts:82-91` — `fetchRepo` `mkdtempSync`es first and `rmSync`s its own temp dir in its
  catch, returning a handle only on success. So `cleanup` is reachable **only** through a resolved
  `fetchRepo` — which is why the spec's "assert `cleanup` was never called" is nearly unfalsifiable
  on its own, and why the plan pairs it with a call COUNT (see the guarantee audit).
- `tests/update.test.ts:141-165` — `beforeEach` opens the TTY gate (`setTTY(true, true)`), resolves
  `confirm` to `true`, and points `fetchRepo`/`fetchRemoteSkillsVersion` at healthy values.
- `tests/update.test.ts:167-190` — the fixture helpers this increment reuses verbatim: `records()`,
  `body()`, `backupDirs()`.
- `tests/update.test.ts:1128-1146` (`MIN_CLI gate`) — the in-repo precedent for the effect triple:
  `expect(cleanup).toHaveBeenCalled()` / `body(CAP_FILE)` unchanged / `readPharnConfig(proj)` null.
- `tests/status.test.ts:98` and `:118` — the sibling pins the spec points at; both assert
  `fetchRepo` was not called, neither asserts effects (status writes nothing by construction).

## Files

- `tests/update.test.ts` — one new `describe('network failure')` with two `it`s, inserted after
  `'cancels when declined'` (`:383-389`), which is the early-exit neighbourhood the spec names.

No `src/**` change (the spec forbids it, and nothing is wrong with the code). No `vitest.config.ts`
change (5.6c owns the coverage floors). No docs change: nothing user-facing moves.

## Evals to write (P1)

1. `network failure > version check fails: exit 1 before the confirm and before any clone`
   — `installed()`, `fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'))`, expect
   `ProcessExit(1)`; then `fetchRepo` not called, `prompts.confirm` not called,
   `readPharnConfig(proj)` null, `body(DOC)` still `constitution v1`, `body(CAP_FILE)` still
   `a11y v1`, the whole record store deep-equal to its pre-run snapshot AND `records()![DOC]` equal
   to the hash of the DOC actually on disk, `backupDirs()` empty.
2. `network failure > clone fails: exit 1, no clone to clean up, nothing written`
   — same fixture, `fetchRepo.mockRejectedValueOnce(new Error('offline'))`, expect `ProcessExit(1)`;
   then `cleanup` not called, `fetchRepo` called exactly once, and the same five effect assertions.

No message string is asserted in either (4.06 owns the wording, and the `fatal-error reporting`
suite already pins it).

Each is demonstrated RED by a temporary source break before being trusted — transcripts in
`VERIFY.md`. Two of the seven breaks redden ONLY the new test, which is the increment's whole claim.

## Guarantee audit (P0)

- "`update` exits 1 when either network call fails" → **advisory, and NOT new**. Already pinned by
  `tests/update.test.ts:249` / `:269`. This increment re-asserts it as the precondition of its
  effect assertions, not as a new guarantee. Saying otherwise would be the exact overclaim this
  repo exists to prevent.
- "a failed run leaves the project byte-identical" → **advisory**. It is deterministic control flow
  demonstrated by tests (P1), not one of the three floor primitives (`ARCHITECTURE.md §2`). And it
  is demonstrated over the fixture's five files, not over "the project": a write to a path the
  fixture does not lay down is invisible here. Named, not implied.
- "the version check precedes the confirm and the clone" → **advisory**, same class. It is the one
  assertion with a break that reddens nothing else in the suite, so it is the increment's strongest
  claim in the falsifiability sense and its weakest in the guarantee sense.
- "`cleanup` is never called on the clone-failure path" → **advisory, and structurally near-vacuous
  on its own**: `cleanup` only exists on a resolved `fetchRepo` handle (`src/lib/repo.ts:94-98`), so
  no edit confined to `update.ts` that keeps the fetch rejecting can call it. It is paired with
  `expect(fetchRepo).toHaveBeenCalledTimes(1)`, which IS falsifiable (a retry or a salvage fetch
  breaks it), so the pair means "one attempt, nothing to clean up" rather than a tautology. Recorded
  as a known weakness rather than dressed up — see `GRILL.md` finding 1.
- "no version bump on a failed run" → **advisory**, and covered only in its strongest form
  (`readPharnConfig(proj) === null`, i.e. no config at all). A run that wrote a config with the OLD
  version would satisfy the withheld-bump rule and still fail this assertion; that is deliberate —
  on these two paths the correct number of config writes is zero.
- Struck: "these tests make `update`'s network paths safe." They make two specific regressions
  detectable. Nothing here changes what the command does.

## Trust audit (P2)

No untrusted artifact is ingested. Both new tests feed a locally-constructed `Error('offline')` into
a `vi.fn()`; no clone, no fetch, no network. The one adjacent taint — `errorMessage(err)` rendering
clone-derived text — is deliberately NOT asserted on, which narrows rather than widens the surface.

## Determinism audit (P5)

No new branch in `src/**` (none is touched). The tests' own determinism: `mockRejectedValueOnce`
queues exactly one rejection, so `toHaveBeenCalledTimes(1)` is exact rather than incidental, and the
record snapshot is taken before the run so the comparison cannot pass by re-reading a store the run
rewrote.

## Out of scope (P7)

- The error TEXT of either catch — `prompts/4.06-network-error-messages.md`, already landed as PR 4.
- Coverage floors in `vitest.config.ts` — `5.6c-add-coverage.md` ratchets them once, after this.
- `init`'s and `add`'s untested failure paths — `5.6b`, `5.6c`.
- `init`'s clone leak on cancel — `4.04`.
- Any change to `update`'s decision table, backup behavior, `--force` semantics, or `src/**` at all.
- Deleting the now-redundant half of the overlap with `fatal-error reporting`: the two suites pin
  different axes (wording vs effect) and both are cheap. Consolidating them is a separate call.

## Open questions (HALT)

None.
