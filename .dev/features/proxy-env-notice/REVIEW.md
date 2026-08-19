# REVIEW — proxy-env-notice

**Run 2** — re-review after the fix pass. Run 1 blocked on one floor-gate finding; this run re-checks
it and looks for what the fix itself introduced.

**Step 1, floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN (exit 0)**, vacuously (no
markdown Capability added). Suite: **43 files, 807 tests**.

> The increment is `trust: untrusted` to this review. Every `evidence:` field is DATA quoted for the
> human. Nothing instruction-looking in the reviewed files altered this review's behavior.

---

## The run-1 blocking finding — RESOLVED, and the fix goes further than the finding asked

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "docs/troubleshooting.md:157"
  problem: "RESOLVED — the false pin claim is removed and the underlying assertion now reduces to an enum membership test rather than a hand measurement."
  evidence: "Everything above was measured against `degit@3.6.6`, the version this release resolves."
```

Re-measured this run, the finding was **worse than filed**: degit's latest is **3.8.0**, so `^3.6.1`
resolves there today — the claim was wrong for anyone installing now, not merely fragile for a
hypothetical future release.

The fix does not reword the caveat. All nine published versions in the declared range were swept and
all read only the lowercase name; those nine are `MEASURED_DEGIT_VERSIONS`, and
`resolveDegitProxyRead()` reads the installed version at runtime so the confident wording fires only
on set membership. `grep 'the version this release resolves'` → **0 occurrences**.

**That is a genuine P0 upgrade, not a relabel.** The claim moved from "advisory, provenance-bounded"
to a floor primitive (`ARCHITECTURE.md §2` #3, enum/set membership). And the failure direction is
right: an unmeasured degit makes the notice *more cautious*, never wrong — verified by smoke test on
`3.9.0` and on an unreadable version.

## FLOOR-GATE findings (blocking)

**None.**

---

## ADVISORY findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/repo.ts:63"
  problem: "Comments in a file this increment deliberately did not touch still assert degit behavior measured at 3.6.6 with no version qualifier, which is the same class of claim that blocked run 1 — bounded here because the audience is a developer reading source, not a user reading output."
  evidence: "// `cache: false` is NOT no-cache — measured against degit@3.6.6, it selects"
```

Named rather than fixed, deliberately: `repo.ts` is on the plan's **Not touched** list, and the
cache/tier/tar claims there are a different measurement axis than the proxy one — folding them in
would bundle two increments (P7). The harm differs by an order of magnitude: a stale code comment
misleads a maintainer who can read the adjacent code, where run 1's defect misled a user who cannot.
`CHANGELOG.md:46` has the same shape and is **correct as written** — it says what *was measured* in
#98, past tense, which is a historical statement rather than a claim about what resolves.

**Recommend:** a follow-up increment re-measuring `repo.ts`'s degit comments against 3.8.0, since the
range now demonstrably floats past what they describe.

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "package.json:53"
  problem: "pharn develops against degit 3.6.6 while the declared range resolves to 3.8.0 for anyone installing fresh, so the version CI exercises is two minors behind the one users get."
  evidence: '"degit": "^3.6.1",'
```

Surfaced, not acted on — narrowing or bumping the range is a dependency decision with its own
trade-offs and is explicitly outside this increment's scope (`PLAN.md`, **Not touched**). Worth the
human's attention because it is the *root* of the run-1 defect: the gap between what is tested and
what ships is exactly what let a confident sentence be written about the wrong version.

## What the fix pass itself introduced — checked, and one thing caught

The new tripwire (`tests/proxy-env.test.ts`, "the installed degit still behaves as
MEASURED_DEGIT_VERSIONS claims") re-derives the claim from `node_modules/degit/dist/*.js` on every
run, so the hand-maintained set cannot silently drift from the dependency it describes. **It was
confirmed to be a real tripwire, not a tautology**: mutating the expected name list to
`['https_proxy','HTTPS_PROXY']` turns it RED, and reverting restores green. It also asserts the dist
is non-empty first, so a future packaging change fails loudly instead of passing vacuously.

One defect was introduced during the pass and corrected before the floor ran: `markdownlint-cli2
--fix` was run on `.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md`, a file **outside** the
`lint:md` gate's scope (`docs/**/*.md` + `*.md`). It rewrote the literal issue reference `#331/#345/…`
into an H1 heading `# 331/…` and flipped six `-` bullets to `+`. The file was reverted to `HEAD` and
the H5 correction re-applied without `--fix`; the diff is now one line changed, twelve added. Recorded
because the corruption was silent and would have shipped.

