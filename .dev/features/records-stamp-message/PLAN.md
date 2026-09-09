# PLAN — name the stamp field that actually differs

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: build `recordsBaseline`'s stamp-mismatch note from only the field(s) that actually
  differ (`skillsVersion`, `commit`, or both) and state what dropping the records costs, so a
  commit-only mismatch stops printing two identical values as a difference.
- layer(s): pharn-cli product code (`src/lib/` — the install record store), no PHARN capability layer
  touched
- constitution_refs: [P1, P3, P5, P7]

## Increment in one paragraph

`recordsBaseline` (`src/lib/install-records.ts:202-219`) rejects the store when
`store.skillsVersion !== config.skillsVersion` **OR** `store.commit !== config.commit`, but its note
interpolates only `skillsVersion` on both sides. On a **commit-only** mismatch the user reads
`… a different install state (skills v3.0.1) than pharn.config.json (skills v3.0.1)` — two identical
values presented as a difference — and the records are dropped, which is a real degradation
(`decideFileAction` row 6: with no baseline, every **present** file that differs from upstream falls
to `unverifiable`). The reason given is self-contradicting, so the user cannot act on it. This
increment changes **one string** and the values it interpolates. The rejection condition, the return
shape, the stamp semantics and every caller are untouched.

Reachability, verified by reading the callers this run — the audit's "exactly what `add` creates" is
**imprecise** and the plan does not repeat it. `add` re-stamps the store with the *same*
`(skillsVersion, commit)` pair it then writes to the config (`src/commands/add.ts:568-576` →
`mergeCapabilityRecords`, `:584-604`), so a **successful** `add` leaves the two agreeing. The
commit-only mismatch is still plainly reachable: `add` writes records **before** the config and the
pair is not a transaction (its own comment says so), so a crash between them leaves the store on the
new commit and the config on the old; `update` opens the same window on the legal
same-version-different-commit upgrade; and a hand edit or an older CLI does it directly. Reachable,
just not routine.

## Files

- `tests/install-records.test.ts` — three assertions on the note text, one per mismatch shape, written
  FIRST — layer: test/spec (P1)
- `src/lib/install-records.ts` — `recordsBaseline` only (lines ~202-219): compute the differing-field
  list, render both sides from it, extend the tail with the cost — layer: `lib/` (one axis: the
  install record store, P3)
- `CHANGELOG.md` — one short bullet under the existing `## [Unreleased]` → `### Fixed`. No heading is
  added, renamed, or restructured (several PRs land in parallel and this file is the conflict point).

Explicitly NOT touched (sibling PRs own them): `src/lib/{constants,install-manifest,install-capabilities,pharn-config,project-lock,tar-extract}.ts`,
`src/commands/*`, `src/index.ts`, `src/steps/install-archetype.ts`. Also untouched: `readRecords`,
`writeRecords`, `buildRecords`, `mergeRecords`, the `RECORDS_SCHEMA_VERSION` gate, and every consumer
of the returned `note` (`src/commands/update.ts:391`, `:530` — the only one that prints it; `add` and
`remove` discard it).

## Exact wording (decided here so build does not improvise)

Both parenthesised sides are built from the SAME ordered field list — only fields that differ:

```ts
const mismatches: Array<{ label: string; store: string; config: string }> = [];
if (store.skillsVersion !== config.skillsVersion)
  mismatches.push({
    label: 'skillsVersion',
    store: JSON.stringify(store.skillsVersion),
    config: JSON.stringify(config.skillsVersion),
  });
if (store.commit !== config.commit)
  mismatches.push({
    label: 'commit',
    store: JSON.stringify(store.commit),
    config: JSON.stringify(config.commit),
  });
```

and the note is:

```text
pharn.records.json was written for a different install state (<store side>) than
pharn.config.json (<config side>); ignoring it, so every file that differs from upstream is
`unverifiable` instead of a clean upgrade
```

where each side is `mismatches.map(m => `${label} ${value}`).join(', ')`. The three shapes:

1. `skillsVersion` only → `(skillsVersion "1.0.0") than pharn.config.json (skillsVersion "1.1.0")`
2. `commit` only → `(commit "aaa…40 hex") than pharn.config.json (commit "bbb…40 hex")`
3. both → `(skillsVersion "1.0.0", commit "aaa…") than pharn.config.json (skillsVersion "1.1.0", commit "bbb…")`

Four decisions, made here:

- **Only differing fields are listed.** Listing both fields always would still let the reader align
  them, but it re-prints an identical pair on each side — a milder version of the defect being fixed.
- **The sentence frame is kept** (`was written for a different install state (A) than
  pharn.config.json (B)`). It is what `docs/reference/pharn-records.md:67` and
  `docs/commands/remove.md:54` paraphrase, so keeping it keeps the docs true without editing them.
- **`JSON.stringify` for every value**, matching the file's three existing untrusted-value messages
  (`:143`, `:170`, `:177`). Both stamp fields are deliberately TYPE-checked, not format-checked
  (`src/lib/install-records.ts:136-141`), so either side may hold an empty string or control
  characters from a hand edit; quoting makes `""` visible instead of blank and escapes the rest. It
  also renders a null commit as `null` — the legal floated-branch case (LIMITS.md §3b) — rather than
  the string `"null"` or nothing.
