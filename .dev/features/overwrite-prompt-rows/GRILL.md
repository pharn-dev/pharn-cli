# GRILL — overwrite-prompt-rows (adversarial pass over this plan, before the build)

Advisory. Findings are against **my own plan**, not against the spec. Each has a Problem (what the
plan actually fails to establish) and a Reduction (what I changed, or why I deliberately did not).

## F1 — The corrupt-config proof never runs `init`

**Problem.** The plan's headline safety claim is "a broken `pharn.config.json` cannot make `init`
abort at this prompt". Every test that supports it calls `confirmWriteTargets` **directly**, with
`@clack/prompts` mocked. `runInitArchetype` is never entered. So the tests establish a property of
one function, and the claim is about a command. Two concrete ways the claim could be false while all
seven tests stay green: (a) a future refactor hoists the config read up into `init.ts` — my tests do
not see `init.ts` at all; (b) some **other** init stage already reads the config through
`readPharnConfig` and aborts before this prompt is ever reached, in which case the fix protects a
door that is already locked from the other side. I checked (b) — `grep -n "readPharnConfig\|
loadArchetypeConfigOrExit" src/commands/init.ts src/steps/*.ts` finds nothing, so the door is real
today — but nothing pins it, and that check is a snapshot, not a guard.

**Reduction.** Two parts, and one refusal.

1. Test 3 is strengthened from "write a weird config and see that we survive" to a **two-sided**
   test: it first asserts that `readPharnConfig` on that exact fixture genuinely **throws**
   `ModelRoutingError`, and only then asserts that `confirmWriteTargets` renders. That converts the
   fixture from something I asserted was dangerous into something measured to be dangerous — without
   it, a fixture that quietly stopped being rejected upstream would silently turn the test into a
   tautology.
2. The guarantee audit is rewritten to say **"FLOOR for the reader, ADVISORY for `init` as a whole"**
   in exactly those words, and to name what is not exercised.
3. **Refused:** adding an end-to-end `tests/init.test.ts` case. It would need the whole init harness
   (repo fetch, capability index, summary) mocked to reach one prompt, and the assertion it could
   make — "`process.exit(1)` was not called" — is weaker than what test 3 already gives, because the
   mocks would be mine too. The honest move is to label the gap, not to buy a false end-to-end.

## F2 — `VERSION_RE` can silently drop a legitimate version, and the user cannot tell why

**Problem.** The plan filters the config's `skillsVersion` through
`VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/` before printing it. That regex rejects semver
**build metadata** (`1.4.0+build.7`) and anything a future upstream might legitimately use. In that
case the prompt silently loses its version line, and the user sees the same output as someone whose
config is corrupt. Silently degrading on a valid input is precisely the shape P5 exists to forbid,
and I am introducing it deliberately.

**Reduction.** Two facts make this acceptable, and both are now stated in the code comment rather
than left implicit. First, the realistic population is closed: `readSkillsVersion`
(`src/lib/skills-version.ts:46`) validates the upstream `SKILLS_VERSION` with **this same
`VERSION_RE`** before `init` records it, so any value `pharn` itself wrote necessarily passes — the
only way to reach the drop is a hand-edit or a config from a future CLI with a wider grammar.
Second, and decisively: the fallback is not a *wrong answer*, it is the **absence of an optional
orientation line**. The prompt is otherwise byte-identical, the listed conflicts are unchanged, and
the decision the user is asked to make is unchanged. A silent skip is only a P5 violation when the
skipped thing was load-bearing; this one is cosmetic by construction, and the alternative — printing
an unvalidated string straight into a terminal warning — is a real trust regression for a benefit
that is decoration. Filtering wins.

## F3 — The stage acquires a second responsibility (P3)

**Problem.** `overwrite-check.ts`'s own header declares *"One axis (P3): the write-target conflict
init stage."* After this change the file also reads and shape-checks the project's
`pharn.config.json` — a second thing it knows how to do, and one that already has an owner
(`lib/pharn-config.ts`). A reviewer could fairly say the reader belongs next to `readPharnConfig`, so
the two readers of the same file live together and the next editor of that module sees both.

