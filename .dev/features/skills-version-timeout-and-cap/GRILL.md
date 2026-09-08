# GRILL — skills-version-timeout-and-cap (ADVISORY)

Plan under interrogation: `.dev/features/skills-version-timeout-and-cap/PLAN.md` (`trust: untrusted`
to this stage). **Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. No drift.

Registered grillers (deterministic membership, `node .dev/floor/count-grillers.mjs .`):
`{"registered":0,"grillers":[]}` — **zero**. This is the CLI repo; it ships no `role: griller`
capability, so only the inline Step-2 axes ran. Stated, not papered over (P7).

`/pharn-dev-grill` is **advisory and gates nothing**. Its findings are quoted DATA.

---

## Findings

### Axis: P0 — guarantee-audit completeness / a cap claim that overstates its own floor

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: blocking
  file: '.dev/features/skills-version-timeout-and-cap/PLAN.md:96'
  problem: 'The plan claims "no more than 256KB of body is ever accumulated" and reduces it to an integer compare in the read loop. The compare necessarily runs AFTER a chunk has been handed to us, so the true bound is `MAX_BODY_BYTES + (size of the chunk that crossed it)`. A server that answers with one single 100MB chunk materialises 100MB in the undici buffer before pharn''s counter ever sees a number. The floor reduction is real but it bounds ACCUMULATION ACROSS CHUNKS, not peak allocation — and the claim as written promises the latter.'
  evidence: 'Any streaming byte cap reads `value.byteLength` from an already-materialised Uint8Array; there is no pre-read length oracle for a chunked body. undici sizes chunks from the socket read (commonly <= 64KB), but that is a Node implementation detail, not a pharn floor primitive.'
```

The fix is wording, not code — but under P0 an overstated guarantee is the disease itself, so it is
blocking at plan stage. The honest claim is: **"the read stops the first time the running total
exceeds 256KB; at most one chunk beyond the cap is ever held, and the chunk size is undici's, not
pharn's."** That is still strictly stronger than today (today the answer is "unbounded"), and it is
the version that survives a reader who checks it.

**Resolution: accept.** The plan's P0 bullet is restated in those terms, and the same limit is
written at the read site in `src/lib/skills-version.ts` so the next reader does not have to re-derive
it.

### Axis: P1 — an eval whose assertion mechanism is named but not chosen

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/skills-version-timeout-and-cap/PLAN.md:82'
  problem: 'The "declared content-length over the cap rejects BEFORE any body read" case is planned as "a `body` whose stream would throw / a `getReader` spy that must not be called" — two alternatives, neither verified to work against a REAL `Response`. `Response.prototype.body` is a getter on the prototype, so a naive `vi.spyOn(res, ''body'')` does not intercept it, and a `ReadableStream`''s `start` callback runs at CONSTRUCTION (not at read), so a flag set there proves nothing about whether the implementation read anything.'
  evidence: 'tests/skills-version.test.ts:12-19 currently fakes the whole Response as an object literal, so no existing case exercises a real `res.body` at all — there is no in-repo precedent to copy.'
```

An eval that cannot fail for the reason it claims to test is worse than no eval (it reads as
coverage). **Resolution: accept.** The mechanism is pinned to the one that cannot silently degrade:
give the oversize-declared response a body stream that is **already errored** (`c.error(new
Error('body must not be read'))`). If the implementation touches the body, the rejection is that
error, not `/too large/` — so `rejects.toThrow(/too large/)` is itself the proof the body was never
read, with no spy and no flag to get wrong. The chosen mechanism is verified empirically at build
time before the implementation changes.

### Axis: P1 / P0 — what the timer test actually proves

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/skills-version-timeout-and-cap/PLAN.md:87'
  problem: 'The fake-timer case asserts a rejection after `vi.advanceTimersByTime(8000)` using a mock that itself wires `opts.signal`''s abort to the body stream''s `controller.error(...)`. That proves pharn''s timer is STILL ARMED at body-read time (the actual defect). It does NOT prove the guarantee the user cares about — that a real slow body is aborted — because the mock supplies the signal-to-stream wiring that undici would have to supply in production.'
  evidence: 'A hand-constructed `ReadableStream` is connected to no `AbortController`; the brief itself records that a fake body which merely never closes leaves `reader.read()` pending until vitest''s 5s timeout.'
