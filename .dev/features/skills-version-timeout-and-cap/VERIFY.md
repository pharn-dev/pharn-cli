# VERIFY — skills-version-timeout-and-cap

**Verdict (FLOOR, `node .dev/floor/check-verify.mjs` → exit 0): `PASS` — every named deterministic
gate exited 0.** `failing_gates[]` is empty.

Machine report: `.dev/features/skills-version-timeout-and-cap/verify-report.json`.

## FLOOR layer — the gates that OWN the verdict

| gate           | command                          | exit |
| -------------- | -------------------------------- | ---- |
| `format:check` | `npm run format:check`           | 0    |
| `lint`         | `npm run lint` (--max-warnings 0)| 0    |
| `lint:md`      | `npm run lint:md`                | 0    |
| `typecheck`    | `npm run typecheck` (both configs)| 0   |
| `test`         | `npm test` (vitest, 894 tests)   | 0    |
| `build`        | `npm run build`                  | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | 0    |

The set is exactly the repo's `npm run check` aggregate plus `build` and `validate`. No
`structural:*` gate: this increment ships no committed eval pair, so none exists (absent from the map,
not skipped).

Counts are post-fix throughout: the gates above were re-run **after** the two blocking
`/pharn-dev-review` findings were resolved, so 894 is the current suite. Where `892` appears in
`REVIEW.md` it is always the explicitly-labeled **pre-fix** baseline (the suite the two surviving
mutants were measured against), never a second reading of the same run.

The five cases that carry this increment's own correctness, all inside `npm test`:

- `rejects an honestly-declared oversize WITHOUT reading the body` — passed before the fix too; it
  pins that the advisory `content-length` fast-fail SURVIVED the rewrite.
- `rejects an oversized chunked body by BYTE count, with no content-length` — **failed before the
  fix** with `/invalid format/` (the body slipped past both caps and died downstream). Now `/too
  large/`.
- `keeps the abort timer armed through the BODY read, not just the headers` — **failed before the
  fix** by hanging to vitest's 5s timeout. Now rejects at the 8,000th faked millisecond.
- `reassembles a body that arrives in several chunks` and `treats a bodyless response as empty, and
  rejects it as an invalid version` — added in response to `/pharn-dev-review`'s P1 finding; both
  mutation-checked (`offset += 0` and dropping the null-body guard each kill exactly one).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.
**No verifiers registered — floor gates only.** None is authored speculatively (P7). Step 2 is a
no-op and contributes nothing to the verdict; `check-verify.mjs`'s only input is the gate→exit-code
map, so a verifier finding could not have changed this number even if one existed (fix #3).

## Honest residual (P0/P7)

"Verified" here means **these gates passed** — it does not mean the increment is correct. Two
specific limits this increment names rather than leaves implicit:

- The timer test pins **pharn's** half (the abort is still armed at body-read time). That undici
  wires the request signal into a real response body stream is **assumed**, not asserted — the mock
  supplies that wiring, and asserting it would be asserting Node's behaviour.
- The byte cap bounds **accumulation across chunks**, not peak allocation: the compare runs after a
  chunk is handed over, so at most one chunk beyond 256 KB is ever held, sized by the runtime rather
  than by pharn. Both limits are written at the code and test sites, not only here.
