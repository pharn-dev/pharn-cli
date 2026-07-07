import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPlainObject } from './validate.js';
import { validateModelRouting } from './model-routing.js';
import type { InstalledModule, PharnConfig } from '../types.js';

export const CONFIG_FILENAME = 'pharn.config.json';

export function configPath(cwd: string): string {
  return resolve(cwd, CONFIG_FILENAME);
}

export function readPharnConfig(cwd: string): PharnConfig | null {
  const path = configPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isPlainObject(raw)) return null;
    // Light shape guard so a hand-edited config fails fast here (→ "run init")
    // rather than throwing deep inside add/update on `config.modules.map`.
    if (typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules)) {
      return null;
    }
    // A present-but-invalid `models` block makes the config unloadable (→ "run
    // init"), consistent with the shape guard above — validateModelRouting throws
    // and is caught below. An absent `models` is legacy/valid (P7, additive).
    if (raw.models !== undefined) {
      validateModelRouting(raw.models);
    }
    return raw as unknown as PharnConfig;
  } catch {
    return null;
  }
}

export async function writePharnConfig(
  cwd: string,
  config: PharnConfig,
): Promise<void> {
  await writeFile(
    configPath(cwd),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

export function toInstalledModules(
  modules: { name: string; version: string }[],
): InstalledModule[] {
  return modules.map(({ name, version }) => ({ name, version }));
}

/**
 * Is this an archetype (capability) install vs. a legacy module install?
 * Deterministic membership (P5): the archetype install (`pharn init --archetype`)
 * always writes a `capabilities` array; a legacy module config never does — so
 * the presence of `capabilities` is the marker. An empty `modules: []` alone is
 * NOT the marker (a module install can legitimately resolve to few modules).
 * Sibling commands branch on this to avoid the module/manifest path (which fails
 * against live pharn-oss, having no manifest.json) for archetype installs.
 */
export function isArchetypeConfig(config: PharnConfig): boolean {
  return Array.isArray(config.capabilities);
}
