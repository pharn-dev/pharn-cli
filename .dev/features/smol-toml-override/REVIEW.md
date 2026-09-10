# REVIEW — smol-toml-override

Increment under review: `trust: untrusted`. Floor first (P0):
`node .dev/floor/validate.mjs .` → **exit 0**, `FLOOR: GREEN — 0 capabilities checked`. The increment
adds no PHARN markdown capability, so that green is **vacuous** and gates nothing here — the
deterministic weight in this review comes from `npm run check` and the increment's own 18 test cases,
not from that row.

Reviewed surface: `package.json` (+3), `package-lock.json` (+3/-3), `CHANGELOG.md` (+32),
`tests/dependency-overrides.test.ts` (new, 224 lines / 18 cases).

---

## Floor-gate findings (blocking)

**None.** No claim in this increment lacks a floor reduction, no eval binding is missing (the floor
agrees: zero capabilities, so zero bindings are owed), and no sibling reference was found.

---

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "CHANGELOG.md:23"
  problem: "A user-facing claim is stated one notch wider than what the change mechanically does — a range PERMITS a future patch but PINS nothing, and the committed lockfile still fixes 1.7.2 until something regenerates it."
  evidence: "`markdownlint-cli2` at `0.23.2` and takes future `1.7.x` patches without another manual edit."
```

Defensible on one reading (no `package.json` edit is needed), misleading on another (it reads as
automatic). The refresh comes from Dependabot opening a lockfile PR — a repo mechanism, not a property
of the specifier. **The grill raised exactly this** (`GRILL.md`, P7 finding) and it reached the shipped
CHANGELOG anyway, which is the part worth flagging: an advisory finding that is read and then not acted
on is indistinguishable, downstream, from one that was never raised. The honest phrasing is "permits
future `1.7.x` patches without a `package.json` edit; picking one up still takes a lockfile refresh."

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "CHANGELOG.md:34"
  problem: "The 'cannot admit a vulnerable version' claim is exact for every specifier form the checker models, but the underlying comparator treats a prerelease as EQUAL to its release, so a hypothetical `~1.7.1-rc.0` override would satisfy the assertion."
  evidence: "`tests/dependency-overrides.test.ts` asserts the declared range cannot admit a vulnerable version"
```

Not a defect, and **already named** where it matters: the test's own header records it as a residual
(`tests/dependency-overrides.test.ts:38-40`), citing `src/lib/semver.ts:10` where the behavior is
deliberate. The finding is only that the CHANGELOG's sentence carries no such qualifier. Reusing the
shared comparator rather than minting a second one is the right call under P3, and inheriting its
documented narrowing is the correct price.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "package-lock.json:4032"
  problem: "The lockfile records no trace that an override is in force — under npm 11.12.1 `packages[\"\"]` carries no `overrides` key — so the only on-disk evidence of the policy is the resolved version itself."
  evidence: 'packages[""] keys: name, version, license, dependencies, bin, devDependencies, engines'
```

Verified not to be a breakage: `npm ci` accepts the package.json/lock pair (dry-run, scratch copy) and
the lock is byte-stable across a re-resolve. The consequence is a coverage one, and it **vindicates the
two-layer test** rather than undermining it: delete the override without refreshing the lock and only
the *spelling* layer notices; delete it *and* refresh and only the *lockfile* layer notices. Neither
layer alone covers both directions, which is the argument for keeping both.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "tests/dependency-overrides.test.ts:103"
  problem: "The suite verifies the COMMITTED lockfile, never a fresh resolve, so a change in npm's own `overrides` semantics would leave every assertion green while a real `npm install` produced something else."
  evidence: "function readLockPackages(): LockPackages {"
```

This is a boundary, not an omission — a fresh-resolve test needs the network and would make a
hermetic suite non-hermetic. Recorded so the coverage claim stays honest: the guarantee is over the
committed artifact CI installs from, which is the artifact that matters, and not over npm's resolver.

