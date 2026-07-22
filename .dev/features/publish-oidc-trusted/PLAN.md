# PLAN — publish.yml: pure OIDC Trusted Publishing (no tokens)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Convert `.github/workflows/publish.yml` to npm Trusted Publishing (OIDC) — remove the `NODE_AUTH_TOKEN` secret, gate publish behind the `npm-publish` environment, bump Node to 24 + `npm@latest`, drop `workflow_dispatch`, and add a tag==package.json version guard.
- layer(s): repo CI infrastructure — NOT a PHARN capability / pharn-core / pharn-contracts. `ARCHITECTURE.md §4` layers cover the PHARN product surface; a repo CI workflow sits outside them as **Surface B′ tooling** (`THREAT-MODEL.md §1`), gated by the writes-scope + trusted-file hooks (`§3.3`), not the install floor.
- constitution_refs: [P0, P2, P5, P6, P7]

## Files

- `.github/workflows/publish.yml` — the ONLY file changed; six edits (below), keeping the SHA-pinned-actions convention — layer: repo CI infra

### The six edits (all within `publish.yml`)

1. **Delete the `env:` block** (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, lines 35–36) on the Publish step — auth becomes OIDC; **zero `secrets.` references remain**.
2. **Add `environment: npm-publish`** at the `publish` job level (immediately under `runs-on: ubuntu-latest`).
3. **setup-node `node-version: 20 → 24`**; add a new step immediately after setup-node: `run: npm install -g npm@latest` (Trusted Publishing needs npm >= 11.5.1). Keep the existing `cache: npm` + `registry-url` and the action SHA pin.
4. **Remove the `workflow_dispatch:` trigger** (line 8) — `release: [published]` only.
5. **Add a guard step before Publish** — `TAG="${GITHUB_REF_NAME#v}"; PKG="$(node -p "require('./package.json').version")"; [ "$TAG" = "$PKG" ] || { echo "tag v$TAG != package.json $PKG"; exit 1; }` (the `!=` written plainly — the `\!=` in the mandate was a shell history-expansion escape artifact).
6. **Rewrite the top workflow comment**: auth = OIDC Trusted Publisher (workflow `publish.yml`, environment `npm-publish`); drop the "or on manual dispatch" phrase; note the local first publish stays manual.

## Contracts satisfied

- **None in `pharn-contracts`.** This increment touches no PHARN capability, contract, rule, lens, or eval — it is repo CI infrastructure (Surface B′ tooling, `THREAT-MODEL.md §1`), outside the `pharn-contracts` surface. Nothing to cite because nothing applies (P4).

## Evals to write (P1)

- **NONE — a deliberate, honest exception, not an omission:**
  - P1 binds behavior of the pharn **PRODUCT** (`tests/*.test.ts` over `src/`). This increment changes **no `src/` behavior** — it edits a GitHub Actions YAML. There is no vitest surface for a workflow file, and the mandate says **"No other files"** (forbidding a new test or floor checker).
  - `.dev/floor/validate.mjs` walks only `.md` files and explicitly excludes `.github`/tooling; `npm run check` (format:check on `src`/`tests`, eslint `src`, typecheck, vitest) parses **no YAML**. So no floor test exists or is addable here.
  - Verification is therefore: (a) `npm run check` stays **GREEN** (proves the TS product is untouched); (b) a deterministic **absence-grep** that zero `secrets.` remain; (c) **human review + GitHub's own workflow parser at release time** (out-of-band). Stated as advisory below (P0/P7).

## Guarantee audit (P0)

- **"No secrets appear anywhere in the workflow"** → **FLOOR** (deterministic absence test): `grep -c 'secrets\.' .github/workflows/publish.yml` == 0. Verifiable at build/verify.
- **"The TS product is unaffected by this change"** → **FLOOR**: `npm run check` exit 0 (existing gates). NOTE: this does **not** validate `publish.yml` — no gate parses YAML.
- **"publish.yml is syntactically valid / the workflow actually publishes via OIDC"** → **ADVISORY.** No floor primitive in this repo parses the workflow. Correctness rests on human review + GitHub's runtime workflow parser + npmjs.org Trusted Publisher config — all **out-of-band**. Not sold as guaranteed (P0; `LIMITS.md §4`: "good" = holes labeled, not "no holes").
- **"tag == package.json version before publish"** → a **RUNTIME floor guard INSIDE the workflow** (string-equality membership test → `exit 1`), deterministic **when GitHub runs it**; from this repo's build floor it is **ADVISORY** (its execution is out-of-band). It adds a release-time gate, not a build-time guarantee.
- **External prerequisites** (advisory, P7 honest scope — named, not silently assumed; not files this plan can create): (i) a GitHub deployment environment named `npm-publish` must exist in repo settings; (ii) npmjs.org must be configured with a Trusted Publisher pointing at workflow `publish.yml` + environment `npm-publish`; (iii) the FIRST publish of the package stays a manual local `npm publish` by a maintainer.

## Trust audit (P2)

- **N/A** — this increment ingests **no** untrusted remote artifact (no manifest / `module.json` / degit tree). It is Surface B′ (the dev-loop editing repo tooling), answered by the writes-scope + trusted-file hooks (`THREAT-MODEL.md §1, §3.3`), not by the install-time validation floor. The workflow's own `checkout` keeps `persist-credentials: false` (unchanged). No taint propagation to audit.

## Determinism audit (P5)

- The only branch introduced is the workflow's guard: `[ "$TAG" = "$PKG" ]` — a string-equality membership test whose fallback is a hard `exit 1` (never a guess). Compliant.
- The build itself is a fixed set of six textual edits to one named file — no classification, no model-chosen branch.

## Open questions (HALT)

- **None blocking.** The six edits are fully specified by the mandate; live state confirms all three stale references (manual-dispatch comment, `workflow_dispatch`, `NODE_AUTH_TOKEN`) live ONLY in `publish.yml`, so "No other files" strands no doc (no P4 tension).
- **One interpretation flagged for confirmation at the approval gate:** unnamed lines (`cache: npm`, `registry-url`, `--provenance`, `id-token: write`, action SHA pins) are left **AS-IS** per "No other files." This is the documented npm Trusted-Publishing pattern — `registry-url` stays (it selects the registry; the OIDC exchange happens in `npm publish`), the token `env` drops, and `--provenance`/`id-token: write` remain valid under OIDC. Confirm this "leave unnamed lines untouched" reading is intended.
