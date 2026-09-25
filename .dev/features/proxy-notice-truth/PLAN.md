# PLAN — proxy-notice-truth (the proxy notice follows Node's measured rules; its tests stop reading the host's env)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `detectProxyNotice` reports what Node's `fetch` will actually do. It follows the
  measured rule set below: the variable Node reads and its precedence, both flag spellings, the
  `--no-` negation and last-one-wins, the 24.0–24.4 window where the variable works without the
  flag, and exact-case lookup. The command tests stop depending on the host's proxy environment.
- layer(s): the CLI itself (`src/lib/proxy-env.ts`, `src/lib/proxy-env-format.ts`), tests, docs
- constitution_refs: [P0, P1, P5, P6]

## Discovery — measured this run (P6)

The measurement harness is in scratchpad `plan-E/`. A local proxy logs `CONNECT`s, and a client
`fetch`es `https://example.com` under `env -i`. It ran on the official binaries for 20.20.2, 21.7.3,
22.20.0, 22.21.0, 22.22.2, 23.11.1, 24.0.0, 24.4.1 and 24.5.0.

| Node                         | flag known¹ | `NODE_USE_ENV_PROXY` turns it on | flag turns it on²  |
| ---------------------------- | ----------- | -------------------------------- | ------------------ |
| 20.x, 21.x, 22.0–22.20, 23.x | no          | never                            | startup error      |
| 22.21+ (22.22.2), 24.5+      | yes         | only the value `1`               | yes, last one wins |
| 24.0.0–24.4.x                | no          | ANY non-empty value (even `0`)   | startup error      |

¹ `process.allowedNodeEnvironmentFlags.has('--use-env-proxy')`. ² `--use-env-proxy` or
`--use_env_proxy`, from `NODE_OPTIONS` or the command line.

The rows below hold wherever env proxy is on (measured on 22.22.2, 24.0.0, 24.4.1 and 24.5.0):

- **Negation.** `--no-use-env-proxy` or `--no-use_env_proxy` overrides `NODE_USE_ENV_PROXY=1`.
- **Order.** The command line is read after `NODE_OPTIONS`, so the last token wins.
  `--use-env-proxy=false` still turns it ON.
- **Case.** `Https_Proxy` is never read on Linux, so the connection goes DIRECT.
- **Precedence.** `https_proxy` beats `HTTPS_PROXY`. Seen via different ports: lowercase won.
- **Fallback.** With only `HTTP_PROXY` set, https requests still go through that proxy (undici's
  `EnvHttpProxyAgent` falls back from the https agent to the http one).
- **Exclusion.** `NO_PROXY=example.com` → direct.

Checked against HEAD `abb274a` (`proxy-env.ts:67-94`):