- **The commit is printed in FULL, never abbreviated.** Two reasons, in order: the stamp is not
  `COMMIT_RE`-checked, so a 7-char prefix is not guaranteed to identify it; and two distinct 40-hex
  shas sharing a prefix would render as an identical pair — recreating the exact "two identical
  values differ" defect this increment removes. The value's purpose is to be compared against
  `pharn.config.json`, so it is copy-pasteable at full length.

The tail says **`unverifiable`, not `unrecorded`** — with no usable store, `decideFileAction` returns
row 6 (`src/lib/update-decision.ts:101`), and `unrecorded` (row 5) requires an *available* store.
It is phrased force-independently ("is `unverifiable` instead of a clean upgrade", not "is skipped"):
under `--force` the label is still `unverifiable` but the action is a backed-up write
(`skipOrForce`, `:120-139`), and the note is printed on forced runs too
(`src/commands/update.ts:530`). It prescribes **no remedy** — `reportOutcome` already prints the
bucket-correct advice a few lines below, and duplicating it here risks contradicting it.

## Contracts satisfied

- No `pharn-contracts` schema is ingested or changed. The `pharn.records.json` schema (this CLI's, P3)
  is untouched — `RECORDS_SCHEMA_VERSION` stays `1` and no stored field is added, read, or dropped.
- `pharn-contracts/finding-shape.md` — not involved; no finding is emitted.

## Evals to write (P1)

All in `tests/install-records.test.ts`, in the existing `recordsBaseline` describe:

- **skillsVersion-only mismatch** (extend the existing `a stamp disagreeing with the config is
  ignored` case at `:313`) → note contains `skillsVersion` on both sides with the two DIFFERENT
  values, and does **not** contain `commit`.
- **commit-only mismatch** (extend the existing `a differing commit alone also invalidates the
  baseline` case at `:334`, which today asserts only `.records === null`) → note names `commit` with
  both shas in FULL, does **not** contain `skillsVersion`, and — the regression itself — the two
  rendered values are not equal.
- **both differ** → note names `skillsVersion` **and** `commit` on both sides, in that order.
- **a null commit renders as `null`** → store `commit: null` vs config `commit: 'a'.repeat(40)`
  produces `commit null` on the store side, not an empty or `"null"` rendering.
- **the cost clause is present and is `unverifiable`** → note matches `/unverifiable/` and does not
  match `/unrecorded/`.

## Guarantee audit (P0)

- "the note names exactly the field(s) that differ" → **floor**: the two sides are built from one
  membership list produced by the same two `!==` comparisons that drive the rejection, so the message
  cannot disagree with the branch by construction; pinned by the three shape tests above.
- "the rejection condition is unchanged" → **floor**: the `if` is untouched; the existing
  `.records === null` assertions at `:313` and `:334` still pass unmodified.
- "the store's `commit`/`skillsVersion` are not format-validated, hence full-length rendering" →
  **floor**: the type-check-only branch at `:136-141` (no `COMMIT_RE`/`VERSION_RE`), unchanged.
- "the tail's `unverifiable` is the label the user will actually see" → **floor**:
  `decideFileAction`'s `if (!recordsAvailable) return skipOrForce('unverifiable', force)` — a
  membership branch already pinned by `tests/update-decision.test.ts`.
- "the new message is clearer / more actionable to a human" → **advisory**. Nothing on the floor
  verifies that prose helps; the floor backstop is only that the strings are pinned by the tests.

## Trust audit (P2)

The increment ingests no new input. It **renders** two values that are untrusted-by-origin: both
stamp fields come from `pharn.records.json` and `pharn.config.json`, which are local but
hand-editable. They were already compared, never path-joined (the file header's rule), and this
change only adds them to a printed string — `JSON.stringify` escapes control characters, so a hostile
value cannot inject terminal escapes into the warning line. Taint reaches the human-readable note and
stops there: no branch, no path, no fetch consumes it.

## Determinism audit (P5)

Both new branches are the exact `!==` comparisons already in the rejection condition — equality tests
over strings, not classification. The field order is source order (`skillsVersion` then `commit`),
never object-key iteration, so the rendered message is byte-stable for a given pair. There is no
fallback that guesses: when neither field differs the function returns the records as before and no
message is built at all.

## Docs (P4)

No `docs/` change is planned. Verified by reading this run: no file under `docs/` quotes the message
verbatim. `docs/reference/pharn-records.md:67` ("`skillsVersion`/`commit` here disagree with
`pharn.config.json`") and `docs/commands/remove.md:54` ("stamped for a different install state") are
paraphrases that stay true — and are already **more** accurate than the code was, since they name
both fields. `CHANGELOG.md:676` is a historical entry and is not edited.

## Open questions (HALT)

None. The three decisions that could have gone either way — only-differing-fields vs always-both,
full vs abbreviated commit, and whether to prescribe a remedy — are decided above with their reasons.
GATE 1 for exactly this minimal fix is pre-approved by the human who commissioned it; if the fix
turns out to need anything outside the three files listed under `## Files`, the build STOPs and
reports instead of growing.
