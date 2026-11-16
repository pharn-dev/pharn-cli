# REVIEW — core-192-claude-md-trim

Floor first: `node .dev/floor/validate.mjs .` is GREEN. `/pharn-dev-regress` returned `no-regressions` and
`/pharn-dev-verify` returned PASS. The token check found 88/88 `src/` files token-identical to origin/main, with zero
directive comments on both sides.

## Floor-gate findings

None.

- "No behaviour change" reduces to an exact token-stream comparison per file plus the green gates.
- "≤ 50% comment lines" reduces to cloc: 4,973/13,459, or 37.0%.
- "CLAUDE.md ≤ 150 lines / ≤ 200 chars" reduces to `wc -l` (149) and `awk` (longest 131).

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "CLAUDE.md:66"
  problem: "CLAUDE.md, docs/architecture.md and four src comments describe invariants as eslint rules in eslint.config.mjs and name tests/lint-rules.test.ts. Both arrive with CORE-191 (#382), which is not merged yet, so on this branch alone those references point at rules that do not exist."
  evidence: "Code invariants are eslint rules in `eslint.config.mjs`, each message naming its reason, and `tests/lint-rules.test.ts` proves that each fires."
```

The coordinator asked for this wording (`core-191-pin-changes.md`). It is correct once #382 lands. Merge #382 first,
or re-check this paragraph if #382 changes.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "docs/architecture.md:1"
  problem: "docs/architecture.md is a condensation of the old CLAUDE.md and was checked against the code only where touched (the TTY gate list was corrected during review). Other paragraphs are as accurate as the prose they replace, no more."
  evidence: "How the `pharn` CLI is put together, command by command."
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/min-cli-gate.ts:7"
  problem: "Three comments dropped the stale framing that a CLI 'always fetches main HEAD', which stopped being true with the release channel. The new wording ('Upstream content can outpace deployed CLIs') is true on both channels; noted because it changes meaning rather than only shortening."
  evidence: "Upstream content can outpace deployed CLIs"
```

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "docs/contributing.md:86"
  problem: "docs/contributing.md's 'Project layout' tree was already stale (missing lib modules). Only its pointer line changed here; CORE-191 also edits this file, so the tree was left alone to avoid a second axis and a merge conflict."
  evidence: "See [Architecture](architecture.md) for the architecture in depth"
```

### Lens notes

- **L-floor (P0).** Every claim reduces to a floor check or is labelled advisory: the accuracy of the docs prose and of
  shortened comments rests on human review.
- **L-eval (P1).** No capability or `rule_id` was added, so no eval binding is required.
- **L-trust (P2).** Nothing untrusted is ingested. The workers' reports were read as data, and their edits were checked
  by the token script, not by trusting the report.
- **L-axis (P3).** One axis throughout: documentation of existing behaviour. No code moved.

## Lesson candidate (proposed, not written to canon)

- **Comment-only refactors need a token-stream check, not an emit diff.** `ts.transpileModule` erases types, so an emit
  comparison passes a changed type annotation. The scanner-token comparison (kind + text with trivia skipped) caught a
  planted `string → String` edit that the emit comparison would have missed. Provenance: CORE-192 GRILL.md finding 1
  and this increment's tokens check.

VERDICT: GREEN (0 floor-gate findings; 1 important and 3 minor advisory findings for the human).
