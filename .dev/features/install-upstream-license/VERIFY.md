# VERIFY — install-upstream-license

- verdict (FLOOR, `check-verify.mjs` exit 0): **PASS** — `test` (1052), `validate`, `lint`,
  `format:check`, `lint:md`, `typecheck` all exit 0. `count-verifiers.mjs` → 0 registered.

## What this does and does not guarantee

Guaranteed: the gates passed, and the mapping is pinned in both layouts — including the one that
matters most, that a project's own root `LICENSE` is byte-identical after `init`. That test was
verified to FAIL when the copy destination is switched to the identity mapping, which is exactly the
trap the obvious version of this change walks into.

**Not** guaranteed, and not claimed: that an initialized repo is license-compliant in general. No
`NOTICE` is generated and no per-file attribution headers are injected — the CLI copies contents
verbatim and never rewrites them, so any inline notice must originate upstream. Nor do existing
installs receive the file: the same `SKILLS_VERSION` early-return window applies, named in the
CHANGELOG rather than worked around.
