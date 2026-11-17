import {
  manifestCapabilityIndex,
  readUpstreamManifest,
} from './upstream-manifest.js';
import type { CapabilityIndex } from '../types.js';

// ---------------------------------------------------------------------------
// Capability index — the FETCH BOUNDARY: a fetched pharn-oss clone → a typed
// CapabilityIndex, one CapabilityEntry per griller/lens the tree's
// pharn-install.json declares (lib/upstream-manifest.ts validates it; a tree
// without one is refused there).
//
// Fail closed on INSTALLING, never on SEEING: upstream grammar evolves faster
// than CLI releases (a new `applies` token), so a capability whose token this
// CLI does not know becomes an `unknown` entry instead of aborting the index.
// Nothing in `unknown` is ever selected or copied, and every caller names the
// list (lib/unknown-capabilities.ts).
// ---------------------------------------------------------------------------

/**
 * The capability index of a fetched pharn-oss clone, grillers before lenses,
 * each by name. A capability with an unknown `applies` token is reported in
 * `unknown` — never installed, never silent.
 */
export function parseCapabilityIndex(repoDir: string): CapabilityIndex {
  return manifestCapabilityIndex(readUpstreamManifest(repoDir));
}
