# REGRESSION — project-lock

Baseline `9300b8230a77d021da07eee0e77b7c547c8aa92e`, measured in a detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**. 1073 → 1095 tests (+22). Coverage 96.72%
statements against a 90 threshold; `project-lock.ts` itself 92.06% / 100% functions. Thresholds
untouched — the new module earns real coverage rather than an exclusion.

**Two pre-existing test fixtures had to change, and neither is a behaviour regression:**

- `tests/remove.test.ts` never created its project root (only `write()` did, as a side effect), so
  the one test that writes nothing had no directory to lock in. A real cwd always exists; the fixture
  now creates it.
- `tests/add.test.ts` runs most cases against the fake cwd `/proj`, where a real `openSync` is
  `ENOENT`. The lock is mocked there — as `repo.js` already is — **keeping the real error class**, so
  the `instanceof` refusal branch is still exercised, plus an explicit wiring pin.
