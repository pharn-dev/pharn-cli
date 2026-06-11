import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPlainObject } from './validate.js';
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
