# PLAN — `remove` has no `--yes`: delete the dead parameter, rescope the docs

- spec_content_hash: 73b100fd30f7d395527ca631207c6c0523a74ff9af68faea19b39758fc1200d9 # fix #4
- increment: `pharn remove` tells three incompatible stories about whether it confirms before
  deleting. Take the spec's **Option A**: delete the `_opts` parameter `runRemove` never reads, stop
  the dispatcher feeding it, and rewrite the four prose sites so every one of them says the same true
  thing — the **named** path never confirms, the **picker** path always confirms once (default No),
  and `remove` has no `--yes`. No user-visible behavior changes.
- layer(s): `src`, `tests`, `docs`
- constitution_refs: [P0, P3, P4, P7]

## Discovery (P6 — read live this run)

Every anchor below was re-read from disk on this branch (`origin/main` = `977aa38`). The spec's line
numbers predate the FABLE 4.5 unknown-option PR, which grew `src/index.ts` by ~75 lines.

- **The picker confirm is unconditional** — `src/commands/remove.ts:300-306` (spec says `:298-305`):

  ```ts
  // ONE confirm listing what will be removed (default No — destructive).
  const ok = await confirm({
    message: `Remove ${targets.length} ${plural(targets.length)}: ${targets
      .map((t) => `${t.name} (${t.role})`)
      .join(', ')}?`,
    initialValue: false,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();
  ```

  Nothing in `runRemovePicker`'s signature (`src/commands/remove.ts:254-258`) can reach it: the
  picker takes `(cwd, config, installed)` — no options at all.

- **The dead parameter** is at `src/commands/remove.ts:41-44` (spec says `:42` — `_opts` is on
  **43**), under a header comment at `:32-40` whose last sentence is the only correctly-scoped
  statement in the repo:

  ```ts
  // was removed; a pre-archetype config is rejected up front. `_opts.yes` is
  // accepted for CLI compat but unused — capability removal has no confirm prompt
  // on the named path.
  export async function runRemove(
    arg: string | undefined,
    _opts: { yes?: boolean } = {},
  ): Promise<void> {
  ```

- **The dispatcher** is at `src/index.ts:148-155`, not `:77` — and it has grown a four-line comment
  the spec never saw, because the unknown-option refusal (FABLE 4.5) landed after the spec was
  written and deliberately left this call alone, naming **this** prompt:

  ```ts
  case 'remove':
  case 'rm':
    // `--yes` is a documented no-op here (remove has no confirm prompt to
    // skip). Whether the passthrough should exist at all is FABLE 4.07's
    // question, not this gate's — left exactly as it was so that decision
    // stays findable rather than pre-empted.
    await runRemove(argv._[1], { yes: Boolean(argv.yes) });
  ```

  That comment is now false in the same way the docs are, and it is this increment's to answer. The
  `runAdd(argv._[1])` call the spec points at as the model shape is at `:150`, not `:73`.

- **`src/index.ts:29`'s usage line is already correctly scoped** (`-y, --yes` … `update: skip the
  confirmation prompt (for CI and scripts)`) — spec claim confirmed, left alone.

- **The docs contradiction is exactly where the spec says**: `docs/commands/remove.md:20` ("then asks
  for one confirmation listing your picks" — true) vs `:43` ("`--yes` / `-y` is accepted but has no
  effect — capability removal has no confirmation prompt to skip" — false).

- **`CLAUDE.md`** states it unconditionally twice, at `:46` ("`--yes`/`-y` is now a no-op: capability
  removal has no confirm prompt") and `:64` ("`--yes`/`-y` is a no-op (there is no confirm prompt to
  skip)"). Both confirmed live.

- **Spec gap, corrected here (P6).** The acceptance criteria name "the three dispatch cases at lines
  67-83" of `tests/index.test.ts`. A live grep finds **five** call-shape pins, not three: `:70`,
  `:76`, `:82` (the three the spec names) **plus** `:212` (`remove '7'` — the numeric-positional pin)
  and `:225` (bare `remove` — the picker-branch pin), both of which assert
  `toHaveBeenCalledWith(…, { yes: false })`. `toHaveBeenCalledWith` is an exact argument-list match in
  vitest, so all five flip RED on the dispatcher change; editing only the three the spec lists would
  leave the suite red.

- **The `--yes` flag itself stays declared in minimist** (`src/index.ts:81`, alias at `:98`). It is
  `update`'s flag and must remain a declared boolean, or the FABLE 4.5 `unknown` handler would start
  refusing `pharn remove --yes` with exit 1 — a user-visible behavior change Option A does not
  license.

- Existing test anchors the spec names in `tests/remove.test.ts` — `:190`, `:241`, `:255`, `:271`,
  `:602`, `:623` — all match live, and all call `runRemove(...)` with **one** argument already, so
  dropping the parameter leaves them untouched.

## Files

- `tests/index.test.ts` — five call-shape pins move to the one-argument contract; the `remove --yes`
  case is re-titled to say what it now pins (the flag is accepted by the parser and **ignored** by
  the command, not forwarded) — layer `tests`
- `tests/remove.test.ts` — NEW cases: (a) a structural pin that `runRemove` declares exactly one
  parameter and names no `yes`, (b) a behavioral pin that the picker path confirms exactly once with
  `initialValue: false` while the named path never calls `confirm` — layer `tests`
- `src/commands/remove.ts` — drop `_opts`; rewrite the header comment to state the real two-path
  contract — layer `src`
- `src/index.ts` — `await runRemove(argv._[1]);`, and replace the deferral comment with the
  resolution (why `--yes` stays a declared boolean) — layer `src`
- `docs/commands/remove.md` — rewrite `:43`; `:20` stays as-is (already correct) — layer `docs`
- `CLAUDE.md` — rescope `:46` and `:64` — layer `docs`
- `CHANGELOG.md` — one `### Fixed` bullet under `## [Unreleased]` — layer `docs`

