# GRILL — proxy-notice-truth

Plan: `.dev/features/proxy-notice-truth/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/proxy-notice-truth/PLAN.md:55'
  problem: 'Every "will not use it" notice ends by citing LIMITS.md §3a, and §3a still says a proxy variable changes nothing. After this increment the notice itself names the opt-in, so the doc it cites contradicts it. LIMITS.md is human-only; the PR must name the §3a edit for the human rather than leave the contradiction silent.'
  evidence: '`LIMITS.md` §3a (`:106-110`) still says "setting a proxy variable will not change that".'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/proxy-notice-truth/PLAN.md:112'
  problem: 'Where a Node knows the flag, the runtime answers for itself (membership). The version window is only needed where it does not: 24.0–24.4. Say in the code that only that window is a version test, so a future line (25+, 26) is classified by the membership test and never by an extrapolated table.'
  evidence: 'table itself is advisory in reach: measured on 9 versions, and later Node lines are assumed to'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/proxy-notice-truth/PLAN.md:83'
  problem: 'The hermetic setup has no vitest case of its own; its proof is the two-environment run in VERIFY. Record both runs with their counts: the whole suite under NODE_USE_ENV_PROXY=1 and under an exported HTTPS_PROXY, before (15 and 1 extra failures) and after (0).'
  evidence: '`tests/setup/hermetic-env.ts` (new) — layer tests. Before any test, it deletes `HTTPS_PROXY`,'
```

### Determinism (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/proxy-notice-truth/PLAN.md:71'
  problem: 'NODE_OPTIONS is split on whitespace, while Node also honours double-quoted arguments. A flag token can never contain a space, so this cannot mis-read a real flag, but a quoted VALUE that happens to spell the flag would be read as one. Pathological; state the approximation in the comment.'
  evidence: '(regex `^--(no[-_])?use[-_]env[-_]proxy(=.*)?$` over `NODE_OPTIONS` tokens, then the command'
```

### Checked, no finding

- Trust (P2): a printed variable NAME reaches output only when it case-folds to one of four proxy
  names (ASCII letters and `_`). Values still go through `redactProxyUrl`.
- Axis (P3): the detection logic changes only in `proxy-env.ts`, and the wording only in
  `proxy-env-format.ts` — the file split's own rule.

## Summary

The rule set is measured, and the plan keeps pure functions pure. The important gap is outside the
plan's reach: `LIMITS.md` §3a, which every notice cites, will contradict the notice. That has to be
handed to the human explicitly. The rest are comments and evidence to record.

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to
weigh before /pharn-dev-build.**
