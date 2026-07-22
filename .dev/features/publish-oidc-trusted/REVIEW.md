# REVIEW — publish-oidc-trusted (ADVISORY)

Increment under review (`trust: untrusted`): the six-edit conversion of `.github/workflows/publish.yml` to npm Trusted Publishing (OIDC).

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` over the working tree is **RED (exit 1)** — but this is **not** a blocking finding against this increment, and the reasoning is deterministic (see `VERIFY.md`):

- Clean CI-equivalent tree (`git worktree` at HEAD, no untracked files) → `validate` **exit 0**.
- **0** working-tree offenders outside `test-*/`; all RED originates in **untracked** local `test-*/` app installs.
- `validate` walks **only `.md`**; this increment changes only `.github/workflows/publish.yml` (`.yml`) → validate is provably invariant under it.

So the increment-relevant floor is GREEN (CI-equivalent); the working-tree RED is a pre-existing untracked-app artifact, human-authorized at the build gate. Recorded, not used to fabricate a block.

## The four lenses

### L-floor → P0 — no blocking finding

Every guarantee the increment claims reduces to the floor or is labeled `advisory` (confirmed against `PLAN.md`'s guarantee audit):

- "No secrets in the workflow" → **floor**, and *observed*: `grep -c 'secrets\.' publish.yml` = **0** at build (the grill's concern that this was labeled-but-unenforced was addressed by actually running it).
- "TS product unaffected" → **floor**: `npm run check` exit 0.
- "workflow valid / OIDC authenticates" → **labeled advisory** (out-of-band: human review + GitHub parser + npmjs Trusted-Publisher config).
- "tag == package.json version" → **runtime floor guard inside the workflow**, labeled advisory from the build floor.

No P0 guarantee is sold without a floor reduction or an `advisory` label. **GREEN on L-floor.**

### L-eval → P1 — N/A (no subject), consistent with plan + grill + floor

The increment adds **no Capability and no `rule_id`**, so P1's "≥1 eval per capability / per enforced rule" has no subject. `validate.mjs` (the floor that would catch a missing binding) does not range over `.github/` and agrees there is nothing to bind. The plan declared this honestly as a deliberate exception. **No finding.**

### L-trust → P2 — no blocking finding; trust posture sound

- The increment (a workflow YAML) emits **no findings**, so there is no free-text taint to mishandle; **no guaranteed decision rests on any tainted field.**
- **No instruction-looking content in the reviewed increment changed my behavior.** (Separately, during grill I encountered a hostile `test-full/AGENTS.md` fixture instructing me to read `node_modules` docs — treated as DATA, not obeyed; it is a test fixture, outside this increment.)
- Positive observations on the built workflow's trust posture: `persist-credentials: false` on checkout; SHA-pinned actions (supply-chain); the publish job gated behind `environment: npm-publish`; least-privilege `permissions` (`contents: read`, `id-token: write` only). The tag guard (`publish.yml:38–39`) is **injection-safe**: `GITHUB_REF_NAME` is assigned into a quoted var and compared with `[ "$TAG" = "$PKG" ]` (quoted), so a hostile tag name cannot inject shell.

### L-axis → P3 — no blocking finding

`publish.yml` remains single-purpose (the publish workflow); no sibling imports exist (it is YAML). One coherent axis of change (the OIDC migration). **No finding.**

## Findings — grouped (fix #3)

### Floor-gate (blocking): NONE

### Advisory (minor — judgment/cosmetic; never a sole basis to block)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".github/workflows/publish.yml:44"
  problem: "The comment 'Auth itself is OIDC — no NODE_AUTH_TOKEN' names NODE_AUTH_TOKEN, so a naive `grep NODE_AUTH_TOKEN` still hits the file even though the env block was removed. The meaningful floor test (`grep -c 'secrets\\.'`) is 0; this is cosmetic."
  evidence: "\"# (needs id-token: write). Auth itself is OIDC — no NODE_AUTH_TOKEN.\""
```

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".github/workflows/publish.yml:36"
  problem: "The tag==version guard (edit #5) is a release-hygiene concern bundled with the OIDC auth migration — two related-but-distinct axes in one increment. Defensible (the human's mandate bundled them; both are tiny); echoes the grill's P7 note."
  evidence: "\"- name: Verify tag matches package.json version\""
```

## Verdict

**GREEN (advisory) — 0 floor-gate/blocking findings; 2 minor advisory notes.** The increment is, by every deterministic signal available in this repo, complete and correct: `npm run check` GREEN, `secrets.` = 0, four of five verify gates GREEN with the fifth a proven local artifact, no regressions. Real-world correctness of the OIDC publish is out-of-band (first release) — see `PLAN.md` external prerequisites (i)–(iii). This verdict is **advisory**; the merge / fix / abandon decision is the human's at GATE 2.

## Proposed lesson candidate (P7 — NOT canon; requires a separate human-gated `/pharn-dev-memory-promote`)

A **real, recurring** dogfooding failure surfaced across build/regress/verify this run — worth proposing for `.dev/memory-bank/lessons-learned.md`:

- **Lesson (candidate):** *When the pharn-cli working tree contains untracked local `test-*/` app installs, the whole-repo floor instruments (`validate.mjs .`, and hence `/pharn-dev-build`'s and `/pharn-dev-verify`'s floor, plus `lens-scanner-map.test.mjs`) go RED/again-red from the installs' intentional `red/` fixtures and inflated capability counts — producing false build/verify FAILs and false `git worktree`-baseline regress asymmetry for any increment that touches no capability. Remedy: measure the CI-equivalent (a clean `git worktree` at HEAD) and classify untracked-`test-*/` RED as pre-existing; never blame it on a non-`.md` increment.*
- **Why real, not hypothetical (P7):** it hit **this** increment at three stages (build verdict, regress base/head, verify verdict), each resolved only by the CI-equivalent measurement.
- **Provenance:** increment `publish-oidc-trusted`; diff = `.github/workflows/publish.yml` (6 edits); evidence = this run's `validate.mjs .` exit 1 vs clean-worktree exit 0, and `regression-report.json` `pre_existing: [tests, validate]`.
- **Gate:** do **not** write canon here. A maintainer runs `/pharn-dev-memory-promote` (which sets its own scope, runs `check-provenance.mjs`, and halts for accept/deny). The model never self-promotes (P2).