## Evals to write (P1)

1. `remove <arg>` reaches `runRemove` with **exactly** `('a11y')` — no options object.
2. `remove a11y --yes` reaches `runRemove` with exactly `('a11y')` — the flag parses (no
   `Unknown option` refusal, exit 0) and is dropped at the dispatch, which is the whole contract.
3. The `rm` alias, the numeric positional (`remove 7` stays the string `'7'`), and bare `remove`
   (`undefined`, the picker branch) all use the same one-argument shape.
4. The usage text still scopes `-y, --yes` to `update` (unchanged assertion, now true of every
   command).
5. `runRemove`'s **signature** declares one parameter and mentions no `yes` — read out of
   `src/commands/remove.ts` (the in-repo precedent is `tests/init.test.ts:323`, which asserts the
   single-`isTTY`-predicate rule the same way).
6. The picker path calls `confirm` exactly once, with `initialValue: false`, and the named path never
   calls it — the two halves of the contract the prose now states.

## Guarantee audit (P0)

- "The dispatcher no longer forwards `--yes` to `remove`" → **FLOOR.** Five exact-argument-list
  assertions; `toHaveBeenCalledWith` fails on an extra argument.
- "`pharn remove --yes` is still accepted (not refused as an unknown option)" → **FLOOR.** Eval 2
  runs the real `main()` with that argv; the FABLE 4.5 refusal path would `process.exit(1)` through
  the stubbed exit and fail the test.
- "The contract cannot be re-broken by threading `yes` back in" → **PARTIAL.** Eval 5 pins the
  signature by reading the source text, so re-adding a parameter named `yes`/`_opts` fails. It is a
  regex over source, not a type-level proof: a differently-named options parameter would slip past
  it. Stated, not hidden.
- "The picker still confirms before deleting" → **FLOOR, but pre-existing.** Eval 6 and the four
  cases at `tests/remove.test.ts:190/241/255/271` pin it; they pass **before** this change too. This
  increment does not make deletion safer — it makes the description of it true. Do not read the green
  suite as new protection.
- "The docs and `CLAUDE.md` now say something true" → **NOT floor-verifiable.** No gate reads prose.
  `lint:md` checks shape, not truth. The only defense against re-drift is that the code no longer has
  a parameter to justify the false sentence.
- "Nothing about what `remove` deletes, prunes or writes changed" → **FLOOR by construction plus
  regression.** No line inside `removeNamed`, `runRemovePicker`, `deleteCapabilityDir`,
  `pruneCapabilityRecords` or `warnIfAutoSelected` is touched; the 60-odd existing `remove` cases run
  unmodified at head.

## Trust audit (P2)

No untrusted input reaches anything this increment touches. `argv.yes` was the only tainted value in
the changed dispatch line, and the change **removes** its last consumer.

## Determinism audit (P5)

All new assertions are exact-value or membership checks over mock call arguments and repo-owned
source text. No clock, no network, no filesystem outside the existing tmp-dir helpers.

## Out of scope (P7)

- **Option B** (honoring `--yes` on the picker confirm). It changes user-visible behavior on a
  destructive command; the spec recommends A and FABLE places this finding in the docs sweep.
- The **named** path stays promptless. No confirm is added to `pharn remove a11y`.
- `update`'s `--yes`, its TTY gate, and `init`'s deliberate lack of a `--yes` — untouched.
- Deletion, pruning, the `pharn.records.json` stamp, the auto-selection warning, `safeJoin`
  containment, the `delete → prune → config` order — untouched.
- The per-command flag allowlist (FABLE 4.5's follow-up). `--yes` stays globally declared here; the
  answer that prompt needs from this one — **`remove` does not accept `--yes`** — is recorded in the
  PR description.
- Historical `CHANGELOG.md` entries (e.g. the module-era `remove --yes` description) are a record,
  not documentation; only a new `## [Unreleased]` bullet is added.

## Open questions (HALT)

- None. The spec offers two options and the task selected A.
