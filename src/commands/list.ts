import { intro, note, outro } from '@clack/prompts';
import pc from '../lib/color.js';
import { renderCapabilityLines } from '../lib/capability-groups.js';
import { loadArchetypeConfigOrExit } from '../lib/pharn-config.js';
import type { Archetype, CapabilitySource, PharnConfig } from '../types.js';

// Archetype (capability) install inventory — the offline view derived entirely
// from pharn.config.json (no manifest, no clone). `mode` tags the `--json` shape.
interface ArchetypeInventory {
  mode: 'archetype';
  skillsVersion: string;
  archetypes: Archetype[];
  // `source`: present only when the config records it — never defaulted, since
  // absence means "provenance unknown".
  capabilities: {
    name: string;
    role: 'griller' | 'lens';
    source?: CapabilitySource;
  }[];
}

// Read-only: shows the installed archetypes + capabilities from the config —
// never writes, clones or fetches. `--json` emits the inventory on stdout;
// diagnostics go to stderr.
export async function runList(opts: { json?: boolean } = {}): Promise<void> {
  const json = opts.json ?? false;
  const cwd = process.cwd();
  if (!json) intro('pharn list');

  // Under `--json` a load error is a plain stderr line, so stdout carries the
  // inventory or nothing.
  const config = loadArchetypeConfigOrExit(cwd, { json });

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
  // The shared renderer: rows, then capabilities grouped by role, one per line.
  const lines = renderCapabilityLines(inv);
  note(lines.join('\n'), 'INSTALLED (archetype)');
  // One short sentence so it survives a narrow terminal without mid-word breaks.
  outro(pc.dim('Read-only — nothing changed.'));
}
