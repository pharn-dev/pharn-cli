# PLAN — make fetchRemoteSkillsVersion honor its 8s timeout and 256KB cap on the body

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Move the 8s abort timer so it stays armed through the **body read**, and replace the
  header-trusting + post-buffered UTF-16 body cap with a **streaming byte** cap — making the three
  network guards CLAUDE.md/SECURITY.md/THREAT-MODEL.md already claim (`redirect: 'error'`, 8s
  timeout, 256KB body cap) true of the body, not just of the header exchange. Pin both with tests.
- layer(s): the CLI's **lightweight fetch boundary** — `src/lib/skills-version.ts`
  (`fetchRemoteSkillsVersion` only) plus its test file.
- constitution_refs: [P0, P1, P2, P3, P4, P7]

## Discovery (live state, read this run — P6)

Verified in `/Users/pgalarowicz/Projects/pharn-cli` (clean tree, branched off `main` @ `2db6563`,
`package.json` version `0.4.0`):

- `src/lib/skills-version.ts:155-179` is the whole function. Its `try { res = await fetch(...) }
  finally { clearTimeout(timer) }` closes **before** `await res.text()` at `:172` — `fetch()` resolves
  on headers, so no pharn timer is armed during the body read.
- `:168-171` is the pre-read cap and it reads `res.headers.get('content-length')`. Verified at
  runtime: a `Response` wrapping a constructed `ReadableStream` reports `content-length` **`null`**;
  `Number(null) === 0` and `Number.isFinite(0)` is `true`, so `0 > MAX_BODY_BYTES` is false and the
  guard passes. A hostile server can equally declare a small lie.
- `:173-177` is the post-read cap and counts `text.length` — **UTF-16 code units**, not bytes.
  Verified: `'一'.repeat(100_000)` is 100,000 code units but 300,000 bytes.
- Verified end-to-end against the CURRENT exported function (tsx, `globalThis.fetch` stubbed with a
  `Response` over that 300,000-byte stream): it **resolves past both caps** and dies downstream in
  `assertSafeString` as `SKILLS_VERSION has invalid format: ...` — a rejection, but the wrong one,
  after the whole body was already buffered.
- `src/lib/repo.ts:112-121` (`fetchCommitSha`) already has the correct timer shape: ONE `try`
  covering the fetch **and** `await res.json()`, `clearTimeout` in the `finally` after the body is
  consumed. It swallows every failure to `null` (best-effort provenance) — that half must NOT be
  mirrored.
- Consumers both print-and-`exit(1)` on a throw: `src/commands/update.ts:122-131` and
  `src/commands/status.ts:60-67`. Neither may see a default or `null`.
- `tests/skills-version.test.ts:12-19` `fakeResponse` is a hand-rolled object literal with
  `headers.get: () => String(body.length)` and `text: async () => body` — it has **no** `res.body`,
  so it cannot drive a streaming implementation and must be replaced by a real `Response`. Its four
  `fetchRemoteSkillsVersion` cases (`:114-139`) are the redirect/signal pin plus ok/non-ok/invalid.
  Neither cap branch has any test today.
- `vitest.config.ts:13-18` thresholds are **global** (`statements 90, branches 82, functions 95,
  lines 92`), so deleting the cap outright would not turn CI red — the invariant is currently
  protected by nothing.
- `SECURITY.md:56`, `THREAT-MODEL.md:135`, `docs/contributing.md:85` and the function's own
  docstring (`:149-154`) all already state the intended behavior. They are correct **after** this
  fix and wrong before it — so this increment needs **no doc edit**, only a CHANGELOG entry.
- `CHANGELOG.md` has a live `## [Unreleased]` section with `### Added` / `### Fixed` subsections.

## Files

- `tests/skills-version.test.ts` — written FIRST (P1). Replace `fakeResponse` with a real-`Response`
  factory the streaming implementation can consume; keep the four existing cases' intent byte-for-
  byte; add the two negative cap cases specified in `prompts/4.11-body-cap-tests.md`
  (declared-oversize rejects before any body read; multi-byte chunked oversize rejects `/too large/`)
  and one timer-scope case — layer: tests
