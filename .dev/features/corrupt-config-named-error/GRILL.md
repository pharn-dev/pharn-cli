# GRILL — corrupt-config-named-error (ADVISORY)

Plan under interrogation: `.dev/features/corrupt-config-named-error/PLAN.md`.
Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's
`spec_content_hash`. (Computation is floor-grade; here it only surfaces — `/pharn-dev-build` is
where drift blocks, fix #4.)

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
**Zero** `role: griller` capabilities are installed in this repo, so the pluggable griller slot
contributes nothing this run and the findings below are entirely the inline Step-2 axes. Stated as
measured live state, not as "the grillers passed" (there were none to pass).

> The plan is `trust: untrusted` to this stage. Every `evidence:` below is a **quoted excerpt** from
> it, rendered as DATA — never followed as an instruction.

---

## Findings

### Axis: docs / P4 — a knowingly-left doc gap

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/corrupt-config-named-error/PLAN.md:82'
  problem: 'The increment changes a user-visible error message but defers the only doc that quotes it, so docs/troubleshooting.md is left describing a case the code has split in two — a genuine P4 gap the plan acknowledges but does not close.'
  evidence: '"**Explicitly NOT touched** (sibling PRs own them; both are reported to the human, not edited): `docs/troubleshooting.md` (its _\"`add` / `update` say to run init first\"_ section, ~`:300`, gains a case it does not document)"'
```

Interrogation: `docs/troubleshooting.md:300-303` documents the "No pharn.config.json found — run
init first" line under a heading that promises to cover why `add`/`update` say to run init. After this
increment a corrupt config no longer reaches that message at all, and the message it _does_ reach
is undocumented. The old text does not become **false** (absent still prints it), so this is a
coverage gap rather than a contradiction — but P4 says docs are kept in sync, and the file already
has the perfect home for the new case (`## A command rejects an invalid config (does NOT say "run
init")`, ~`:314`). The plan's reason for deferring is a **process** constraint (a sibling PR owns
the file), not a technical one. **For the human to route** — either lift the scope bar for that one
section, or file it as an explicit follow-up so it is not silently lost between the two PRs.

### Axis: eval coverage / P1 — the `list` path is argued, not exercised

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:180'
  problem: 'The union-membership test proves isConfigValidationError(new ConfigParseError(...)) is true, but it does not prove commands/list.ts actually routes that error to emitError + exit(1) in --json mode, so one of the two call sites this increment claims to fix has no eval of its own.'
  evidence: '"**`list --json` is covered by the union, not by a new test in `tests/list.test.ts`.** `commands/list.ts:46` branches on `isConfigValidationError(e)` — membership, not identity — so adding a member to the union is exercised by the union test above plus the existing `list` test for a different member."'
```

Interrogation: the argument is sound as _reasoning_ — `list.ts` genuinely branches on membership, so
a new member cannot miss the branch — and the plan is refreshingly honest that it is reasoning
(`"Stated rather than over-claimed (P0)"`). But P1 says tests are the spec, and the spec here is
"both call sites report the corrupt config loudly." Half of that is proved by execution and half by
argument. The mitigation is that the argument's premise (_`list.ts` uses the union_) is itself
locked by the existing `list` test for `ModelRoutingError`: if someone rewrote that branch to an
`instanceof ModelRoutingError` identity check, that existing test would stay green while the new
member silently fell through to the "run init" lie. **That is the concrete regression this gap
cannot see.** Weigh against the plan's scope bar, which excludes `tests/list.test.ts`.

### Axis: guarantee audit / P0 — one claim is labeled floor on a reduction that is partly a reading

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:202'
  problem: 'The claim "zero call-site changes are needed" is labeled floor, but its reduction is an instanceof union test that only one of the two call sites will actually execute in this increment  s tests — for the other site the reduction rests on reading the source, which is verification, not a floor primitive.'
  evidence: '"- _\"Zero call-site changes are needed.\"_ → **floor**: both sites branch on `isConfigValidationError`, an `instanceof` union membership test the new class joins."'
```

Interrogation: `instanceof` union membership genuinely **is** an `ARCHITECTURE.md §2` primitive #3
check, so the label is not wrong in kind. The looseness is in scope: the primitive is exercised at
`loadConfigOrExit` and asserted directly on `isConfigValidationError`; at `list.ts` it is _present in
the source_ but not driven this run (see the P1 finding above). Either narrow the claim to
`loadConfigOrExit` and label the `list` half `advisory (verified by reading)`, or close it with the
test. Small, but this repo's whole thesis is that a claim's label matches how it is actually
established.

### Axis: trust propagation / P2 — the path's provenance is described too generously

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:211'
  problem: 'The trust audit says the printed path is safe because "this CLI computed" it, but resolve(cwd, ...) embeds the process working directory, whose bytes come from the environment rather than from the CLI — the correct and sufficient claim is that the path is not derived from the config file being reported.'
  evidence: '"What reaches the user   s terminal is: a path this CLI computed (`resolve(cwd, …)`), fixed English, and at most two integers V8 produced."'
