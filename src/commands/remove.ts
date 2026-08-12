import { existsSync, rmSync } from 'node:fs';
import {
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log,
  outro,
} from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { configLayout, layoutPaths, type LayoutPaths } from '../lib/layout.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import {
  buildRemoveSelection,
  interactiveAllowed,
} from '../lib/capability-picker.js';
import { safeJoin } from '../lib/validate.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import {
  readRecords,
  recordsBaseline,
  writeRecords,
  type FileRecords,
} from '../lib/install-records.js';
import type { InstalledCapability, PharnConfig } from '../types.js';

// The inverse of `pharn add`: removes installed capabilities from an archetype
// project (no clone, no network — everything is derivable from
// config.capabilities + the filesystem). Bare `pharn remove` in a terminal opens
// a grouped multi-select over the installed capabilities, confirms once, then
// deletes each via the SAME per-name delete path (deleteCapabilityDir); non-TTY
// keeps a usage error. The legacy module/skill removal (which read the manifest)
// was removed; a pre-archetype config is rejected up front. `_opts.yes` is
// accepted for CLI compat but unused — capability removal has no confirm prompt
// on the named path.
export async function runRemove(
  arg: string | undefined,
  _opts: { yes?: boolean } = {},
): Promise<void> {
  intro('pharn remove');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await removeCapability(cwd, config, arg);
}

// Each capability is an isolated dir, so removal is a precise recursive delete
// (siblings never touched). Touches only `capabilities` (never archetypes /
// modules). No arg → the interactive picker; an arg → the named single remove.
async function removeCapability(
  cwd: string,
  config: PharnConfig,
  arg: string | undefined,
): Promise<void> {
  const installed = config.capabilities ?? [];

  if (arg === undefined) {
    await runRemovePicker(cwd, config, installed);
    return;
  }
  await removeNamed(cwd, config, installed, arg);
}

// Delete one capability's isolated dir at the project's recorded layout (flat OR
// pharn/), returning whether the dir existed. The shared per-name delete path —
// the named remove and the picker loop both call it, so the two never diverge.
// Every delete is safeJoin-contained.
function deleteCapabilityDir(
  cwd: string,
  paths: LayoutPaths,
  target: InstalledCapability,
): boolean {
  const dir = safeJoin(cwd, capabilityRelDir(paths, target));
  const existed = existsSync(dir);
  if (existed) rmSync(dir, { recursive: true, force: true });
  return existed;
}

// One source for the role→dir mapping. The delete addresses the filesystem and
// the prune addresses the record store; they MUST name the same directory, and
// sharing the ternary makes that true by construction rather than by two copies
// staying in sync.
function capabilityRelDir(
  paths: LayoutPaths,
  capability: InstalledCapability,
): string {
  const subtree = capability.role === 'griller' ? paths.grillers : paths.lenses;
  return `${subtree}/${capability.name}`;
}

// Drop the removed capabilities' entries from `pharn.records.json`, so `remove`
// honors the same sentence `update` does: the store describes only files pharn
// still manages. Without this, `remove` is the one write path that leaves records
// describing bytes that are gone, and they linger until the next `update` prunes
// them via its manifest.
//
// A key-prefix filter over the STORE, never a filesystem walk:
// `capabilityRecordPaths` enumerates the DEST directory and returns [] once it is
// gone — which is the case both AFTER the delete and, on the "its files were
// already gone" path, before it too. So there is no moment at which a walk could
// see what to prune.
//
// Only an already-READABLE store is edited: `recordsBaseline` returns null for
// absent, corrupt, AND stamped-for-another-state, and each of those means the
// same thing here — this is not our store to rewrite (the `add` precedent,
// commands/add.ts). Minting one would claim knowledge of files we never hashed.
//
// The baseline `note` is deliberately NOT surfaced, matching `add`: `remove` is a
// local, zero-network operation whose outro already reports exactly what it did,
// and `update` — which is where an unusable store actually changes an outcome —
// is the command that names the reason. Silence here is a choice, not an
// oversight.
async function pruneCapabilityRecords(
  cwd: string,
  config: PharnConfig,
  paths: LayoutPaths,
  targets: InstalledCapability[],
): Promise<void> {
  const { records } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
  if (records === null) return; // absent/corrupt/stale → leave it alone

  // The trailing slash is load-bearing: without it `lenses/a11y` would also eat
  // every key belonging to `lenses/a11y-extended`.
  const prefixes = targets.map((t) => `${capabilityRelDir(paths, t)}/`);
  const kept: FileRecords = {};
  let dropped = 0;
  for (const [key, hash] of Object.entries(records)) {
    // Keys are COMPARED as strings and never joined into a path — the invariant
    // that makes a hand-edited store unable to drive a filesystem access.
    if (prefixes.some((prefix) => key.startsWith(prefix))) dropped++;
    else kept[key] = hash;
  }
  if (dropped === 0) return; // nothing matched → the store stays byte-identical

  // The stamp does not move: `remove` changes neither `skillsVersion` nor
  // `commit`, so the store is re-written against the same pair the config holds
  // (and still holds after the config write, which touches only `capabilities`
  // and `installedAt`). A moved stamp would make the very next `update` read this
  // store as written for another state and ignore it wholesale.
  await writeRecords(cwd, {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
    files: kept,
  });
}

