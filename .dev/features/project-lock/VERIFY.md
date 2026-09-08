# VERIFY — project-lock

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**. `npm run build` clean.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**Coverage is split across three files on purpose**, because each can only see one thing:

- `tests/project-lock.test.ts` (17) — the module against real directories: acquire/release, the
  refusal, all three staleness rules, six malformed payloads, the foreign-host rule, and that release
  never deletes a lock it does not own.
- `tests/project-lock-commands.test.ts` (4) — the seam: a held lock makes `remove` exit 1 with **no
  config write and the capability still on disk**, the refusal does not clear the lock it refused on,
  a normal run leaves none behind, and a week-old lock is broken rather than wedging.
- `tests/add.test.ts` — the wiring: `add` takes the lock **once** per run, naming itself and the cwd.
  A per-pick lock would leave gaps between picks, and only a call-count assertion can see that.

**What PASS does not cover, stated plainly.**

- **It is an advisory lock.** `O_EXCL` is atomic, but nothing stops a non-pharn writer, and no
  cross-machine or NFS guarantee is claimed — the spec excludes both.
- **Age can retire a genuinely live foreign-host lock** after six hours. That is a deliberate trade:
  wedging a project forever is the worse failure, and the held window is short by design. Not a bug,
  but not a guarantee either.
- **No concurrency test runs two real processes.** The interleave is reasoned from the code and the
  refusal is tested; a true two-process race harness was not built.
