// Runs before every test file (vitest.config.ts → setupFiles).
//
// The suite must not depend on the proxy environment of the machine running it.
// The commands print a proxy notice before they fetch, and what that notice says
// is derived from these variables. So a developer who had opted in to Node's
// env proxy (`NODE_USE_ENV_PROXY=1`), or merely exported `HTTPS_PROXY`, saw
// tests fail that pass in CI: 15 of them under `NODE_USE_ENV_PROXY=1`, and
// init's "prints nothing extra" under an exported `HTTPS_PROXY`.
//
// DELETED rather than stubbed: a test that stubs one of these calls
// `vi.unstubAllEnvs()` afterwards, which restores the value from before the
// stub. Deleting here first makes that value "absent" — never the host's.
// NODE_OPTIONS goes too, because `--use-env-proxy` inside it turns the opt-in on.
for (const name of [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'NODE_OPTIONS',
]) {
  delete process.env[name];
}
