import { existsSync, rmSync } from 'node:fs';
import { intro, isCancel, log, outro, select } from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { configLayout, layoutPaths } from '../lib/layout.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { safeJoin } from '../lib/validate.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { PharnConfig } from '../types.js';

// The inverse of `pharn add`: removes one installed capability from an archetype
// project (no clone, no network — everything is derivable from config.capabilities
// + the filesystem). The legacy module/skill removal (which read the manifest)
// was removed; a pre-archetype config is rejected up front. `_opts.yes` is
// accepted for CLI compat but unused — capability removal has no confirm prompt.
export async function runRemove(
  arg: string | undefined,
  _opts: { yes?: boolean } = {},
): Promise<void> {
  intro('pharn remove');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await removeCapability(cwd, config, arg);
}

// Installed capabilities are fully derivable from config.capabilities + the
// filesystem, so this never clones. Each capability is an isolated dir, so
// removal is a precise recursive delete (siblings never touched). Touches only
// `capabilities` (never archetypes / modules).
async function removeCapability(
  cwd: string,
  config: PharnConfig,
  arg: string | undefined,
): Promise<void> {
  const installed = config.capabilities ?? [];

  // No arg → pick from the installed capabilities (or nothing to remove).
  let address = arg;
  if (address === undefined) {
    if (installed.length === 0) {
      outro('No capabilities are installed.');
      return;
    }
    const choice = await select({
      message: 'Which capability do you want to remove?',
      options: installed.map((c) => ({
        value: `${c.role}:${c.name}`,
        label: `${c.name} (${c.role})`,
      })),
    });
    if (isCancel(choice)) cancelAndExit();
    address = choice as string;
  }

  const parsed = parseCapabilityArg(address);
  if (parsed.error) {
    log.error(parsed.error);
    process.exit(1);
  }
  const matches = installed.filter(
    (c) =>
      c.name === parsed.name &&
      (parsed.role === undefined || c.role === parsed.role),
  );

  // Not installed → benign no-op (no config write). Without a manifest we list
  // the installed capabilities (the only removable things) as the valid values.
  if (matches.length === 0) {
    const valid = installed.map((c) => `${c.role}:${c.name}`).sort();
    const hint = valid.length
      ? ` Installed: ${valid.join(', ')}.`
      : ' No capabilities are installed.';
    log.warn(`"${address}" is not an installed capability.${hint}`);
    outro('Nothing was removed.');
    return;
  }
  if (matches.length > 1) {
    log.error(
      `"${parsed.name}" is ambiguous — use ${matches.map((m) => `${m.role}:${m.name}`).join(' or ')}.`,
    );
    process.exit(1);
  }

  const target = matches[0]!;
  // Address the capability at the project's recorded layout (flat OR pharn/), so
  // a pharn-layout install deletes pharn/pharn-review|pharn-pipeline/grillers/<name>
  // (lib/layout.ts). Legacy/absent layout → flat, the safe default (P5/P7).
  const paths = layoutPaths(configLayout(config));
  const subtree = target.role === 'griller' ? paths.grillers : paths.lenses;
  const dir = safeJoin(cwd, `${subtree}/${target.name}`);
  let note = '';
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  } else {
    note = pc.dim(' (its files were already gone)');
  }

  await writePharnConfig(cwd, {
    ...config,
    capabilities: installed.filter(
      (c) => !(c.name === target.name && c.role === target.role),
    ),
    installedAt: new Date().toISOString(),
  });

  outro(`${pc.green('✔')} Removed ${target.name} (${target.role})${note}`);
}