- `src/lib/skills-version.ts` — `fetchRemoteSkillsVersion` only: one `try` covering fetch **and**
  body read with `clearTimeout` in its `finally`; a streaming byte-counting cap over `res.body`;
  `TextDecoder` after the cap holds; `null` body → empty text; keep the advisory `content-length`
  fast-fail, `redirect: 'error'`, the signal, both error-message shapes, and the final
  `assertSafeString` — layer: the lightweight fetch boundary
- `CHANGELOG.md` — a `### Fixed` bullet under `## [Unreleased]` — layer: docs

Explicitly NOT touched: `readSkillsVersion`, `readMinCli`, `fetchCommitSha`/`fetchRepo`
(`src/lib/repo.ts`), `src/commands/update.ts`, `src/commands/status.ts`, `src/lib/validate.ts`,
`vitest.config.ts`.

## Contracts satisfied

- `CONSTITUTION.md` P2's network-guard clause ("Remote fetches use `redirect: 'error'`, an 8s
  timeout, and a 256KB body cap") — cited, not restated (P4). This increment makes the clause true
  of the body; it does not widen it.
- `ARCHITECTURE.md §2` floor primitive "network guard" — the cap becomes an integer compare over
  actual wire bytes rather than a value the remote host supplies.

## Evals to write (P1)

No new PHARN capability is authored (this is CLI code), so P1 is discharged by `vitest` cases:

- declared `content-length` over the cap → rejects `/too large/`, **and the body is never read**.
  Mechanism pinned post-grill (GRILL.md F2): the response carries an **already-errored** body stream
  (`c.error(new Error('body must not be read'))`), so touching it would surface THAT message — which
  makes `rejects.toThrow(/too large/)` itself the proof, with no spy and no flag to get wrong
  (`Response.prototype.body` is a prototype getter, and a `ReadableStream`'s `start` runs at
  construction, so both of the obvious alternatives fail silently).
- chunked body (no `content-length`) of 300,000 **bytes** / 100,000 code units → rejects
  `/too large/`. Multi-byte is load-bearing: an ASCII oversize already rejects pre-fix via
  `text.length`, so it would pin nothing.
- the abort timer is live during the body read → with `vi.useFakeTimers()` and a mock that wires
  `opts.signal`'s `abort` to `controller.error(...)` on the body stream (what undici does),
  `vi.advanceTimersByTime(8000)` rejects instead of hanging. **Limit labeled post-grill (GRILL.md
  F3):** this pins pharn's half — the timer is still armed at read time, so moving `clearTimeout`
  back before the read makes this case hang instead of reject. It does NOT prove undici wires the
  signal into a real body stream; that half is assumed, and the test says so in a header comment.
- the four existing cases (resolve+trim, redirect/signal pin, non-ok `/fetch failed/`, invalid value
  `ManifestValidationError`) stay green against real `Response` objects.

## Guarantee audit (P0)

- "a slow body cannot hang `pharn update` / `pharn status --no-drift` past 8s" → **floor**: the
  `AbortController` timer is cleared only in a `finally` that closes after the read loop settles, so
  the signal that undici wires into the body stream is still armed while chunks are awaited. Pinned
  by the fake-timer test.
- "the read stops the first time the running total exceeds 256KB" → **floor**: an integer compare on
  a running `Uint8Array.byteLength` sum inside the read loop, throwing (and cancelling the reader)
  the moment it exceeds the cap. Independent of any header the remote supplies. **Restated
  post-grill (GRILL.md F1): this bounds accumulation ACROSS chunks, not peak allocation** — the
  compare necessarily runs after a chunk has been handed to us, so at most one chunk beyond the cap
  is ever held, and that chunk's size is undici's (commonly ≤64KB from a socket read), not pharn's.
  Strictly stronger than today's "unbounded"; not the peak-allocation bound a careless reading would
  take it for.
