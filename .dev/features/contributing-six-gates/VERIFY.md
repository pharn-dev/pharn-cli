# VERIFY — contributing-six-gates

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**. `npm run build` clean.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**The demonstration that matters.** A composition pin can pass while the composed command does
nothing. So `check` was run against a planted markdown error:

```
$ printf '\n#  bad heading with two spaces\n' >> docs/troubleshooting.md
$ npm run check ; echo $?
1
$ git checkout docs/troubleshooting.md && npm run check ; echo $?
0
```

Before this change that same planted error left `npm run check` green — which is precisely the bug
report: a contributor editing docs passes every documented gate and still gets a red required
`Markdown lint`.

**What PASS does not cover.** `check` is still not CI: it skips `build` and runs `test` rather than
`test:coverage`, so coverage thresholds are unenforced locally. Both divergences are pinned as
explicit assertions in `tests/check-composition.test.ts` and stated in every doc that describes the
command — grill F1 is the reason that wording was treated as the increment's main risk.
