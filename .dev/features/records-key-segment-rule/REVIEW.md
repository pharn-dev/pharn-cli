# REVIEW — records-key-segment-rule

Increment under review: the diff at HEAD over `src/lib/install-records.ts`,
`tests/install-records.test.ts`, `tests/update.test.ts`, `docs/reference/pharn-records.md`.
Reviewed as `trust: untrusted`.

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN**, exit 0. Everything below is
**advisory** except where a finding is marked floor-gate.

## The invariant the whole increment rests on — traced, not assumed

The relaxation is only sound if a store-derived key never reaches a path operation. I traced every
consumer rather than trusting the header comment:

| consumer | what it does with a STORE key |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `update-decision.ts:216` | `records?.[rel]` — `rel` comes from `latestHashes` (the manifest); the store supplies a **value** |
| `update-decision.ts:231,267` | `nextRecords[rel] = previous` — again manifest-keyed; `previous` is a hash |
| `recordsUnderCapabilities` (`update.ts:406`) | `rel.startsWith(prefix)` — string comparison |
| `add.ts:580` / `remove.ts:124` | merge / key-prefix prune — string operations |
| `apply-update.ts:46,116`, `backup.ts:60-104` | `safeJoin(projectRoot, rel)` — every `rel` here comes from `plan.writes` / `plan.backups`, i.e. the **manifest**, never the store |

**No store key reaches a `safeJoin`, `resolve`, `join`, or any fs call.** The relaxation gives up
nothing, and `safeJoin` remains the backstop if a future caller ever wired one in. This is the
strongest thing in the increment and it holds.

---

## Floor-gate findings (blocking)

**None.** No guarantee is claimed without a floor reduction or an `advisory` label; no eval binding
is missing; no sibling import; no guaranteed decision rests on a tainted field.

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/install-records.ts:62'
  problem: 'The comment asserts writer and reader "agree BY CONSTRUCTION, since every key originates from collectExpectedInstallPaths (toPosix-normalized)" — but there is a SECOND writer source, `capabilityCloneFiles` (install-manifest.ts:193), which `add` uses via mergeCapabilityRecords and which is NOT toPosix-normalized, so the stated construction covers only one of the two paths.'
  evidence: '// now agree BY CONSTRUCTION, since every key originates from
    // collectExpectedInstallPaths (toPosix-normalized, root-relative).'
```

Advisory, and the practical consequence is nil: `capabilityCloneFiles` builds `${relDir}/${rel}` from
`walkFiles`, which joins with a literal `/`, so its output is posix-shaped without needing `toPosix`.
But "BY CONSTRUCTION" is an absolute, and it is stated over a set the author did not enumerate. Either
name both sources, or soften to "every key pharn writes is built by joining walked components with
`/`" — which is the property that actually holds for both.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/install-records.ts:62'
  problem: 'Nothing binds the writer to the reader: no test asserts that a manifest built over a fixture clone yields keys the reader accepts, so the "agree by construction" relationship can silently drift if either side changes — the exact class of asymmetry this increment exists to fix.'
  evidence: 'grep over tests/ finds no test importing both collectExpectedInstallPaths and the reader''s key rule.'
```

This one is **floor-reducible** — a single test over the existing `install-manifest` fixture clone
asserting `readRecords` accepts `buildRecords`' output would make the claim a gate rather than a
comment. It is raised as advisory because the increment's plan did not scope it and shipping it here
would widen the increment; it is the natural next step, and it is what would stop this finding from
recurring in the opposite direction.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/lib/install-records.ts:74'
  problem: 'The comment makes a platform-conditional behavioral claim — that a win32-written `a\b\c` key splits into components, and therefore that `..\..\etc\passwd` is REJECTED on win32 — and no test exercises it; CI runs ubuntu-latest only, so this half of the rule has zero coverage anywhere.'
  evidence: '// toPosix converts the PLATFORM separator (lib/validate.ts), so a win32-written
    // `a\b\c` splits into components while a posix key with a literal backslash
    // stays one opaque segment'
