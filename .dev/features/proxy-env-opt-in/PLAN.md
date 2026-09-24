# PLAN — proxy-env-opt-in (PHARN-12: the proxy notice must not say "pharn will not use it" when Node will)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `detectProxyNotice` also reports whether THIS Node supports env-proxy
  (`process.allowedNodeEnvironmentFlags.has('--use-env-proxy')` — a runtime membership test) and whether
  it is turned on (`NODE_USE_ENV_PROXY=1`, `--use-env-proxy` in `process.execArgv` or `NODE_OPTIONS`);
  the message then says one of three true things: the proxy IS used; it is not used but
  `NODE_USE_ENV_PROXY=1` would route pharn through it; or this Node cannot use it at all.
- layer(s): the CLI itself (`src/lib/proxy-env.ts`, `src/lib/proxy-env-format.ts`)
- constitution_refs: [P1, P4, P5]

## Discovery — verified this run (P6)

Probed here: Node 22.22.2 with `HTTPS_PROXY=http://127.0.0.1:9` and `NODE_USE_ENV_PROXY=1` (or
`--use-env-proxy`) → `fetch failed` (it dialled the dead proxy); without → direct. Node 20.20.2 ignores the
variable and rejects the flag (`bad option`). `process.allowedNodeEnvironmentFlags.has('--use-env-proxy')`
is `true` on 22.22.2 and `false` on 20.20.2. Current message (`proxy-env-format.ts`): "…but pharn will not
use it: its network calls go through Node's global fetch, which reads no proxy environment variable on
any platform" — false with the opt-in on, and it hides the one workaround from users behind a proxy.
`LIMITS.md` §3a / `THREAT-MODEL.md` carry the same claim but are human-only (hook-protected) — flagged for
a maintainer, not edited here.

## Files

- `src/lib/proxy-env.ts` — `ProxyNotice` gains `envProxy: 'on' | 'available' | 'unsupported'`, computed from
  injectable inputs (env, execArgv, the allowed-flags set) so it is testable without spawning Node — layer CLI/lib
- `src/lib/proxy-env-format.ts` — one message per state; `on` names that pharn's downloads go through the
  proxy (Node also honours `NO_PROXY` then) — layer CLI/lib
- `tests/proxy-env.test.ts` — the detection matrix: env var `1`/other, flag in execArgv, flag in
  NODE_OPTIONS, unsupported Node ignores both
- `tests/proxy-env-format.test.ts` — each state's message; redaction unchanged
- `docs/troubleshooting.md` — "Proxy environment variables": the opt-in and which Node supports it (P4)

## Contracts satisfied

- P4 (docs cite code): the user-facing claim now matches what Node actually does.

## Evals to write (P1)

- listed above; the `on` and `available` messages fail on the base source.

## Guarantee audit (P0)

- "the notice says whether Node will use the proxy" → floor: membership of `--use-env-proxy` in
  `process.allowedNodeEnvironmentFlags` + exact env/argv string checks. Whether a given proxy actually
  WORKS is not claimed (advisory).

## Trust audit (P2)

- The proxy value is still rendered only through `redactProxyUrl`.

## Determinism audit (P5)

- Membership tests only.

## Open questions (HALT)

- none