Otherwise **P1 is well served, and unusually so**: six of the eighteen cases are negative — a planted
`1.7.0` entry flat and nested under another package, an unparseable version, a missing `version`
field, a lookalike package name — so the check is demonstrated to **reject**, not merely to pass. This
is the grill's important P1 finding closed inside the approved `## Files`. The floor and this lens
agree (zero capabilities → zero `enforces` bindings owed); no disagreement to report.

### L-trust → P2

No finding. The increment ingests no untrusted artifact at pharn runtime, emits no finding object, and
changes no fetch boundary; `src/` is untouched.

Answering the lens's direct question — **did instruction-looking content change my behavior?** The
source artifact for this whole increment is a vendor advisory containing directive prose ("it is
**strongly advised** to upgrade to an up-to-date version of the library as soon as possible") and an
LLM-legible severity ("high", CVSS 8.2). That is untrusted free-text, and the honest answer is that it
supplied urgency but not a decision: the plan **struck** the exploitability claim on the strength of a
live read (`.markdownlint-cli2.jsonc`, so `parse()` is never invoked here) rather than inheriting the
advisory's framing. That is the enum-gated/free-text split working on a real input — the deterministic
facts (version ranges, `npm audit` exit, the resolved tree) drove every branch.

One residual worth stating: the lockfile's `integrity` sha512 pins **which** bytes were resolved, never
that they are benign — provenance, not proof, the same shape `LIMITS.md §1b` names for pharn's own
upstream. `smol-toml@1.7.2` entered the dev toolchain on that basis.

### L-axis → P3

No finding. `tests/dependency-overrides.test.ts` imports `../src/lib/semver.js` — test → lib, the
sanctioned direction, matching `tests/semver.test.ts`; no sibling-leaf reference exists. The file has
one axis of change (the smol-toml override policy). The local `lowestAdmitted` / `auditSmolToml`
helpers are test-only and used once, matching the `lintExitCodeAs` precedent in
`tests/lint-gate.test.ts`; if a second override is ever added they would want extracting, which is a
trigger that does not exist yet (P7).

---

## A correction to this increment's own artifacts (P6)

`VERIFY.md` stated the new test ships "13 cases". It ships **18** — nine `it` blocks plus nine more
from two `it.each` tables. The number was written from the count of `it` declarations without
expanding the tables, i.e. asserted rather than read. `VERIFY.md` has been corrected; no verdict
changes, since the gate exit codes are untouched. Recorded here rather than silently fixed, because
"a number in a report that nobody re-derived" is the same failure mode as a green gate that checked
nothing.

---

## Proposed lesson for canon (NOT written here — P2)

A candidate for `.dev/memory-bank/lessons-learned.md`, to be promoted only by a separate, human-gated
`/pharn-dev-memory-promote` run:

> **A shell gate that "fails" identically at both ends may be measuring nothing.** In this run the
> first `/pharn-dev-regress` capture passed all 46 test paths to `node --test` as a single argument (zsh does
> not word-split an unquoted parameter expansion), yielding exit 1 at base **and** head. The exit-code
> comparison was still correct — no regression could be masked — so the verdict was green and the
> defect was invisible to the floor. Detection required reading the gate's *stdout*, which the
> comparison deliberately never consumes. **How to apply:** when a captured gate is non-zero on both
> sides, confirm it ran before recording it as pre-existing; a gate absent from the map is safer than
> one present and hollow.
>
> Provenance: increment `smol-toml-override`, this run; `REGRESSION.md` §"Two orchestration facts".

---

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory findings (1 important, 4 minor).**

Advisory means advisory: none of the five blocks the increment, and every severity above is my own
assignment (fix #3). The increment does what its plan said, its guarantees are labeled, and its test
demonstrates rejection rather than only observing success. The one finding I would not ship without
addressing is the `CHANGELOG.md:23` overstatement — not because it is dangerous, but because it is a
claim wider than its mechanism in the one file users read, and the grill already named it.
