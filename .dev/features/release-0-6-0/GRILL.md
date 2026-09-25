# GRILL — `release-0-6-0`

- Plan: `.dev/features/release-0-6-0/PLAN.md`
- Spec-hash check: PLAN `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` matches live
  `sha256(ARCHITECTURE.md)` — **no drift**.
- Registered grillers: 0 (count-grillers.mjs returned `{"registered":0,"grillers":[]}`)

---

## Findings

### Axis: Honest scope / missing file (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/release-0-6-0/PLAN.md:43"
  problem: "`package-lock.json` is omitted from `## Files` but it carries the version string in two
    places (`version` at the root and under `packages[\"\"]`); both read `0.5.0` live. A direct edit
    of `package.json` without updating the lock file leaves the two out of sync — cosmetically
    misleading and a latent CI confusion risk (e.g. a `npm ci --strict-peer-deps` run that reads the
    lock version for provenance logging)."
  evidence: "\"## Files\" lists only `package.json` and `CHANGELOG.md`; `package-lock.json`
    is not mentioned."
```

**Grounding (P6 — live, not memory):** `python3 -c "import json; d=json.load(open('package-lock.json')); print(d.get('version'), d['packages']['']['version'])"` → `0.5.0 0.5.0`. The field exists in both locations and requires updating.

**Fix:** Add `package-lock.json` to `## Files` in the plan and update both `"version"` occurrences to `"0.6.0"` during `/pharn-dev-build`. Alternatively, run `npm version 0.6.0 --no-git-tag-version` (which updates both atomically) and verify no unintended changes land.

---

### Axis: Determinism / heading format inconsistency (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/release-0-6-0/PLAN.md:28"
  problem: "The plan proposes `## [0.6.0] — 2026-09-25` (em-dash U+2014), but the immediately
    preceding version heading `## [0.5.0] - 2026-09-10` uses a plain ASCII hyphen-minus (U+002D).
    A deterministic rule should choose one character consistently; the inconsistency is cosmetic but
    could confuse a reader diffing headings."
  evidence: "PLAN line 28: `## [0.6.0] — 2026-09-25`; live CHANGELOG.md L69:
    `## [0.5.0] - 2026-09-10`."
```

**Fix (advisory recommendation):** Match the separator used in `[0.5.0]` — use `## [0.6.0] - 2026-09-25`. Alternatively, adopt the em-dash consistently (all prior versions from `[0.4.0]` down use it), and state the choice explicitly.

---

## No other findings

The remaining axes are clean:

- **P0 (guarantee audit):** All four claims in the plan's `## Guarantee audit` carry correct labels
  (`advisory` or a named CI floor gate). No guarantee is asserted without a floor reduction.
- **P1 (eval coverage):** The P1 waiver is explicit and reasoned — this increment adds no behavior in
  `src/**`; the "no product behavior → no eval" argument is sound. Nothing to surface.
- **P2 (trust audit):** No untrusted artifact is ingested. Both edited files are in-repo, human-authored.
- **P3 (one axis of change):** Both files change for the same reason (release 0.6.0 prep); the axis
  is singular. No sibling-import violation.
- **P6 (discovery):** The plan's live-state claims (version string, CHANGELOG line numbers, link defs,
  lint result) were independently verified this run and match.
- **P7 (honest scope):** The increment is the minimum release-prep unit. No speculation.

---

## Summary

Two concerns, neither blocking:

1. **`package-lock.json` omitted from `## Files`** (important) — the lock file carries the version
   string in two places; leaving it unmentioned risks an out-of-sync build artifact. The fix is one
   line in the plan's `## Files` list and two field edits during build.

2. **Heading separator inconsistency** (minor) — the plan uses an em-dash while `[0.5.0]` uses a
   hyphen-minus. Cosmetic, but a deterministic rule should choose one.

Neither finding is blocking. The plan's structure, guarantee audit, trust audit, and scope are sound.
The human should read this before `/pharn-dev-build` and decide whether to update the plan or proceed
as-is (e.g. accepting the em-dash if prior consistency with `[0.4.0]` and below is preferred).

---

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 1 important, 1 minor) — for the human to
weigh before `/pharn-dev-build`. This is not a guarantee, a gate, or an approval. `/pharn-dev-grill` is
advisory end-to-end.
