# GRILL — core-386-unpack-listed-paths-only

Advisory (`/pharn-dev-grill` gates nothing). Spec hash: recomputed `bca940a5…3c4e`, equal to the plan's.

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: 'PLAN.md:Design step 2'
  problem: 'Moving the layout-marker check from the tree to the manifest is only equivalent if nothing but listed files can create pharn/pharn-contracts.'
  evidence: 'Pass 1 writes four root-level or .claude files only; pass 2 writes only listed paths. Say so in the code comment and keep the init test that pins the refusal.'
- type: FINDING
  rule_id: P1
  severity: important
  file: 'PLAN.md:Evals'
  problem: 'Real gunzip chunks are 16 KiB, a multiple of 512, so a header never straddles a chunk in production and the carry path would go untested.'
  evidence: 'Plan names odd-sized chunk tests via extractTar(readonly Buffer[]); make them byte-identical comparisons, and cover a payload split across chunks.'
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'PLAN.md:Design (selection key)'
  problem: 'The root segment of a selected entry is attacker bytes that reach a refusal message (second root, absolute).'
  evidence: 'Keep assertDisplayablePath before any message that interpolates the full path, exactly as today.'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'PLAN.md:Caps'
  problem: "A scanned-bytes cap is not in the ticket's list; justify it so it is not read as reintroducing the repo-size failure."
  evidence: "1 GiB is 24x today's real archive (43 MB) and only bounds a compression bomb's CPU; name it in the CHANGELOG/SECURITY text."
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'PLAN.md:Files (repo.ts)'
  problem: 'extractPharnArchive is exported for a command that does not exist yet (CORE-387).'
  evidence: 'Acceptable: the ticket asks for that shape; it is also what fetchAt calls, so it is not dead code.'
```

Verdict: proceed (advisory). All five folded into the build.
