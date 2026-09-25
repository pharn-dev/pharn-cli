# REVIEW — local-file-reads

Increment: a new `src/lib/bounded-read.ts` (`readBoundedFile`, `MAX_LOCAL_FILE_BYTES`). It is one
`O_NONBLOCK` descriptor, `fstat`-checked as a regular file of at most 16 MiB, read from that same
descriptor, and it never throws. Six call sites now read through it:

- `readRecords`;
- `readPharnConfig` and `configFingerprint`;
- `recordedSkillsVersion` and `readCarriedEntries`, init's two tolerant config reads;
- `readRawAt`, the lock.

Tests in four files, two docs, CLAUDE.md and CHANGELOG.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1664 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`. The chain ran twice: this review's first read found a platform inconsistency
(advisory finding 1), fixed within the plan's `## Files` before the second run.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)** — "no pharn-owned project file can block a read" reduces to `O_NONBLOCK` +
  `fstat` in one function, tested per file: records, config, and a young and an old lock, each in a
  child with a hard timeout. "No such read is unbounded" reduces to the size compare, tested at the
  cap, one byte over it, and past it mid-read (`/proc/self/status`, whose `fstat` says 0 bytes).
- **L-eval (P1)** — the five caller cases failed on the unchanged code: four hung until killed, and
  one mislabeled a directory as "not valid JSON". The reader's own cases cannot load on the base
  (new module).
- **L-trust (P2)** — the bytes are returned as data; only the fixed reason strings reach a message.
  A symlinked file is followed as before, and its target is held to the same type and size checks.
- **L-axis (P3)** — one new module with one job. Each caller swaps its read and keeps its own
  failure shape.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/bounded-read.ts:64'
  problem: 'RESOLVED IN THIS INCREMENT. Windows refuses to open a directory (EISDIR at open) where POSIX opens it and fstat says so, so the same directory would have been reported as "could not be read (EISDIR)" on one platform and "is not a regular file" on the other. Both now give the same reason.'
  evidence: "if (code === 'EISDIR') {"
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/pharn-config.ts:309'
  problem: 'A FIFO (or a config over 16 MiB) at pharn.config.json now reads as an unreadable config, which every command other than init answers with "No pharn.config.json found. Run `pharn init` first." That wording was already imprecise for a directory or a permissions problem, and the plan keeps the existing outcome on purpose; the troubleshooting page names these cases. A message that says "cannot be read" would be clearer, but it changes the documented contract of every command, so it is left for its own increment.'
  evidence: "if (read.kind !== 'ok') return null;"
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/bounded-read.ts:48'
  problem: 'On win32 O_NONBLOCK is absent and the flag is not set. Windows has no filesystem FIFOs, so there is nothing to block on, but the Windows path is untested in CI, as every win32 branch in this repo is.'
  evidence: 'const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);'
```

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory (minor; one resolved in this increment).** The standing
decision is the human's (GATE 2).
