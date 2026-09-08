# VERIFY — npm-run-dev

**FLOOR layer** — `check-verify.mjs` over the six gates: all exit 0 → **`PASS`**, `failing_gates: []`.
`npm run build` also runs clean (a seventh gate CI runs; not part of check-verify's set here).

**ADVISORY layer** — zero `role: verifier` capabilities exist (P7).

**What the PASS covers, and what it does not.** The new test pins the script's spelling. It does not
execute the CLI — grill F2. That gap was closed by hand, outside the suite, and the evidence is
worth recording:

```
$ npm run dev -- --help
Pharn - Installs PHARN (an audit-grade methodology for Claude Code) into your project. …

$ npm run dev -- list --json      # in an empty temp dir
No pharn.config.json found. Run `pharn init` first.
```

Both subcommands reached minimist through `--`, which is the behavior the docs promise. This is a
manual observation, not a gate: nothing re-runs it on the next PR.
