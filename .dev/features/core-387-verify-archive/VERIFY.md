# VERIFY — core-387-verify-archive

At HEAD (the feature merged forward onto origin/main `f9fa96b0`): every floor gate exited 0, and
`check-verify.mjs` returned `PASS`.

| Gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |
| build        | 0    |

There are no committed eval pairs, so no `structural:*` gate ran. Registered verifiers: 0 (`count-verifiers.mjs`),
so no advisory annotations.

## Live Done-when (bundle `node dist/index.js`, outside the gates)

`$S` is the session scratchpad (`…/scratchpad/live`).

| Case | Archive                                                                                                                    | Result                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| (a)  | `git -C pharn-oss archive --prefix=pharn-oss/ --format=tar.gz` of `origin/main` (a2cacaef), with `--expect-version 7.25.5` | exit 0, "616 files … 35 capabilities; SKILLS_VERSION 7.25.5, as expected; MIN_CLI 0.14.0."                               |
| (b)  | (a) extracted, `pharn/CONSTITUTION.md` altered, repacked with ustar `tar`                                                  | exit 1, "declares a sha256 for pharn/CONSTITUTION.md that its bytes do not match"                                        |
| (c)  | the real codeload `refs/tags/v7.25.5` tarball, with `--expect-version 7.25.5`                                              | exit 0, the same summary                                                                                                 |
| (c') | (c) with `--expect-version 7.25.6`                                                                                         | exit 1, "it ships SKILLS_VERSION 7.25.5, not 7.25.6 (--expect-version)"                                                  |
| (d)  | plain `git archive --format=tar.gz` of `origin/main` (no prefix)                                                           | exit 1, "tar entry has no path below the archive root: MIN_CLI. … Re-create it with `git archive --prefix=pharn-oss/ …`" |

No `pharn-verify-*` directory was left in `$TMPDIR` after these runs.

VERIFY: PASS on the floor gates. This verdict covers only those gates and the live runs listed here.
