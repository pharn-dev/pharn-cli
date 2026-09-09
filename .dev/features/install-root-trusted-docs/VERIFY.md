# VERIFY — install-root-trusted-docs

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`failing_gates: []`. Whole-repo granularity, deliberately (P7): `npm test` is 56 files / **1126 tests**,
and the four `npm run check` gates plus `lint:md` run over the whole tree, so PASS means the repo is
clean **with this feature in it**, not merely that the changed files are.

No `structural:*` gate: this increment ships no committed expected↔actual eval pair (pharn is
TypeScript — its "evals" are vitest tests, collected by the `test` gate above).

**VERIFIED: floor gates PASS.**

### What the `test` gate is actually holding here

Worth naming, because the defect this increment fixes was *invisible to a green suite for its whole
life*. The old tests passed because the fixture invented `pharn/THREAT-MODEL.md` — a path pharn-oss has
never shipped — so writer and mirror agreed on dropping the same two docs and the mirror pin had
nothing to catch. The rewritten fixtures mirror the measured upstream shape, and the new assertions were
**demonstrated red against the old constant** before being accepted: reverting `PHARN_TRUSTED_DOCS`
alone (and nothing else) fails **5** tests —

- `layout: pharn resolves every runtime surface under pharn/, but the docs keep a per-DOC prefix`
- `install-manifest: mirrors every surface UNDER pharn/, all four trusted docs included`
- `install-capabilities: installs THREAT-MODEL.md and LIMITS.md at the project ROOT, from the clone root`
- `install-capabilities: reports the four docs it wrote, at their per-doc paths`
- `install-capabilities: never copies, expects, or reports a symlinked root LIMITS.md`

That falsification is what makes the green above mean something; a fixture rewrite plus an assertion
rewrite can otherwise land green while testing nothing.

The floor also caught the plan's one real omission on its own: `tests/docs-install-tables.test.ts`
derives its `REQUIRED` set from `layoutPaths('pharn').docs`, so correcting the constant immediately
turned `README.md never names \`THREAT-MODEL.md\`` red. The gate demanded the README fix; it was not
noticed by judgment.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone,
and no `claude -p` call was made.

## Honest residual (P0/P7)

**Verified = the named gates passed.** This is **NOT** a guarantee of correctness beyond what those
gates check — verifier concerns would be advisory help, not assurance, and there are none to report.

Two things the gates specifically do **not** cover, named rather than left implied:

1. **That the 186 citations now resolve is advisory.** The floor is only that the files exist at the
   project root. Nothing parses a citing file or follows a reference; the destination rests on the
   measured spelling counts in `PLAN.md`, which are evidence, not a check.
2. **Existing installs are untouched by any gate here.** `pharn status --strict` will newly report the
   two docs `missing` on projects installed by an earlier version, while `pharn update` early-returns on
   an unchanged `skillsVersion`. That behavior is correct and is documented in `CHANGELOG.md`
   (`--force` or re-`init`), but no test in this repo exercises the upgrade path of an already-installed
   project.
