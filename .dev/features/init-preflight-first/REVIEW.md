# REVIEW — init-preflight-first

Increment: `preflightInstall` (`src/steps/install-archetype.ts`), a thin call to the existing,
read-only `prepareInstall` over the manifest `init` already builds. `init` now calls it after that
manifest and before `confirmWriteTargets`. A project the install cannot finish in is therefore
refused before the user is asked "Continue and overwrite?", not after they answer yes. Tests in two
files, two docs pages, CLAUDE.md, and one existing CHANGELOG entry extended.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1666 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)** — "an install the pre-flight refuses never shows the overwrite prompt" reduces
  to the call order in `init.ts` plus two tests:
  - a unit case that pins the order and the refusal (exit 1, no prompt, no install, the clone
    cleaned up before the report, the message on stderr);
  - a whole-`runInit` case over a real re-install with a type collision.

  "A refused install writes nothing" still rests on the lock-time checks, which are unchanged; the
  plan, the code comment, the docs and CLAUDE.md all name those as the authoritative ones.
- **L-eval (P1)** — all three new cases failed on the unchanged code. The whole-`runInit` case
  failed because the overwrite warning was shown before the refusal.
- **L-trust (P2)** — no new input. The early run reads the same destination paths the lock-time run
  reads, and its message reaches the one fatal sink (`logError` → `terminalSafe`), as before.
- **L-axis (P3)** — `preflightInstall` lives in the step module `init` already imports.
  `init.ts` still imports no `*manifest.js` (static guard green) and does not import
  `install-capabilities.js`.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/init.ts:268'
  problem: 'PRE-EXISTING, not introduced here. A pre-flight refusal is a ManifestValidationError, so it is reported as a failure and ends with the PHARN_DEBUG hint, although it already names its fix ("Move or rename the named entries"). The lock-time refusal has always done the same; this increment only makes it arrive earlier. Treating it as a policy refusal (no hint) would change the documented list of what prints the hint, so it is left for its own increment.'
  evidence: 'else failure = { err };'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/init-archetype.test.ts'
  problem: 'The whole-runInit case covers a type collision only. A symlink on the way reaches the same prepareInstall call and is covered by that function''s own cases; no separate whole-run case was added (P7).'
  evidence: 'refuses a project it cannot install into BEFORE asking to overwrite anything'
```

## Grill findings — how each was folded in

- Claim scoped to the overwrite prompt: the docs say "after you choose **install**, and before it
  asks to overwrite anything". The cancelled-summary case now also pins that no pre-flight runs.
- Why all three runs stay: named in `preflightInstall`'s doc comment, in init's comment and in
  CLAUDE.md ("keep all three").
- Report shape pinned: the refusal case asserts stderr and that cleanup ran before the report.
- CHANGELOG: the existing `[Unreleased]` entry was extended; no second entry.

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor; one pre-existing).** The standing decision is
the human's (GATE 2).
