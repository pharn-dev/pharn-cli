# PLAN — fail closed on PAX extended headers in the tar reader

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e
- increment: `tar-extract.ts` stops discarding PAX extended-header records — it throws on any
  per-file `x` header, and on a global `g` header carrying a record that overrides subsequent
  entries — instead of skipping metadata that silently changes where a file lands or how the rest
  of the stream is framed.
- layer(s): pharn CLI `src/lib/` (the fetch boundary; `ARCHITECTURE.md §4` bottom-shared lib, no
  sibling imports added — the module keeps its single `./validate.js` import)
- constitution_refs: [P0, P1, P2, P5, P7]

## The defect, measured (P6 — grounded in reads made this run)

`src/lib/tar-extract.ts:235` sorts typeflag `g` and `x` into a SKIP bucket that advances past the
padded payload **applying no rules at all**. The payload is thrown away.

A PAX `x` header's records **override the ustar header that follows it**. Two of them are
load-bearing:

- `path=` — replaces `prefix`+`name`. A writer emits it precisely when the real path does **not**
  fit ustar, and it writes a **truncated** path into the ustar header it cannot represent.
- `size=` — replaces the size field, i.e. how many bytes the next entry occupies. Ignoring it
  mis-frames **every subsequent header**, so the parser starts reading attacker-controlled file
  _content_ as tar headers.

Reproduced this run, not inferred. A pax-format archive containing one 140-character filename
(`tar --format=pax`) emits, as its last two headers:

```text
typeflag='x'  size=362  name='PaxHeader/zzz…(95 z)'  prefix='paxsrc/deep'
   PAYLOAD: b'166 path=paxsrc/deep/zzz…(140 z).txt\n30 ctime=…\n30 atime=…\n30 mtime=…\n…'
typeflag='0'  size=2    name='zzz…(exactly 100 z)'   prefix='paxsrc/deep'
```

The ustar `name` is the real name **truncated to the 100-byte field**. It is contained, it has a
leading component, it passes the `..`/absolute/single-root/`safeJoin` rules — so today's parser
skips the `x`, accepts the `0`, and writes the file at a **wrong path, silently**. That is exactly
the class of failure the module's own header comment says it exists to prevent ("every unexpected
entry is a THROW … anything else is a signal, not noise"), and the one bucket that does not.

Live-archive measurement (`codeload.github.com/pharn-dev/pharn-oss/tar.gz/refs/heads/main`,
downloaded and parsed this run — 11,192,320 uncompressed bytes, 1,968 header entries):

| measurement                             | value                                                   |
| --------------------------------------- | ------------------------------------------------------- |
| typeflags present                       | `g`×1, `5`×327, `0`×1640 — **zero `x`**, zero `L`/`K`   |
| the one `g` payload                     | `52 comment=ab9aabdf5ea5177713bda2fee82c7220ec559a7c\n` |
| longest dest-relative path (post-strip) | **97**                                                  |
| longest raw ustar `name` field          | **100** — exactly at the field ceiling                  |
| longest single path component           | 41                                                      |
| entries already using `prefix`          | 42                                                      |

So the defect is **latent, not exploitable today** — but the margin is thinner than "97" suggests:
the `name` field is already **full**. One more character on that path, or any single component over
100 bytes, moves an entry into the PAX path.

## Files

- `src/lib/tar-extract.ts` — replace the two-typeflag SKIP with the split below; add the record
  reader used only to name keywords — layer `src/lib/` (fetch boundary)
- `tests/tar-extract.test.ts` — one fixture per shape thrown on, plus the unchanged-extraction
  proofs — layer `tests/`
- `CHANGELOG.md` — one entry under the existing `## [Unreleased]` → `### Fixed`
- `SECURITY.md` — the one `tar-extract.ts` in-scope sentence describing the SKIP bucket — layer
  `docs (disclosure policy)`

