# VERIFY — tar-entry-names

## FLOOR layer (owns the verdict)

Gates run over the whole repo with the feature present, on node 22 with the session proxy variables unset
and as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`) — the
CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

`test` is vitest (1507 tests), which collects this increment's own tests (`tests/tar-extract.test.ts`).
`test:floor` is floor.yml's `node --test` run (754 tests). No `structural:*` gate — the increment ships no
eval-actual pair. Outside the verdict, a git-archive of pharn-oss@b31e540 (the review's real-archive
fixture) was extracted with the new code: 2208 files and 414 directories, the same as before.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers registered, floor
gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond what those
gates check — verifier concerns are advisory help, not assurance. The byte-exact name holds for the name
pharn passes to the filesystem; a filesystem that normalizes Unicode (HFS+) may store other bytes.
