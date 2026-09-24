# REVIEW — tar-entry-names

Increment: `src/lib/tar-extract.ts` (`readPathField` — strict UTF-8 with `ignoreBOM`; the check, the path
rules and the write share the decoded string; a per-archive pax budget; global headers counted toward the
entry cap; `describeBytes` for header bytes in messages), `tests/tar-extract.test.ts` (nine cases),
`CHANGELOG.md` (`### Security`). Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check` exit 0
(1507 tests), `/pharn-dev-regress` `no-regressions`, `/pharn-dev-verify` `PASS`.

## Floor-gate findings (blocking)

None.

- L-floor (P0): "the name passed to the filesystem holds no C0/C1/Cf character and is the archive's bytes
  decoded as UTF-8" → a fatal decode plus the `hasUnsafeChars` regex over the exact string written; the
  on-disk half is scoped to the name written (a Unicode-normalizing filesystem is named in VERIFY.md).
  "Pax parsing costs O(64 KiB) per archive" → a cumulative compare before any parse. "Every global header
  counts toward the entry cap" → counter + compare. "No header byte reaches a message raw" →
  `describeBytes` is total over bytes; every other message interpolates only a path that already passed
  the check.
- L-eval (P1): eight of the nine new cases fail on the base `tar-extract.ts` (checked by stashing it);
  the ninth (a leading byte-order mark) passes on both by design — it pins the decoder option the grill
  found. The byte-exact case asserts on the BYTES `readdirSync` returns. A git-archive of pharn-oss
  extracts to the same 2208 files / 414 directories as before.
- L-trust (P2): the increment only narrows what an untrusted archive may contain.
- L-axis (P3): everything stays in the fetch boundary's own module.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/tar-extract.ts:106'
  problem: '`describeBytes` is a second display renderer beside terminal-safe.ts, which PHARN-17 called the one display sanitizer. The input differs (raw bytes that may not decode, vs a string), which justifies a byte-level form; if a second caller needs it, it belongs in terminal-safe.ts.'
  evidence: 'function describeBytes(bytes: Buffer, max = 200): string {'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/tar-extract.ts:137'
  problem: 'One non-UTF-8 name refuses the whole archive — the extractor''s reject-don''t-skip posture, but upstream main is a live input to every deployed CLI (LIMITS.md §3e), so a single such file upstream would fail every install until reverted. pharn-oss ships only ASCII names today; named, not changed.'
  evidence: 'tar entry path is not valid UTF-8'
```

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor).** The standing decision is the human's (GATE 2).
