# REVIEW — symlink-guard-core

Increment under review: `trust: untrusted` (per this stage's discipline, even though trusted
`/pharn-dev-build` produced it). Diff: 2 new files + 6 edited, `src/lib/symlink-guard.ts` +
`tests/symlink-guard.test.ts` new; `backup.ts`, `apply-update.ts`, `install-manifest.ts`,
`validate.ts`, `tests/validate.test.ts`, `CLAUDE.md` edited.

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` → **`FLOOR: GREEN — 0 capabilities checked`**, exit 0. The increment
reached review legitimately. Everything below this line is **advisory**.

(Honest note carried from `/pharn-dev-verify`: `validate` is green *vacuously* here — it checks markdown
capabilities and this repo has none. It gates nothing about the TypeScript under review.)

---

## Floor-gate findings (blocking)

**None.** No guarantee in this increment lacks a floor reduction or an `advisory` label; no eval
binding is missing (no Capability is added); no guaranteed decision rests on a tainted field; no
sibling import was introduced.

---

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'tests/symlink-guard.test.ts:176'
  problem: 'The anti-fork pin is honestly scoped in its own comment, but nothing outside that comment stops a future reader from citing a green run as proof that no fourth walk exists — the narrowing lives only in prose.'
  evidence: '"It does NOT catch a fork respelled as `current += ''/'' + segment`, `[current, segment].join(''/'')`, or via `path.posix.join`."'
```

