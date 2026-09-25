# VERIFY — local-file-reads

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, on node 22, with the session proxy
variables unset. They ran as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` /
`CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1664 tests). The four FIFO cases (records, config, a young lock, an old lock)
  were run against the unchanged code first: each read hung in `open(2)` until its 15 s child
  timeout killed it, and a directory at `pharn.records.json` was misreported as "not valid JSON".
  With the reader, the FIFO cases return at once.
- The lock follows its existing rule for an unreadable payload: a young FIFO is refused as a live
  lock, an old one is broken and replaced, and the command runs.
- `npm run test:coverage` passes its ratchet (97.48 / 92.81 / 98.34 / 98.35) and `npm run build`
  exits 0; neither is a verdict gate, both are CI gates.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

Named limits:

- Win32 has no `O_NONBLOCK`; the flag is simply not set there, and Windows has no filesystem FIFOs.
  The Windows path is not run in CI (as `CLAUDE.md` records for every `win32` branch).
- The reader closes the hang for the three files pharn owns. Files it reads through other routes
  (the clone, the settings files, `package.json`, project files under `scanDest` / `readDiskState`)
  keep their own, already-checked readers.