- `supportsEnvProxy` is the flag membership alone. So 24.0–24.4 read as `unsupported` ("this Node
  has no NODE_USE_ENV_PROXY support") while the variable really does route `fetch`.
- `hasFlagToken` knows only the hyphen spelling and no negation.
- `proxyVariantKeys` matches any letter-case and prefers `HTTPS_PROXY`. So it names a variable Node
  ignores, or the one Node does not use.
- It never looks at `http_proxy`/`HTTP_PROXY`.

F27, reproduced here (proxy variables unset, root capabilities dropped):

- `NODE_USE_ENV_PROXY=1` → 15 extra failures (add 2, init 2, status 5, update 6). Every one is a
  notice test that expects "will not use it".
- `HTTPS_PROXY` exported → `init.test.ts:871` "prints nothing extra…" fails. The notice counts as an
  unexpected `log.warn`.
- The four update failures that appear under both are the known root-only chmod cases (the
  CI-equivalent wrapper passes them).

`LIMITS.md` §3a (`:106-110`) still says "setting a proxy variable will not change that". That has
been untrue since PHARN-12. LIMITS.md is human-only (hook-protected), so this plan **surfaces** it
and does not edit it.

## Files

- `src/lib/proxy-env.ts` — layer CLI/lib. Changes:
  - The runtime record gains the Node version.
  - The proxy Node would use for an https URL is resolved with undici's own `??` chains, by exact
    key: the first PRESENT of `https_proxy` / `HTTPS_PROXY`; if that is absent or empty, the first
    present of `http_proxy` / `HTTP_PROXY` (GATE 1 answer 1 → a). Measured on 22.22.2: an empty
    `https_proxy` shadows a set `HTTPS_PROXY` and falls through to the http pair. On win32,
    `process.env` lookups are case-insensitive, so the platform difference comes for free.
  - A key that only case-folds to one of those four, when no exact lookup found a proxy, yields a
    new "ignored spelling" notice.
  - The env-proxy state follows the table. Where the flag is known, the LAST flag token decides
    (regex `^--(no[-_])?use[-_]env[-_]proxy(=.*)?$` over `NODE_OPTIONS` tokens, then the command
    line); with no token, `NODE_USE_ENV_PROXY === '1'` decides. Where the flag is unknown and the
    version is 24.0–24.4, any non-empty `NODE_USE_ENV_PROXY` turns it on. Otherwise: unsupported.
- `src/lib/proxy-env-format.ts` — layer CLI/lib. The message for the ignored spelling ("Node reads
  only https_proxy / HTTPS_PROXY / http_proxy / HTTP_PROXY"). The unsupported wording names the
  Node lines that have the option (22.21+, 24+), rather than "a newer release". The "on" wording
  keeps its NO_PROXY hedge (GATE 1 answer 2 → a).
- `tests/proxy-env.test.ts` — layer tests. One case per measured row; each is an injected runtime,
  so the cases are pure. FAIL on base: 24.4 + `NODE_USE_ENV_PROXY=1` → on; `--use_env_proxy` → on;
  `NUEP=1` + `--no-use-env-proxy` → available; `Https_Proxy` → ignored spelling; lower beats
  upper; `HTTP_PROXY` only → a notice; an empty `https_proxy` shadows `HTTPS_PROXY`.
- `tests/proxy-env-format.test.ts` — layer tests. The new and changed wordings.
- `tests/setup/hermetic-env.ts` (new) — layer tests. Before any test, it deletes `HTTPS_PROXY`,
  `https_proxy`, `HTTP_PROXY`, `http_proxy`, `NO_PROXY`, `no_proxy` and `NODE_USE_ENV_PROXY` from
  the test process, so `vi.unstubAllEnvs()` restores "absent", never the host's value.
- `vitest.config.ts` — layer tests. Registers that file under `setupFiles`.
- `tests/add.test.ts` — layer tests. Adjusted only if a notice assertion depends on the host Node's
  flag support. Today they match "will not use it", which holds for both available and
  unsupported.
- `tests/init.test.ts` — layer tests. The same.
- `tests/status.test.ts` — layer tests. The same.
- `tests/update.test.ts` — layer tests. The same.
- `docs/troubleshooting.md` — layer docs. The proxy section: the version table in prose, the
  exact-case rule, lowercase precedence, the `HTTP_PROXY` fallback, and `--no-use-env-proxy`.
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed` (notice), plus a line for the hermetic tests

## Contracts satisfied

- PHARN-12's own contract: "the notice is one of three TRUE forms" (`proxy-env-format.ts:46-51`).
  It is true again on every measured Node, now as four forms (cited, P4).

## Evals to write (P1)

- Listed under Files. Six cases FAIL on the base.
- The hermetic setup is proven by running the whole suite under `NODE_USE_ENV_PROXY=1` and under
  an exported `HTTPS_PROXY`, before and after. That run is recorded in VERIFY, not a vitest case:
  a test cannot set its own process env before its setup file runs.

## Guarantee audit (P0)

- "the notice matches Node's behaviour" → floor: pure-function tests over the MEASURED table. The
  table itself is advisory in reach: measured on 9 versions, and later Node lines are assumed to
  follow the 24.5 row. That assumption is named in the code comment and the docs.
- "the suite's result does not depend on the host's proxy env" → floor: the setup file
  (deterministic deletion) plus the two-environment run above.

## Trust audit (P2)

- The environment is attacker-influenceable. Values are still printed only through
  `redactProxyUrl`. A variable NAME is printed only when it case-folds to a proxy name, so it
  contains ASCII letters and `_` only.

## Determinism audit (P5)

- Key membership, a regex over tokens, and a version-range compare. No classification. With nothing
  set the result is `null` (silence).

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. With only `HTTP_PROXY`/`http_proxy` set (no https variable), today pharn says nothing. Node,
   when on, still proxies https through it. (a) Report it, naming that variable — recommended,
   because it is the proxy Node actually uses. (b) Stay https-only, as today.
2. `NO_PROXY` covering `github.com` hosts while env proxy is on. (a) Keep the current hedge
   ("Node's fetch then also honours NO_PROXY") — recommended, no new matching logic. (b) Evaluate
   `NO_PROXY` against the three hosts and say "direct" when they match.