Advisory and, in my judgement, **acceptable as shipped**. The narrowing is stated in three places (the
test comment, the plan's guarantee audit, `VERIFY.md`), which is the standard this repo applies to
labeled limits. Recorded so the claim's width stays visible if the pin is ever cited in isolation.

Positively: the L-floor lens found the increment's guarantee discipline **stronger after the grill
than the originating build prompt specified** — invariant 2 moved from a one-shot grep (advisory) to a
byte-exact test assertion (floor), and the anti-fork claim was narrowed to what its instrument proves
rather than left at "no fourth fork".

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/backup.ts:106'
  problem: 'Two lines in the touched files remain uncovered, and while both sit in functions this diff never edits, the increment does not record that fact anywhere durable.'
  evidence: 'coverage: backup.ts 96.77% stmts (line 106), apply-update.ts 96.87% stmts (line 67)'
```

Verified not a regression: `backup.ts:106` is `uniqueBackupDir`'s collision-exhaustion throw and
`apply-update.ts:67` is `readDiskState`'s unreadable-file catch — **neither appears in any diff hunk**
(`git diff --unified=0` hunks are at `backup.ts` 3/75-82/96-116 and `apply-update.ts` 4/95-104/116).
A diff that does not touch a line cannot have reduced its coverage.

Otherwise this lens is clean and the increment is **above** the bar: no Capability is added, so no
`enforces`/`rule_id` binding is owed, and the floor agrees (`0 capabilities checked`). Every new
behavior ships its test in the same increment — `findSymlinkComponent` (10 cases), `toPosix` (7),
the two message pins, the anti-fork pin — with `symlink-guard.ts`, `validate.ts` and
`install-manifest.ts` all at **100%** statements/branches/functions/lines.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/symlink-guard.ts:40'
  problem: 'The returned component is interpolated verbatim into a user-facing error message, and for the manifest callers that string can originate in an untrusted clone''s directory names, so a name carrying terminal control sequences would reach the terminal unsanitized.'
  evidence: 'return current;  // → `Cannot back up ${rel}: ${link} is a symlink.`'
```

**Pre-existing, not introduced** — all three deleted walkers interpolated `current` identically, so
this diff changes the exposure not at all. Raised because the refactor **centralizes** it: there is
now exactly one place a future sanitizer would go, which is the cheapest this will ever be to fix.
Scope is genuinely narrow (capability names pass `CAPABILITY_NAME_RE`; `paths.docs` are constants), so
I would not block on it — it is a note for the human, not a defect of this increment.

**Did instruction-looking content change my behavior?** No. The `PLAN.md` and `GRILL.md` I read this
run are `trust: untrusted` to their consuming stages; nothing in them, nor in any reviewed source
file, attempted to redirect a stage. No injection attempt was found.

**Taint propagation is unchanged and correct:** `base`/`rel` may be untrusted, the returned string is
**data** consumed by exactly two things — message interpolation and a `!== null` test — and is never
executed. No guaranteed decision anywhere in this increment rests on a free-text field.

### L-axis → P3

> **RESOLVED after review, at the human's instruction (GATE 2).** The comment was rewritten to state
> that `toPosix` converts the **platform** separator — splitting `a\b\c` into three components on
> win32, and deliberately leaving it as one opaque segment on posix where a backslash is a legal
> filename character — with only the trailing-slash strip named as cross-platform. Both floor
> verdicts were **recomputed against the fixed bytes** rather than inherited: `/pharn-dev-verify`
> `PASS` (all five gates 0) and `/pharn-dev-regress` `no-regressions` (exit 0). The finding is left
> below in full, as the record of what was found.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'src/lib/validate.ts:128'
  problem: 'The toPosix comment states that a backslash-separated rel walks the same components as its posix twin, but on a posix platform `sep` is "/" so a backslash string is left entirely untouched and is never split into components — the comment documents behavior the code does not have on the platform most readers will run.'
  evidence: '"Shared by the install manifest''s map keys and by symlink-guard.ts, which normalizes before splitting so a caller passing a `\\`-separated rel walks the same components as its posix twin."'
```

**This is a real defect introduced by this increment, and it is the one item I would fix before
merge.** Verified live rather than reasoned: with `sep === '/'`,
`toPosix(String.raw`a\b\c.md`)` returns `a\b\c.md` unchanged — one opaque segment, not three
components. The claim holds only on win32. It matters more than a typo because it sits in the file
`CLAUDE.md` labels security-sensitive, describing a normalization that feeds a security guard, and
because P4's rule is precisely "never document behavior the code does not have."

The increment's *tests* get this right — `tests/symlink-guard.test.ts` pins the posix reality
explicitly ("a backslash rel is one opaque segment on posix") and says so at length. Only the
`validate.ts` comment overstates. Suggested correction: say that `toPosix` normalizes the **platform**
separator, so a win32-style rel is split on win32 while on posix a backslash is a legal filename
character and is deliberately left alone.

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/validate.ts:123'
  problem: 'validate.ts now hosts a normalization helper alongside its validation primitives, which is a different verb even if both are lexical path work.'
  evidence: '"// Normalize a dest/relpath to a posix, no-trailing-slash key. Purely LEXICAL"'
```

Raised at the grill, argued in the plan, and **explicitly chosen by the human** at HALT 1 over the two
alternatives (a circular import, or a duplicated helper in a de-duplication PR). I judge the placement
correct — `safeJoin` already establishes lexical path handling as this file's axis, and P3's test is
"what forces this file to change", to which both answer "the lexical path rules". Recorded for the
record, not as a defect.

**No sibling-import violation.** All new edges are `lib/` → `lib/`, which P3 permits (it forbids
command→command and step→step): `symlink-guard.ts → validate.ts`, and
`{backup, apply-update, install-manifest}.ts → symlink-guard.ts`. No cycle exists — the `toPosix`
relocation to `validate.ts` is precisely what prevents the `install-manifest ↔ symlink-guard` cycle a
naive extraction would have created. Typecheck and the full suite passing confirm it.

---

## Behavior-preservation audit (the increment's own headline claim)

Checked line-by-line against the diff, since "byte-preserving refactor" is the claim everything else
rests on:

| site                 | preserved                                                                                          | verdict |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `backup.ts`          | `action` had exactly one call site (`back up ${rel}`), so inlining reproduces `Cannot back up ${rel}: ${link} is a symlink.` exactly; the guard still precedes the disappeared-check; `ManifestValidationError` unchanged | ✅ |
| `apply-update.ts`    | refusal stays **inside** the `try`, so the `catch` still wraps into `ApplyError` carrying `written`; `safeJoin` → guard → `mkdirSync` → `copyFileSync` order unchanged | ✅ |
| `install-manifest.ts`| both call sites keep their skip semantics (`return` at the capability dir, `continue` at the trusted doc) | ✅ |
| empty-segment handling | old apply used `.filter(s => s.length > 0)`, old backup/manifest used `if (!segment) continue` — the core keeps the latter; semantics identical | ✅ |
| nonexistent-tail pass | preserved and now **documented + pinned**, where before it was an undocumented consequence of `throwIfNoEntry: false` | ✅ |
| `toPosix` convergence | backup/apply now normalize where they previously split raw. On posix this is a **no-op** (trailing-slash strip only, and their inputs carry none); on win32 it is a real, strictly-safer widening | ✅ |

The one deviation from the plan's text is documented in it: the "backslash walks like its posix twin"
pin was **not achievable on posix** and was replaced with a pin on the actual posix behavior. The
build recorded that rather than quietly writing a tautological assertion — which is the right call,
and the reason the L-axis finding above is a stale *comment* rather than a false *test*.

---

## Proposed lesson for canon (NOT written here — P2)

`/pharn-dev-review` writes no canon. Proposing **one** candidate for a separate, human-gated
`/pharn-dev-memory-promote` run:

- **Lesson (proposed):** *Verify that a test instrument pins what it claims, not merely that a pin
  exists.* This increment's plan specified "byte-exact" message pins via `toThrow('…')`; the installed
  `@vitest/expect` computes `actual.includes(expected)` for a string matcher, so the assertion was a
  **substring** test and could not have delivered byte-exactness. The plan's guarantee audit had
  already upgraded that invariant from advisory to floor on the strength of the unverified instrument
  — the P0 disease reproduced one layer down, at the test rather than the claim.
- **Provenance:** increment `symlink-guard-core`; caught by `/pharn-dev-grill`
  (`.dev/features/symlink-guard-core/GRILL.md`, finding P1/important) against
  `.dev/features/symlink-guard-core/PLAN.md:189`; corrected in `tests/symlink-guard.test.ts` (assert on
  `.message` with `toBe`); receipt `node_modules/@vitest/expect/dist/index.js:1295`.
- **Why it generalizes (P7 — real, not hypothetical):** it already fired once here, and the same shape
  recurs wherever a matcher is *assumed* to be strict (`toContain` vs `toEqual`, `toMatchObject` vs
  `toEqual`, a regex without anchors). The general rule — a claim of exactness must be checked against
  the matcher's actual semantics — is what makes "tests are the spec" (P1) trustworthy.

---

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory findings (1 important, 4 minor).**

The increment does what it set out to do: three duplicated component walks collapse to one shared
core with 100% coverage, every call site keeps its exact failure shape, the thrice-repeated `/tmp`
rationale collapses to one doc-comment, and the guarantee discipline came out of the loop *stronger*
than the originating prompt specified (a real byte-exact pin, a narrowed anti-fork claim, a `toPosix`
relocation forced by a measured circular import rather than by taste).

**The one item flagged for fixing before merge — the `validate.ts:128` `toPosix` comment (P4,
important) — was fixed at the human's instruction at GATE 2**, and both floor verdicts were
recomputed against the corrected bytes rather than carried over. No advisory finding remains open
except the four minor ones above, each of which is recorded as accepted-as-shipped with its reason.

This is a review, not an approval: GREEN means no blocking floor-gate finding was found by these four
lenses, **not** that the increment is correct beyond what the floor checks (P0). The merge decision is
the human's.