- "the declared `content-length` fast-fail rejects an honestly-declared oversize before reading" →
  **advisory** — it is a courtesy over an attacker-controlled header, explicitly backstopped by the
  streaming counter above. Labeled as such in the code comment (P0: label, then backstop).
- "the returned value is a valid version" → **floor, unchanged**: `assertSafeString(..., VERSION_RE)`
  is untouched.
- "failures reach the user as exit(1), never a default" → **floor**: every failure path is a `throw`;
  no `catch` is introduced (unlike `fetchCommitSha`, whose `null` half is deliberately not mirrored).
- "`fetchRepo`'s degit boundary has no timeout or cap" → **NOT closed, unchanged** — a labeled limit
  (`THREAT-MODEL.md §4`), untouched by this increment.

## Trust audit (P2)

- **Input:** the raw `SKILLS_VERSION` bytes from `raw.githubusercontent.com` — untrusted, plus two
  untrusted response fields now consulted: `content-length` (advisory only) and the body's byte
  length (a counter, never a size to allocate against).
- **Taint propagation:** the collected bytes reach exactly one place — `TextDecoder.decode` →
  `.trim()` → `assertSafeString(..., VERSION_RE)`, which is anchored, so control characters and any
  injected payload fail it before the value is returned, persisted, or compared. No untrusted byte
  reaches a path join, a write, or a branch other than "is the running total over the cap".
- **Not widened:** no allowlist is loosened; the number of network round-trips is unchanged; the
  fetch options object is unchanged.

## Determinism audit (P5)

- The cap is `total > MAX_BODY_BYTES`, an integer compare — no classification, no heuristic.
- The `content-length` fast-fail keeps its existing `Number.isFinite` shape; because it is advisory
  its `Number(null) === 0` behavior is no longer load-bearing, and the comment says so rather than
  leaving a reader to infer it.
- Both failure modes end in a named `throw` (`fetch failed (${status})`, `too large (${n} bytes)`),
  never in a fallback value or a guess.

## Consequences worth naming (not open questions)

- **The 8s abort's surface MOVES** from `await fetch(...)` to the body-read loop. Nothing wraps it
  today (the propagation is raw either way), but `prompts/4.06-network-error-messages.md` will wrap
  it — so a `// FABLE 4.6:` marker is left at the read site so that sibling fix cannot miss the
  relocated surface.
- **The reader is cancelled on the cap throw only** (GRILL.md F5). A transport error mid-body and
  the abort itself leave the body un-cancelled — benign **because both consumers `process.exit(1)`
  immediately**, which is a caller property, not a local one, so it is written at the code site
  rather than left implicit for a future non-exiting caller.
- **`res.body === null`** (a `Response` built from `null`, e.g. a 204) now decodes to `''`, which
  `assertSafeString` rejects as an invalid version — same outcome as today's `res.text()` returning
  `''`, reached by a different line.

## Out of scope (explicitly not in this increment)

- Wrapping transport/abort errors with the host name + `PHARN_DEBUG` hint — `prompts/4.06`.
- The degit exact-version pin — `prompts/4.10`, its own brief; it rides in the same PR bundle but is
  a dependency-declaration change with a separate acceptance list, not this increment.
- Adding a body cap to `fetchCommitSha` (`src/lib/repo.ts`) — its JSON body is small by design and
  the absence is documented (`THREAT-MODEL.md:136`).
- Raising or per-file-scoping the `vitest.config.ts` coverage thresholds.
- Any change to `commands/update.ts` / `commands/status.ts` call sites.

## Open questions (HALT)

None. The increment was specified in full by the human — task, three verified defects, the fix
shape, the invariant list and the acceptance criteria — and every claim in it was re-verified
against live code this run.

**Plan approved by the human at GATE 1: the increment was specified in full by the human in the
`/pharn-dev-ship` invocation (task, fix, invariants, acceptance criteria), and the same message
pre-authorised the post-review decision ("create pull request ... merge pr"). Recorded honestly:
GATE 2 was delegated in advance, not self-issued.**
