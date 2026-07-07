import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { categorizeModules, fetchRemoteManifest } from '../lib/manifest.js';
import { listSkillAddresses } from '../lib/wizard.js';
import { row, shortDescription } from '../lib/format.js';
import { isArchetypeConfig, readPharnConfig } from '../lib/pharn-config.js';
import type { Archetype, Manifest, PharnConfig } from '../types.js';

// A single, JSON-serializable snapshot of what's installed vs. available. Both
// the human renderer and `--json` derive from this, so the two never disagree.
interface ListInventory {
  skillsVersion: string;
  latestSkillsVersion: string;
  installed: {
    modules: { name: string; version: string; latest: string | null }[];
    skills: { skill: string; from: string }[];
  };
  available: {
    modules: { name: string; version: string; description: string }[];
    skills: { category: string; skill: string; install: string }[];
  };
}

// Archetype (capability) install inventory — the offline view for an
// `isArchetypeConfig` project (no modules/skills, no manifest). `mode`
// discriminates it from the module ListInventory in `--json` output.
interface ArchetypeInventory {
  mode: 'archetype';
  skillsVersion: string;
  archetypes: Archetype[];
  capabilities: { name: string; role: 'griller' | 'lens' }[];
}

// Read-only: shows installed + available modules/skills. Never writes, never
// clones — only the lightweight manifest fetch that add/update already do.
export async function runList(opts: { json?: boolean } = {}): Promise<void> {
  const json = opts.json ?? false;
  const cwd = process.cwd();
  if (!json) intro('pharn list');

  const config = readPharnConfig(cwd);
  if (!config) {
    emitError('No pharn.config.json found. Run `pharn init` first.', json);
    process.exit(1);
  }

  // Archetype (capability) install: render offline from the config — no manifest
  // fetch (live pharn-oss has none) and no clone, so it cannot crash on the
  // missing manifest. Cross-checking installed vs. upstream (available/updatable
  // capabilities) arrives with the status/update archetype slices (labeled in the
  // render, P4/P7). The legacy module path below is unchanged.
  if (isArchetypeConfig(config)) {
    const inventory = buildArchetypeInventory(config);
    if (json) {
      console.log(JSON.stringify(inventory, null, 2));
      return;
    }
    renderArchetypeHuman(inventory);
    return;
  }

  const manifest = await loadManifest(json);
  const inventory = buildInventory(config, manifest);

  if (json) {
    // stdout carries only the JSON object; diagnostics went to stderr above.
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }

  const hasWizard = manifest.schemaVersion === 2 && Boolean(manifest.wizard);
  renderHuman(inventory, hasWizard);
}

function buildInventory(
  config: PharnConfig,
  manifest: Manifest,
): ListInventory {
  const latestByName = new Map(
    manifest.modules.map((m) => [m.name, m.version]),
  );

  const installedModules = config.modules.map((m) => ({
    name: m.name,
    version: m.version,
    latest: latestByName.get(m.name) ?? null,
  }));
  const installedSkills = (config.installedSkills ?? []).map((s) => ({
    skill: s.skill,
    from: s.from,
  }));

  // Mirror `add`'s addable set exactly so the two commands never disagree.
  const { optional, stackPacks } = categorizeModules(manifest);
  const installedNames = new Set(config.modules.map((m) => m.name));
  const availableModules = [...optional, ...stackPacks]
    .filter((m) => !installedNames.has(m.name))
    .map((m) => ({
      name: m.name,
      version: m.version,
      description: m.description,
    }));

  // schemaVersion 2 only: every wizard skill not already recorded (matched by
  // its `install` path against installedSkills `from`).
  let availableSkills: ListInventory['available']['skills'] = [];
  if (manifest.schemaVersion === 2 && manifest.wizard) {
    const installedFroms = new Set(
      (config.installedSkills ?? []).map((s) => s.from),
    );
    availableSkills = listSkillAddresses(manifest.wizard)
      .filter((a) => !installedFroms.has(a.install))
      .map((a) => ({
        category: a.category,
        skill: a.skill,
        install: a.install,
      }));
  }

  return {
    skillsVersion: config.skillsVersion,
    latestSkillsVersion: manifest.skillsVersion,
    installed: { modules: installedModules, skills: installedSkills },
    available: { modules: availableModules, skills: availableSkills },
  };
}

