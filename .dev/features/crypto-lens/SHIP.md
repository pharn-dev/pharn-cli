# SHIP — crypto-lens (gated `/pharn-dev-ship` roll-up) — iteration 2 (post-GATE-2 refinement)

**Advisory roll-up only.** `/pharn-dev-ship` adds no floor primitive: every verdict below belongs to a sub-stage's own deterministic checker. This file records **that the chain ran and its floor verdicts** — it is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| #   | stage                | outcome                                                                                                                     |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | PLAN.md written; **GATE 1** approved ("Approve as written")                                                                 |
| 2   | `/pharn-dev-grill`   | GRILL.md written; advisory — 4 minor concerns, 0 blocking                                                                   |
| 3   | `/pharn-dev-build`   | 12 files written; floor **GREEN**                                                                                           |
| 4   | `/pharn-dev-regress` | verdict **no-regressions**                                                                                                  |
| 5   | `/pharn-dev-verify`  | verdict **PASS**                                                                                                            |
| 6   | `/pharn-dev-review`  | REVIEW.md **GREEN**; **GATE 2** reached                                                                                     |
| —   | **GATE 2 decision**  | human chose **"Refine first"** → 4 refinements directed (RC4, createCipher, benign-context eval, broadened insecure-random) |
| 3′  | `/pharn-dev-build`   | PLAN revised (15 files); scanner → **8 kinds**; +1 eval case; floor **GREEN**                                               |
| 4′  | `/pharn-dev-regress` | re-run; verdict **no-regressions**                                                                                          |
| 5′  | `/pharn-dev-verify`  | re-run; verdict **PASS** (26 scanner tests)                                                                                 |
| 6′  | `/pharn-dev-review`  | re-run; REVIEW.md **GREEN**; **GATE 2** re-reached — run ends for the human                                                 |

**Where the run ended:** at **GATE 2** (post-review), after one human-directed refinement iteration. Not a RED-verdict STOP — every floor verdict came back GREEN/clean in both passes.

## Structural verdicts read (verbatim — the floor, per sub-stage; latest pass)

- **`/pharn-dev-build` → `validate.mjs` exit:** `0` (GREEN — 20 capabilities).
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`:** `"no-regressions"` (outside gates `tests`/`validate`/`structural:trust-fence` all 0→0).
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`:** `"PASS"` (`test`/`validate`/`lint`/`format:check`/`lint:md` all exit 0; 0 verifiers).

Each verdict is the sub-stage's own floor checker; `/pharn-dev-ship`'s act of reading them and proceeding is advisory orchestration (two clocks).

## What the refinement added (human-directed at GATE 2)

- Scanner kinds **6 → 8**: `weak-cipher-rc4` (broken stream cipher) and `deprecated-createcipher` (Node's no-IV `crypto.createCipher`, anchored so the safe `createCipheriv(...)` is a verified true-negative).
- `insecure-random` word list **broadened** (`+passphrase`, `+credential`).
- New **benign-context** lens eval `case-md5-cachekey` — exercises the surface-don't-suppress boundary the iteration-1 grill flagged as untested.

## Pointers (cited, not restated — P4)

- **`REVIEW.md`** — 4-lens advisory review (**GREEN**, 0 blocking; the iteration-1 adequacy gap now partly closed by the benign-context eval; two proposed lessons-learned candidates for a separate `/pharn-dev-memory-promote` gate).
- **`GRILL.md`** — the iteration-1 advisory interrogation whose in-scope cautions were honored and whose two scope-expanding suggestions were exactly what the human then directed at GATE 2.

## Honest note

Free-text from GRILL/REVIEW is `trust: untrusted` DATA (P2), quoted for the human — it gated none of `/pharn-dev-ship`'s control flow (which read only exit codes / `.verdict` enums). Two orchestration caveats recorded in the trace: a false symmetric regress RED from shell word-splitting (corrected to `xargs` before any verdict was read), and trace-artifact style hygiene (SHIP/VERIFY/REVIEW tables `prettier --write`-formatted to satisfy the whole-repo `lint:md`/`format:check` at verify).

---

**chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.**
