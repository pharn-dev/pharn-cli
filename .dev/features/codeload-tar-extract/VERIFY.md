# VERIFY — codeload-tar-extract

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**. `npm run build` clean,
and `dist/index.js` contains zero occurrences of `degit`.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**The unit suite is not the evidence that matters here.** The spec says so outright ("a passing unit
suite does not prove the network path"), and this is the increment where that is most true: the
highest-risk defect — running the path rules over the leading `pax_global_header` — passes every
fixture built from a normal directory and fails 100% of real fetches. So the rewritten `fetchRepo`
was run against the **live** `pharn-dev/pharn-oss`:

```
sha            : 2e183e6468cc1ffbe01484537253f333f342b860
elapsed ms     : 1215
files extracted: 1640
SKILLS_VERSION : 3.0.1
layout         : pharn
.dev/features  : 153   (deep paths — the ustar prefix split)
```

Every downstream reader of the clone was exercised by that probe: `readSkillsVersion` parsed the
root file, `detectLayout` resolved `pharn`, and the 153 `.dev/features` entries are the >100-char
paths that only land correctly if `prefix` and `name` are reassembled.

**What PASS does not cover.**

- **No speed claim.** 1.2-1.6 s for resolve + download + extract of 1,640 files. The spec's figures
  (222 ms resolve + 1,061 ms warm clone) were a different tree on a different day; no controlled A/B
  was run, so the increment claims structural wins, not a benchmark.
- **Contents are still unverified.** Provenance is by-SHA, not cryptographic. Every check added here
  is about shape and placement.
- **The proxy regression is real.** Nothing verifies behaviour behind a proxy, because there is none
  to verify: `fetch` reads no proxy variable. It is a named limit, not a covered case.
