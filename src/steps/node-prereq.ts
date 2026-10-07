import { logError } from '../lib/report-error.js';
import { nodeFloorRefusal, nodeFloorStatus } from '../lib/node-floor.js';

// The Node-floor preflight for the two commands that install PHARN's floor
// checkers into a project (`init`) or refresh them (`update`). Runs FIRST in
// each — before the git prerequisite, the config load, the TTY gate and every
// network call — because it is a fact about the environment that no later step
// can repair, and refusing here costs nothing and writes nothing.
//
// A separate step module from `runGitPrereq` on purpose: the command suites mock
// `steps/prereqs.js` wholesale, and this check must keep running for real there.
//
// Reported through the shared reporter (stderr), exit 1 — the CLI's own refusal
// code, like every other up-front refusal in `index.ts`. (pharn-oss's floor CLIs
// exit 2 for the same condition; that is theirs, and `status` quotes it.)
export function runNodePrereq(command: 'init' | 'update'): void {
  const refusal = nodeFloorRefusal(
    nodeFloorStatus(process.versions.node),
    command,
  );
  if (refusal === null) return;
  logError(refusal);
  process.exit(1);
}
