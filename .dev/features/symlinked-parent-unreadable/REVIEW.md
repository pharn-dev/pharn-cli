# REVIEW — symlinked-parent-unreadable

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN** (exit 0, 0 capabilities — vacuous,
named as such). `/pharn-dev-verify`'s gate map is all-zero and `/pharn-dev-regress` returned
`no-regressions`. Everything below is **advisory**; the floor above is the only guaranteed part.

> **Trust (P2).** The increment is `trust: untrusted` to this stage. Nothing in it read as an
> instruction to me: the new prose is explanatory comments and user docs. The one imperative voice in
> the increment's neighbourhood (`prompts/4.03-…md`, "Do NOT touch the walk core") is the human's brief,
> not content the build produced, and it was treated as scope, not as a directive.

---

## Findings

### advisory-gate (warn) — L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'src/lib/apply-update.ts:66'
  problem: 'The reason string now always names the offending component, so `status` prints a stutter for the LEAF case it used to render cleanly — "CONSTITUTION.md — CONSTITUTION.md is a symlink" where it previously read "CONSTITUTION.md — the path is a symlink".'
  evidence: "return { kind: 'unreadable', reason: `${link} is a symlink` };  →  rendered by src/commands/status.ts:222 as `  ${rel} — ${reason}`"
```

Real and user-visible: the increment set out to make the report *more* honest and made one of its lines
read worse. The offender being the leaf is exactly the case where naming the component adds nothing —
the rel is already the line's first half. Fix is local to the classifier: keep `the path is a symlink`
when the walk's answer IS the rel, and name the component otherwise. Advisory, not floor-gate: no
guarantee rests on the wording, and every existing test passes either way (they match `/symlink/`).

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/symlink-guard.ts:43'
  problem: 'The corrected docstring claims every caller guards the ENOTDIR throw, naming `backup.ts` as "already inside a try" — but `createBackup`\'s call sits in no try, so an ENOTDIR there propagates as a raw fatal rather than the typed refusal the sentence implies.'
  evidence: '"Each caller guards it — `readDiskState` wraps the call and returns its `unreadable` terminal, `applyWrites` and `backup.ts` are already inside a try that becomes their own error."'
```

Verified at `src/lib/backup.ts:72-82`: the walk is called directly in the copy loop, and the enclosing
`runUpdate` only has the reporter's outer catch. The path is **unreachable in practice** — a file only
reaches `plan.backups` after `readDiskState` classified it `file`, which now implies its components are
walkable — but that is an argument the docstring does not make, and it was the increment's own
P0-discipline correction that introduced the imprecision. Worth fixing precisely because this file is
where the "never throws" claim was just struck for being false.

### No findings — L-eval → P1

Every new behavior ships a test in the same increment: three `readDiskState` parent cases, the walk's
ENOTDIR throw pinned directly (the fact the guard exists for), the read-side twin in `diff.test.ts`, and
the end-to-end resolving run. The two reworked partial-failure tests keep every original assertion,
including `readRecords(proj) === {kind:'absent'}`. The deleted leaf branch loses no coverage: both leaf
symlink cases still pass, now answered by the walk. Measured coverage over the touched module leaves
only the pre-existing `sha256File` catch uncovered — no new unreachable arm, which was the point.

### No findings — L-trust → P2

The walk returns a POSIX path accumulated from a manifest-derived `rel` (clone-side names already
validated by `CAPABILITY_NAME_RE` / `COPY_FILENAME_RE`), and it reaches exactly two sinks: the
`unreadable` reason under the `UNREADABLE` skip heading and `status`'s drift line. No decision anywhere
reads that string — the branches are `link !== null` and `state.kind`, both membership tests. No file
content under a symlinked path is read: the classification happens before `sha256File`. No new fetch,
no new write, no allowlist relaxed.

### No findings — L-axis → P3

`apply-update.ts` gains one call to a module it already imported; `diff.ts` and `symlink-guard.ts` are
comment-only. No command imports a command, and the structural anti-fork pin
(`tests/symlink-guard.test.ts:199`) is still green — the walk was reused, never forked. `update` and
`status` inherit the fix with **zero** call-site changes, which is the cleanest evidence the axis held.

---

## What the increment gets right (recorded, not padded)

The fix is the small one: one shared walk, run at the one classifier both readers already go through.
The write-side backstop stays with a comment explaining *why* duplication is correct here (TOCTOU),
rather than being deduplicated into a false economy. The two rework mechanisms are chosen per decision
row rather than copied, and each carries the reason it cannot be the other one — which is exactly the
trap the brief flagged.

## Verdict

**GREEN — 0 floor-gate findings; 2 advisory findings (1 important, 1 minor), both local to wording.**
Advisory means advisory: this is not a certification that the increment is correct beyond what the
gates in `VERIFY.md` checked.

## Proposed lesson (candidate only — NOT written to canon here)

- **Candidate:** "When a classifier gains a shared check that also covers a narrower existing check,
  delete the narrower one — an unreachable arm is a coverage debt and a lie about what is enforced —
  and re-read the *rendering* of any message the change re-words."
- **Provenance:** this increment, commit `4cc8dc8`, `src/lib/apply-update.ts` (leaf branch deleted;
  leaf reason string stuttered at `src/commands/status.ts:222`); surfaced by `GRILL.md` finding 1 (the
  dead-arm trade) and this review's finding 1.
- **Status:** proposed. Promotion is a separate human-gated `/pharn-dev-memory-promote` run — this stage
  writes no canon.