**Scope amendment, recorded rather than back-dated.** `SECURITY.md` was NOT in this plan's original
`## Files`: it was being rewritten by a sibling PR (#159) when this increment was planned, so it was
held out. Once #159 merged, the human directed that it join THIS increment rather than a follow-up —
because the sentence on `main` is _correct about current code_, and merging this increment is what
makes it false. Landing the fix first would put a disclosure policy that misdescribes its own parser
on `main` for the length of the gap, which is the shape of audit finding P-2 (the policy describing a
fetch the tool does not perform) that was just closed. The chain's regress/verify stages were re-run
after the amendment so the recorded verdicts describe what actually ships.

## The rule (P5 — membership tests, no classification)

**`x` (per-file extended header) → THROW, unconditionally.**

The decision is `typeflag === 'x'`. It does **not** consult the payload, so no parse of untrusted
bytes can suppress it. Justified by measurement, not by taste: codeload archives are written by
`git archive`, which emits an `x` header for exactly three reasons — a path too long for ustar, a
link target too long for ustar, and a size at/over the octal ceiling — i.e. `path`, `linkpath`,
`size`, **all three load-bearing**. The live archive contains **zero**. So for this archive
"an `x` exists" and "a record that changes interpretation exists" are the same predicate, and the
cheaper, unparsed one is the one to branch on.

**`g` (global extended header) → THROW only when it carries `path`, `linkpath` or `size`;
otherwise SKIP.**

`g` cannot take the same rule: **every** codeload archive opens with one, so an unconditional throw
would reject 100% of real fetches on the first block — the exact regression the existing
`skips the leading pax_global_header` test was written for. The asymmetry is evidence-driven and
states in one line: **`x` is absent from the live archive, so its presence is the signal; `g` is
mandatory, so only its contents can be.** A `g` record applies as a _default to every subsequent
entry_, so the same three keywords are the harmful set; `comment` (what GitHub actually sends),
`mtime`, `uid`, `gid`, `uname`, `gname`, `charset` and vendor `SCHILY.*`/`LIBARCHIVE.*` records
change nothing pharn reads and stay skipped.

**Deliberately NOT thrown on, with the reason:**

- **GNU `L` / `K` (long name / long link name).** Already fail closed — they are not `0`/NUL/`5`,
  so they fall to the existing `unsupported type` reject. Adding a branch would be a second way to
  say the same thing (P3, one axis). Pinned by a **test** instead, so a future refactor of the
  bucket cannot silently start accepting them.
- **A `g` carrying only metadata** (`comment`/`mtime`/`uid`/…). Throwing would break every fetch
  for a change that cannot move a byte pharn writes — a guarantee sold over an availability cost
  with no threat behind it (P7).
- **Implementing PAX.** Explicitly out of scope. pharn fetches ONE known archive shape; honouring
  `path=` would mean re-running the whole path-rule pipeline over a _second_ untrusted path source,
  i.e. new attack surface bought for a case that does not occur.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the audit finding P-14 this closes is consumed as DATA; no
  contract file changes.
- No `pharn-contracts` schema is touched: this is a CLI-internal parser invariant.

## Evals to write (P1 — every branch demonstrated, not asserted)

- `x` header carrying `path=` → throws `TarExtractError`, and the file does **not** appear at the
  truncated path (the defect, demonstrated end-to-end: the fixture is the real shape — an `x` whose
  `path=` disagrees with a truncated ustar `name` that would otherwise extract cleanly).
- `x` header carrying `size=` → throws (the stream-reframing record the "throw on `path=`" reading
  of the finding would have missed).
- `x` header carrying only `mtime=` → **still throws** (pins that the decision is the typeflag, not
  the payload).
- `x` header with an empty / unparsable payload → still throws (pins that a payload the reader
  cannot understand cannot dodge the throw).
- error message names the typeflag and the record keywords it could read → diagnosable in one read.
- `g` carrying `path=` → throws. `g` carrying `size=` → throws. `g` carrying `linkpath=` → throws.
- `g` carrying `comment=<sha>` (**the live archive's actual first block**) → skipped, extraction
  unchanged — the anti-regression for the 100%-failure bug.
- `g` carrying `mtime=`/vendor records → skipped.
- GNU `L` and `K` typeflags → throw `unsupported type` (pinning the existing fall-through).
- The existing normal-ustar extraction test still passes byte-for-byte.

## Guarantee audit (P0)

| claim                                                                 | reduction                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "a per-file `x` header never reaches a write"                         | **floor — enum check.** `typeflag === 'x'` → throw, before any path rule or write. No payload input.                                                                                        |
| "a `g` header cannot silently set a default `path`/`linkpath`/`size`" | **floor — enum/regex check.** keyword parsed by a fixed record grammar, membership-tested against a 3-element set.                                                                          |
| "the extractor still accepts every real codeload archive"             | **advisory** — grounded in a measurement of one archive at one commit, re-checked by the `comment=` skip test. Not a floor claim; a future upstream shape change is _meant_ to fail loudly. |
| "the error is diagnosable in one read"                                | **advisory** — message quality. Backstopped by a test asserting the typeflag and keyword appear.                                                                                            |
| "no file lands at a truncated path"                                   | **floor — enum check** (the throw above), plus the pre-existing `safeJoin` containment gate.                                                                                                |

No new floor primitive is introduced: both branches are `ARCHITECTURE.md §2` primitive #3
(enum/regex membership), the same class as the existing typeflag allowlist.

## Trust audit (P2)

- **Input:** the PAX payload — remote, attacker-controlled bytes, `trust: untrusted`.
- **`x` path:** taint **does not propagate to the decision at all.** The throw is taken from the
  typeflag byte alone; the payload is read only _after_ the decision, only to build a message.
- **`g` path:** taint reaches a branch, so it is gated: the payload is parsed by a fixed
  `<len> <keyword>=<value>\n` grammar and only the **keyword** is used, membership-tested against
  `{path, linkpath, size}`. Values are never read, never joined into a path, never written.
- **Message construction:** keywords are filtered to a strict `[A-Za-z0-9._-]` shape and capped
  before interpolation, so no control characters or unbounded remote text reach the terminal —
  the same posture as `CONTROL_CHARS_RE` in `lib/validate.ts`.
- **Residual (named, not hidden):** a malformed record whose length prefix disagrees with its own
  bytes could make the `g` reader mis-split records. It fails **closed** in the direction that
  matters — a keyword it fails to isolate is simply not matched, and the surrounding ustar rules
  (single-root, `..`, absolute, `safeJoin`) still gate every write. It cannot manufacture a write.

## Determinism audit (P5)

Both new branches are membership tests over a fixed alphabet — `typeflag === 'x'`, and
`keyword ∈ {path, linkpath, size}`. Neither has a fallback: an unrecognised `x` payload still
throws, and a `g` keyword outside the set is skipped by construction, not by a guess. Nothing
classifies, nothing degrades.

## Open questions (HALT)

None. The one judgment call — unconditional `x` throw vs. payload-conditional — was resolved by
measurement (zero `x` in the live archive; `git archive` emits `x` only for the three load-bearing
records), and the human pre-approved the minimal-fix shape (throw, do not implement PAX).
