# REVIEW — release-tag-ref

Increment: commit `55fae47` on `fix/release-tag-ref` (base `9542656`). Floor first: `node .dev/floor/validate.mjs .` → **0 (GREEN)**. Everything below is advisory unless marked floor-gate.

## Floor-gate findings

None.

- Every guarantee the increment states rests on a floor primitive: the request URLs are fixed literal prefixes plus a `RELEASE_TAG_RE`-validated segment or a constant, and they are pinned by literal-URL tests.
- The external-behaviour part (GitHub resolves `refs/tags/<name>` only as a tag) is labelled measured-not-documented in code, CHANGELOG and VERIFY.
- There is no sibling import between commands or steps, and no capability or `rule_id` was added (so no eval binding is due).

## Advisory findings

### L-floor (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'CHANGELOG.md:16'
  problem: "The entry says the new URL 'answers the same commit for today's releases'. Only the latest release (v7.10.3) was measured, so 'today's releases' is wider than the evidence. Accurate wording would be 'the latest release'."
  evidence: "which answers the same commit for today's releases (checked against pharn-oss v7.10.3, an annotated tag)"
```

**Fixed after GATE 2:** the entry now says "for the latest release".

### L-eval (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/release.test.ts:124'
  problem: "The one-request test can't prove GitHub dereferences an annotated tag, because the stub answers a commit id directly. It proves only that the CLI makes no second request. Its comment says exactly that and cites the live measurement, so this is noted, not a gap (it follows GRILL's P1 finding: one case, not a fake annotated/lightweight pair)."
  evidence: "That happens on GitHub's side, so the CLI makes no second request for either tag type."
```

**No change after GATE 2:** this is a note, not a gap. The test claims only what it proves, and its comment says so.

### L-trust (P2)

No findings. No new untrusted input. `tag_name` passes `RELEASE_TAG_RE` before it becomes a URL segment, and both responses still pass `COMMIT_RE` (release) or `fetchAt`'s `COMMIT_RE` (main) before use. Nothing in the reviewed diff read as an instruction.

### L-axis (P3)

No findings. Each file keeps one reason to change. `src/lib/repo.ts:290` mentions `lib/release.ts` in a comment, which is a lib-to-lib reference, not a command or step crossing.

### Docs in sync (P4) — carried from GRILL, still open

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'LIMITS.md:162'
  problem: "LIMITS.md §3e and THREAT-MODEL.md (l.73, l.171) do not describe the full-ref resolves. Both are hook-protected, so the build could not edit them. CORE-169's acceptance criterion needs them. Merging the bump publishes 0.18.5, so the human should apply the PLAN's proposed text on this branch before merge."
  evidence: 'waits for a verified release. The'
```

**Still open after GATE 2:** the files are hook-protected, so only the human can apply the PLAN's proposed text.

## Lesson candidate

None proposed. The release-consistency gate refusing a link to the previous tag (`KNOWN_TAGS` lagging one release) is a step of the documented bump procedure, not a new failure.

VERDICT: GREEN, 0 floor-gate findings. 3 advisory findings (1 important, 2 minor). After GATE 2: 1 fixed, 1 needs no change, 1 open for the human (protected docs).
