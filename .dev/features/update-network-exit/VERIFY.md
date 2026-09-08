# VERIFY — update-network-exit

## FLOOR layer — the gates that own the verdict

| gate           | exit | command                                    |
| -------------- | ---- | ------------------------------------------ |
| `test`         | 0    | `npm test` — 52 files, 1069 tests          |
| `lint`         | 0    | `npm run lint`                             |
| `typecheck`    | 0    | `npm run typecheck`                        |
| `format:check` | 0    | `npm run format:check`                     |
| `lint:md`      | 0    | `npm run lint:md`                          |
| `validate`     | 0    | `node .dev/floor/validate.mjs .`           |

`failing_gates[]`: empty. **VERIFIED: floor gates PASS.** (`check-verify.mjs` → `"PASS"`, exit 0.)

No `structural:*` gate: this feature ships no committed eval pair; its deterministic signal is the
two new `*.test.ts` cases, collected by `npm test`.

`validate` reports `FLOOR: GREEN — 0 capabilities checked in .` — this repo ships no markdown
capability, so that gate is vacuously green here and certifies nothing about the increment. Said
plainly so a green row is not read as evidence it is not.

## The evidence that matters: seven breaks, and what each one reddened

A test nobody has watched fail proves nothing. Each break below was applied to
`src/commands/update.ts` in the working tree, measured, and reverted with
`git checkout -- src/commands/update.ts`. **`src/**` is byte-identical to base in the committed
tree.** Counts are over `npx vitest run tests/update.test.ts` (79 tests after this increment).

Two of the seven redden **only** a new test. The other five redden it alongside pre-existing tests —
reported as shared, because "it went RED" and "it was needed" are different claims.

### Break B — hoist the confirm above the version check → **1 RED of 79, only the new test**

The single most valuable result in this report: the ordering assertion is the one guard nothing else
in the repo provides.

Applied — the `if (!yes) ... confirm(...)` block moved from after the version note to the first
statement of `runArchetypeUpdate`, before `s.start('Checking for updates')`. Nothing else changed;
the confirm's message does not depend on `latest`, so this is a compiling, plausible refactor.

```text
 FAIL  tests/update.test.ts > runUpdate (drift-safe) > network failure > version check fails: exit 1 before the confirm and before any clone
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:
  1st vi.fn() call:
    Array [
      Object {
        "initialValue": true,
        "message": "Re-fetch capabilities at the latest version?",
      },
    ]

Number of calls: 1

 ❯ tests/update.test.ts:416:35
    415|       expect(fetchRepo).not.toHaveBeenCalled();
    416|       expect(prompts.confirm).not.toHaveBeenCalled();
       |                                   ^

 Test Files  1 failed (1)
      Tests  1 failed | 78 passed (79)
```

Pre-existing tests reddened: **none**. Before this increment, a `pharn update` that asked the user to
approve a re-fetch and only then discovered it could not read `SKILLS_VERSION` shipped green.

### Break F — a salvage fetch + cleanup on the clone-failure path → **1 RED of 79, only the new test**

Applied — the clone catch gains `const salvage = await fetchRepo().catch(() => null);
salvage?.cleanup();` before its unchanged `reportFatal` / `process.exit(1)`. The exit code, the
message, the hint and the stream are all untouched, so the entire `fatal-error reporting` suite stays
green.

```text
 FAIL  tests/update.test.ts > runUpdate (drift-safe) > network failure > clone fails: exit 1, no clone to clean up, nothing written
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:
  1st vi.fn() call:
    Array []

Number of calls: 1

 ❯ tests/update.test.ts:443:27
    443|       expect(cleanup).not.toHaveBeenCalled();
       |                           ^
    444|       expect(fetchRepo).toHaveBeenCalledTimes(1);

 Test Files  1 failed (1)
      Tests  1 failed | 78 passed (79)
```

Pre-existing tests reddened: **none**. This break is admittedly contrived as a refactor a human would
write; its job is to prove the assertion is wired rather than vacuous, and it does — with the
assertion order deliberately flipped (`cleanup` before the call count) so the invariant, not its
corroboration, is what fails first.

### Break G — stamp `pharn.config.json` before the version check → 7 RED of 79 (2 new, 5 pre-existing)

Applied — `await writePharnConfig(cwd, ...)` inserted as the first statement of
`runArchetypeUpdate`. This is the break that exercises the new tests' "nothing written" assertion on
BOTH paths.

```text
 FAIL  tests/update.test.ts > runUpdate (drift-safe) > network failure > version check fails: exit 1 before the confirm and before any clone
AssertionError: expected { pharnVersion: '0.4.0', …(8) } to be null

- Expected:
null
+ Received:
{
  "archetypes": [ "ssr" ],
  "capabilities": [ { "name": "a11y", "role": "griller" } ],
  "commit": null,
  "installedAt": "2026-09-08T18:54:31.781Z",
  "layout": "flat",
  "modules": [],
  "pharnVersion": "0.4.0",
  "repo": "pharn-dev/pharn-oss",
  "skillsVersion": "1.0.0",
}

 ❯ tests/update.test.ts:420:37
    420|       expect(readPharnConfig(proj)).toBeNull();
       |                                     ^

      Tests  7 failed | 72 passed (79)
```

Both new tests RED, plus five pre-existing (`MIN_CLI gate`, two `--force` failure-path tests, the
mid-loop-throw test, and the records-before-config test). Shared coverage — the assertion is new for
these two paths, not new to the repo.

