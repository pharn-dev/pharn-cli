# VERIFY — triage-unverified-observations

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**Only one of the nine produced anything a gate can see**, and it was mutation-verified in both
directions rather than assumed:

```
$ sed -i '' 's/MAX_DEPTH = 24/MAX_DEPTH = 30/' src/lib/detect-archetype.ts
× does not find one past it
AssertionError: expected true to be false

$ sed -i '' 's/MAX_DEPTH = 24/MAX_DEPTH = 12/' src/lib/detect-archetype.ts
× finds a signal at the deepest permitted level (MAX_DEPTH = 24)
AssertionError: expected false to be true
```

Both sides matter: a test that only checks "deep enough is not found" passes just as well if the walk
stopped at depth 1.

**The other eight produced verdicts, not code**, and PASS says nothing about whether those verdicts
are right — that is the reviewer's job. Four were "no action": two because another prompt owns them
(#146 for the triple materialization, `5.6c` for the coverage ratchet), one because the spec itself
recommends none, and one — item 2 — because verification **overturned the proposed fix**.

**Item 7's deliverable is not in this repo at all**: `pharn-dev/pharn-oss#180`. Nothing here verifies
it; the issue is the whole action, and the spec forbids touching the copied hook.

**Items 5 and 8 are documented, not closed.** No test asserts Node 20 or Windows behaviour, because
none runs there. That is the gap being *stated*, not fixed.
