# VERIFY — core-386-unpack-listed-paths-only

| Gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |
| build        | 0    |

Verdict `PASS` (`check-verify.mjs`): 106 files, 3,662 tests, coverage 98.59 / 95.75 / 99.08 / 99.08 (floors
90/85/90/90). No verifier capabilities exist, so no advisory layer ran.

End to end (manual, not a gate): the built `dist/index.js` ran `init --yes`, `status` and `update --yes` in throwaway
projects against the real pharn-oss archive on the default channel (release v7.25.5, commit `1755d6b8`) and on
`--ref main` (commit `a2cacaef`); both archives hold 7 symlinks under `.claude/skills/`. All exit 0, 592 files, "No
drift", "Up to date", no symlink in the project. The 0.21.5 build refuses the same archive with
`tar entry has an unsupported type '2': …/.claude/skills/pharn-ci-cover`.

The named gates passed; this is not a claim that the feature is correct beyond what they check.
