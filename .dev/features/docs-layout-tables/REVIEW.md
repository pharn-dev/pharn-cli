# REVIEW — docs-layout-tables (advisory)

Four lenses. Floor findings would block; none are floor findings — every gate is green
(`regression-report.json` `no-regressions`, `verify-report.json` `PASS`).

## Lens 1 — guarantee honesty (P0)

The increment's own claim is narrow and stated as such: the new test pins the SET OF PATHS the two
tables name, derived from `layoutPaths('pharn')`. It does not read a description, does not notice an
extra row, and does not cover `docs/commands/*.md`. That is written into `PLAN.md`'s guarantee audit
in the negative, which is the form that matters.

The doc prose itself was held to the same standard. Two places where a confident sentence would have
been wrong now carry the condition instead: the trusted-doc row says which two docs land today and
why the other two might not, and the flat note says flat "ships no `pharn-core/`" rather than
asserting a mirrored root copy. **Advisory:** the phrase "upstream still keeps those two at the repo
root" is a statement about a moving target — true at `2e183e6`, and it will read as stale rather than
wrong once upstream relocates them. The surrounding sentence is conditional, so the failure mode is
mild.

## Lens 2 — one axis (P3)

`tests/docs-install-tables.test.ts` holds one axis: *do the two install tables name the paths the
installer writes?* It borrows the installer's own resolver instead of restating it, so there is no
second copy of the path knowledge to drift — the same discipline `install-manifest.ts` applies to
`install-capabilities.ts`.

The doc edits respect the existing division of labour rather than widening cells: `init.md`'s
per-layout paths moved OUT of `Copy product surfaces` and INTO `Mirror the layout`, the row that
exists to say which layout was mirrored. **Advisory:** `status.md`'s compared-set sentence now names
both layouts inline and runs four lines; it is the longest sentence in that file. Acceptable, because
the alternative — naming one layout — is the defect being fixed.

## Lens 3 — reuse over restatement (P4)

Required paths come from `layoutPaths('pharn')`, forbidden ones from `layoutPaths('flat')`,
`PHARN_CONFIG_FILE` from `install-manifest.ts` and `RECORDS_FILE` from `install-records.ts` — five
existing exports, zero new literals. Renaming `PHARN_FLOOR_DIR` therefore fails this test until both
docs follow, which is the entire point.

The doc row set was not copied from the brief either: it was derived by executing
`collectExpectedInstallPaths` against a live upstream checkout. That is how `features/README.md` — in
neither table and in the brief's explicit "do not add" list — was caught as a genuine omission.

## Lens 4 — legacy honesty (P7)

`flat` is still real and the docs still say so: `configLayout` defaults anything non-`'pharn'` to
`flat`, an old pinned SHA still mirrors flat, and both notes describe flat as the legacy variant with
its concrete paths — never as removed. No source file was touched, so no behavior moved under a doc
change.

**Advisory (not this increment's):** `docs/reference/pharn-records.md:24` still shows a root
`CONSTITUTION.md` key in its example store. It is a schema illustration rather than an install claim,
and rewriting it would widen this diff into a fourth file for no gate's benefit — but it is the last
flat-first example a reader is likely to hit.

## Floor vs advisory

- **Floor (blocking):** none. Six gates green at base and head; `verify` PASS.
- **Advisory:** three notes above (moving-target phrasing, `status.md` sentence length,
  `pharn-records.md` example). None blocks; all are recorded rather than fixed.
