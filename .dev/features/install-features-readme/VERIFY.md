# VERIFY — install-features-readme

- verdict (FLOOR, `check-verify.mjs` exit 0): **PASS** — `test` (1034), `validate`, `lint`,
  `format:check`, `lint:md`, `typecheck` all exit 0.
- `count-verifiers.mjs` → 0 registered; floor gates only.

## What this does and does not guarantee

Guaranteed: the six gates passed, and the tests demonstrate the file is installed at the project root
in BOTH layouts, omitted when the clone lacks it, and refused when it — or its `features/` parent — is
a symlink. The parent case was measured before it was written and proven to FAIL without the guard.

**Not** guaranteed: that an existing install receives the file. A CLI-side install-set change does not
move upstream's `SKILLS_VERSION`, so `pharn update` still early-returns "Already up to date" at an
equal version while `pharn status` reports the file `missing`. That window is named in the CHANGELOG
with both exits, and was deliberately NOT closed by letting a restore-only plan through the version
gate — that would be a change to `update`'s contract.
