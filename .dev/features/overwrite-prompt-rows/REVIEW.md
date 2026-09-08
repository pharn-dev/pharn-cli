# REVIEW — overwrite-prompt-rows

Four advisory lenses over what the build produced. **Floor-gate findings block; advisory findings do
not.** The floor-gate section is settled first, because nothing below it can change the verdict.

## Floor-gate findings (blocking)

**None.** All six deterministic gates are green at this head and were green at `977aa38`
(`REGRESSION.md`), `regression-report.json` is `no-regressions`, and `verify-report.json` is `PASS`.
`check-regress.mjs scope` returned `escaped: []` — every changed file is declared in the plan's
`## Files`. The one acceptance criterion that is itself a floor check —
no `Overwrite existing` literal left in `docs/`, `src/` or `tests/` — returns empty.

## L1 — Over-claiming (P0)

The increment's headline is a **docs correction**, and the doc it corrects is one that was caught
describing a prompt that had been deleted. So the first thing to check is whether the replacement
prose over-claims in the same way.

It does not, and the specific reason is that the new rows describe a **mechanism** rather than a
transcript: "any of the install's write targets already exists", "at most 10, then '…and N more'",
"**Continue and overwrite?** — default **no**". Each of those is a literal the code contains and a
test pins (`MAX_LISTED`, the `…and` cap test, the `already exist and may be overwritten` assertion).
The old row failed precisely because it quoted a *string* nothing owned any more.

Two claims are correctly hedged rather than asserted. The version clause is documented as **omitted**
when the file cannot be read, which is the truthful description of a total-catch reader — it does not
promise the version will be shown. And `PLAN.md`'s guarantee audit splits the corrupt-config claim
into "FLOOR for the reader, ADVISORY for `init` as a whole", which is the honest split given no test
enters `runInitArchetype`.

One residual, flagged not fixed: the CHANGELOG entry says `init` "names the `skillsVersion` you are
about to overwrite **again**". "Again" is a claim about history — the deleted prompt did show it —
and is supported by the spec's own account, not by anything in this repo's tests. Harmless, but it is
the one sentence here that rests on testimony.

## L2 — One responsibility (P3)

`src/steps/overwrite-check.ts` declares "One axis (P3): the write-target conflict init stage" in its
own header, and this change gives it a second capability: reading and shape-checking the project's
`pharn.config.json`. That is a real widening and `GRILL.md` F3 argues it rather than denying it.

The review's judgment is that the containment holds, for a reason that is structural rather than
stylistic: `recordedSkillsVersion` is **unexported**, so the widening cannot spread. The alternative
placement — beside `readPharnConfig` in `lib/pharn-config.ts` — would put a total-catch reader in the
module whose entire design point is that it **throws** on a config it cannot validate, where the next
caller to reach for "the easy one" would silently lose that protection. Keeping the swallow local to
the one caller whose worst failure is printing one fewer word is the smaller violation.

The prompt function itself stays one verb. The new code is four statements: a membership test, a
guarded read, a ternary for the intro string, and the same `confirmWarning` call as before.

## L3 — Cite, don't restate (P4)

The rewritten section makes one deliberate choice worth naming: it **does not** re-list what the
install writes. `docs/commands/init.md` already itemises that set (capability dirs, product commands,
hooks, contracts, `pharn-core/`, floor checkers, the constitution, `pharn.config.json`), so the
reference doc points at it — `[the init summary step](../commands/init.md#6-summary)` — instead of
duplicating a list that would then have two places to rot. One itemisation, one pointer.

The same discipline applies in the other direction: the `update --force` sentence still links the
update decision table rather than summarising it, and the source comment cites
`lib/pharn-config.ts`'s propagate-by-design behavior rather than re-explaining it.

The `.claude/settings.json` exclusion is the one fact now stated in two docs plus a source comment.
That is accepted because it is also **behaviorally pinned** — `tests/overwrite-check.test.ts`'s
`stays silent for a project with ONLY .claude/settings.json` is the live assertion, and it is cited
here so a future editor of either sentence can find the test that owns the claim.

## L4 — Additive and in scope (P7)

Nothing was removed and nothing changed shape. `conflictingWriteTargets`, the `MAX_LISTED = 10` cap,
`lib/install-manifest.ts`, `lib/pharn-config.ts`, `commands/init.ts` and `lib/confirm.ts` are all
byte-identical. No CLI flag was added — in particular `init` still has **no** `--yes`, which the spec
names as an invariant because this prompt is the destructive confirmation. No second TTY check was
introduced. The config schema is untouched: this increment **reads** the config and never writes it.

The prompt's decision semantics are unchanged end to end — default No, a declined confirm still
returns `false` so `init.ts` reaches `cancelAndExit()` (exit 0), and Ctrl+C still exits 0. The four
pre-existing tests covering those are untouched, and the diff on the test file is 94 insertions with
**zero** deletions, which is what makes "unchanged" checkable rather than asserted.

Two items the spec put out of scope stayed out: `pharn.records.json` was not added to the conflict
set, and the `models` block documentation in the same file was not touched.

## Advisory findings (non-blocking)

1. **No end-to-end proof for the corrupt-config claim.** `GRILL.md` F1. Every new test calls
   `confirmWriteTargets` directly; `init` is never run. Mitigated by the two-sided test that first
   proves `readPharnConfig` throws on the fixture, so the fixture is measured dangerous rather than
   assumed so. A `tests/init.test.ts` case remains a reasonable follow-up.
2. **`VERSION_RE` silently drops semver build metadata** (`1.4.0+build.7`). `GRILL.md` F2. Accepted:
   `readSkillsVersion` validates the upstream value with the same regex, so anything `pharn` wrote
   passes, and the failure mode is one missing clause rather than a wrong answer.
3. **Neither doc's prose is tied to the manifest by any check.** `GRILL.md` F5. A future addition to
   the install set will make both docs quietly incomplete rather than loudly wrong. The rows name
   `lib/install-manifest.ts` as the source so the drift is at least findable.
4. **`PHARN_CONFIG_FILE` and `CONFIG_FILENAME` are two constants for one string.** Pre-existing and
   documented at the definition site; out of scope here (P7). This change deliberately uses
   `PHARN_CONFIG_FILE` — the constant that *populated* the conflict list — so the membership test
   cannot drift from the list it queries even if the two constants later diverge.
