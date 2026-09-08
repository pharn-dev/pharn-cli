# VERIFY — remove-yes-contract

**FLOOR layer** — `check-verify.mjs` over the six gates: all exit 0 → **`PASS`**, `failing_gates: []`.
`npm run build` also runs clean (the seventh gate CI runs; not part of check-verify's set here).

**ADVISORY layer** — zero `role: verifier` capabilities exist (P7).

## The RED that came first

The pins were written before the source change and confirmed failing on the unmodified tree
(`npx vitest run tests/index.test.ts tests/remove.test.ts` → **6 failed | 63 passed**):

```text
FAIL tests/index.test.ts > routes `remove <arg>` to runRemove with the argument alone
AssertionError: expected "vi.fn()" to be called with arguments: [ 'a11y' ]
  Received: [ 'a11y', + { "yes": false } ]
FAIL tests/index.test.ts > accepts `remove --yes` and drops it — it is an update flag
FAIL tests/index.test.ts > routes the `rm` alias to runRemove
FAIL tests/index.test.ts > keeps a numeric `remove` positional a string (not the number 7)
FAIL tests/index.test.ts > leaves a bare `add` / `remove` argument undefined (the picker branch)
FAIL tests/remove.test.ts > runRemove declares exactly one parameter — no `yes` option survives
AssertionError: expected '\n  arg: string | undefined,\n  _opts…' not to match /yes/
```

The two per-path confirm pins (`the NAMED path never confirms`, `the PICKER's one confirm is
unconditional`) passed **before** the change as well — they are regression pins on behavior this
increment deliberately does not move, and they are recorded as such in the plan's guarantee audit
rather than counted as evidence of a fix.

## What the gates cannot see — checked by hand

No gate reads prose, and no unit test runs the built binary. Both were exercised manually against
`dist/index.js` in a throwaway project (flat layout, one installed `griller:a11y`):

```text
$ pharn remove a11y --yes
┌  pharn remove
│
└  ✔ Removed a11y (griller)          # exit 0; capability dir gone, capabilities: []

$ pharn remove --yes                 # non-TTY, no argument
■  Specify a capability to remove (e.g. `pharn remove a11y`), or run `pharn remove` in an
   interactive terminal to pick from a list.        # exit 1 — unchanged

$ pharn remove --bogus
Unknown option: "--bogus"            # exit 1 — the flag gate still refuses what it always refused,
                                     # which is what proves `--yes` is still a DECLARED boolean
```

So `--yes` prints nothing and changes nothing on `remove`, exactly as the rewritten docs now say.
This is a manual observation, not a gate: nothing re-runs it on the next PR.