### Break D — stamp `pharn.config.json` before the clone → 6 RED of 79 (1 new, 5 pre-existing)

The same insertion moved below the version check, isolating test 2. The interesting half is what
stayed GREEN: `prints the hint when the clone throws` and `dumps the error instead of the hint under
PHARN_DEBUG=1` both passed, because the message axis cannot see a write.

```text
 FAIL  tests/update.test.ts > runUpdate (drift-safe) > network failure > clone fails: exit 1, no clone to clean up, nothing written
AssertionError: expected { pharnVersion: '0.4.0', …(8) } to be null
 ❯ tests/update.test.ts:445:37
    445|       expect(readPharnConfig(proj)).toBeNull();

      Tests  6 failed | 73 passed (79)
```

### Break C — the version-check catch swallows the failure → 2 RED of 79 (1 new, 1 pre-existing)

Applied — `process.exit(1)` replaced with `latest = '9.9.9';`, i.e. "degrade gracefully and carry on"
— the refactor shape the spec worries about.

```text
 FAIL  tests/update.test.ts > runUpdate (drift-safe) > fatal-error reporting > prints the PHARN_DEBUG hint when the version check throws, on stderr
AssertionError: promise resolved "undefined" instead of rejecting

 FAIL  tests/update.test.ts > runUpdate (drift-safe) > network failure > version check fails: exit 1 before the confirm and before any clone
AssertionError: promise resolved "undefined" instead of rejecting
 ❯ tests/update.test.ts:408:32
    408|       await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(…

      Tests  2 failed | 77 passed (79)
```

Shared: the `exit(1)` pin is **pre-existing coverage**. The new test re-asserts it as the
precondition of its effect assertions, and the spec's premise that this catch was "dead to the suite"
is false.

### Break E — retry the clone once instead of exiting → 3 RED of 79 (1 new, 2 pre-existing)

Applied — the clone catch replaced with `catch { repo = await fetchRepo(); }`. Because
`mockRejectedValueOnce` queues exactly one rejection, the retry succeeds, the run completes, and the
command exits 0.

```text
 FAIL  ... fatal-error reporting > prints the hint when the clone throws
 FAIL  ... fatal-error reporting > dumps the error instead of the hint under PHARN_DEBUG=1
 FAIL  ... network failure > clone fails: exit 1, no clone to clean up, nothing written
AssertionError: promise resolved "undefined" instead of rejecting
 ❯ tests/update.test.ts:435:32

      Tests  3 failed | 76 passed (79)
```

### Break A — hoist the clone above the version check → 9 RED of 79 (2 new, 7 pre-existing)

Applied — `await fetchRepo();` as the first statement of `runArchetypeUpdate`. This is the exact
regression the spec names ("a future reorder that clones first would burn a full fetch before
discovering it cannot check the version"), and it turns out to be **already** guarded: seven existing
tests assert `expect(fetchRepo).not.toHaveBeenCalled()` on paths that must not clone.

```text
 FAIL  ... network failure > version check fails: exit 1 before the confirm and before any clone
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 ... plus: reports already up to date without cloning; cancels when declined; --yes at the current
 version early-returns; proxy notice ×2; fatal-error reporting ×2

      Tests  9 failed | 70 passed (79)
```

## Assertions I could NOT make fail — and what that means

Five assertions per test survived every one of the seven breaks:

- `expect(body(DOC)).toBe('constitution v1')` and `expect(body(CAP_FILE)).toBe('a11y v1')`
- `expect(records()).toEqual(recorded)` and `expect(records()![DOC]).toBe(sha256File(...))`
- `expect(backupDirs()).toEqual([])`

The reason is structural, not accidental: every file write in `update.ts` lives inside `applyUpdate`,
which neither failure path reaches, and `createBackup` runs later still. Falsifying these would mean
inventing a new write site rather than moving an existing one — which is what break D/G did for the
config, the one write that sits outside `applyUpdate`.

**What that means, stated plainly:** those five assertions are a written statement of the invariant,
not a guard for it. They are kept because they are cheap and match the in-repo house style for
"nothing written" (`MIN_CLI gate`, `tests/update.test.ts:1128`), and because a future refactor that
DID move a write earlier would be caught by them — but on today's evidence they carry no
demonstrated detection power. Anyone reading `npm test` green should not conclude from them that
`update` cannot write on a failed network call; they should conclude that it does not today, at the
five paths this fixture lays down.

The same honesty applies to `expect(cleanup).not.toHaveBeenCalled()`: it is falsifiable only in
company with `expect(fetchRepo).toHaveBeenCalledTimes(1)`, because `cleanup` exists only on a handle
a resolved `fetchRepo` returns (`src/lib/repo.ts:94-98`, which also `rmSync`s its own temp dir in its
catch — so the "no clone to clean up" invariant is really `repo.ts`'s, not `update.ts`'s).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Nothing annotates this report, and nothing could have
flipped the verdict if it had: `check-verify.mjs`'s only input is the gate→exit-code map, so a
verifier finding cannot reach it even in principle (fix #3).

## Honest residual

Verified = **the named gates passed**. For a test-only increment that is a weaker statement than
usual: the gates confirm the new tests pass and break nothing, and the transcripts above — not the
gates — are the evidence that the tests would fail if the behavior regressed. Of eighteen assertions
across the two new cases, **three are isolated guards** (breaks B and F), five are shared with
pre-existing coverage, and ten were not falsified by anything attempted. That accounting is the
report; the green table is not.
