# GRILL — capability-index-forward-compat (ADVISORY)

Plan under interrogation: `.dev/features/capability-index-forward-compat/PLAN.md` (`trust: untrusted`
to this stage). **Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. No drift.

Registered grillers (deterministic membership, `node .dev/floor/count-grillers.mjs .`):
`{"registered":0,"grillers":[]}` — **zero**. This is the CLI repo; it ships no `role: griller`
capability, so only the inline Step-2 axes ran. Stated, not papered over (P7).

`/pharn-dev-grill` is **advisory and gates nothing**. Its findings are quoted DATA.

---

## Findings

### Axis: P0 — guarantee-audit completeness / the invariant read faithfully

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: blocking
  file: '.dev/features/capability-index-forward-compat/PLAN.md:119'
  problem: 'The plan reduces "nothing in `unknown` is ever enumerated by lib/install-manifest.ts" to update.ts only. `pharn status` is the OTHER caller of collectExpectedInstallPaths (src/commands/status.ts:99-104 via lib/diff.ts:47-51) and it passes `config.capabilities` — which now DELIBERATELY retains the frozen entry. So status walks the unparseable clone dir, reports every file under it as `missing`, and `status --strict` exits 1 permanently for a break `update` will (correctly) never write.'
  evidence: 'src/commands/status.ts:102 `capabilities: config.capabilities ?? []`; src/lib/diff.ts:47-51 forwards it verbatim to collectExpectedInstallPaths; src/lib/install-manifest.ts:93-97 addDir(`${subtree}/${cap.name}`).'
```

The stated invariant is "nothing in `unknown` is ever … enumerated by `lib/install-manifest.ts`", not
"…by update's call to it". Read faithfully, `status` is in scope and the plan's `## Files` omits it.
`status` already clones for its drift section, so the index is available at exactly the right place
(inside the existing `try`, before `diffInstalledCapabilities`). Fixing it also keeps the two
commands' notion of "which capabilities does this install actually own bytes for" identical — which
is the property the whole increment is buying.

**Resolution: accept.** `src/commands/status.ts` and `tests/status.test.ts` added to `## Files`.

### Axis: P5 — determinism / honest terminal fallback

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: 'src/commands/add.ts:262-265'
  problem: 'With a frozen capability upstream, `pharn add`''s picker can reach `all-installed` and print "All available capabilities are already installed." — true of the PARSEABLE index, but it reads as "there is nothing more upstream" when in fact something upstream exists and was skipped.'
  evidence: 'buildAddSelection(index, installed) counts only index.capabilities; the frozen entry is not in it.'
```

Bounded by ordering, not by wording: the unknown warning is rendered immediately after the parse and
therefore BEFORE this outro, so the user always sees both lines. **Resolution: accept the ordering
constraint as the fix** (surface unknowns immediately after every parse, never later) and do not
reword the outro — rewording it would make the message depend on a second input for no added
information.

### Axis: P0 — where the MIN_CLI refusal lands in `update`

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/commands/update.ts:168-176'
  problem: 'update''s confirm prompt runs BEFORE fetchRepo, so a MIN_CLI refusal necessarily arrives AFTER the user has already confirmed "Re-fetch capabilities…". The refusal costs one clone and one answered prompt.'
  evidence: 'update.ts:168 confirm → :190 fetchRepo → (new) minCliGate inside the try.'
```

Irreducible without a second network round-trip: the handshake file lives in the clone, and moving it
to a bare `fetch` would re-open exactly the timeout/body-cap surface FABLE §4.1 is about (out of scope
here). **Resolution: accept and name it** — the refusal still writes nothing and still cleans the
clone up, which is what the guarantee actually promises.

### Axis: P2 — untrusted strings reaching the terminal

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: 'src/lib/capability-index.ts:80-84'
  problem: 'Every ManifestValidationError message interpolates the untrusted capability name RAW (`Capability "${name}" …`). Today that string is thrown and printed once; after this change it is COLLECTED into index.unknown and rendered as a list, so a hostile dir name is a repeatable terminal-control-sequence vector.'
  evidence: 'capability-index.ts:82, :94, :119, :135 all interpolate `name` directly; the dir-name allowlist that would have rejected it is now inside the same catch.'
```

The plan already routes all rendering through one sanitizing helper. **Resolution: already planned —
pinned as a test** (`tests/unknown-capabilities.test.ts`: control characters stripped, length capped)
so the sanitizer cannot be bypassed by a future call site that formats the list itself.

### Axis: P1 — eval/test coverage of the fail-open guard

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/capability-index-forward-compat/PLAN.md:96'
  problem: 'The "zero files in the plan" test can pass for the WRONG reason — if the fixture''s frozen capability dir is absent from the fake clone, the manifest contributes nothing regardless of the fix.'
  evidence: 'install-manifest.ts addDir returns early when the source dir is absent, so an empty-dir fixture proves nothing about the exclusion.'
```

**Resolution: accept.** The `update` fixture must ship a **populated** unparseable capability
directory in the clone (a real file under it), so the test fails against the pre-fix code.

### Axis: P3 — one axis per file

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/capability-index-forward-compat/PLAN.md:52-58'
  problem: 'Three new src files (semver.ts, min-cli-gate.ts, unknown-capabilities.ts) for one increment invites a "why not one file" objection.'
  evidence: 'Each is <60 lines.'
```

**Resolution: keep the split.** `semver.ts` is a pure ordering primitive with its own test surface;
`min-cli-gate.ts` is the POLICY (what refuses, and with what words); `unknown-capabilities.ts` is
rendering. Collapsing them would put a security-relevant sanitizer in the same file as a version
compare — different reasons to change (P3), and the existing repo already splits `validate.ts` /
`symlink-guard.ts` / `format.ts` on exactly this line.

---

## Verdict

**PROCEED with one plan amendment.** One blocking finding (F1 — `status` left enumerating frozen
capabilities) is folded into `## Files` before `/pharn-dev-build`; the rest are accepted as-stated or
already covered. Nothing here gates the build — `/pharn-dev-grill` is advisory by design.