// Warn when a capability being removed will simply come back. Derived from the
// STORED `source` alone — `remove` is zero-network and has no capability index,
// so there is nothing else it could honestly read.
//
// It fires on the LITERAL 'auto' and nothing else. An ABSENT `source` (a config
// written before the field existed) stays SILENT on purpose: absence means the
// provenance is genuinely unknown until `pharn update` infers it against a fresh
// index, and a legacy MANUAL add given an "absent means auto" default would be
// told the exact opposite of the truth. A false warning here is worse than none
// (P5 — the terminal for unknown is to say nothing, never to guess).
function warnIfAutoSelected(targets: InstalledCapability[]): void {
  const auto = targets.filter((c) => c.source === 'auto');
  if (auto.length === 0) return;
  const names = auto.map((c) => `${c.name} (${c.role})`).join(', ');
  log.warn(
    `${names} ${auto.length === 1 ? 'is' : 'are'} selected automatically for your archetypes, so the next \`pharn update\` will reinstall ${auto.length === 1 ? 'it' : 'them'} (and will name ${auto.length === 1 ? 'it' : 'them'} in its report).`,
  );
}

// `pharn remove <name>` / `<role>:<name>` — resolve to ONE installed capability
// and delete it. Byte-identical to the pre-picker behavior (now routed through
// the shared deleteCapabilityDir helper).
async function removeNamed(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
  address: string,
): Promise<void> {
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
  const paths = layoutPaths(configLayout(config));
  const existed = deleteCapabilityDir(cwd, paths, target);
  const note = existed ? '' : pc.dim(' (its files were already gone)');

  // Order: delete → prune records → write config (mirroring `add`'s
  // records-before-config). `writeRecords` is a plain `writeFile`, so this is a
  // benign-failure argument, NOT an atomicity claim (advisory, P0): a prune that
  // fails after the delete leaves exactly today's status quo — stale entries the
  // next `update` prunes — and a config write that fails after the prune leaves
  // the entry listed with its files absent, which the next `update` restores and
  // re-records. Neither direction corrupts, and since the stamp never moves the
  // two files cannot skew relative to each other.
  //
  // `existed` deliberately does NOT gate this: on the "already gone" path the
  // records are exactly what is left to clean up.
  await pruneCapabilityRecords(cwd, config, paths, [target]);

  // The surviving entries are the ORIGINAL objects, so every other capability's
  // `source` is carried through untouched.
  await writePharnConfig(cwd, {
    ...config,
    capabilities: installed.filter(
      (c) => !(c.name === target.name && c.role === target.role),
    ),
    installedAt: new Date().toISOString(),
  });

  warnIfAutoSelected([target]);

  outro(`${pc.green('✔')} Removed ${target.name} (${target.role})${note}`);
}

// ---------------------------------------------------------------------------
// Bare `pharn remove` — the interactive multi-select picker (subtractive-only).
// ---------------------------------------------------------------------------

// Nothing installed → benign message (even non-TTY). Otherwise: non-TTY → a
// reworded usage error + exit(1) (NEVER a prompt, P5); TTY → multi-select over
// the installed capabilities, ONE confirm listing the picks (destructive), then
// delete each + a single config write dropping them all.
async function runRemovePicker(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
): Promise<void> {
  if (installed.length === 0) {
    outro('No capabilities are installed.');
    return;
  }
  if (
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    log.error(
      'Specify a capability to remove (e.g. `pharn remove a11y`), or run `pharn remove` in an interactive terminal to pick from a list.',
    );
    process.exit(1);
  }

  const { groups } = buildRemoveSelection(installed);
  const picked = await groupMultiselect({
    message: 'Select capabilities to remove',
    options: groups,
    required: false,
    selectableGroups: false,
  });
  if (isCancel(picked)) cancelAndExit();
  const values = picked as string[];
  if (values.length === 0) {
    outro('Nothing selected. No capabilities were removed.');
    return;
  }

  // Map each picked `role:name` back to its installed entry (the options were
  // built from `installed`, so each resolves).
  const targets: InstalledCapability[] = [];
  for (const value of values) {
    const parsed = parseCapabilityArg(value);
    const target = installed.find(
      (c) => c.name === parsed.name && c.role === parsed.role,
    );
    if (target) targets.push(target);
  }

  // ONE confirm listing what will be removed (default No — destructive).
  const ok = await confirm({
    message: `Remove ${targets.length} ${plural(targets.length)}: ${targets
      .map((t) => `${t.name} (${t.role})`)
      .join(', ')}?`,
    initialValue: false,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();

  const paths = layoutPaths(configLayout(config));
  for (const target of targets) deleteCapabilityDir(cwd, paths, target);

  // One prune for the whole selection — the same delete → prune → config order
  // as removeNamed, and one store write to match the one config write below.
  await pruneCapabilityRecords(cwd, config, paths, targets);

  // As in removeNamed: survivors are the original objects, so their `source` is
  // preserved verbatim.
  const removed = new Set(targets.map((t) => `${t.role}:${t.name}`));
  await writePharnConfig(cwd, {
    ...config,
    capabilities: installed.filter((c) => !removed.has(`${c.role}:${c.name}`)),
    installedAt: new Date().toISOString(),
  });

  warnIfAutoSelected(targets);

  outro(
    `${pc.green('✔')} Removed ${targets.length} ${plural(targets.length)}.`,
  );
}

function plural(n: number): string {
  return n === 1 ? 'capability' : 'capabilities';
}
