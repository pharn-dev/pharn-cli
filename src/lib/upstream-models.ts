import { checkModelsBlock } from './model-config.js';
import { readUpstreamManifest } from './upstream-manifest.js';

// ---------------------------------------------------------------------------
// pharn-oss's own `models` block — the one `pharn init` copies and `pharn
// update` moves an unedited block to: the `models.defaults` of the fetched
// tree's pharn-install.json (read by the one parser, lib/upstream-manifest.ts).
//
// The block is NETWORK-DERIVED, so it is checked here, before it can reach a
// config write (THREAT-MODEL.md §3.1), with the pinned copy of pharn-oss's
// rules (lib/model-config.ts). Nothing throws past the manifest read: every
// failure of the block is a named `invalid`, and the caller applies nothing.
// ---------------------------------------------------------------------------

export type UpstreamModels =
  // No `models.defaults` (absent or `null`): pharn writes none rather than
  // invent one.
  | { kind: 'absent' }
  // A block pharn-oss's rules accept — copied VERBATIM, other keys included.
  | { kind: 'ok'; block: unknown }
  // A block this CLI will not apply, with why. The reasons quote upstream
  // bytes: `terminalSafe` before printing.
  | { kind: 'invalid'; reasons: string[] };

export function readUpstreamModels(repoDir: string): UpstreamModels {
  return checkUpstreamBlock(readUpstreamManifest(repoDir).modelsDefaults);
}

// The one gate an upstream block passes before it can reach a config write.
function checkUpstreamBlock(block: unknown): UpstreamModels {
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
