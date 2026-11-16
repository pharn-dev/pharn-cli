import { readJsonBounded } from './bounded-read.js';
import { checkModelsBlock } from './model-config.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// pharn-oss's own `models` block — the one `pharn init` copies and `pharn
// update` moves an unedited block to — read from the ROOT pharn.config.json of
// the fetched clone (same name as the project config, a different file; read
// here, never copied).
//
// The block is NETWORK-DERIVED, so it is checked here, before it can reach a
// config write (THREAT-MODEL.md §3.1), with the pinned copy of pharn-oss's
// rules (lib/model-config.ts). The read is bounded and non-blocking. Nothing
// throws: every failure is a named `invalid`, and the caller applies nothing.
// ---------------------------------------------------------------------------

// pharn-oss's root config (not the project config).
const UPSTREAM_CONFIG_FILE = 'pharn.config.json';

// Upstream's file is about 2 KB; the cap bounds what a poisoned clone can make
// this read parse.
export const MAX_UPSTREAM_CONFIG_BYTES = 1024 * 1024;

export type UpstreamModels =
  // No root config, or no `models` block (absent or `null`): pharn writes none
  // rather than invent one.
  | { kind: 'absent' }
  // A block pharn-oss's rules accept — copied VERBATIM, other keys included.
  | { kind: 'ok'; block: unknown }
  // A block (or a file) this CLI will not apply, with why. The reasons quote
  // upstream bytes: `terminalSafe` before printing.
  | { kind: 'invalid'; reasons: string[] };

export function readUpstreamModels(repoDir: string): UpstreamModels {
  const read = readJsonBounded(
    safeJoin(repoDir, UPSTREAM_CONFIG_FILE),
    MAX_UPSTREAM_CONFIG_BYTES,
  );
  if (read.kind === 'absent') return { kind: 'absent' };
  if (read.kind === 'unusable') {
    return {
      kind: 'invalid',
      reasons: [`pharn-oss's ${UPSTREAM_CONFIG_FILE} ${read.reason}`],
    };
  }
  if (read.kind === 'invalid-json') {
    // V8's message is not echoed: one of its shapes quotes raw file bytes.
    return {
      kind: 'invalid',
      reasons: [`pharn-oss's ${UPSTREAM_CONFIG_FILE} is not valid JSON`],
    };
  }
  const config = read.value;
  if (!isPlainObject(config)) {
    return {
      kind: 'invalid',
      reasons: [
        `pharn-oss's ${UPSTREAM_CONFIG_FILE} is valid JSON but is not an object`,
      ],
    };
  }
  const block = config.models;
  if (block === undefined || block === null) return { kind: 'absent' };
  const check = checkModelsBlock(block);
  if (check.kind === 'invalid') {
    return { kind: 'invalid', reasons: check.reds.map((red) => red.detail) };
  }
  // The checker reads only `stages`' entries, so a block can pass while an
  // ignored key nests deeper than JSON.stringify can go. Refused before any
  // copy rather than thrown half-way through an install.
  try {
    JSON.stringify(block);
  } catch {
    return {
      kind: 'invalid',
      reasons: ["pharn-oss's models block is nested too deeply to copy"],
    };
  }
  return { kind: 'ok', block };
}
