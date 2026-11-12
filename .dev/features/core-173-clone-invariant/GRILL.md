# GRILL — core-173-clone-invariant

- plan: `.dev/features/core-173-clone-invariant/PLAN.md`
- spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e` = the plan's `spec_content_hash` → **no drift** (content-hash, surfaced here; `/pharn-dev-build` enforces it).
- registered grillers (`count-grillers.mjs`): `{"registered":0}`, so the inline axes only.
- ADVISORY: this log gates nothing.

## Findings

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/core-173-clone-invariant/PLAN.md:31"
  problem: "The plan drops O_NONBLOCK from capability-index's OPEN_FLAGS but deletes only the symlinked-markdown test; the FIFO test at tests/capability-index.test.ts:360-371 (mkfifo in a fake clone) would then block open(2) synchronously and hang the test worker."
  evidence: "`OPEN_FLAGS` (`:162-168`) → `O_RDONLY` only … DELETE the symlinked-markdown case (`:353`)"
```

Resolution for build: delete the FIFO case too. A FIFO in a fake clone violates the stated invariant, the same category as the symlink cases.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/core-173-clone-invariant/PLAN.md:63"
  problem: "The 'only files and dirs' property test, run over an archive of files and dirs, is close to tautological; it pins little beyond what the typeflag it.each already does."
  evidence: "extract a representative archive and walk `destDir` with `lstat`, asserting every entry `isFile() || isDirectory()`"
```

Suggestion: also run it over the real-shaped `codeloadArchive` fixture (`tests/support/tar-fixture.ts`), and over an archive whose LAST entry is refused (symlink typeflag), asserting that the partial tree left before the throw holds only files and dirs.

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/core-173-clone-invariant/PLAN.md:82"
  problem: "The premise 'fetchRepo is the only producer of repoDir' is checked only by a one-off grep at build time; nothing lasting fails if a future caller hands a non-fetchRepo directory to a clone-side reader."
  evidence: "Pinned by: (a) `fetchRepo` being the only exported producer (grep at build, plus a sentence in the `FetchedRepo` doc)"
```

For the human: accept it as advisory (the plan labels it a derivation, which is honest), or add a cheap static test, e.g. that no `src/` file other than `repo.ts` calls `mkdtempSync` / `extractTarGz`. Recommended: the static test. It is about 15 lines and makes the premise floor-checked.

### Docs cite code (P4)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/core-173-clone-invariant/PLAN.md:72"
  problem: "The CLAUDE.md edit list names four spots, but CLAUDE.md states clone-side symlink handling in more places (add's 'The scan SKIPS an absent/symlinked/non-dir source', absentInstallSurfaces' 'missing, symlinked, wrong type', the manifest's 'symlink-guarded' copy wording); the uncaught ones would describe deleted behaviour."
  evidence: "`CLAUDE.md` — the `lib/install-capabilities.ts` paragraph … the hook-wiring sentence … the `capability-index` read description … and the `fresh init` HOOKS sentence"
```

Resolution for build: grep CLAUDE.md, SECURITY.md and `docs/` for `symlink` / `O_NOFOLLOW` / `noSymlinks` / `pax` and fix every CLONE-side statement. Leave the project-side ones alone.

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/core-173-clone-invariant/PLAN.md:70"
  problem: "THREAT-MODEL.md §2 already disagrees with the code (it lists typeflag 'x' under SKIP, while tar-extract refuses it); the patch should correct that bucket explicitly rather than only adding the new rules."
  evidence: "§2 fetch-boundary bullets (pax: `x` refused on typeflag, `g` skipped unparsed; …)"
```

### Trust (P2), one axis (P3), determinism (P5), scope (P7)

- P2: no finding. The plan keeps the escaped refusal message (GATE-1 decision), and fewer untrusted bytes are parsed.
- P3: no finding. Each file keeps one reason to change. The `hook-wiring.ts` read merge reduces two code paths to one.
- P5: no finding. Every new branch is a character or typeflag membership test.
- P7: no finding. The trigger is a reproduced review finding (`a\..\..\evil`). Keeping `readMinCli`'s code (Finding 6) is a justified narrowing of the ticket, not speculation.

## Summary

The plan is grounded in the live tree: line numbers re-measured, C5.4 checked, the F-19 filter trap and the trim/`0xA0` gap found. The concrete gap is the FIFO test in `capability-index.test.ts`. Removing `O_NONBLOCK` while that test stays would hang the suite, so it must be deleted together with the flag. The rest concerns completeness: a lasting check that `fetchRepo` is the only producer, a stronger property test, and a full sweep of the clone-side wording in `CLAUDE.md`/`SECURITY.md`/`docs`.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor). For the human to weigh before /pharn-dev-build. The build will apply the FIFO deletion, the docs sweep and the stronger property test as plan-consistent corrections, and will add the static producer test.
