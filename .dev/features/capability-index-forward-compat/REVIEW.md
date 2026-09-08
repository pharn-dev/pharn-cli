# REVIEW — capability-index-forward-compat

PHARN reviewing PHARN. Four advisory lenses over what `/pharn-dev-build` produced, with the
floor-gate / advisory split kept explicit.

Registered lenses (`node .dev/floor/count-lenses.mjs .`): **zero** — this is the CLI repo, it ships
no `role: lens` capability, so only the inline lenses ran. Stated, not papered over (P7).

**Floor-grade content of this stage** (already gated, not recomputed here): `.dev/floor/validate.mjs`
GREEN; `regression-report.json` `.verdict = "no-regressions"`; `verify-report.json`
`.verdict = "PASS"`. Everything below is **advisory** — LLM-assigned severity, never a gate
(`ARCHITECTURE.md §7`, fix #3).

---

## Lens 1 — the fail-open surface (P2: nothing unvalidated may be installed)

The whole increment is a deliberate loosening, so the first question is where the loosening leaks.

Traced every consumer of an unparseable capability:

| Path                                            | Sees `unknown`? | Why it is closed                                                     |
| ----------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `resolveCapabilities`                           | no              | reads `index.capabilities` only; `unknown` is a sibling array         |
| `installCapabilities` (`init`)                  | no              | driven by `selection`, which is derived from `capabilities`           |
| `installCapabilityDirs` (`add`)                 | no              | `resolveArchetypeAdd` filters `index.capabilities`; an unknown name is an "Unknown capability" error |
| `collectExpectedInstallPaths` ← `update`        | no              | `manifestCapabilities` filters the frozen keys out                    |
| `collectExpectedInstallPaths` ← `status`        | no              | same filter, added post-grill (F1)                                    |
| `applyWrites`                                   | no              | writes exactly `plan.writes ⊆ manifest keys`                          |
| `writePharnConfig`                              | **entry only**  | an ALREADY-recorded entry is kept; nothing new is ever added          |

`buildAddSelection` also reads `index.capabilities` only, so the picker cannot offer one.

**FINDING (important, resolved during review).** The two `collectExpectedInstallPaths` callers were
initially treated as one. `status` was left passing `config.capabilities` verbatim, which — because
`update` deliberately KEEPS a frozen entry — would have walked the unparseable clone directory and
reported every file under it as `missing`, making `status --strict` exit 1 permanently for a break
no command can resolve. Fixed in `src/commands/status.ts`; pinned in `tests/status.test.ts`. The
invariant is "nothing in `unknown` is enumerated by `install-manifest.ts`", not "…by update's call
to it".

**Not a finding, checked:** the `catch` is narrowed to `ManifestValidationError` and re-throws
anything else, so an I/O failure mid-clone still surfaces instead of collapsing into a silently
empty index — the fail-open direction, avoided.

## Lens 2 — the second-order effects of KEEPING a config entry (P0: what is actually guaranteed)

Keeping an entry whose files are excluded from the manifest touches three systems, not one.

**FINDING (blocking, fixed in this increment).** `planUpdate` keys `nextRecords` by the MANIFEST, so
excluding a frozen capability from the manifest also prunes its `pharn.records.json` entries as "no
longer installed". Its bytes are untouched on disk, so those hashes are still true — dropping them
would make the next run, once upstream parses again, classify every one of those files `unrecorded`,
skip it, and withhold the version bump: a transient upstream break converted into a `--force` with
backups. Fixed by `recordsUnderCapabilities` (`src/lib/install-records.ts`, a pure key-prefix filter
with the same load-bearing trailing slash `pruneCapabilityRecords` uses) carried into the store
write; pinned in `tests/update.test.ts`.

**Checked, correct as built:** the withheld-bump rule is untouched
(`versionWithheld = plan.counts.skipped > 0`, FILE-level only). A frozen capability contributes zero
expected files, hence zero file-level skips, hence the version still bumps — which is precisely what
keeps `add`'s `versionGate` from refusing forever. This was the trap the finding named, and the
`still bumps skillsVersion/commit` test is the guard on it.

**Checked, deliberate:** `kept-frozen` re-reports on every run. It is not idempotent-silent like
`kept-manual`, and that asymmetry is the point — `kept-manual` reports a one-time TAGGING, while
`kept-frozen` reports a condition that is still true.

## Lens 3 — untrusted data reaching a human (P2 trust fence)

`unknown` carries three untrusted strings straight from a hostile-capable clone: `name` may be the
very directory name that failed `CAPABILITY_NAME_RE`, and `reason` is a validation message that
interpolates it raw (`capability-index.ts:121`, `:134`, `:150`).

Before this change those strings were thrown once and printed once. Collecting them into a rendered
list makes them a *repeatable* terminal-control-sequence vector, so the containment is a single
renderer (`lib/unknown-capabilities.ts`): control characters stripped, every field capped at 120
chars, at most 10 entries listed with a truthful total. Centralising it is what makes the guarantee
hold by construction rather than by four call sites remembering.

`MIN_CLI`'s value never reaches a message unvalidated: `VERSION_RE` is anchored, so a malformed body
is rejected as not-a-version and its bytes are not echoed back (pinned in `min-cli-gate.test.ts`).

**Advisory residual (named, not closed):** the sanitizer strips control characters; it does not
attempt to neutralise instruction-looking prose in a `reason`. A human or a downstream LLM reading
the warning is the same bounded residual `LIMITS.md §2` / `THREAT-MODEL.md §5` already name. Nothing
in the CLI's control flow reads it.

## Lens 4 — honest labelling of the new guarantee (P0: the disease this repo prevents)

The temptation here is to write "pharn is now forward-compatible". It is not, and the artifacts say
so:

- The **bounded** part is floor: an unparseable capability cannot be selected, copied, enumerated, or
  written — every one of those is a set-membership or filter operation, not a judgment.
- The **levered** part is `MIN_CLI`, and it is **advisory, contingent on upstream**: upstream ships
  no such file today, so the lever is inert until it does. `LIMITS.md §3e` says this in those words.
- The **not-closed** part is a STRUCTURAL break — a relocated or renamed subtree still hard-fails
  every released CLI. Named in `LIMITS.md §3e`, not hidden behind the word "compatible".

**FINDING (minor, accepted).** `status` now parses the index, so a clone with a missing subtree makes
`status` exit 1 where it previously reported everything as `missing`. That is a behaviour change on a
read-only command. Accepted: it is the same structural refusal `init`/`add`/`update` give, the
message is actionable, and reporting a whole install as drifted against a clone the CLI cannot
address is the less honest outcome. Caught by the existing `try` → `reportError` → cleanup path, so
the clone is still removed.

**FINDING (minor, accepted).** In `update`, the `MIN_CLI` refusal necessarily lands AFTER the confirm
prompt, because the file it reads lives in the clone and the confirm precedes `fetchRepo`. Moving it
earlier would need a second bare network fetch, re-opening the surface FABLE §4.1 covers (out of
scope). The refusal still writes nothing and still cleans the clone up, which is what the guarantee
promises.

**FINDING (minor, fixed during review).** The bare-`pharn add` picker parsed the index once per pick,
so an N-pick run repeated the identical skipped-capability warning N+1 times. The parsed index is now
threaded into each pick — parsed once, warned once — pinned by
`warns ONCE for a multi-pick picker run`.

---

## Lessons

1. **"Nothing X is enumerated by module M" has as many call sites as M has callers.** Reducing the
   invariant to the caller the prompt happened to name (`update`) left `status` open. When an
   invariant is phrased over a MODULE, enumerate that module's callers, not the ones under
   discussion.
2. **Excluding something from a manifest excludes it from everything keyed by that manifest.** The
   records store was pruned as a side effect of the fail-open fix — a second-order consequence in a
   different subsystem, invisible from the diff of either file alone.
3. **A tolerance must be scoped by LOCATION, not by shape.** Enumerating the six known throw sites
   would have been the same bug again the first time a seventh is added. One `try` around the loop
   body covers refusals that do not exist yet.

## Verdict

No blocking finding stands: the two substantive ones (F1 `status`, F2 records pruning) were fixed
inside this increment and are test-pinned; the remaining three are accepted with their reasons
recorded. `/pharn-dev-review` has no structural verdict and does not gate — the standing floor
verdicts are `validate` GREEN, `regress` `no-regressions`, `verify` `PASS`.
