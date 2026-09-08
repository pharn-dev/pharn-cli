# VERIFY — atomic-json-writes

- machine report: `.dev/features/atomic-json-writes/verify-report.json`
- verdict (FLOOR, `.dev/floor/check-verify.mjs` exit 0): **PASS**

## FLOOR layer — the deterministic gates (these OWN the verdict)

| gate           | exit |
| -------------- | ---- |
| `test` (1023)  | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

## ADVISORY layer — verifiers

`count-verifiers.mjs` → 0 registered. Floor gates only; a verifier finding could not have flipped
the verdict in any case (fix #3).

## What this does and does not guarantee

Guaranteed: the six named gates passed. **Not** guaranteed — and deliberately not claimed anywhere in
the increment: that the records+config PAIR is transactional (it is not; a crash between them still
leaves the stamp mismatch `recordsBaseline` already reports), that two concurrent `pharn` processes
are serialized (there is no lock), or that the bytes are durable across a power cut (no `fsync`). The
tests pin the one claim that is made — the target is replaced or left untouched — including that a
failed write rethrows the WRITE's error rather than the best-effort cleanup's.
