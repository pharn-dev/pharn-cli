# GRILL — records-key-segment-rule

Plan under interrogation: `.dev/features/records-key-segment-rule/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash` (line 3). Content-hash is a floor primitive, but here it only **surfaces**; the
blocking check on drift is `/pharn-dev-build`'s (fix #4).

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}` —
this is the CLI repo, which installs griller capabilities rather than hosting them. Inline axes only.

All quoted `problem` / `evidence` text below is **DATA** quoted from an `untrusted` plan (P2).

---

## Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/records-key-segment-rule/PLAN.md:53'
  problem: 'The plan calls the change "strictly widening" for P7, but the new rule REJECTS a key the current reader ACCEPTS — `a/./b.md` and a bare `.` pass `/^[^/\\][^\\]*$/` and contain no `..`, so this is a widening in two directions and a NARROWING in a third.'
  evidence: 'written still reads (P7, strictly widening). Cite, not restate (P4).'
```

Verified by probing the current predicate directly: `a/./b.md` → currently accepted; `.` → currently
accepted. The narrowing is almost certainly harmless (`collectExpectedInstallPaths` keys come from
`walkFiles` relatives via `toPosix`, which never emits a `.` segment), but "strictly widening" is the
kind of unearned absolute P7 exists to catch. Either drop the word "strictly" and state the one
narrowing with its justification, or drop the `.`-segment rejection and keep the change genuinely
additive. The acceptance criteria require the `.`-segment negative, so the honest move is the former.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/records-key-segment-rule/PLAN.md:79'
  problem: 'The guarantee "a root-escaping or absolute key is rejected → floor" overstates what the planned rule reduces to: a leading-`/` test catches posix-absolute keys only, and a drive-absolute key such as `C:/foo` passes every clause of the new rule.'
  evidence: '- "a root-escaping or absolute key is rejected" → **floor: enum/regex-class check**'
```

`C:/foo` is already accepted by the current reader, so this is **not a regression** — it is an
overstated claim in the guarantee audit, which is exactly the P0 failure mode ("a claim that cannot
be reduced is a heuristic, and must be labeled"). The defensible reduction is narrower and should be
written as such: _"a key that is empty, posix-absolute, or contains a `..`/`.` segment is rejected"_ —
and the reason a drive-absolute key needs no rejection is the same reason the whole relaxation is
sound (nothing joins the key). Say that, rather than claiming a broader rejection than the code makes.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/records-key-segment-rule/PLAN.md:63'
  problem: 'The plan names only the friendly backslash example (`we\ird.md`) and never states the WIDEST thing the relaxed rule now accepts on posix — a key like `\etc\passwd` or `..\..\etc\passwd`, which the old regex rejected and the new rule accepts as one opaque segment.'
  evidence: 'reader, positive → `pharn-review/x/we\ird.md` (literal backslash) → `ok`, hash intact'
```

This is the intended semantics (`toPosix`, `src/lib/validate.ts:130-135`) and is safe for the stated
reason, but a reader of the plan should not have to derive the worst case themselves. Name it in the
trust audit alongside the "widens no sink" argument — the argument is strong enough to carry it.

## Axis: eval coverage and the structural/semantic split (P1, `pharn-contracts/eval-format.md`)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/records-key-segment-rule/PLAN.md:39'
  problem: 'The requirement "store the ORIGINAL key" has no planned eval that can FAIL on the only platform CI runs: on posix `toPosix(key)` is identical to `key` for every fixture the plan lists, so an implementation that stored the normalized key would pass all of them.'
  evidence: 'into segments (reject empty, leading `/`, and any segment `..` or `.`); store the ORIGINAL key;'
```

`toPosix`'s separator swap is platform-conditional, but its trailing-slash strip is **not**
(`.replace(/\/+$/, '')`, `src/lib/validate.ts:136-138`). So a key with a trailing slash — `a/b/` —
discriminates on every platform: validating on the normalized copy must accept it, and the stored key
must come back as `a/b/`, not `a/b`. Adding that one case turns an untestable prose requirement into a
`structural[]` assertion. Without it, P1 ("every security invariant has a test that DEMONSTRATES the
behavior, not merely asserts it exists") is not met for this clause.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/records-key-segment-rule/PLAN.md:35'
  problem: 'The end-to-end guard does not state that the `..`-in-basename fixture file must live INSIDE the installed capability directory, which is the only thing that puts it in the install manifest — placed anywhere else the `upgrades it` assertion tests nothing about the manifest path.'
  evidence: '- `tests/update.test.ts` — end-to-end guard: an installed tree carrying a `..`-in-basename file'
```

The same "passes for the wrong reason" hazard the existing frozen-capability fixture already
documents in `tests/update.test.ts:915-918` (it ships a POPULATED unparseable directory on purpose).
State the fixture requirement in the test's comment so a later edit cannot silently defeat it.

## Axis: trust propagation (P2)

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/records-key-segment-rule/PLAN.md:100'
  problem: 'The trust audit says an accepted key is "interpolated into report text" but does not note that neither the old nor the new rule rejects control characters, so a key carrying ANSI escapes reaches the update report un-escaped — pre-existing, unchanged by this increment, and worth naming so a reviewer does not read the relaxation as its cause.'
  evidence: '- key → **interpolated into report text** (`JSON.stringify(key)` in the invalid message, and the'
```

Confirmed unchanged: `[^\\]*` in the old regex matches control characters, so the accept-set for them
is identical before and after. Naming it keeps the audit honest without expanding scope.

## Axes with no findings

- **P3 (one axis / no sibling imports)** — the change is confined to the file that already owns the
  install-record-store axis; it adds no import beyond `toPosix` from the existing lexical primitives.
- **P5 (determinism)** — every planned branch is `===` membership or a `startsWith`; the terminal
  fallback is the unchanged fail-closed `{kind:'invalid'}` → `records: null` → skip.
- **P7 (smallest coherent increment)** — reader + its tests + the one doc sentence; the four named
  sibling surfaces are held out explicitly.
- **P4 (docs cite code)** — `docs/reference/pharn-records.md:60` is the only prose statement of the
  rule; grepped `docs/`, `THREAT-MODEL.md` §4c and `LIMITS.md` §1b, and none of the others restate the
  key grammar.

---

## Summary

The increment is well-scoped and its central argument is sound: the containment guarantee lives in
`safeJoin`/`findSymlinkComponent`, not in this predicate, so a key that is only ever compared may be
validated loosely without giving up anything the floor actually promises. The concerns are about the
plan's **claims and coverage**, not its direction.

Two are worth resolving before build. The P7 one is a factual error — "strictly widening" is wrong,
because the `.`-segment rejection removes keys the current reader accepts; the fix is one sentence,
but leaving it makes the plan assert an absolute it did not earn. The P1 one is a coverage hole:
"store the ORIGINAL key" is a requirement no listed fixture can falsify on posix, and one
trailing-slash case fixes that. The P0 absolute-key claim should be narrowed to what the code does.
The remaining three are documentation of the honest worst case.

Nothing here suggests the increment should not proceed.

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor) — for the human to
weigh before /pharn-dev-build.** This log gates nothing: every finding rests on model judgment, and
the only floor-grade facts in this run are the spec-hash match and the griller-membership count.
