import { intro, log, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import { renderCapabilityLines } from '../lib/capability-groups.js';
import {
  isArchetypeConfig,
  isConfigValidationError,
  LEGACY_CONFIG_MESSAGE,
  readPharnConfig,
} from '../lib/pharn-config.js';
import type { Archetype, CapabilitySource, PharnConfig } from '../types.js';

// Archetype (capability) install inventory — the offline view derived entirely
// from pharn.config.json (no manifest, no clone). `mode` tags the `--json` shape.
interface ArchetypeInventory {
  mode: 'archetype';
  skillsVersion: string;
  archetypes: Archetype[];
  // `source` is ADDITIVE in the --json shape: present only when the config
  // records it, omitted for a legacy entry that predates the field (never
  // defaulted — absence means "provenance unknown until the next `pharn update`",
  // and inventing a value here would publish a guess).
  capabilities: {
    name: string;
    role: 'griller' | 'lens';
    source?: CapabilitySource;
  }[];
}

// Read-only: shows the installed archetypes + capabilities from the config.
// Never writes, never clones, never fetches (the module/manifest catalog was
// removed — live pharn-oss ships no manifest.json). `--json` emits the inventory
// object on stdout; diagnostics go to stderr.
export async function runList(opts: { json?: boolean } = {}): Promise<void> {
  const json = opts.json ?? false;
  const cwd = process.cwd();
  if (!json) intro('pharn list');

  let config: PharnConfig | null;
  try {
    config = readPharnConfig(cwd);
  } catch (e) {
    // A present-but-invalid models/seam block: surface the loud, named error
    // (json-aware, to stderr) + exit — never the "run init" lie (BUG 1). A
    // non-config error is a bug: rethrow, never swallow.
    if (isConfigValidationError(e)) {
      emitError(e.message, json);
      process.exit(1);
    }
    throw e;
  }
  if (!config) {
    emitError('No pharn.config.json found. Run `pharn init` first.', json);
    process.exit(1);
  }

  // A pre-archetype (module) config is no longer listable — the module/manifest
  // path was removed. json-aware so --json keeps stdout pure (error → stderr).
  if (!isArchetypeConfig(config)) {
    emitError(LEGACY_CONFIG_MESSAGE, json);
    process.exit(1);
  }

  const inventory = buildArchetypeInventory(config);
  if (json) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  renderArchetypeHuman(inventory);
}

function buildArchetypeInventory(config: PharnConfig): ArchetypeInventory {
  return {
    mode: 'archetype',
    skillsVersion: config.skillsVersion,
    archetypes: config.archetypes ?? [],
    capabilities: (config.capabilities ?? []).map((c) => ({
      name: c.name,
      role: c.role,
      // Spread-in rather than assigned, so an absent `source` stays ABSENT in the
      // JSON instead of surfacing as `"source": null`.
      ...(c.source !== undefined ? { source: c.source } : {}),
    })),
  };
}

function renderArchetypeHuman(inv: ArchetypeInventory): void {
  // Body built by the pure, shared renderer (lib/capability-groups.ts): the
  // key-value rows, then capabilities grouped by role, counted, ONE per line.
  const lines = renderCapabilityLines(inv);
  note(lines.join('\n'), 'INSTALLED (archetype)');
  // One short sentence so it survives a narrow terminal without mid-word breaks.
  outro(pc.dim('Read-only — nothing changed.'));
}

function emitError(message: string, json: boolean): void {
  // JSON mode keeps stdout pure for the object, so errors go to stderr.
  if (json) console.error(message);
  else log.error(message);
}
