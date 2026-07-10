# GRILL — commands-off-manifest

Header: interrogating `.dev/features/commands-off-manifest/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` **matches** the plan's pinned
`spec_content_hash` — no spec drift (the binding block on drift is `/pharn-dev-build`'s floor, not this stage).
Grillers: `count-grillers.mjs` registered 13, but **all are `test-app/` install fixtures**, not the dev
repo's own grillers — so the relevant axes (architecture, coupling, security, documentation, testability)
are applied **inline** per this command's "apply the procedure inline" guidance. Findings conform to
`pharn-contracts/finding-shape.md` (enum-gated `type`/`rule_id`/`severity`/`file` = my own assertions;
free-text `problem`/`evidence` quote the untrusted PLAN.md as DATA).

## Findings (grouped by axis)

### Axis: honest scope / constitution tension (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: blocking
  file: ".dev/features/commands-off-manifest/PLAN.md:158"
  problem: "The increment removes the legacy module/manifest path, which CONSTITUTION P7 says must keep working 'forever' — a constitution-principle tension the grill records even though the human accepted it at GATE 1."
  evidence: "'RESOLVED: hard-fail with a clear, named message … The human accepted that CONSTITUTION.md P7's manifest clause is superseded by the archetype model (the manifest is already 404 upstream).'"
```

Note: `/pharn-dev-grill` is advisory and cannot issue a binding `CONSTITUTION_VIOLATION`. This is recorded at
blocking-severity for the human's record; it was explicitly weighed and accepted at GATE 1 (the manifest is
already dead upstream, so P7's clause is un-honorable regardless). The human owns the trusted-doc
reconciliation (below).

### Axis: documentation (P4)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/commands-off-manifest/PLAN.md:166"
  problem: "After the increment, the four trusted docs (CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS) describe the module/manifest model as current, contradicting the code — a P4 tension the plan correctly won't agent-edit (hook-protected) but which stays live until a human reconciles."
  evidence: "'These four files are human-only, hook-protected … the agent will not edit them. Flagged here for a human to reconcile.'"
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/commands-off-manifest/PLAN.md:48"
  problem: "The plan's Files list omits src/index.ts, whose USAGE/help text describes 'Add a methodology module or stack pack', 'List installed and available modules/skills', and 'Update installed modules' — user-facing docs-in-code that go stale (P4). tests/index.test.ts may assert on that text."
  evidence: "Files list under '## Files' names the 5 command files + libs + docs, but not src/index.ts (the dispatcher whose USAGE string is module-worded)."
```

### Axis: coupling / DRY (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: ".dev/features/commands-off-manifest/PLAN.md:81"
  problem: "The 'non-archetype config → named message + exit(1)' behavior is planned per-command across all five commands, duplicating the message + branch five times; a shared helper (e.g. loadArchetypeConfigOrExit in lib/pharn-config.ts) would keep it single-sourced — but then pharn-config.ts must be added to the Files list."
  evidence: "'ADD a \"non-archetype (legacy) config → message + exit(1)\" case per command' — the reject logic is described command-by-command, and lib/pharn-config.ts is not in the Files list."
```

### Axis: security / guarantee reduction (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/commands-off-manifest/PLAN.md:124"
  problem: "The claim 'the symlink arbitrary-write finding is closed' asserts install-capabilities.ts is the sole surviving copy path; build should substantiate it by grepping surviving src for any other cpSync/writeFileSync/renameSync from the untrusted clone, so the guarantee rests on an observed-empty set, not an assertion."
  evidence: "'the ONLY surviving copy path is install-capabilities.ts, whose symlink guards + safeJoin are tested'."
```

### Axis: testability (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/commands-off-manifest/PLAN.md:76"
  problem: "The legacy-config eval says the command 'never a network fetch', but the test spec only asserts the message + exit(1); it should also assert the clone/fetch function (fetchRepo / fetchRemoteManifest mock) is NOT called on the legacy branch — otherwise 'no fetch' is unverified."
  evidence: "'prints the named … message and exit(1); never performs a network fetch' — the assertion of 'no fetch' is stated but not given a test hook."
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/commands-off-manifest/PLAN.md:71"
  problem: "Removing the legacy list/render path may orphan exports (e.g. format.ts shortDescription, used only by the legacy list renderer); the plan's type/constant pruning covers types.ts/constants.ts but not lib/format.ts — build should sweep for newly-dead exports so the tree stays honest."
  evidence: "types.ts + constants.ts are listed for orphan pruning, but format.ts (shortDescription) is not, though it feeds only the removed legacy list renderer."
```

### Axis: scope size (P7 — human-accepted)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/commands-off-manifest/PLAN.md:163"
  problem: "The increment bundles four axes (relocate safeJoin; excise the legacy subsystem; prune dead types/constants; sync ~13 docs), ~40 files — larger than 'smallest coherent increment'; the human chose one increment at GATE 1, so this is advisory, but /pharn-dev-build should phase strictly (relocate+importers → command excision → deletions → tests → docs) to keep each step green."
  evidence: "'RESOLVED: one increment = code + tests + CLAUDE.md + user docs/ (ends fully P4-consistent).'"
```

## Prose summary

The plan is well-grounded: discovery is live, the import graph is verified, the guarantee/trust/determinism
audits are present, and the crux (P7 legacy back-compat) is surfaced and human-resolved rather than
buried. Its trust posture strictly **improves** (three untrusted surfaces — manifest, module.json, wizard —
are deleted), and the core security claim (closing the `install-modules.ts` symlink write-path) reduces to
the surviving `safeJoin` + capability-name regex + symlink rejection, all tested.

The concerns worth the human's attention before building are two **completeness gaps in the Files list** —
`src/index.ts` (module-worded USAGE/help text, P4) and, if the DRY helper is adopted, `lib/pharn-config.ts`
(F4) — plus the **five-fold duplication** of the legacy-reject branch. None blocks: the writes-scope hook
will simply deny a write to any file not declared, so a missing Files entry surfaces loudly at build (the
fix is to declare it + re-run the setter, never bypass). The remaining findings are minor verification
hardening (substantiate "sole copy path"; assert "no fetch"; sweep orphaned exports) and an honest note
that this is a large bundled increment the human elected to keep whole.

## Verdict

ADVISORY VERDICT: 8 concerns raised (1 blocking-severity [P7, human-accepted at GATE 1], 3 important
[2× Files-list/doc completeness, 1× DRY], 4 minor [verification hardening + scope size]) — for the human to
weigh before `/pharn-dev-build`. This grill-log is **advisory**; it gates nothing. The floor backstops remain
`/pharn-dev-build`'s spec-hash + open-questions gates and `.dev/floor/validate.mjs`.
