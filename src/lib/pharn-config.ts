import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { log } from '@clack/prompts';
import { isPlainObject } from './validate.js';
import { validateModelRouting, ModelRoutingError } from './model-routing.js';
import { validateSeamConfig, SeamConfigError } from './seam-config.js';
import type { InstalledModule, PharnConfig } from '../types.js';

export const CONFIG_FILENAME = 'pharn.config.json';

export function configPath(cwd: string): string {
  return resolve(cwd, CONFIG_FILENAME);
}

/**
 * Read + validate pharn.config.json.
 *
 * Returns `null` ONLY for "no usable config": absent file, malformed JSON, or a
 * wrong top-level shape (→ the caller's "run `pharn init`"). A present-but-invalid
 * `models`/`seam` block is a DIFFERENT failure — a hand-edit the validators exist
 * to catch — so it is validated OUTSIDE the null-returning try and its named
 * `ModelRoutingError`/`SeamConfigError` PROPAGATES (BUG 1), never swallowed into
 * the "run init" lie. On success the validated, typed `models`/`seam` (the
 * validators' stripped return) replace the raw sub-blocks (BUG 3), while unknown
 * TOP-LEVEL keys still pass through so a legacy config carrying a since-removed
 * field still loads (P7, additive).
 */
export function readPharnConfig(cwd: string): PharnConfig | null {
  const path = configPath(cwd);
  if (!existsSync(path)) return null;
  // Absent / malformed-JSON / unreadable → null. This try does NOT wrap the
  // validators — that is the whole point (BUG 1).
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  // Light shape guard so a hand-edited config fails fast here (→ "run init")
  // rather than throwing deep inside add/update on `config.modules.map`.
  if (typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules)) {
    return null;
  }
  // Present-but-invalid → the validators THROW (named) and the error propagates.
  // Absent models/seam is legacy/valid (P7, additive). Use the validators' typed,
  // stripped return for the sub-blocks (BUG 3).
  const models =
    raw.models !== undefined ? validateModelRouting(raw.models) : undefined;
  const seam =
    raw.seam !== undefined ? validateSeamConfig(raw.seam) : undefined;
  const config: PharnConfig = {
    ...(raw as unknown as PharnConfig),
    ...(models !== undefined ? { models } : {}),
    ...(seam !== undefined ? { seam } : {}),
  };
  // Additive `layout` (lib/layout.ts): coerce to the {pharn, flat} enum. A legacy
  // config omits it and a hand-edited garbage value is dropped — both resolve to
  // 'flat' downstream (configLayout), the safe default (P5/P7). Only 'pharn' /
  // 'flat' survive verbatim, so the field round-trips.
  if (config.layout !== 'pharn' && config.layout !== 'flat') {
    delete config.layout;
  }
  return config;
}

/**
 * Load pharn.config.json for a command, or exit(1) with a clear message — the
 * shared load surface for `add`/`status`/`update`/`remove` (mirrors
 * `cancelAndExit` in `lib/confirm.ts`). It distinguishes the two failures the
 * bare `readPharnConfig` collapses:
 * - `null` (absent / malformed / wrong-shape) → "Run `pharn init`" + exit(1).
 * - a NAMED validator error → that loud, offender-naming message + exit(1),
 *   NEVER the "run init" lie (BUG 1).
 * Any OTHER error is a programming bug, not a config problem — it is RETHROWN,
 * never swallowed (so this helper can never re-become the disease it fixes).
 */
export function loadConfigOrExit(cwd: string): PharnConfig {
  try {
    const config = readPharnConfig(cwd);
    if (config) return config;
  } catch (err) {
    if (isConfigValidationError(err)) {
      log.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  // Reached only when readPharnConfig returned null (absent / malformed / wrong-shape).
  log.error('No pharn.config.json found. Run `pharn init` first.');
  process.exit(1);
}

/**
 * Is `err` a present-but-invalid-config error (a hand-edited `models`/`seam`
 * block the validators rejected), as opposed to a programming bug? The single
 * definition of "config error" — used by `loadConfigOrExit` and by `list`'s own
 * `--json`-aware error path, so neither re-encodes the class membership (P3).
 */
export function isConfigValidationError(
  err: unknown,
): err is ModelRoutingError | SeamConfigError {
  return err instanceof ModelRoutingError || err instanceof SeamConfigError;
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