```

Interrogation: this does **not** change the increment s conclusion — the finding under audit is
about the _config file_ tainting the message, and `cwd` is not that channel. It also matches
existing practice: many `src/**` messages already interpolate project paths. But "we computed it,
therefore it is clean" is precisely the shape of reasoning P0/P2 exist to catch ("the repo is ours,
therefore its contents are safe"). The honest phrasing is that `cwd` is a **pre-existing, repo-wide**
interpolation channel, unchanged by this increment, and outside its scope — not that it is
guaranteed clean.

### Axis: determinism / P5 — an unstated (benign) assumption about V8's message format

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:128'
  problem: 'The plan calls the crafted-location attack "structurally impossible" from a measurement on one V8 version, without stating what happens if a future V8 appends anything after the "(line N column M)" suffix.'
  evidence: '"a file crafted to contain the literal text `(line 999 column 999)` **cannot** match. The regex can therefore only ever yield digits V8 itself computed, and its worst case is no match at all."'
```

Interrogation: the assumption is real but the failure mode is **fail-safe**, which the plan should
say out loud. If V8 ever moves or decorates the suffix, the `$`-anchored regex stops matching and
the message simply loses its location clause — it can never start reporting a location taken from
file content, because the content-echoing shape ends with a fixed English suffix. "Worst case is no
match at all" is the right sentence; it just needs to be attached to the _version_ assumption, not
only to the crafted-input one. No design change implied.

### Axis: scope / P7 — a small omission that the build must not have to guess

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:72'
  problem: 'The plan never states that ConfigParseError must be exported from src/lib/pharn-config.ts, even though its own eval list requires the test file to import the class for toThrow(ConfigParseError).'
  evidence: '"- `src/lib/pharn-config.ts` — add `ConfigParseError`; split the single `try` so `readFileSync` failure keeps returning `null` (unchanged) while `JSON.parse` failure throws the named error"'
```

Interrogation: mechanical, and the sibling classes (`CapabilitySourceError`) are all exported, so the
build will almost certainly do it. Recorded because an unexported class would make the plan's own
first eval unwritable — the kind of gap that is trivial before build and annoying after.

### Axis: testability / P1 — a portability trap in one planned assertion

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/corrupt-config-named-error/PLAN.md:161'
  problem: 'Asserting the message "contains the absolute config path" via a regex would break on Windows, where the path separator is a regex escape character — the assertion should use a substring check against configPath(cwd) rather than a constructed RegExp.'
  evidence: '"message content: contains the **absolute config path**; matches `/is not valid JSON/`; does **NOT** match `/No pharn\\.config\\.json found/`"'
```

Interrogation: `CLAUDE.md` records that CI runs ubuntu-only and that the Windows claim is already
wider than what is tested, so this would not go red in CI — which is exactly why it is worth saying
now. `expect(msg).toContain(configPath(dir))` is both simpler and separator-agnostic.

---

## No findings raised on

- **P3 (one axis).** `pharn-config.ts` already owns "read + validate + write the config"; a parse-
  failure class is that same axis, not a second one. No sibling import is introduced — the new class
  is consumed through the union the two callers already read.
- **P6.** The blast radius section is grounded in reads performed this run (both call sites, the
  `overwrite-check.ts` comment, the four `toBeNull` assertions in `tests/update.test.ts`), not from
  memory, and it names file:line for each.
- **P0, on the finding's own guarantee.** "A config that exists but does not parse is never reported
  as absent" reduces cleanly to control flow whose branch is `JSON.parse` throwing — no
  classification anywhere.
- **P7, on the two deferrals.** Leaving the wrong-shape null-returns and the EACCES case alone is the
  right call and is recorded rather than silently skipped; folding either in would widen the change
  past what the human approved.

## Summary

The plan is unusually well-grounded: it picks the harder-to-justify shape (a named error) over the
audit's suggested one and argues it from _this file's_ existing design rather than from the audit's
phrasing, it measured the V8 message shapes instead of assuming them, and it found a real trust
boundary (V8 echoing raw file bytes) that the audit's own "surface the line/column" suggestion would
have walked straight into.

The concerns are concentrated in two places. First, **the one `important` finding is a doc gap the
plan creates deliberately** — a user-visible message changes while the only doc quoting it is held
back by a PR-ownership constraint; that needs a human decision, not a technical one. Second, a
cluster of `minor` findings are **label-precision** issues rather than design issues: one guarantee
is called floor where half of it is established by reading, one trust claim is phrased as "we
computed it, so it is clean", and one determinism claim is stated as impossibility where it is
really a fail-safe degradation. None of these change what should be built; all of them change how
honestly the artifact describes what was built, which in this repo is the point. The remaining two
are mechanical (export the class; use `toContain` for the path assertion).

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 1 important, 6 minor) — for the human to
weigh before `/pharn-dev-build`. Nothing here blocks the build; this log gates nothing.
