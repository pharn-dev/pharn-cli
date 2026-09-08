# REVIEW — remove-yes-contract

## Lens 1 — P4 (cite, do not restate)

**PASS.** `docs/commands/remove.md` no longer carries its own rule about `--yes`; it names the flag's
owner ([`update`](../../../docs/commands/update.md)) and points back at the picker confirmation the
same page already describes at its step 2. The page had been contradicting itself across 23 lines —
the fix removes the second statement rather than adding a third.

**Advisory finding (low).** `CLAUDE.md`'s `remove` paragraph and `src/index.ts`'s dispatch comment now
both explain why `--yes` stays a declared minimist boolean. Two copies of one argument can drift. Kept
deliberately: the dispatch comment is what a contributor editing the switch reads, and `CLAUDE.md` is
what an agent reads before it opens the file at all — and the previous single-sited version is exactly
what went stale.

## Lens 2 — P3 (one gate, one responsibility)

**PASS.** The `remove` dispatch case now does one thing: route the positional (`await
runRemove(argv._[1])`), identical in shape to `add` above it. The confirm contract lives entirely in
`commands/remove.ts` — the named path is promptless, the picker owns the one destructive confirm — and
neither is reachable from argv any more. The adjacent responsibility (*refusing* `--yes` on a command
that does not use it) is explicitly assigned to a future per-command allowlist rather than smuggled
into this switch, where it would have silently changed a user-visible exit code.

## Lens 3 — P0 (do not claim more than is verified)

**PASS, with the claims downgraded in writing.** Three limits are stated rather than glossed:

1. No gate reads prose. `npm run check` green after this PR is **not** evidence that `CLAUDE.md` and
   `docs/commands/remove.md` are true; the live CLI transcripts in `VERIFY.md` are the evidence, and
   they are manual.
2. The signature pin is a regex over source text (PARTIAL): it stops a `yes`/`_opts` parameter coming
   back, not an options parameter under another name. It fails closed — the capture is asserted
   defined and the parameter count asserted at 1 — but it is not a type-level proof.
3. The two per-path confirm pins were **green before this change**. They document the contract; they
   do not demonstrate that deletion became safer. Nothing about removal became safer.

## Lens 4 — P7 (additive / in scope)

**PASS.** Nothing user-visible moved: `pharn remove --yes` still parses and is still ignored (measured
live, exit 0), the non-TTY picker still exits 1, the named path still deletes without asking, and
`pharn remove --bogus` is still refused — which is what demonstrates `--yes` remained a *declared*
flag rather than falling into the unknown-option path. Deletion, pruning, the records stamp, the
`delete → prune → config` order, the auto re-add warning, `update`'s `--yes` and `init`'s deliberate
lack of one are all untouched. Historical `CHANGELOG.md` entries were left alone; one `### Unreleased`
bullet was added, matching how the repo has recorded its other docs-truth fixes.

**Advisory finding (medium, adjacent — deliberately NOT fixed here).** `CLAUDE.md`'s Architecture
section still opens with "**The two prompting commands hard-fail off a TTY.** `init` and `update` each
read `process.std*.isTTY`…". `commands/remove.ts:263-271` reads it too, through the same
`interactiveAllowed({…})` predicate, and exits 1 — so the count is three, and the sentence
under-describes a guard `remove` genuinely has. It is a different sentence, in a paragraph this
increment does not own, and correcting it is not in the spec; it deserves its own prompt. Raised so it
is not lost.

## Floor-gate vs advisory split

- **Floor (blocking, all green):** `format:check`, `lint`, `lint:md`, `typecheck`, `test` (1059),
  `validate.mjs` exit 0, plus `npm run build`. `check-regress` → `no-regressions`; `check-verify` →
  `PASS`.
- **Advisory (non-blocking):** the duplicated "declared boolean" rationale (low, kept on purpose) and
  the stale "two prompting commands" count in `CLAUDE.md` (medium, out of scope, filed here).
