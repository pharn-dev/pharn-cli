# REVIEW — pax-fail-closed

Floor first (P0): `node .dev/floor/validate.mjs .` → **GREEN**, exit 0. The increment was entitled to
reach review. Everything below the floor line is **advisory**.

The reviewed increment is `trust: untrusted`. Nothing in it read as an instruction addressed to the
reviewer; the pax payloads in the fixtures are adversarial _data_ by design and were treated as such.

---

## L-floor → P0 — no floor-gate finding

Every claim the increment makes is either reduced or labeled:

- "a per-file `x` header never reaches a write" → **floor, enum check**. `typeflag === 'x'`
  (`src/lib/tar-extract.ts:334`) throws before the file/dir sort, before the path rules and before
  any `writeFileSync`. Verified by construction: the branch precedes `resolveEntryPath`.
- "a `g` cannot silently set a `path`/`linkpath`/`size` default" → **floor, enum membership** over
  `PAX_OVERRIDE_KEYWORDS` (`src/lib/tar-extract.ts:132`), an exact string compare against the raw
  keyword bytes.
- "still accepts every real codeload archive" → correctly labeled **advisory** in `PLAN.md`. It has
  since been strengthened from an argument to a measurement: the live
  `codeload.github.com/pharn-dev/pharn-oss/tar.gz/refs/heads/main` archive (1,968 entries,
  11,192,320 uncompressed bytes) was run through the built extractor and extracted cleanly, 25
  top-level entries. Still advisory — it measures one archive at one commit — but it is now measured
  rather than reasoned.
- "the error is diagnosable in one read" → **advisory**, backstopped by a test asserting the typeflag
  and keyword appear.

The one thing worth naming as a strength rather than a finding: the `x` decision consumes **no**
untrusted bytes. The payload is parsed only _after_ the throw is decided, to build a message. That
is the difference between a check an attacker can attempt to confuse and one they cannot reach.

## L-eval → P1 — one minor finding

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/tar-extract.ts:191'
  problem: 'The keyword-elision branch has no test — no fixture supplies more than eight distinct pax record keywords, so the "(+N more)" arm of describeKeywords never executes in the suite.'
  evidence: 'const more = new Set(keywords).size - shown.length;'
```

**Advisory, not blocking.** The branch decides only how an error message is truncated; it cannot
change what is refused or what is written, and every security-relevant branch this increment adds
does have a demonstrating test.

> **RESOLVED after this review.** It was recorded rather than fixed because `/pharn-dev-review` does
> not edit built files, and re-opening the build would have invalidated the `/pharn-dev-verify`
> verdict already recorded against those bytes. The human then re-opened the increment anyway to add
> `SECURITY.md`, which re-measures the verdict regardless — so the objection lapsed and the test was
> added: `caps how many keywords it names, so a padded payload cannot flood the message`. Verified to
> have teeth by removing the cap from `describeKeywords`, at which point exactly that one test fails.
> Branch coverage on this file moves 92.22 → 93.33.

Coverage confirms the rest: `src/lib/tar-extract.ts` reports uncovered lines **120, 238, 253** only —
the non-octal numeric throw, the empty-path throw and the no-leading-component throw, all three
**pre-existing** and none touched by this increment.

The eval set was checked for teeth rather than presence: run against the pre-change module, all 12
new assertions fail and the 27 pre-existing ones in that file still pass. A suite that passes on both
sides of a behaviour change would satisfy P1's letter and none of its purpose.

## L-trust → P2 — one minor finding

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/tar-extract.ts:186'
  problem: 'Dedupe runs before the shape filter, so several distinct malformed keywords each collapse to the same "<unprintable>" token and can repeat in one message.'
  evidence: "const shown = [...new Set(keywords)].map((keyword) => (PAX_KEYWORD_RE.test(keyword) ? keyword : '<unprintable>'))"
```

**Advisory, cosmetic.** It makes a message noisier, never less safe — the filter still runs on every
keyword, so no raw remote byte reaches the terminal either way. Pinned by the hostile-keyword test.

