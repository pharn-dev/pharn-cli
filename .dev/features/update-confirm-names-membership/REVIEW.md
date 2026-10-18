# REVIEW — update-confirm-names-membership (F-24)

Increment: `ee707fa`, reviewed against base `d7f4482`. The floor is GREEN: `validate.mjs` exited 0 in a fresh worktree, and VERIFY reports PASS.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the one new guarantee is "the applied membership is the confirmed membership". It reduces to an exact equality test (`membershipDrift` over `membershipKeys`) under the lock, plus `assertConfigUnchanged`. Two tests exercise it: the membership differs, and a deleted-dir set grows.
- The deleted-dir preview is labelled a snapshot in `docs/commands/update.md` ("The list is a snapshot … decided there").
- **L-eval (P1):** every new behavior has a vitest case: ordering, the confirm wording and defaults on both sides, `--yes`, cancel, a single fetch, MIN_CLI before the confirm, removal refusal before the confirm, the guard (two cases), and a non-TTY refusal with zero round-trips.
- **L-axis (P3):** the change is confined to `commands/update.ts`. There is no new cross-command import; `planFromClone` is a local helper.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "src/commands/update.ts:235"
  problem: "Two comments still describe the old order: the proxy-notice block says the tarball download is 'inside the lock', and the resolve comment says the tarball is fetched 'inside the lock below'. Both are now before the confirm."
  evidence: "the tarball download inside the lock alike … reused for the tarball inside the lock below"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "LIMITS.md:71"
  problem: "LIMITS.md §1d says '`update` never deletes'. It has been stale since F-04 (update deletes the directories of the capabilities it drops). LIMITS.md is a trusted, human-only doc, so it is reported, not edited."
  evidence: "the old copy is left on disk — `update` never deletes"
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/commands/update.ts:592"
  problem: "The MIN_CLI warning and the unknown-capabilities warning are logged while the pre-confirm `Planning` spinner is still running, so in a narrow terminal clack may glue or erase them. This is the same shape the dry run and the previous locked path already had (not a regression), but the pre-confirm path is now the one users see before answering."
  evidence: "const snapshot = planFromClone(repo, …, (m) => log.warn(m)); pre.stop(planStopMessage(snapshot));"
```

- **L-trust (P2):** capability names in the preview and in the refusal come from the validated index (`CAPABILITY_NAME_RE`) and the same renderer as the post-run note. No new sink, and no decision rests on free text. Nothing instruction-like was found in the reviewed diff.

## Verdict

GREEN: 0 floor findings, 3 advisory findings (all minor). Recommended at GATE 2: fix the two stale comments (comment-only), and leave the spinner ordering as a pre-existing shape. LIMITS.md §1d goes to the human.

Lesson candidate (proposed only, not canon): when an ordering moves across a lock or a prompt, grep the touched file's comments for the old order ("inside the lock", "before the fetch"). The two stale comments here survived a careful edit. Provenance: this increment, `ee707fa`.