function buildArchetypeInventory(config: PharnConfig): ArchetypeInventory {
  return {
    mode: 'archetype',
    skillsVersion: config.skillsVersion,
    archetypes: config.archetypes ?? [],
    capabilities: (config.capabilities ?? []).map((c) => ({
      name: c.name,
      role: c.role,
    })),
  };
}

function renderArchetypeHuman(inv: ArchetypeInventory): void {
  const grillers = inv.capabilities.filter((c) => c.role === 'griller');
  const lenses = inv.capabilities.filter((c) => c.role === 'lens');
  const lines: string[] = [
    row('Skills version', `v${inv.skillsVersion}`),
    row('Archetypes', inv.archetypes.join(', ') || '(none)'),
    '',
    '  CAPABILITIES',
  ];
  if (inv.capabilities.length === 0) {
    lines.push('  (none)');
  } else {
    if (grillers.length > 0) {
      lines.push(row('  grillers', grillers.map((c) => c.name).join(', ')));
    }
    if (lenses.length > 0) {
      lines.push(row('  lenses', lenses.map((c) => c.name).join(', ')));
    }
  }
  note(lines.join('\n'), 'INSTALLED (archetype)');
  outro(
    pc.dim(
      'Read-only — nothing changed. Available/updatable capabilities: coming with `pharn status`/`update` archetype support.',
    ),
  );
}

function renderHuman(inv: ListInventory, hasWizard: boolean): void {
  const skillsLine = row('Skills version', `v${inv.skillsVersion}`);
  const installed: string[] = [
    inv.latestSkillsVersion !== inv.skillsVersion
      ? `${skillsLine} ${pc.dim(
          `→ v${inv.latestSkillsVersion} (update available, run \`pharn update\`)`,
        )}`
      : skillsLine,
    '',
    '  MODULES',
  ];
  for (const m of inv.installed.modules) {
    const base = row(m.name, `v${m.version}`);
    installed.push(
      m.latest && m.latest !== m.version
        ? `${base} ${pc.dim(`→ v${m.latest}`)}`
        : base,
    );
  }
  if (inv.installed.skills.length > 0) {
    installed.push('', '  SKILLS');
    for (const s of inv.installed.skills) {
      installed.push(row(`  ${s.skill}`, pc.dim(s.from)));
    }
  }
  note(installed.join('\n'), 'INSTALLED');

  const available: string[] = ['  MODULES'];
  if (inv.available.modules.length > 0) {
    for (const m of inv.available.modules) {
      available.push(
        row(
          m.name,
          `v${m.version}  ${pc.dim(shortDescription(m.description))}`,
        ),
      );
    }
  } else {
    available.push('  (all installed)');
  }
  // schemaVersion 1 has no wizard, so there is no skills concept to list.
  if (hasWizard) {
    available.push('', '  SKILLS');
    if (inv.available.skills.length > 0) {
      for (const a of inv.available.skills) {
        available.push(`  ${a.category}:${a.skill}`);
      }
    } else {
      available.push('  (all installed)');
    }
  }
  note(available.join('\n'), 'AVAILABLE TO ADD');

  outro(
    pc.dim(
      'Read-only — nothing changed. `pharn add <module|category:skill>` to install, `pharn update` to upgrade.',
    ),
  );
}

function emitError(message: string, json: boolean): void {
  // JSON mode keeps stdout pure for the object, so errors go to stderr.
  if (json) console.error(message);
  else log.error(message);
}

async function loadManifest(json: boolean): Promise<Manifest> {
  if (json) {
    try {
      return await fetchRemoteManifest();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      if (process.env.PHARN_DEBUG) console.error(err);
      process.exit(1);
    }
  }
  const s = spinner();
  s.start('Fetching module catalog');
  try {
    const manifest = await fetchRemoteManifest();
    s.stop('Module catalog loaded');
    return manifest;
  } catch (err) {
    s.stop('Failed to load module catalog');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }
}
