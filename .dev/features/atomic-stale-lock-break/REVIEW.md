# REVIEW — atomic-stale-lock-break

Floor first (P0): `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .`,
exit 0. Green, and vacuously so — this increment adds no markdown capability, so the structural
floor gates nothing here. Everything below is **advisory**.

> The increment under review is `trust: untrusted`. Its comments are unusually discursive, which is
> this repo's style; nothing in them read as an instruction, and nothing in them changed how this
> review was conducted. Free-text quoted below is DATA.

## Findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/project-lock.ts:237'
  problem: 'The corpse sweep is called "the guarantee" in the source while being best-effort in every direction, and the advisory label the plan gave it did not survive into the code.'
  evidence: '"a file the user happens to have named `.pharn.lock.<digits>.<8 hex>` WOULD be removed, and that is the deliberate (and remote) cost of the guarantee."'
```

`.dev/features/atomic-stale-lock-break/PLAN.md:154` classifies this correctly — _"**advisory
(bounded)**"_ — precisely because the sweep runs only on the break path, only past `STALE_MS`, and
swallows every failure it meets (`readdirSync` throwing returns early at `:253`; a `statSync` or
`rmSync` failure skips that entry at `:258`). None of that is a guarantee; a project can hold a
stranded corpse indefinitely if no later break ever runs. The word "guarantee" appears in the
source with no `advisory` qualifier anywhere in `sweepCorpses`' 30-line doc-comment, so a reader of
the code alone gets a stronger claim than the plan makes. **advisory-gate**, not floor-gate: the
underlying behaviour is right and tested (`tests/project-lock.test.ts` pins the aged/fresh/
non-matching partition and the break-path-only rule); it is the wording that overreaches. Cheapest
correct fix is one word.

Everything else this increment claims does reduce, and the two claims that cannot were labeled:

- `src/lib/project-lock.ts:299` — the byte-equality's dependence on two live payloads never
  coinciding is marked _"ADVISORY, not floor — vanishingly narrow, not impossible."_ Correct call.
- `src/lib/project-lock.ts:337` — the lost-`link` restore is named as _"a two-writer window this fix
  narrows but does not close. Named, not hidden."_ Correct call, and the honest one: the headline
  "no two holders" is stated without that caveat in `CHANGELOG.md`, but the changelog's claim is
  about the **break path**, which is true, so this is not a second finding.
- `:328` — _"the restore can never clobber a lock a third process took in the gap"_ **is** floor:
  `link(2)` fails `EEXIST`, probed on node v24.13.1 and pinned by
  `tests/project-lock-break.test.ts` ("the restore never CLOBBERS a lock a third process took in
  the gap").

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/project-lock.ts:253'
  problem: 'Two of the increment''s new failure branches — the sweep''s readdir failure and its per-entry stat/rm failure — ship with no test that exercises them.'
  evidence: '"} catch {\n    return;\n  }"'
```

`npm run test:coverage` reports `project-lock.ts` at 95.4 / 92 / 100 / 97.4 with lines `206` and
`253` uncovered; `206` is the pre-existing non-`EEXIST` `openSync` rethrow, `253` is new. Global
coverage (97.33 / 93.05 / 97.61 / 98.2) clears the 97/92/97/97 ratchet, so nothing is red — this is
P1's "no behavior ships without a test" applied to defensive I/O catches, which is the weakest form
of the principle. Both branches are unreachable without making the project root unreadable
mid-run. **advisory-gate.** Noted so the human decides whether that class of catch is worth a
fixture; the ten behaviours that actually matter are all pinned, and six of them fail against the
pre-fix implementation.

No Capability and no `rule_id`/`enforces` binding exists in this increment (pharn is TypeScript;
its evals are vitest tests), so the floor's eval check and this lens agree vacuously — no
disagreement to report.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/project-lock.ts:318'
  problem: 'The re-verify adds a second uncapped read of a user-controlled local file, so a `.pharn.lock` that is enormous — or a symlink to a character device — is now read twice per contended acquire rather than once.'
  evidence: '"if (readRawAt(corpse) !== observedRaw) {"'
