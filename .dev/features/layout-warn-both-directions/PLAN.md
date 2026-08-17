# PLAN — the layout-migration warn stops swallowing the pharn→flat direction

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `reportOutcome` gains the mirror `abandonedLayout === 'pharn'` branch, so a pharn→flat
  layout migration warns about the abandoned `pharn/` tree instead of computing the fact and
  discarding it.
- layer(s): pharn-cli `src/commands/` (the `update` verb's report) + its test + its user doc
- constitution_refs: [P1, P3, P4, P5, P7]

## Baseline verified this run (P6)

Live state read this run — the build prompt's base commit had drifted, everything else matched:

| Anchor                                                            | Filed             | Live                    |
| ----------------------------------------------------------------- | ----------------- | ----------------------- |
| base commit                                                       | `2cd061d` (#95)   | **`210d0e4` (#96)** ⚠   |
| `src/commands/update.ts` type field                               | `:106`            | `:106` ✓                |
| `src/commands/update.ts` direction-agnostic assignment            | `:345-346`        | `:345-346` ✓            |
| `src/commands/update.ts` one-eyed renderer                        | `:385`            | `:385` ✓                |
| flat message text                                                 | `:387`            | `:387` ✓                |
| flat test pin                                                     | `:975`            | `:975` ✓                |
| `pharnClone()` fixture                                            | `:948-961`        | `:948-961` ✓            |
| docs region                                                       | `:195-199`        | `:195-199` ✓            |
| `grep -rnF 'Your install moved to the pharn/ layout' src/ \| wc -l` | 1               | 1 ✓                     |
| `grep -c abandonedLayout src/commands/update.ts`                   | 3                 | 3 ✓                     |
| `npm run check`                                                   | green             | green (41 files / 754 tests) ✓ |

The base drift is inert to this increment: `#96` (`210d0e4`) refactored the physical symlink walk into
`lib/symlink-guard.ts` and touched neither `reportOutcome` nor the layout plumbing.

`Layout` is a **closed two-member type** — `src/types.ts:154`: `export type Layout = 'pharn' | 'flat'`
— and the field is `Layout | null` (`update.ts:106`). `previousLayout = configLayout(config)`
(`:248`), `layout = detectLayout(repoDir)` (`:247`), so the two operands come from the config and the
clone respectively.

## Files

- `src/commands/update.ts` — add the mirror `else if (outcome.abandonedLayout === 'pharn')` branch to
  `reportOutcome`; the flat branch and `:345-346`'s assignment stay byte-identical — layer
  `commands/` (the `update` verb's report)
- `tests/update.test.ts` — additive: one `it()` in the existing `layout migration (the (d) fix)`
  describe pinning the reverse direction; existing tests untouched — layer `tests/`
- `docs/commands/update.md` — one paragraph in `## Layout migrations` narrating the reverse direction
  — layer `docs/`
- `CHANGELOG.md` — one entry under the existing `[Unreleased] → ### Fixed` (line 40) — layer `docs/`

## The diff — literal

### 1. `src/commands/update.ts:385-389` → add the mirror branch

The flat branch is **untouched**; four lines are appended after it:

```ts
  if (outcome.abandonedLayout === 'flat') {
    log.warn(
      'Your install moved to the pharn/ layout. The old top-level copies are left behind and are no longer managed by pharn — delete them by hand.',
    );
  } else if (outcome.abandonedLayout === 'pharn') {
    log.warn(
      'Your install moved to the flat layout. The old pharn/ tree (contracts, floor scripts, docs, and capabilities) is left behind and is no longer managed by pharn — delete it by hand.',
    );
  }
```

The message mirrors `:387`'s sentence structure verbatim — _"Your install moved to the &lt;X&gt;
layout. The old &lt;Y&gt; is left behind and is no longer managed by pharn — delete it by hand."_ —
and satisfies the three required elements: it **names what was abandoned** (the `pharn/` tree, with
the enumeration in parens so the single em-dash rhythm of `:387` survives), that **nothing manages it
anymore**, and the **by-hand deletion remedy**. `flat layout` is the vocabulary
`docs/commands/update.md:196` already uses for this direction, so the message and the doc agree (P4).

**Why `else if` and not a bare `else`:** the explicit equality is a membership test (P5), and it fails
safe — if `Layout` ever gains a third member, a bare `else` would print the `pharn/`-specific message
for it, whereas `else if` prints nothing until someone adds the branch.

**Why two branches and not one parameterized template:** the flat message is observable output pinned
at `tests/update.test.ts:975`, and the two directions abandon genuinely different things (scattered
top-level files vs one root holding everything). A template would churn a pinned string for zero user
gain (the L5 rule: messages are observable).

### 2. `tests/update.test.ts` — one additive `it()` in the `:944` describe

**No new `flatClone()` fixture is needed, and adding one would be dead code.** The build prompt
suggested a `flatClone()` mirroring `pharnClone()`, but discovery found `beforeEach` **already**
scaffolds a flat clone — `:149`, `scaffoldClone(repo, '1.1.0', 'v2')`, whose paths (`CAP_FILE =
'pharn-pipeline/grillers/a11y/a11y.md'`, `CONSTITUTION.md`, `.claude/…`) are the flat layout. A
`flatClone()` would be a verbatim duplicate of the default. The prompt's own fallback is the
guiding floor: "`installed()` as-is with `config.layout` hand-set to `'pharn'` suffices."

So the reverse direction is reached by flipping **only the config**:

```ts
    // The mirror direction: a project recorded `pharn` meeting a flat clone (the
    // default fixture). The field at :346 has always been direction-agnostic; the
    // report used to test only for 'flat' and drop this case on the floor —
    // silently abandoning the whole pharn/ tree, which holds strictly more than
    // the scattered top-level files the other direction leaves.
    it('warns that the abandoned pharn/ tree is no longer managed', async () => {
      await installed({ layout: 'pharn' });
      // A real pharn/ tree to be abandoned, so the warning describes something
      // that exists. It is outside the flat manifest, so update never touches it.
      write(join(proj, 'pharn/pharn-contracts/finding-shape.md'), 'contract v1');

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('pharn/ tree');
      // The other direction's message must NOT fire: this pins the branch, not
      // just the presence of some warning.
      expect(warned).not.toContain('moved to the pharn/ layout');
      // update never deletes, so the abandoned tree is still there — hence the warning.
      expect(body('pharn/pharn-contracts/finding-shape.md')).toBe('contract v1');
      expect(readPharnConfig(proj)!.layout).toBe('flat');
    });
```

Traced through live code, this reaches the branch: `configLayout({layout:'pharn'})` → `'pharn'`;
`detectLayout(repo)` → `'flat'` (no `pharn/pharn-contracts` in the clone, `layout.ts:52`);
`installed()`'s records match the project's v1 bytes and the clone ships v2, so all four manifest
files are `upgrade`s → `written.length === 4 > 0` → `abandonedLayout: 'pharn'`. No skips, so
`versionWithheld` is false and nothing else changes about the report.

**On the `pharn/` marker file (the prompt's "optional garnish" — recommended, taken):** the minimal
seed pins the branch either way, but without it the fixture asserts a warning about a tree that never
existed. One line makes the premise coherent and lets the test mirror the flat pin's *second* half
(`:987`'s "the old copies are still there — hence the warning"). It is inert to the decision:
`detectLayout` reads the **clone**, never the project.

### 3. `docs/commands/update.md:199` — one paragraph appended to `## Layout migrations`

```markdown
The reverse direction behaves the same way. If your project is recorded at the `pharn/` layout and the
clone is flat, the update installs the top-level tree and the whole `pharn/` directory — contracts,
floor scripts, trusted docs, and every capability — is what remains; `update` never deletes it, no
command addresses it any more, and the update prints the matching warning. Delete it by hand.
```

`docs/commands/update.md` is the **sole** doc site: a sweep for migration/abandonment narration across
`docs/` and the root `*.md` found only this section plus `docs/commands/status.md:14`/`:58`, which are
already direction-agnostic ("a layout migration") and need no change.

### 4. `CHANGELOG.md` — one entry under `[Unreleased] → ### Fixed`

```markdown
- **`pharn update` now warns on both layout-migration directions, not just flat→`pharn/`.** The
  outcome field that records an abandoned layout has always been direction-agnostic, but the report
  only tested it for `flat`, so a project recorded at the `pharn/` layout meeting a flat clone was
  migrated in silence — leaving the entire `pharn/` tree (contracts, floor scripts, docs, and every
  capability) behind with nothing managing it and nothing said about it. That direction now prints its
  own warning naming what was left and how to clean it up. The flat→`pharn/` message is unchanged.
```

## Contracts satisfied

- No `pharn-contracts` contract governs a CLI report string; none is claimed. The applicable rule is
  the repo's own **"skips/leftovers are never silent"** discipline that `reportOutcome` already
  implements for every other bucket (`update.ts:361-395` — skips, backups, withheld version) — this
  increment closes the one bucket that computed its fact and printed nothing (P4: cited, not restated).

## Evals to write (P1)

- `reportOutcome` reverse branch → project recorded `pharn` + flat clone + ≥1 file written ⇒ the warn
  names the abandoned `pharn/` tree, the flat-direction message does **not** fire, and the abandoned
  tree still exists on disk (`tests/update.test.ts`, the `:944` describe).
- The existing flat pin (`:975`) stays green **untouched** — it is the byte-identity evidence for the
  message this increment must not churn.

## Guarantee audit (P0)

- **"the flat-direction message is byte-identical"** → **floor: enum/regex** —
  `grep -rnF 'Your install moved to the pharn/ layout' src/ | wc -l` → 1, plus `:975` green untouched.
- **"exactly one branch was added"** → **floor: enum/regex** —
  `grep -c abandonedLayout src/commands/update.ts` → 4 (baseline 3, measured this run).
- **"the reverse direction warns"** → **floor: test** — `tests/update.test.ts`'s new `it()` exercises
  the real `reportOutcome` through `runUpdate()` against a real filesystem fixture (P1).
- **"the branch is a membership test"** → **floor: enum** — two `===` comparisons over the closed
  `Layout = 'pharn' | 'flat'` (`src/types.ts:154`); the `null` case falls through to no output, which
  is the correct report for "nothing was abandoned" (P5).
- **"the user will act on the warning and delete the tree"** → **advisory**. `update` never deletes;
  the warning is a report. Nothing on the floor makes a human clean up, and this increment does not
  claim otherwise — it claims only that the fact is no longer swallowed.
- **"both directions are now covered"** → **floor: test** for the two members of `Layout`; this is
  total only because the type is closed. Stated as such, not as an open-ended guarantee.

## Trust audit (P2)

Not applicable — no new untrusted ingestion. The increment reads `outcome.abandonedLayout`, an
in-process `Layout | null` derived from `configLayout(config)` and `detectLayout(repoDir)`; both are
already-validated enum values, never interpolated remote text. The added message is a **constant
string with no interpolation**, so no clone-controlled bytes reach the user's terminal through it.
`safeJoin`, the symlink guards, and the network guards are untouched.

## Determinism audit (P5)

The only new branch is `outcome.abandonedLayout === 'pharn'` — an equality membership test over a
closed two-member type, evaluated after the `'flat'` test. There is no fallback to classify: `null`
(the third inhabitant) prints nothing, which is the truthful report. No guess, no heuristic, no
free-text-driven branch.

## Scope discipline (P7, P3)

- **P7** — triggered by a real, filed finding (L7), not a hypothetical: the field already computes the
  reverse case, so this wires up something the code has been discarding. Nothing speculative is added
  (no third layout, no template abstraction, no deletion behavior).
- **P3** — one axis: `update.ts` changes only for "the report tells the truth about layout
  abandonment". The renderer branch is the sole edit; `:345-346`'s field, the flat message, and every
  other line stay byte-equivalent.

## The comment-instead-of-fix option, recorded

The build prompt kept "leave it and write a conscious why-not comment" formally on the table. It is
rejected, and the reason is structural rather than a preference: the field at `:346` **already
computes** the reverse case, so a why-not comment would have to argue that computing a fact and then
discarding it in the renderer is intentional. No such argument survives — a half-wired warn reads as
coverage in review, which is strictly worse than either fixing it or never computing it. Recorded
here per the prompt's instruction to record it either way.

## Open questions (HALT)

None blocking. Two judgment calls were resolved from live state and are flagged for the approval gate
rather than left open:

1. **`flatClone()` dropped** — the default `beforeEach` clone is already flat (`:149`), so the
   proposed fixture would be a verbatim duplicate. Resolved by using `installed({ layout: 'pharn' })`,
   which is the prompt's own stated minimal floor.
2. **The `pharn/` marker file taken** — the prompt left it optional; recommended and included, because
   without it the test warns about a tree that never existed and cannot mirror the flat pin's
   "leftovers still there" assertion. One line, inert to the branch decision.