```

The gap is not closable in a unit test — asserting undici's internal wiring would mean asserting
Node's behavior, not pharn's. **Resolution: accept the limit and label it.** The test keeps its value
(it is a true regression pin on `clearTimeout` placement: move the `clearTimeout` back before the
read and this case hangs instead of rejecting) and gains a header comment stating exactly that
boundary — pharn's half is pinned, undici's half is assumed. Advisory, labeled, not sold as floor.

### Axis: P2 — a taint path this increment narrows but does not close

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/validate.ts:88-92'
  problem: '`assertSafeString` interpolates the ENTIRE untrusted value into its "has invalid format" message (`JSON.stringify(value)`), and both consumers print that message to the terminal (`update.ts:129`, `status.ts:65` via `reportError`). After this increment an attacker''s echo is bounded at 256KB; before it, it was unbounded — verified live: the pre-fix run against a 300,000-byte body threw a message carrying all 100,000 untrusted characters.'
  evidence: 'Observed this run: `SKILLS_VERSION has invalid format: "一一一…"`, the full body inlined. `JSON.stringify` escapes control characters, so there is no terminal-repaint vector — the residual is volume, not injection.'
```

**Resolution: accept as a named residual, out of scope here.** The increment strictly improves it
(unbounded → 256KB) and touching `validate.ts` would widen this change past one axis (P3). Recorded
so it is not mistaken for something this fix closed.

### Axis: P3 / P7 — the un-cancelled reader on the non-cap failure paths

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/skills-version-timeout-and-cap/PLAN.md:60'
  problem: 'The plan cancels the reader on the cap throw but says nothing about the other two ways out of the read loop: a transport error mid-body, and the abort itself. Those leave the response body un-cancelled, i.e. the socket is not explicitly released.'
  evidence: 'Both consumers `process.exit(1)` immediately on a throw from this function (update.ts:131, status.ts:67), so the process tears the socket down regardless.'
```

Benign **because of a caller property, not a local one** — which is exactly the kind of thing worth
writing down rather than leaving implicit. **Resolution: accept**; the reasoning goes in the code
comment so a future non-exiting caller is warned rather than surprised.

### Axis: P7 — the PR bundle names a third brief the plan scopes out

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/skills-version-timeout-and-cap/PLAN.md:150'
  problem: 'The originating brief heads itself "PR bundle: PR 3 — land together with the tests in 4.11 and the degit pin (FABLE 4.10)". The plan folds in 4.11 (its own acceptance criteria require it) but scopes 4.10 out. That is a deliberate divergence from the bundle instruction and the human should see it, not discover it at review.'
  evidence: 'The pasted brief lists the degit pin under its own `## Out of scope` ("rides in the same PR but has its own sibling prompt"), and 4.10 carries a separate acceptance list (package-lock re-resolution, a new tests/degit-pin.test.ts, THREAT-MODEL/LIMITS/contributing prose) that this increment''s criteria do not mention.'
```

**Resolution: accept the narrower scope, surfaced.** 4.01 + 4.11 are one axis (this function's guards
and their pins); 4.10 is a dependency-declaration change with an independent acceptance list. Shipping
them together would make one PR fail-or-pass on two unrelated verdicts. Named in the PR description
and to the human at the post-review gate — the bundling call stays theirs.

---

## Summary (advisory)

Six findings, one blocking: the plan sells a peak-allocation bound the streaming cap cannot deliver
(F1). The rest are the plan being vaguer than it should be about **how** two of its three new tests
prove what they claim (F2, F3), plus two honest-residual notes (F4, F5) and one scope disclosure
(F6). Nothing here challenges the increment's shape: the defect is real, verified live this run
against the current exported function, and the fix is the smallest one that closes it.

What the plan gets right and is therefore not re-litigated: the timer shape is copied from an
in-repo precedent rather than invented; the `content-length` check is demoted to advisory **and
backstopped** rather than deleted (P0's actual prescription); and the multi-byte test payload is
chosen for the one property that separates pre-fix from post-fix behaviour, which is the difference
between a pin and a decoration.

**Verdict: proceed with the four accepted resolutions folded in (F1 wording is blocking at plan
stage).** This verdict is **advisory** — it blocks nothing, and `/pharn-dev-build` neither reads nor
respects it.