**Reduction.** I considered moving it and decided against, on a containment argument rather than a
convenience one. `recordedSkillsVersion`'s defining property is that it **swallows everything** —
which is correct for decorating one prompt and actively wrong for every other caller, because
`readPharnConfig`'s propagate-by-design behavior exists specifically so that `add`/`update`/`status`
/`remove` cannot silently proceed on a config they failed to understand. Exporting a
total-catch reader from `lib/pharn-config.ts` would put a loaded footgun in the module whose whole
point is that the footgun is not there. Keeping it **file-local and unexported**, in the one file
whose failure mode is "print one fewer word", is the containment. The code comment now says this
outright, so the next reader meets the argument instead of the omission. The residual cost — a second
reader of the same file exists — is real and is accepted, not denied.

## F4 — `conflicts.includes(PHARN_CONFIG_FILE)` is a layout assumption the plan never stated

**Problem.** The gate on showing a version is membership of the literal `'pharn.config.json'` in the
conflict list. Everything else this stage handles is layout-dependent: in the `pharn/` layout the
constitution is `pharn/CONSTITUTION.md`, the contracts are `pharn/pharn-contracts/`, and the existing
test at `:142-149` exists precisely because those paths move. The plan simply assumed the config does
not move. If it did, the version line would never appear for exactly the users most likely to be
re-running `init` over an existing pharn-layout install — a silent, layout-shaped hole.

**Reduction.** Verified rather than assumed: `configPath(cwd)` is `resolve(cwd, CONFIG_FILENAME)`
(`src/lib/pharn-config.ts:56-58`) — no `layoutPaths` involvement, no `pharn/` prefix — and
`conflictingWriteTargets` adds the bare `PHARN_CONFIG_FILE` constant to the candidate set
(`install-manifest.ts:233`) outside the layout-derived `collectExpectedInstallPaths`. The config is
layout-invariant by construction on both sides. I take the constant from `install-manifest.ts`
(`PHARN_CONFIG_FILE`), not from `pharn-config.ts` (`CONFIG_FILENAME`), so the value I test membership
with is *the same object* the list was built from — the two are equal strings today and the
duplication is pre-existing and documented, but comparing against the one that populated the list
means a future divergence cannot make the check quietly wrong. **The layout axis is left untested**;
adding a pharn-layout version test would only re-assert `resolve(cwd, 'pharn.config.json')`, which no
code path varies. Named as a deliberate omission.

## F5 — The rewritten doc row makes a claim about a set it does not enumerate

**Problem.** The new row's trigger reads "any of the install's write targets already exists". That is
a claim about `collectExpectedInstallPaths`, a ~140-line function whose membership I am summarising
in five words, in a file that has just been caught documenting a prompt that was deleted. The
specific sub-claim most likely to rot is the companion sentence — that `.claude/settings.json` is
excluded — because it will now be asserted in prose in **two** docs (`init.md` and
`pharn-config.md`) and in a source comment, with no test tying the prose to any of them.

**Reduction.** Partial, and the residue is stated. The `settings.json` exclusion is not
prose-only: `tests/overwrite-check.test.ts:87-94` (`stays silent for a project with ONLY
.claude/settings.json`) is a live behavioral pin, and it is now cited by line in `REVIEW.md` so the
link between the sentence and the test is written down somewhere a future editor will hit. For the
broader "any write target" claim I deliberately **kept the doc vague where the code is complex**:
the row says the set is derived from `lib/install-manifest.ts` and points at
`docs/commands/init.md`, which already carries the itemised list, instead of duplicating that list
into a second file where the two copies could drift apart. One statement of the itemisation, one
pointer to it — the P4 shape. What remains unreduced: no test compares either doc's prose to the
manifest, so a future addition to the install set will make both docs quietly incomplete rather than
loudly wrong. That is the ordinary cost of prose, and it is the reason the row names the source file.

## Verdict (advisory)

**Proceed.** Five findings, none blocking. F1 and F5 are honest-scope problems, and both are reduced
by narrowing the claim rather than by widening the tests — which is the right direction when the
extra test would be built out of the same mocks as the claim. F2 and F3 are genuine trade-offs that
the plan made silently; both are now argued in the code itself, which is where the next reader will
be standing. F4 was an unstated assumption that turned out to be true, and is now true *by
verification* instead of by luck.

The one thing a reader should carry forward: this increment's floor guarantee is **"the doc no longer
names a prompt that does not exist"** — a string-membership check. Everything about the optional
code half is a smaller, well-tested convenience whose worst failure is printing one fewer word.
Neither claim should be read as "`pharn init` is safe against a broken config"; that is a larger
property this increment does not establish.
