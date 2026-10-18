import { groupMultiselect, isCancel, log } from '@clack/prompts';
import pc from '../lib/color.js';
import { logError, type FatalCause } from '../lib/report-error.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { buildAddSelection } from '../lib/capability-picker.js';
import type { CapabilityIndex, PharnConfig } from '../types.js';

// The prompt behind bare `pharn add` (src/commands/add.ts `runAddPicker`): the
// grouped multi-select over the not-yet-installed capabilities, and the loop that
// installs each pick. The command keeps everything around it — the TTY gate, the
// lock, the fetch and the version/layout gates, which run BEFORE this is called,
// so a refused add never renders the multi-select — and passes its per-name
// install path in as `addOne`, so this file never imports the command.

export type AddResult =
  | {
      kind: 'added';
      name: string;
      version: string;
      stamp: { skillsVersion: string; commit: string | null };
    }
  | { kind: 'noop'; name: string }
  // See PickerAddOutcome: `cause` present ⇔ this came from an exception.
  | { kind: 'error'; message: string; cause?: FatalCause };

// The command's per-name install path (`resolveArchetypeAdd`), the one
// installer every pick goes through.
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
  | { kind: 'installed'; added: string[] }
  | { kind: 'all-installed' }
  | { kind: 'none' }
  | { kind: 'cancelled' }
  // `cause` is present ONLY when this outcome came from a caught exception. Its
  // absence is what keeps the PHARN_DEBUG hint off a curated gate refusal, which
  // reaches the very same variant.
  | { kind: 'error'; message: string; cause?: FatalCause };

// Build the menu (available = index − installed), multi-select, then install each
// pick via the EXISTING per-name path (resolveArchetypeAdd, passed in as `addOne`), threading the
// growing config forward so the FINAL pharn.config.json holds every pick — not
// just the last (resolveArchetypeAdd persists per call off the config passed in).
// Pure of process.exit — the caller owns cleanup + exit.
export async function resolveAddPicker(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  addOne: AddOne,
): Promise<PickerAddOutcome> {
  const index = parseCapabilityIndex(repoDir);
  // No silent skips (P5): named immediately after the parse, so it precedes both
  // the `all-installed` outro and the picker itself — the user never reads
  // "all available capabilities are already installed" without also being told
  // that something upstream was skipped. ONCE per command: the index is threaded
  // into every pick below rather than re-parsed, so an N-pick run does not repeat
  // the same warning N times.
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

  // Thread the config forward across the per-pick installs (grill F1): each
  // resolveArchetypeAdd writes pharn.config.json off the `cfg` passed in, so cfg
  // must accumulate every prior pick or the writes clobber down to the last one.
  const added: string[] = [];
  let cfg = config;
  for (const value of values) {
    const parsed = parseCapabilityArg(value);
    const result = await addOne(repoDir, sha, cfg, cwd, parsed, value, index);
    if (result.kind === 'added') {
      log.info(`${pc.green('✔')} Added ${result.name}`);
      added.push(result.name);
      // parsed.role is always defined — our option `value`s are `role:name`.
      // Carry EVERY field resolveArchetypeAdd persisted, not just capabilities:
      // `cfg` must mirror the config just written, or the next pick reads a
      // config that disagrees with disk. (Concretely: the records store is
      // stamped with the persisted skillsVersion/commit, so a stale `cfg` makes
      // the next pick's stamp check fail and silently drop its records.)
      cfg = {
        ...cfg,
        ...result.stamp,
        // Mirrors the entry resolveArchetypeAdd just persisted — INCLUDING its
        // `source: 'manual'`. This is the second entry-construction site, and it
        // must not diverge: the next pick spreads THIS array into its own config
        // write, so an untagged mirror would persist every earlier pick without
        // its provenance and `pharn update` would delete them.
        capabilities: [
          ...(cfg.capabilities ?? []),
          { name: parsed.name, role: parsed.role!, source: 'manual' },
        ],
      };
    } else if (result.kind === 'noop') {
      // Defensive: the picker only offers not-installed capabilities.
      log.info(`${result.name} is already installed.`);
    } else {
      // Defensive: values come from the validated index, so this is unexpected.
      // `logError`, not `reportFatal`: this does not exit — the loop continues to
      // the next pick — and `resolveArchetypeAdd` only ever returns CURATED
      // errors here (unknown / ambiguous), so there is no stack to offer.
      logError(`⚠ ${result.message}`);
    }
  }
  return { kind: 'installed', added };
}