```

Advisory. The consequence is bounded to nil by the traced invariant above — even if the win32 branch
misbehaved, the key is never joined — but P1 says a security-shaped claim gets a test that
**demonstrates** it. `toPosix` reads `sep` from `node:path` at call time, so covering this needs a
module mock; that cost is a fair reason to defer, but the honest move is to say so at the comment
rather than let it read as verified behavior.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/commands/update.ts:406'
  problem: 'A hand-edited store key that the OLD rule rejected wholesale can now survive a round-trip: `recordsUnderCapabilities` selects by string prefix and its output is merged into the next store written (update.ts:415-420), so an odd-but-accepted key under a frozen capability is carried forward into a file pharn wrote.'
  evidence: '...frozenRecords,
    ...plan.nextRecords,
    ...buildRecords(cwd, written),'
```

Advisory, and arguably correct behavior rather than a defect: if the key names a real upstream file,
carrying it forward is exactly right, and if it does not, the entry is inert (it matches no manifest
key and drives no fs access). Recorded because it is a real behavior change the increment does not
mention — under the old rule the whole store would have been rejected, so such a key never survived.

**Injection check (the lens's second question):** I read the increment's comments, test names, and doc
prose looking for content directed at me. There is none — every comment is descriptive
("Normalize a COPY to split it"), and no string, fixture name, or doc line attempts to instruct the
reviewer. Nothing changed my behavior, and I did not catch myself about to comply with anything.

**Checked and NOT a finding:** the relaxed rule still accepts control characters in a key, and accepted
keys are interpolated un-escaped into the update report's file lists. Verified pre-existing and
**unwidened**: the old `[^\\]*` class matched control characters too, and the one character class this
change adds (backslash) is not a terminal control. Naming it here so a reader does not attribute it to
the relaxation.

### L-axis → P3

**No findings.** `install-records.ts` still changes for exactly one reason (the install record store);
`isInvalidRecordKey` is module-private and colocated with the store it validates; the only new import
is `toPosix` from `lib/validate.ts`, the shared lexical primitive, which is `lib`→`lib` and explicitly
the sanctioned route. No command→command or step→step edge. The `toPosix(x).split('/')` shape now
appears in both `symlink-guard.ts:55` and here — two consumers of one primitive, which is the pattern
`validate.ts` documents, not duplication.

---

## What the increment got right (not restated as findings)

The tests were written first and confirmed RED for the right reason before the implementation landed;
the trailing-slash fixture makes "store the ORIGINAL key" falsifiable on posix rather than leaving it
as untestable prose; and the end-to-end guard's fixture is deliberately placed inside the capability
directory with a comment saying why, so it cannot silently degenerate into a test that passes because
the file was never a manifest candidate. The comment states the honest worst case (a drive-absolute or
backslash-bearing key is accepted) instead of only the flattering example.

## Verdict

**GREEN — 0 floor-gate findings; 4 advisory (3 important, 1 minor).**

The increment is not blocked. The advisory findings cluster on one theme worth the human's attention:
the code's *comments* claim slightly more than the code's *tests* establish — a construction argument
stated over an unenumerated set, and a platform branch with no coverage. That is the mild form of the
same disease the increment fixes, and it is cheap to correct at the comment or with one binding test.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the gated path)

- **id:** `writer-reader-asymmetry`
- **lesson:** When one module writes a store and another validates it on read, the validator must be
  no stricter than what the writer can legitimately produce — otherwise the product declares its own
  output corrupt, and because the failure is fail-closed it looks like correct safety behavior rather
  than a bug. Bind the two sides with a test that feeds the writer's real output to the reader.
- **provenance:** this increment (`records-key-segment-rule`), `src/lib/install-records.ts:51-82`;
  triggered by a real latent defect (FABLE 5.1), not a hypothetical.
- **recurrence evidence:** the same shape is already reasoned about at `install-records.ts:134-139`
  (stamp fields are type-checked, not format-checked, for exactly this reason) — so this is the second
  instance in one file, which is what makes it a pattern rather than a one-off.

Promotion requires a separate `/pharn-dev-memory-promote` run under its own scope, `check-provenance.mjs`,
and a human accept/deny. The model does not self-promote (P2).