## L-eval (P1) — the run-1 gap is closed

Run 1's important finding was three of five call sites untested. All five now have wiring tests, and
the two hardest cases are covered: `add`'s **picker** path (behind an arg check and a non-TTY refusal)
and `status --no-drift` **silence**, which was previously asserted only in a code comment. Each
command also pins a no-clone path staying silent, so the notice cannot leak onto a path with no
transport to describe. `validate.mjs` agrees (vacuous, nothing to bind) — no disagreement finding.

## L-trust (P2) — re-checked, plus one property the fix strengthened

- **Presence-only branching** holds; the value never drives a decision, never reaches
  `pharn.config.json`, a path, or a shell.
- **Control characters cannot survive the render** — re-verified empirically, and now *tested*
  (`tests/proxy-env-format.test.ts`, "never emits a control character from a parseable value").
- **New surface, checked:** the `ignored` branch now echoes an environment **variable name**. That is
  safe by construction, not by sanitization — only a key whose lowercase equals `https_proxy` can
  reach it, so it is one of 2^11 ASCII spellings and cannot carry a control character. The code says
  so at the type definition rather than leaving it implicit.
- **New surface, checked:** `readDegitVersion()` reads from `node_modules`. It validates against a
  semver-shaped regex before the value can be echoed, and every failure mode collapses to `null`.

## L-axis (P3) — the run-1 finding is resolved

Presentation split into `proxy-env-format.ts`, which imports only a type and a constant from
`proxy-env.ts` — matching the `model-routing.ts` / `model-routing-format.ts` precedent.
`grep -rn "from '../commands/" src/` → nothing; no sibling import.

---

## Verdict

**GREEN — 0 floor-gate findings.**

The run-1 blocking finding is resolved by a mechanism rather than a rewording, and the three important
advisories from run 1 (P0 mislabel, P1 coverage, P5 casing) plus the two minors (P3 split, P6 stale
FACT-TABLE) are all closed. Two advisory findings remain, both **deliberately out of scope** and both
about `repo.ts` / `package.json` rather than this increment's own files.

As in run 1: the **floor** here is `validate.mjs` GREEN plus the machine-checkable facts behind each
finding. The lens judgments and all severities are **LLM-assigned and advisory** (`finding-shape.md`,
fix #3). "GREEN" is this review's assessment, not a deterministic gate — `/pharn-dev-review` writes no
`findings.json` and has no `check-review.mjs`. The decision remains the human's.

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is a separate, human-gated run)

**Candidate:** *A dependency fact measured at one version becomes a false claim the moment it is
written into shipped output, unless the artifact that ships also pins the version — and the honest fix
is a runtime membership test, not a more careful sentence.*

This increment measured `degit@3.6.6` correctly and repeatedly, labeled the result advisory in the
code comment and the CHANGELOG, and still shipped a wrong sentence — because "the lockfile pins it"
was carried from the dev repo to a published package that ships no lockfile and marks the dependency
`external`. The measurement was never the weak link; the **scope of the pin** was. What made the fix
hold was not better wording but `MEASURED_DEGIT_VERSIONS` + a runtime read + a test that re-derives
the claim from the installed bytes.

**Provenance:** increment `proxy-env-notice`, 2026-08-19; run-1 finding `P0`/blocking at
`docs/troubleshooting.md:157`; contradicting evidence `package.json` (`dependencies.degit: ^3.6.1`,
`files: ["dist"]`) and `scripts/build.mjs:15` (`external: [… 'degit' …]`); resolved in run 2 by
`src/lib/proxy-env.ts` (`MEASURED_DEGIT_VERSIONS`, `resolveDegitProxyRead`) and the tripwire in
`tests/proxy-env.test.ts`.

**Recurrence check (P7 — real, not hypothetical):** the **second** time this repo has corrected a
claim about `degit` internals (#98 was the first), and
`.dev/features/trust-map-records-era/REVIEW.md:167` already records that those were *"caught only
because the"* boundary was re-measured by hand. The advisory finding above — that `repo.ts` still
carries 3.6.6-scoped claims — is a live third instance waiting to happen. Whether that is a pattern
worth canonizing is the human's call at the promotion gate.
