# REGRESSION — codeload-tar-extract

Baseline `977aa3805bdf57c24da299955c55370a84331d58`, measured in a detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**.

Test count 1061 → 1059: +23 extractor cases and +4 fetch cases, minus the 5 `degit-pin` cases whose
four inputs this change deletes, minus the proxy cases that pinned a dependency's version-gated
behavior. The spec authorises that deletion explicitly.

**Coverage went UP, against the spec's prediction:** 97.1% statements / 92.67 branches / 97.36
functions / 97.86 lines, all well over the `vitest.config.ts` thresholds (90/82/95/92), which were
not touched. ORDER.md sequences this increment before the `5.6c` ratchet on the premise that it
*lowers* coverage; that premise assumed the new extractor would arrive untested.
