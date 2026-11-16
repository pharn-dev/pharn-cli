import { compareVersionCore } from './semver.js';
import { terminalSafe } from './terminal-safe.js';

// ---------------------------------------------------------------------------
// THE NODE FLOOR — the oldest Node this CLI, and the PHARN floor checkers it
// installs, will run on. Pure, so one verdict feeds the `init`/`update`
// preflight and `status`'s NODE note.
//
// Why 24.2.0: pharn-oss's floor CLIs refuse to run below it, so an install on
// an older Node would meet those refusals mid-run; this CLI says so up front.
// `tests/node-floor.test.ts` pins it equal to `engines.node`.
//
// FAIL-CLOSED, unlike the MIN_CLI gate: its purpose is to refuse an
// environment where a check would silently pass without running, and a Node
// version we cannot read is not one we can vouch for.
// ---------------------------------------------------------------------------

export const NODE_FLOOR = '24.2.0';

export type NodeFloorStatus =
  // At or above the floor.
  | { kind: 'ok'; current: string }
  // A readable version below the floor.
  | { kind: 'below'; current: string }
  // Absent or not a three-part numeric version.
  | { kind: 'unparseable'; raw: string | undefined };

/**
 * Compare a Node version string (`process.versions.node`, no leading `v`) with
 * the floor. REQUIRED, not defaulted: a default would silently substitute the
 * running Node for an explicit `undefined`. Never throws.
 *
 * A prerelease of the floor itself (`24.2.0-rc.1`) is BELOW it, as semver
 * orders it — `compareVersionCore` equates the two for MIN_CLI and would wave
 * through a build that may predate the floor's behaviour.
 */
export function nodeFloorStatus(current: string | undefined): NodeFloorStatus {
  if (typeof current !== 'string') return { kind: 'unparseable', raw: current };
  const cmp = compareVersionCore(current, NODE_FLOOR);
  if (cmp === null) return { kind: 'unparseable', raw: current };
  if (cmp < 0 || (cmp === 0 && current.includes('-'))) {
    return { kind: 'below', current };
  }
  return { kind: 'ok', current };
}

/**
 * The refusal message for a command that must not run on this Node, or `null`.
 * `command` is a literal command name, never argv. Every message says nothing
 * was written: the preflight precedes any write.
 */
export function nodeFloorRefusal(
  status: NodeFloorStatus,
  command: 'init' | 'update',
): string | null {
  if (status.kind === 'ok') return null;
  if (status.kind === 'below') {
    return `pharn ${command} requires Node ${NODE_FLOOR} or newer, and this is Node ${terminalSafe(status.current, { max: 40 })}. The PHARN floor checks it installs refuse to run on older Node, so an install made here would fail mid-run. Upgrade Node, then re-run: npx @pharn-dev/pharn ${command}. Nothing was written.`;
  }
  const shown =
    status.raw === undefined
      ? 'no version reported'
      : JSON.stringify(terminalSafe(status.raw, { max: 40 }));
  return `pharn ${command} requires Node ${NODE_FLOOR} or newer, and could not read this Node's version (${shown}). It will not continue on a version it cannot verify. Run it on Node ${NODE_FLOOR} or newer. Nothing was written.`;
}

/** The `status` NODE note body: the floor, what is running, and the verdict. */
export function nodeFloorLines(status: NodeFloorStatus): string[] {
  const running =
    status.kind === 'unparseable'
      ? status.raw === undefined
        ? '(not reported)'
        : JSON.stringify(terminalSafe(status.raw, { max: 40 }))
      : `v${terminalSafe(status.current, { max: 40 })}`;
  const lines = [
    `  ${'Node floor'.padEnd(26)}>= ${NODE_FLOOR}`,
    `  ${'Node (running)'.padEnd(26)}${running}`,
  ];
  if (status.kind === 'ok') return lines;
  lines.push(
    '',
    status.kind === 'below'
      ? `  MISMATCH — below the floor. PHARN's floor checks refuse to run on this Node (exit 2); use Node ${NODE_FLOOR} or newer.`
      : `  MISMATCH — this Node's version could not be verified against the floor. Use Node ${NODE_FLOOR} or newer.`,
  );
  return lines;
}
