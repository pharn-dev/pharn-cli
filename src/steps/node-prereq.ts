import { CliError } from '../lib/cli-error.js';
import { nodeFloorRefusal, nodeFloorStatus } from '../lib/node-floor.js';

// The Node-floor preflight for `init` and `update`, which install or refresh
// PHARN's floor checkers. Runs FIRST — before the git prerequisite, the config
// load, the TTY gate and every network call — since no later step can repair
// the environment. Separate from `runGitPrereq` because the command suites mock
// `steps/prereqs.js` wholesale and this check must keep running there. Exit 1,
// the CLI's own refusal code (pharn-oss's floor CLIs exit 2).
export function runNodePrereq(
  command: 'init' | 'update',
  opts: { json?: boolean } = {},
): void {
  const refusal = nodeFloorRefusal(
    nodeFloorStatus(process.versions.node),
    command,
  );
  if (refusal === null) return;
  // `--json` keeps stdout and the clack chrome out of it: one plain stderr line.
  throw CliError.error(refusal, opts);
}
