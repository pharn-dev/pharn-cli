import { readBoundedFile } from './bounded-read.js';
import { checkModelsBlock } from './model-config.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// pharn-oss's own `models` block — the one `pharn init` copies and `pharn
// update` moves an unedited block to. It lives in pharn-oss's ROOT
// pharn.config.json, which is inside the tarball every command already
// downloads. That file shares its name with the config pharn writes into a
// project and is a different file: pharn-oss's is read here, never copied.
//
// The block is NETWORK-DERIVED, so it is checked at this boundary, before it
// can reach a config write (THREAT-MODEL.md §3.1): against pharn-oss's rules,
// through this CLI's pinned copy of them (lib/model-config.ts). The read is
// bounded and non-blocking (lib/bounded-read.ts), and the clone holds no
// symlinks (lib/tar-extract.ts refuses them). Nothing here throws: every
// failure is a named `invalid`, and the caller applies nothing.
//
// One axis (P3): obtaining pharn-oss's models block from a fetched clone.
// ---------------------------------------------------------------------------

// pharn-oss's root config. The same name as the project config, not the same
// file (see above).
const UPSTREAM_CONFIG_FILE = 'pharn.config.json';

// Upstream's file is about 2 KB. A cap far above that, and far below the
// 16 MiB pharn allows its own project files, bounds what a poisoned clone can
// make this read parse.
export const MAX_UPSTREAM_CONFIG_BYTES = 1024 * 1024;

export type UpstreamModels =
  // No root pharn.config.json, or one without a `models` block (absent or
  // `null`, which pharn-oss's checker reads as nothing declared): there is
  // nothing to copy, and pharn writes none rather than invent one.
  | { kind: 'absent' }
  // A block pharn-oss's rules accept — copied VERBATIM, other keys included.
  | { kind: 'ok'; block: unknown }
  // A block (or a file) this CLI will not apply, with why. The reasons quote
  // upstream bytes: `terminalSafe` before printing.
  | { kind: 'invalid'; reasons: string[] };

export function readUpstreamModels(repoDir: string): UpstreamModels {
  const read = readBoundedFile(
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
  let config: unknown;
  try {
    config = JSON.parse(read.bytes.toString('utf8'));
  } catch {
    // V8's message is not echoed: one of its shapes quotes raw file bytes
    // (lib/pharn-config.ts, parseLocation).
    return {
      kind: 'invalid',
      reasons: [`pharn-oss's ${UPSTREAM_CONFIG_FILE} is not valid JSON`],
    };
  }
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
  // The checker reads only `stages`' entries, so a block can pass while a key
  // it ignores nests deeper than JSON.stringify can go — and pharn serializes
  // the block to record it and to write it. Refused here, before any copy,
  // rather than thrown half-way through an install.
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
