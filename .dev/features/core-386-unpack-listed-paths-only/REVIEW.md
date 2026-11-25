# REVIEW — core-386-unpack-listed-paths-only

Floor first: `node .dev/floor/validate.mjs .` GREEN. Everything below is advisory.

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/lib/upstream-manifest.ts:checkLayoutMarker'
  problem: 'The layout-marker check now passes when the manifest lists a file under pharn/pharn-contracts even if the tree lacks it.'
  evidence: 'Safe because fetchRepo runs verifyUpstreamManifest before returning, and every later caller reads a fully extracted tree; pinned by the new upstream-manifest test (accepted by the parser, refused by the hash check).'
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/tar-extract.ts:TarWalker.push'
  problem: "A selected file's payload is kept as subarrays of the gunzip output chunks until it is complete."
  evidence: 'zlib allocates a fresh output buffer once one fills and never rewrites an emitted region; the e2e run verified 616 sha256s on the real archive, and the chunk-boundary tests compare byte-identical trees.'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'tests/project-lock.test.ts:SIGNAL_HANDLED'
  problem: 'A test-harness change outside the extractor.'
  evidence: "The SIGINT child relied on a pending tsx IPC handle to keep its loop alive; the streamed extraction removed that accident. A ref'd timer in the helper makes all signal children deterministic; no assertion changed."
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'src/lib/repo.ts:extractPharnArchive'
  problem: 'Exported ahead of its second caller (CORE-387 verify-archive).'
  evidence: 'fetchAt uses it; the ticket asks for this shape. The clone-producer lint rule still confines mkdtemp to repo.ts.'
```

Verdict: 0 floor-gate findings, 4 advisory (minor). `TarExtractError` keeps its name and export; every refusal names
the entry path and the rule (CORE-388 compatibility).
