import { groupMultiselect, isCancel, log } from '@clack/prompts';
import pc from '../lib/color.js';
import { logError } from '../lib/report-error.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { buildAddSelection } from '../lib/capability-picker.js';
import type { CapabilityIndex, PharnConfig } from '../types.js';

// The prompt behind bare `pharn add`: the grouped multi-select over the
// not-yet-installed capabilities, and the loop that installs each pick. The
// lock, TTY gate, fetch and version/layout gates run in the command BEFORE
// this, so a refused add never renders the multi-select, and the lock is held
// across it; the per-name install path comes in as `addOne`, so this file
// never imports the command.

export type AddResult =
  | {
      kind: 'added';
      name: string;
      version: string;
      stamp: { skillsVersion: string; commit: string | null };
    }
  | { kind: 'noop'; name: string }
  // A curated refusal (unknown, ambiguous, a symlinked dir); a failure throws.
  | { kind: 'error'; message: string };

// The command's per-name install path (`resolveArchetypeAdd`).
export type AddOne = (
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  parsed: { name: string; role?: 'griller' | 'lens' },
  arg: string,
  parsedIndex?: CapabilityIndex,
) => Promise<AddResult>;

export type PickerAddOutcome =
  // The picks that came back as `error`, by `role:name`; the command names
  // them and exits 1.
  | { kind: 'installed'; added: string[]; failed: string[] }
  | { kind: 'all-installed' }
  | { kind: 'none' }
  | { kind: 'cancelled' };

// Build the menu (available = index − installed), multi-select, then install
// each pick via `addOne`, threading the growing config forward so the FINAL
// pharn.config.json holds every pick, not just the last. `beforeWrite` runs
// once between the multi-select and the first pick (the command's write-time
// check); it throws to refuse. Never exits.
export async function resolveAddPicker(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  addOne: AddOne,
  beforeWrite: () => void = () => undefined,
): Promise<PickerAddOutcome> {
  const index = parseCapabilityIndex(repoDir);
  // Named right after the parse, before both the `all-installed` outro and the
  // picker, and ONCE: the index is threaded into every pick, not re-parsed.
  const unknownWarning = unknownCapabilitiesWarning(index.unknown);
  if (unknownWarning) log.warn(unknownWarning);
  const installed = config.capabilities ?? [];
  const { groups, availableCount } = buildAddSelection(index, installed);
  if (availableCount === 0) return { kind: 'all-installed' };

  if (installed.length > 0) {
    log.info(
      `Installed (${installed.length}): ${installed.map((c) => `${c.name} (${c.role})`).join(', ')}`,
    );
  }

  const picked = await groupMultiselect({
    message: 'Select capabilities to add',
    options: groups,
    required: false,
    selectableGroups: false,
  });
  if (isCancel(picked)) return { kind: 'cancelled' };
  const values = picked as string[];
  if (values.length === 0) return { kind: 'none' };
  beforeWrite();

  // Each pick writes pharn.config.json off the `cfg` passed in, so cfg must
  // accumulate every prior pick or the writes clobber down to the last one.
  const added: string[] = [];
  const failed: string[] = [];
  let cfg = config;
  for (const value of values) {
    const parsed = parseCapabilityArg(value);
    const result = await addOne(repoDir, sha, cfg, cwd, parsed, value, index);
    if (result.kind === 'added') {
      log.info(`${pc.green('✔')} Added ${result.name}`);
      added.push(result.name);
      // parsed.role is always defined — the option `value`s are `role:name`.
      // Carry EVERY field the pick persisted, or the next pick's write would
      // put back the pre-pick skillsVersion/commit, disagreeing with the
      // records stamp.
      cfg = {
        ...cfg,
        ...result.stamp,
        // Mirrors the persisted entry INCLUDING `source: 'manual'`: the next
        // pick spreads this array into its config write, and an untagged entry
        // would later be deleted by `pharn update`.
        capabilities: [
          ...(cfg.capabilities ?? []),
          { name: parsed.name, role: parsed.role!, source: 'manual' },
        ],
      };
    } else if (result.kind === 'noop') {
      // Defensive: the picker only offers not-installed capabilities.
      log.info(`${result.name} is already installed.`);
    } else {
      // REACHABLE: `resolveArchetypeAdd` refuses a pick whose project dir
      // crosses a symlink. Named now and counted, so the command names it in
      // its outro and exits 1. `logError`, not `reportFatal`: the loop goes on,
      // and a curated message has no stack. A pick that THROWS still aborts the
      // loop through the command's catch.
      logError(`⚠ ${result.message}`);
      failed.push(value);
    }
  }
  return { kind: 'installed', added, failed };
}
