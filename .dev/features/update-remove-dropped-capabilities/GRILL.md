# GRILL — update-remove-dropped-capabilities (ADVISORY)

Plan: `.dev/features/update-remove-dropped-capabilities/PLAN.md` (as amended at GATE 1: update only, init out of scope). Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:90'
  problem: "The trust audit understates a NEW capability given to upstream: before this change, the untrusted clone's index could only cause a capability NOT to be installed; now an index that stops listing a capability causes update to DELETE that directory. The blast radius is bounded (only `<subtree>/<validated-name>` dirs of entries already in the local config; files pharn cannot prove it wrote are backed up first), but it must be named in the trust audit, the docs, and the LIMITS.md hand-over text rather than described as 'membership only'."
  evidence: 'the untrusted clone only decides WHETHER a capability is still selected/shipped (membership), never a path'
- type: FINDING
  rule_id: P5
  severity: important
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:28'
  problem: "ENOTDIR is unaddressed: when a component of the dropped dir's path is a regular file (e.g. a file named `pharn-review` at the root), `findSymlinkComponent` and `removalBackupSet`'s `lstatSync` both THROW ENOTDIR (probed this run: `lstatSync('<file>/sub', {throwIfNoEntry:false})` throws ENOTDIR; `existsSync` returns false). The plan maps every scan error to a whole-run refusal, which would block every update over a path that cannot hold a directory at all. Decide explicitly: an address below a non-directory is `present: false`, nothing to back up or delete."
  evidence: 'A scan error → `CapabilityRemovalError` ("Could not check the files in <cap> before removing it: <cause>. Nothing was changed.").'
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:33'
  problem: "The abort-path backup notice says 'some originals may already have been overwritten'; with deletes now running before the writes, a run that fails after a delete has REMOVED directories, not overwritten files. The aborted wording (stderr) must cover removal, or it misdescribes the tree the user is left with."
  evidence: 'A delete failure is reported like any other failure (exit 1, the backup pointer repeated on stderr by the existing abort path).'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:80'
  problem: "'update never deletes anything ELSE' is a negative claim and needs explicit evals: a stray file inside a KEPT capability survives, an abandoned-layout tree survives a run that also drops a capability, `.claude/settings.json` stays byte-identical, and a frozen (kept-unparsed) capability's dir survives even when its entry would otherwise fall into row 5."
  evidence: 'floor by absence: the only new `rmSync` call site is `deleteCapabilityDir`, fed only by `removals`'
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:28'
  problem: 'mergeCapabilities can emit two DROP changes for a duplicated previous key; the de-duplication of removals (and of backup rels across removals and `report.backups`) must be by key/rel so createBackup never receives the same rel twice.'
  evidence: 'de-duplicated by `role:name`'
- type: FINDING
  rule_id: P4
  severity: minor
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:17'
  problem: 'LIMITS.md cites `src/commands/remove.ts` and `src/commands/update.ts:452` by line; moving helpers out of remove.ts and rewording update.ts shifts them. The GATE-2 hand-over text should refresh those citations, since the agent cannot edit LIMITS.md.'
  evidence: '`LIMITS.md:71` (human-only)'
- type: FINDING
  rule_id: P7
  severity: minor
  file: '.dev/features/update-remove-dropped-capabilities/PLAN.md:45'
  problem: 'Projects that already have orphaned capability dirs from earlier pharn versions get no help (their config entry is gone, so update has nothing to drop). The plan says so; the CHANGELOG entry should also say it, with the manual fix (delete the dir), so users do not assume upgrading cleans them.'
  evidence: 'a capability directory left on disk by pharn < this version (or created by hand) is not listed but still runs — delete it by hand'
```

## Summary

The increment is coherent and reuses `remove`'s machinery rather than re-inventing it; the GATE-1 decisions (update only, deletes before writes, refuse on a symlinked component, one backup dir) remove the earlier scope risk. Concerns to weigh before build: name the new upstream-driven deletion capability honestly in the trust audit/docs/LIMITS text; decide ENOTDIR as "absent", not a refusal; fix the abort-path wording; add evals for every "never deletes anything else" clause; de-duplicate removals and backup rels; refresh LIMITS line citations in the hand-over; say in the CHANGELOG that earlier orphans are not cleaned.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 7 advisory: 4 important, 3 minor) — for the human to weigh before /pharn-dev-build. This log gates nothing.
