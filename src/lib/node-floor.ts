import { compareVersionCore } from './semver.js';
import { terminalSafe } from './terminal-safe.js';

// ---------------------------------------------------------------------------
// THE NODE FLOOR — the oldest Node this CLI, and the PHARN floor checkers it
// installs, will run on. Pure: no I/O, no exit, so the same verdict feeds the
// `init`/`update` preflight (steps/prereqs.ts) and `status`'s NODE note.
//
// Why 24.2.0: every pharn-oss floor CLI is gated on `import.meta.main`, which
// older Node leaves undefined — the CLI then exited 0 having checked NOTHING, a
// silent false green. Since pharn-oss 6.50.0 those CLIs refuse to run below
// 24.2.0 (one stderr line, exit 2). A user on an older Node could install
// successfully and then meet those refusals mid-run, so this CLI says it up
// front, and `engines.node` (package.json) declares the same number.
// `tests/node-floor.test.ts` pins the constant equal to the declared bound.
//
// FAIL-CLOSED, the opposite of the MIN_CLI gate (lib/min-cli-gate.ts): that gate
// fails open because a typo upstream must not brick the fleet; this one fails
// closed because its whole purpose is to refuse an environment where a check
// would silently pass without running. A Node version we cannot read is not a
// version we can vouch for.
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
 * Compare a Node version string (callers pass `process.versions.node`: no
 * leading `v`) with the floor. The argument is REQUIRED, not defaulted: a
 * default would also fire for an explicit `undefined`, silently substituting the
 * running Node for "the runtime reported no version". Total and deterministic (P5): a three-integer compare with an
 * explicit "cannot read" outcome, never a throw.
 *
 * A prerelease of the floor itself (`24.2.0-rc.1`) is BELOW it: semver orders a
 * prerelease before its release, and `compareVersionCore` (which deliberately
 * equates the two for the MIN_CLI handshake) would otherwise wave through a
 * build that may predate the floor's behaviour.
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
 * The refusal message for a command that must not run on this Node, or `null`
 * when the Node is fine. `command` is one of the CLI's own literal command
 * names, never argv. Every message says nothing was written, because the
 * preflight sits ahead of any write.
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
