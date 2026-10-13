# REVIEW — crlf-tolerant-hashing

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment; the deterministic gates that matter are `/pharn-dev-verify`'s). The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff origin/main..HEAD` after rebasing onto `6dae4fe` — `src/lib/hash.ts`, the six call-site swaps (`apply-update.ts`, `diff.ts`, `update-plan.ts`, `dest-drift.ts`, `install-records.ts`, `removal-backup.ts`), `tests/hash.test.ts` (new), the CRLF cases in seven test files, the `sha256File` → `contentHash` record-helper renames in seven more, and the docs named in the plan.

Dist smoke, run by hand against live pharn-oss `main` (advisory evidence, not a gate): `pharn init` (driven through a pseudo-TTY) in a scratch git project, commit with `core.autocrlf=false`, delete the 589 tracked files and re-check them out with `git -c core.autocrlf=true checkout -- .` (`pharn/CONSTITUTION.md` then holds 153 CR bytes). `origin/main`'s build: `status --strict --json` exit 1, `drift.okCount` 0 (every file differing); with the stamp moved back one version, `update --dry-run --json` planned `skipped: 575` (all `modified`). This branch's build: `status --strict --json` exit 0, `okCount` 588, `modified` 0; `update --dry-run --json` planned `ok: 588, skipped: 0`. (575 vs 588: origin/main at that moment had #275, which stops installing the floor's `fixtures/`.)

## Floor-gate findings (blocking)

None.

- L-floor (P0): the content-identity claim reduces to a deterministic hash of the bytes (ARCHITECTURE §2 #2), the text/binary rule to a byte-membership test on a fixed 8000-byte prefix; both are demonstrated by `tests/hash.test.ts`, including a differential test against pharn-oss's own fold expression. The one claim that is NOT a floor — "a Windows / `core.autocrlf` checkout no longer reads as modified" — is labelled as tested on Linux only, in `hash.ts`, troubleshooting, contributing, CLAUDE.md and the CHANGELOG. The reason the 8000-byte rule is safe (git does not convert NUL-bearing content) is labelled ADVISORY in the `hash.ts` comment. The invariant "every comparison uses `contentHash`" is pinned by a static test (GRILL P0), which matters because other branches in flight add hashing sites.
- L-eval (P1): every new behaviour has a test — 17 unit tests for the primitive, CRLF cases for status drift (incl. a real `git -c core.autocrlf=true` checkout, GRILL P1), the update plan (upgrade / no-op / still-modified), dest-drift (plain and records-baseline), the removal backup set, `buildRecords`, and one `runRemove` integration case. A real content change in a CRLF file is asserted to stay `modified` at every layer.
- L-trust (P2): the only new input handling is hashing bytes of project files and of the (untrusted) clone; nothing is parsed, executed or path-joined, containment and symlink guards are untouched (the swaps are identifier-only, line-count-neutral in `apply-update.ts` and `diff.ts`).
- L-axis (P3): `hash.ts` keeps one axis (how content identity is computed); the call-site files each changed only the function they call. No command file and no command→command import changed.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/lib/update-decision.ts:67'
  problem: 'The decision-table comment still says "byte-identical"; with folded hashes row 2 now means identical content (CRLF vs LF in text aside). update-decision.ts was deliberately left out of the plan (it is pure over hashes), so the wording was not touched.'
  evidence: 'Row 2 deliberately precedes the record rows: a file already byte-identical to'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'THREAT-MODEL.md:224'
  problem: 'THREAT-MODEL §4c says "A file already byte-identical to upstream is never skipped" and cites line numbers that had already drifted (diff.ts:79 is now right by accident; apply-update.ts:44 and :57-61 are not). It is a human-only trusted doc; replacement text is handed over at GATE 2.'
  evidence: 'A file already byte-identical to upstream is never skipped even with no records'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'LIMITS.md:182'
  problem: 'LIMITS.md names no line-ending limit, yet the fold introduces one (a CRLF<->LF-only edit is invisible and can be overwritten or deleted without a backup) and the fix is unverified on Windows. Human-only file; proposed §3f text handed over at GATE 2.'
  evidence: '## 4. What "good" means here'
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'src/lib/hash.ts:54'
  problem: 'A NUL-free binary file is folded like text, so two such files that differ only in CRLF vs LF bytes hash equal. Upstream ships no binaries today (measured: 0 NUL bytes in 2907 files) and both sides are folded identically, so nothing is overwritten wrongly; stated in the troubleshooting section, noted here for the record.'
  evidence: 'export function contentHashBytes(buf: Buffer): string {'
```

## Lesson candidate (proposed only; promotion is a separate human-gated `/pharn-dev-memory-promote`)

None. The one recurring pattern here (a security/identity invariant that held only "today" until pinned by a static test) is already canon in spirit (`tests/diff.test.ts` "owns no disk or hash primitives of its own"); no new lesson is proposed.

## Verdict

GREEN — 0 floor-gate findings; 4 advisory (minor) findings, two of which need a human edit to a trusted doc (text handed over at GATE 2).
