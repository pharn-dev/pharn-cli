import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// npm reads a package argument as a LOCAL FILE only when it starts with `./`,
// `../`, `/` or `~/` (npm-package-arg's file-spec test). A bare relative path
// such as `pkg/pharn-dev-pharn-0.6.0.tgz` has the shape of the GitHub
// `owner/repo` shorthand, so npm resolves it as a git dependency and runs
// `git ls-remote ssh://git@github.com/pkg/pharn-dev-pharn-0.6.0.tgz.git`. That
// is exactly how the 0.6.0 release failed: the publish job died on
// `Permission denied (publickey)` and nothing reached the registry. The build
// job's smoke install never hit it only because its path began with `../`.
//
// Pinned statically because publish.yml runs solely on a published Release —
// no PR check ever executes it, so the first run of a broken line is a release.
const PUBLISH_WORKFLOW = '.github/workflows/publish.yml';

/** Every `.tgz` argument handed to `npm publish` / `npm install` in the workflow. */
function tarballArgs(source: string): { command: string; arg: string }[] {
  const found: { command: string; arg: string }[] = [];
  for (const line of source.split('\n')) {
    const m = /\bnpm (publish|install|i)\b(.*)$/.exec(line);
    if (!m) continue;
    for (const token of m[2]!.trim().split(/\s+/)) {
      const arg = token.replace(/^["']|["']$/g, '');
      if (arg.endsWith('.tgz')) found.push({ command: m[1]!, arg });
    }
  }
  return found;
}

describe('publish.yml tarball arguments', () => {
  const args = tarballArgs(readFileSync(PUBLISH_WORKFLOW, 'utf8'));

  it('publishes a tarball (so the path check below is not vacuous)', () => {
    expect(args.some((a) => a.command === 'publish')).toBe(true);
  });

  it('passes every tarball as an explicit file path, never an owner/repo lookalike', () => {
    for (const { arg } of args) {
      expect(arg, `npm would resolve "${arg}" as a GitHub repo`).toMatch(
        /^(?:\.{1,2}|~)?\//,
      );
    }
  });
});