Taint propagation is otherwise correct and worth stating explicitly, because it is the point of the
increment: values are **never** returned by `readPaxKeywords` — only keywords — and a keyword reaches
a decision only through exact membership in a three-element set, or a message only through
`PAX_KEYWORD_RE` plus an eight-item cap. No guaranteed decision rests on a free-text field.

The malformed-record case is handled the strict way rather than the convenient one: a payload the
reader cannot account for end-to-end returns `null` and the caller throws, instead of returning "the
keywords I managed to find". That closes the gap where a length prefix disagreeing with its own bytes
could hide a `path=` between two mis-split records. This was raised as a `P5` concern in `GRILL.md`
and adopted before the build; the grill earned its place here.

## L-axis → P3 — no finding

`src/lib/tar-extract.ts` keeps its single reason to change — it is the tar reader — and its single
import (`./validate.js`). No sibling import, no cross-command reference, no new module. The pax record
reader is part of reading tar, not a second axis.

`L`/`K` were deliberately **not** given a branch: they already fall to the existing unsupported-type
refusal, and a second way to say the same thing would be the duplication P3 exists to prevent. They
are pinned by test instead.

---

## Floor-gate findings (blocking)

**None.** `validate` GREEN; no P0 guarantee lacks a reduction; no missing eval binding; no sibling
reference.

## Advisory findings (warn)

Two minor, both above (`P1:191` untested elision arm, `P2:186` cosmetic dedupe ordering).

## Carried forward from GRILL.md — a P4 doc reconciliation for the human, NOT agent-editable

`GRILL.md` raised this at blocking severity and it stands unresolved **by design**, because neither
document is this increment's to change. Both now describe behaviour the product no longer has:

- `THREAT-MODEL.md:93` — _"**SKIP** typeflag `g` (pax global header) and `x` (pax extended header),
  advancing past the padded payload with **no** path rules applied."_ This file is `trust: trusted`
  and **write-protected at the floor** by `.claude/hooks/protect-trusted-paths.cjs`; an agent must
  not edit it.
- `SECURITY.md:57` — _"SKIP `pax` global/extended headers, advancing past the padded payload with
  **no** path rules applied"_, inside the `tar-extract.ts` in-scope bullet. This file was rewritten by
  a sibling PR in flight and is out of this increment's declared scope.

Both sentences are now wrong in the same way: `x` is refused outright, and `g` is skipped only after
its records are read. Surfaced for a human to reconcile — `/pharn-dev-review` is advisory and cannot
issue a binding stop.

> **Disposition after review.** The human split the two:
>
> - **`SECURITY.md` — FIXED IN THIS INCREMENT.** #159 had merged, freeing the file, and the ordering
>   argument decided it: the sentence on `main` is correct about _current_ code, so **merging this
>   increment is what makes it false**. Fixing it afterwards would ship a disclosure policy that
>   misdescribes its own parser for the length of the gap — the shape of finding P-2, just closed. It
>   was added to `PLAN.md`'s `## Files` (amendment recorded there, not back-dated), the writes-scope
>   re-set from the amended plan, and the rewrite preserves the `x`/`g` asymmetry rather than
>   flattening it, since that distinction is what a researcher reading the file needs.
> - **`THREAT-MODEL.md` — STILL OPEN, escalated to the human.** Floor-write-protected and human-only.
>   Deliberately untouched.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the gated path)

**Candidate:** _A parser that refuses several input classes should state, per class, whether the
refusal reads the input's identity or its contents — and prefer identity where the measurement allows
it._ Provenance: this increment; the `x` refusal reads one typeflag byte and is therefore
unsuppressable, while the `g` refusal must read attacker-controlled payload because every real
archive contains a `g`. The asymmetry looked arbitrary until it was grounded in a count (zero `x`,
exactly one `g`), which is what made it defensible.

Proposed only. Canon is written by a separate, human-gated `/pharn-dev-memory-promote` run.

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor), 1 doc reconciliation carried forward for the
human.**

This verdict is `/pharn-dev-review`'s advisory judgment plus one floor fact (`validate` GREEN). It is
not a statement that the increment is correct, and its severities are LLM-assigned — advisory by
construction (fix #3). The decision is the human's.
