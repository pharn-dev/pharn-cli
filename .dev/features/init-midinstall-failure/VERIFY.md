# VERIFY — init-midinstall-failure

**FLOOR layer** — `check-verify.mjs` over the six gates: all exit 0 → **`PASS`**, `failing_gates: []`.
`npm run build` also runs clean (the seventh gate CI runs; not part of check-verify's set here).

**ADVISORY layer** — zero `role: verifier` capabilities exist (P7).

Full suite at head: **53 files, 1087 tests, all passing**. `tests/init.test.ts` went 21 → 24 cases.

Everything below was measured on `4972abb`, the base after the three PRs that landed mid-run
(`REGRESSION.md` names them). The first CI run on this PR was RED against the *merge* ref because
`#151` retyped `confirmWriteTargets`; that is recorded rather than quietly rebased away.

## Measured coverage of the target

Before, on the unmodified `4972abb` tree, `npx vitest run --coverage tests/init.test.ts`:

```text
init.ts          |   94.11 |       95 |     100 |   93.75 | 150,163-164
```

Line `150` is `failure = { err };`; `163-164` are `reportFatal(errorMessage(failure.err), failure);`
and `process.exit(1);`. After, read out of `coverage-summary.json` for `src/commands/init.ts`:

```json
"lines":      { "total": 48, "covered": 48, "pct": 100 },
"functions":  { "total":  2, "covered":  2, "pct": 100 },
"statements": { "total": 51, "covered": 51, "pct": 100 },
"branches":   { "total": 20, "covered": 20, "pct": 100 }
```

This is a **measurement, not a gate**: `vitest.config.ts` is untouched (5.6c owns the ratchet), so
nothing in CI requires these lines to stay covered. The pins are the assertions below.

## The RED that came first — four breaks, four distinct failures

A test-only increment is worth exactly what it fails on. Each break was applied to
`src/commands/init.ts` in the working tree, the suite was run, and the break was reverted with
`git checkout --`. None is committed.

### BREAK 1 — the `catch` swallows silently (`failure = { err };` → `void err;`)

The regression the spec names: a catch turned into a no-op. `pharn init` then reports **success** on
a malformed clone.

```text
 ❯ tests/init.test.ts (24 tests | 3 failed)
   × exits(1), installs nothing, and still cleans up on a malformed clone
   × exits(1) and still cleans up when the install throws mid-copy
   × treats a thrown undefined as a failure, not as success

AssertionError: expected ProcessExit: process.exit(0) { …(1) } to match object ProcessExit: process.exit(1) { code: 1 }
- Expected
+ Received
  ProcessExit {
-   "message": "process.exit(1)",
-   "code": 1,
+   "code": 0,
    "name": "ProcessExit",
  }
 ❯ tests/init.test.ts:258:30

 Tests  3 failed | 21 passed (24)
```

**21 passed** is the load-bearing number: the whole pre-existing suite — including the `Ctrl+C at the
overwrite confirm` case `#151` had just added — is blind to this break. The transcript also settles a
question the spec left open: `toMatchObject(new ProcessExit(1))` *does* discriminate on `code`, so a
failure exiting 0 as a cancel cannot pass as a failure.

### BREAK 2 — the exit is hoisted into the `catch`, above the `finally`

```ts
  } catch (err) {
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  } finally {
    repo.cleanup();
  }
```

This is the break the **spec's own recommended assertion cannot see**:

```text
 ❯ tests/init.test.ts (24 tests | 2 failed)
   × exits(1), installs nothing, and still cleans up on a malformed clone
   × exits(1) and still cleans up when the install throws mid-copy

AssertionError: expected false to be true // Object.is equality
 ❯ tests/init.test.ts:266:43
    264|       expect(runInstallArchetype).not.toHaveBeenCalled();
    265|       expect(cleanup).toHaveBeenCalledTimes(1);
    266|       expect(cleanupRanBeforeTheReport()).toBe(true);
       |                                           ^

 Tests  2 failed | 22 passed (24)
```

Line **265 passes** and line **266 fails**. `expect(cleanup).toHaveBeenCalledTimes(1)` — the
assertion the spec calls *"the assertion that pins it"* — is green under the very regression it is
supposed to pin, because `stubProcessExit` makes the exit a **throw** and a throw still unwinds
through a `finally`. `#151`'s own commit message names the same limitation from the other side
(*"the harness could not reproduce the original bug: stubProcessExit throws ProcessExit… unlike a
real process.exit"*), and worked around it by inducing its RED backwards. The ordering comparison is
a forward-facing pin for the same blind spot.

**What this break costs, stated precisely.** Since `#149` (`3bbbb5f`), `src/lib/repo.ts` registers
every clone in a process-wide set drained by `exit`/`SIGINT`/`SIGTERM` handlers, so a hoisted exit no
longer *leaks* the temp dir in production — the backstop reclaims it. `#149`'s own commit message
says that backstop is *"deliberately not relied on: a backstop that hides a structural bug leaves the
next stage added to that `try` with the same trap and nothing to catch it."* That is exactly this
assertion's job: it observes the primary mechanism, which the backstop otherwise makes invisible.

### BREAK 3 — the cause is stored unboxed (`let failure: unknown = null`)

Legal-looking, strictly simpler code. `throw undefined` then reads as "nothing failed".

```text
 ❯ tests/init.test.ts (24 tests | 1 failed)
   × treats a thrown undefined as a failure, not as success

AssertionError: expected ProcessExit: process.exit(0) { …(1) } to match object ProcessExit: process.exit(1) { code: 1 }
 ❯ tests/init.test.ts:298:30

 Tests  1 failed | 23 passed (24)
```

Exactly one case fails — including the other two new ones — so eval 5 is the only thing in the repo
standing between this refactor and `pharn init` exiting **0**, as a cancel, on a run that crashed.

### BREAK 4 — the cause is dropped at the report (`reportFatal(errorMessage(failure.err))`)

The failure still exits 1; only the actionable next step disappears.

```text
 ❯ tests/init.test.ts (24 tests | 2 failed)
   × exits(1), installs nothing, and still cleans up on a malformed clone
   × treats a thrown undefined as a failure, not as success

AssertionError: expected '' to match /PHARN_DEBUG/
- Expected:
/PHARN_DEBUG/
+ Received:
""
 ❯ tests/init.test.ts:270:26

 Tests  2 failed | 22 passed (24)
```

`Received: ""` is also the answer to GRILL F3: nothing else in a failure run emits the string, so
the loose match is not currently passing for an unrelated reason.

## What the gates cannot see

- **Real `process.exit` semantics.** Every ordering claim here is measured against a *stubbed* exit
  that throws. That nothing in a vitest suite can observe a real `process.exit` skipping a `finally`
  is precisely why BREAK 2 matters, and why the ordering assertion — not the call count — is the
  pin. It remains a proxy for the production behavior, not a demonstration of it.
- **A real malformed clone.** The `ManifestValidationError` path is modelled as a plain `Error`;
  `parseCapabilityIndex`'s own eight throw sites are covered by `tests/capability-index.test.ts`,
  not here.
- **The temp dir actually being deleted.** `cleanup` is a `vi.fn()`. That the real closure `rmSync`s
  its directory — and deregisters it from `#149`'s backstop set first — is `lib/repo.ts`'s contract,
  pinned in `tests/repo-signals.test.ts`, not `init`'s.
