# VERIFY — symlinked-parent-unreadable

## FLOOR layer — the deterministic gates (these own the verdict)

| gate           | command                          | exit |
| -------------- | -------------------------------- | ---- |
| `test`         | `npm test` (953 vitest cases)     | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | 0    |
| `lint`         | `npm run lint`                   | 0    |
| `format:check` | `npm run format:check`           | 0    |
| `lint:md`      | `npm run lint:md`                | 0    |

No `structural:*` gate: this increment ships no committed eval pair (it is TypeScript, not a markdown
capability), so none is in the map — the absence is by membership, not by omission. `validate` is GREEN
over 0 capabilities, i.e. vacuous, and is named as such.

**Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0):**

**VERIFIED: floor gates PASS** — `failing_gates: []`.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` —
**no verifiers registered; floor gates only.** No advisory findings were produced, and none could have
changed the verdict above: `check-verify.mjs`'s only input is the gate→exit-code map.

## What this feature's own gates actually exercised

The floor gates are whole-repo, so the feature-specific signal is the increment's own tests, collected
by `npm test`:

- `readDiskState` under a **live** symlinked parent with byte-identical bytes → `unreadable`, asserted
  `not.toMatchObject({kind:'file'})`; under a **dangling** parent symlink → `unreadable`, not `absent`;
  a two-link chain → the reason carries the walk's **first** offender.
- The pre-existing ENOTDIR pin still holds (the classifier stays total), and the walk's ENOTDIR throw —
  the reason the guard exists — is now pinned directly in `tests/symlink-guard.test.ts`.
- Read side: `diffInstalledCapabilities` reports a dir moved aside and symlinked back as `unreadable`
  with `okCount === REST` — never blessed as ok.
- End to end: `runUpdate` with a symlinked `.claude/hooks` **resolves** (no exit 1), lists `UNREADABLE`,
  writes nothing through the link, upgrades everything else, and withholds the `skillsVersion` bump.
- The two partial-failure contracts still fail mid-loop, by two new EACCES mechanisms, with every
  original assertion intact — including `readRecords(proj) === {kind:'absent'}` (no mint).

Coverage measured this run over `src/lib/apply-update.ts`: statements 96.96 / branches 91.66 /
functions 100, with the single uncovered line the pre-existing `sha256File` catch — the increment
introduced **no** unreachable arm (the whole reason the leaf `isSymbolicLink()` branch was deleted
rather than kept).

## Honest residual (P0/P7)

**Verified = the named gates passed.** This is NOT a guarantee of correctness beyond what those gates
check: a defect no test, lint rule, or eval covers is invisible to this verdict, and there is no
verifier layer today that might have noticed it. Specifically unverified here: the behavior on a
platform whose `lstat` errno mapping differs (the EACCES/ENOTDIR mechanisms were measured on
darwin 25.5.0 only — CI runs ubuntu-latest, where the same suite must pass), and the TOCTOU window
between the classifier's walk and `applyWrites`' walk, which is bounded by the write-side backstop
rather than closed.
