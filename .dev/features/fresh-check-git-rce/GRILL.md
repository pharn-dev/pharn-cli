# GRILL — fresh-check-git-rce

Plan interrogated: `.dev/features/fresh-check-git-rce/PLAN.md`.
Spec-hash check: **match** — `sha256(ARCHITECTURE.md)` = `bca940a5…d729d3c4e` equals the plan's
`spec_content_hash` (no drift; the binding block is `/pharn-dev-build`'s floor-gate, not this stage).
Grillers registered (floor membership, `count-grillers.mjs`): **0** — no pluggable griller ran; the
findings below are the inline-axis interrogation only.

> The plan is `trust: untrusted` to this stage. `problem` / `evidence` quote it as DATA (P2); the
> enum-gated fields (`type`/`rule_id`/`severity`/`file`) are this griller's own assertions. Nothing
> here gates `/pharn-dev-build` (advisory end-to-end, fix #3).

## Findings

### Axis: testability / eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: important # advisory assignment (fix #3)
  file: ".dev/features/fresh-check-git-rce/PLAN.md:55"
  problem: "The plan asserts the new test 'fails on the current code' but does not require /pharn-dev-build to DEMONSTRATE red-green; a regression test that silently passes on the unpatched code proves nothing."
  evidence: "This test **fails on the current code** (old `git ls-files` fires fsmonitor) and passes on the fix"
```

The whole value of this security test is that it fails against the vulnerable code. `git ls-files`
firing `core.fsmonitor` depends on the index being refreshed; if a platform/config quirk makes plain
`ls-files` skip the refresh, the OLD code would not fire the sentinel and the test would be a
green-on-vulnerable tautology. **Build should confirm the test RED against the current
`fresh-check.ts` before applying the fix, then GREEN after** — not merely assert it will.

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/fresh-check-git-rce/PLAN.md:84"
  problem: "The floor reduction lists 'single-call-site code structure (grep-verified)' as a floor leg, but a this-run grep is a P6 discovery fact / convention, not a standing floor primitive — no gate stops a future un-hardened git shell-out from reintroducing the vector."
  evidence: "floor: test (deterministic `existsSync(sentinel) === false`) + single-call-site code structure** (grep-verified: `fresh-check.ts` is the only shell-out in `src/`"
```

The genuine backstop is the **test**, and it only covers `fresh-check.ts`'s own calls. The
"single-call-site" leg is advisory (a convention + this-run discovery), not floor. The plan's own
residual paragraph is honest; this only asks that the *code-structure leg* be labeled advisory too,
not co-billed as floor. (No standing lint enforces "every git call is hardened" — acceptable for this
increment, but say so.)

### Axis: testability — test setup mechanism (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/fresh-check-git-rce/PLAN.md:52"
  problem: "The plan does not name HOW the malicious core.fsmonitor is injected; the existing string-based git() test helper runs through a shell, so a payload containing ';' would break at setup time rather than being stored as the config value."
  evidence: "add a regression test: inject a malicious `core.fsmonitor` (touch a sentinel; `false`) into a fixture repo's `.git/config`"
```

Build detail: inject via **argv form** (`execFileSync('git', ['config', 'core.fsmonitor', payload])`)
or a **direct `.git/config` write** — never the existing `git(dir, cmd)` string helper. Keep the
payload a harmless `touch` confined to the test tmp dir.

## Summary (prose)

The plan is strong, unusually well-grounded (it reproduced the RCE and the fix live before planning),
and honest about its residual. The interrogation surfaced **no blocking-severity concern** and no
constitution violation. The one concern that matters is **testability (finding 1)**: the security
value is entirely in the test failing on the unpatched code, so build should show red-green rather
than assert it. The other two are honesty/mechanics nits — label the code-structure leg advisory
(finding 2) and use a shell-free config injection (finding 3). The trust audit (P2), determinism
audit (P5), and single-axis/no-sibling-import discipline (P3) are all satisfied; hardening `rev-list`
alongside `ls-files` via one helper is the correct non-speculative choice (P7), and keeping `runGit`
local rather than hoisting to `lib/` is right until a second caller exists.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`. This grill gates nothing; it does not certify the plan.