```

Pre-existing in kind, not introduced: `readPayload` has always done an uncapped
`readFileSync(lockPath(cwd), 'utf8')` and has always followed a symlink there. What this increment
changes is the count — the bytes are now read at `:409` and again at `:318`. Worth naming because
this repo does cap the analogous remote read (`skills-version.ts`: 8 s, 256 KB) and does refuse
symlinked components elsewhere (`symlink-guard.ts`), so the local lock file is the one untrusted
input read with neither. **advisory-gate**, and out of this increment's declared scope to fix.

The rest of the trust surface holds. `parsePayload`'s shape check still runs before any value can
reach `process.kill` — unchanged, and still tested. The genuinely new taint path is `sweepCorpses`
reading **user-controlled filenames** from `readdirSync` and deleting matches; it is gated by a
regex allowlist (`CORPSE_RE`, `:69`), the corpse path is `safeJoin`-contained, and `:233-237` names
the cost out loud rather than implying the regex is a filter. No guaranteed decision anywhere rests
on a free-text or tainted field: the break branches on byte equality, a regex, and an integer age
compare.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/project-lock.ts:405'
  problem: 'A lib/ file now documents the acquisition order of four command files in prose, which is exactly the coupling that made the comment this increment is fixing go stale — and nothing pins the new text either.'
  evidence: '"- `add` (named) and `update` — BEFORE the fetch, so a run that is going to be refused pays for no tarball."'
```

The comment is **correct as of this commit** — all six call sites were re-read from
`src/commands/{init,add,update,remove}.ts` after the rebase onto `a382bc3` and match. And there is
no import: `project-lock.ts` reaches only `node:*` and `./validate.js`, so P3's hard rule (no
leaf→leaf import) is intact and this is prose coupling, not structural coupling. But the failure
mode is demonstrated rather than hypothetical: the previous text was wrong for three of four
commands after #162, and wrong for `add`'s picker even **before** #162 — it survived two reviews.
Mitigating: #162's own tests (a refused `add`/`update` never calls `fetchRepo`; `init` still does)
pin the behaviour the comment describes, so the code cannot drift silently — only the comment can.
**advisory-gate**; the alternative (moving the per-command reasoning into each command file and
leaving `lib/` a pointer) is a refactor no one asked for.

`sweepCorpses` living in `project-lock.ts` was raised at grill as a possible second axis
(`GRILL.md`). On review it is one axis: the corpses exist only because this file's break creates
them, and no other file can know the naming convention. Not a finding.

## Gate split

- **floor-gate (blocking): none.** No P0 guarantee lacks a reduction or a label; no eval binding is
  missing that the floor disagrees about; no sibling import exists.
- **advisory-gate (warn): four** — one important (`P0`, the sweep's "guarantee" wording), three
  minor (`P1` untested defensive catches, `P2` doubled uncapped read, `P3` prose coupling to the
  command layer).

## Verdict

**GREEN — 0 floor findings; 4 advisory (1 important, 3 minor).**

The increment does what it set out to do, and the part that matters most is right: the break is now
three ordered steps with the two linearization points kept distinct (`rename(2)` decides who may
break; `O_EXCL` still decides who holds), losers refuse rather than loop, and a wrongly-moved live
lock is restored with a primitive that cannot clobber. The two residuals that survive are named in
the source rather than implied — which is the behaviour P0 actually asks for, and the reason none of
these findings blocks.

The single most useful thing for the human to weigh at the gate is not in this list: the interleave
is exercised through a seam around `renameSync`, not by two OS processes, so `rename(2)`'s
single-winner atomicity is assumed by the tests and probed only separately. `VERIFY.md` says so, the
test file's header says so, and the commit message says so. That is the right disclosure — but it is
still the load-bearing assumption of the whole fix.

## Proposed lesson (candidate only — NOT written to canon)

`/pharn-dev-review` writes no canon. Recorded here for a separate, human-gated
`/pharn-dev-memory-promote` run to accept or deny:

- **Candidate:** a doc-comment in `lib/` that describes the **ordering** of its callers goes stale
  silently, because nothing imports it and no test reads it. When a comment must describe caller
  behaviour, cite the caller's test rather than restating the caller's shape.
- **Provenance:** this increment (`atomic-stale-lock-break`); the comment at
  `src/lib/project-lock.ts:203-206` and `:50-51` as of `70dba0d`, wrong for three of four commands
  after #162 and wrong for `add`'s picker before it; handed forward explicitly by #162's commit
  message (_"its stale doc-comment is handed to the P-10 PR"_), which is the one thing that stopped
  it rotting further.
- **Why it may NOT deserve canon (stated so the gate is real):** n=1 file, and the hand-off in
  #162's commit message shows the existing process caught it. P7 says an addition needs a real
  recurring trigger, and one file twice may not be one.
