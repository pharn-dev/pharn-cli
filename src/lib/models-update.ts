import { modelsRecordHash } from './install-records.js';
import { checkModelsBlock } from './model-config.js';
import { decideFileAction, type UpdateLabel } from './update-decision.js';
import { isPlainObject } from './validate.js';
import type { UpstreamModels } from './upstream-models.js';

// ---------------------------------------------------------------------------
// What `pharn update` does with the `models` block. The schema is pharn-oss's
// (lib/model-config.ts), but before 0.7.0 this CLI wrote a block of its own (a
// top-level `default`, model ids no checker accepts) — so knowledge of that OLD
// format lives here: the id map, the defaults it wrote, and the conversion.
//
// The decision is the per-file one — `decideFileAction`, called, not copied —
// with the block's hash standing in for a file's: absent → restored; equal to
// pharn-oss's → ok; still pharn's (its record, or an old default) → updated;
// anything else is the user's and KEPT unless `--force` (config backed up
// first). A kept old-format block is CONVERTED, never reset. Pure: no I/O.
// ---------------------------------------------------------------------------

/** The four model ids pharn wrote before 0.7.0 → the Claude Code alias. */
const LEGACY_MODEL_ALIASES: ReadonlyMap<string, string> = new Map([
  ['opus-4-8', 'opus'],
  ['sonnet-5', 'sonnet'],
  ['fable-5', 'fable'],
  ['haiku-4-5', 'haiku'],
]);

/**
 * Every `models` block an earlier pharn wrote on a fresh install, serialized as
 * pharn wrote it. A block equal to one of these was never edited.
 */
const LEGACY_DEFAULTS: readonly string[] = [
  // Written through 0.6.0 — every published release.
  JSON.stringify({
    default: { model: 'sonnet-5', effort: 'high' },
    stages: {
      plan: { model: 'opus-4-8', effort: 'max' },
      review: { model: 'opus-4-8', effort: 'high' },
    },
  }),
  // Written before that by source builds only, never published.
  JSON.stringify({
    default: { model: 'sonnet-5', effort: 'high' },
    stages: {
      plan: { model: 'opus-4-8', effort: 'max' },
      review: { model: 'fable-5', effort: 'max' },
    },
  }),
];

/**
 * Is this block, as pharn serializes it, a default an earlier pharn wrote?
 * `JSON.stringify` of the parsed block: re-indenting is not an edit, reordering
 * keys is — the conservative reading, since an edited block is kept.
 */
export function isLegacyDefault(block: unknown): boolean {
  return block !== undefined && LEGACY_DEFAULTS.includes(JSON.stringify(block));
}

export interface ModelsConversion {
  // The converted block (a new object), or the input when nothing converted.
  block: unknown;
  // What was converted, one named line each.
  changes: string[];
  // What could not be converted and was left exactly as it was.
  leftovers: string[];
}

/**
 * Convert a pre-0.7.0 block to pharn-oss's format: a top-level `default` moves
 * into `stages.default`, each old model id becomes its alias, everything else
 * is copied verbatim. A `default` that cannot move stays and is named. Objects
 * are rebuilt with own-property definitions, so a `__proto__` key stays data.
 */
export function convertLegacyModels(block: unknown): ModelsConversion {
  if (!isPlainObject(block)) return { block, changes: [], leftovers: [] };
  const changes: string[] = [];
  const leftovers: string[] = [];
  let next: Record<string, unknown> = block;

  if (Object.hasOwn(next, 'default')) {
    const { default: moved, ...rest } = next;
    const stages = next.stages;
    if (stages === undefined || stages === null) {
      next = { ...rest, stages: { default: moved } };
      changes.push('moved `models.default` into `models.stages.default`');
    } else if (isPlainObject(stages) && !Object.hasOwn(stages, 'default')) {
      next = { ...rest, stages: { default: moved, ...stages } };
      changes.push('moved `models.default` into `models.stages.default`');
    } else {
      leftovers.push(
        isPlainObject(stages)
          ? '`models.default` was left where it is: `models.stages.default` is already set, and pharn-oss reads only that one'
          : '`models.default` was left where it is: `models.stages` is not an object, so it cannot move into it',
      );
    }
  }

  const stages = next.stages;
  if (isPlainObject(stages)) {
    let mapped = false;
    const converted = Object.fromEntries(
      Object.entries(stages).map(([name, entry]) => {
        if (!isPlainObject(entry) || typeof entry.model !== 'string') {
          return [name, entry];
        }
        const alias = LEGACY_MODEL_ALIASES.get(entry.model);
        if (alias === undefined) return [name, entry];
        mapped = true;
        changes.push(
          `stage ${JSON.stringify(name)} model ${JSON.stringify(entry.model)} → ${JSON.stringify(alias)}`,
        );
        return [name, { ...entry, model: alias }];
      }),
    );
    if (mapped) next = { ...next, stages: converted };
  }

  return { block: changes.length > 0 ? next : block, changes, leftovers };
}

/**
 * Does this block still hold something `convertLegacyModels` would convert?
 * A block whose only leftover cannot move converts nothing.
 */
export function needsModelsConversion(block: unknown): boolean {
  return convertLegacyModels(block).changes.length > 0;
}

export type ModelsOutcome =
  // Your config had no block; pharn-oss's was written.
  | 'restored'
  // The block was still pharn's; it became pharn-oss's current one.
  | 'updated'
  // Already pharn-oss's current block.
  | 'ok'
  // Yours, kept (converted when it was in the old format).
  | 'kept'
  // Yours, replaced under `--force` after pharn.config.json was backed up.
  | 'forced'
  // pharn-oss ships no block, or one this CLI will not apply: yours stays.
  | 'upstream-absent'
  | 'upstream-invalid';

export interface ModelsUpdate {
  outcome: ModelsOutcome;
  // Why the block is the user's (`kept` / `forced`): the per-file skip label.
  label: UpdateLabel | null;
  // `updated` / `forced` over a default an earlier pharn wrote.
  replacedLegacyDefault: boolean;
  // The block to write back; `undefined` means no `models` key.
  next: unknown;
  // The record to store under MODELS_RECORD_KEY; `null` means none. A block
  // pharn did not just write carries its previous record, never a new one.
  nextRecord: string | null;
  // Back up pharn.config.json before the config is written.
  backup: boolean;
  // Set when a kept block was converted from the old format.
  conversion: ModelsConversion | null;
  // Why the kept block still fails pharn-oss's rules. Untrusted: `terminalSafe`.
  problems: string[];
  // Why pharn-oss's block was not applied (`upstream-invalid`).
  upstreamReasons: string[];
}

export function decideModelsUpdate(input: {
  // config.models; `undefined` when the key is absent.
  current: unknown;
  upstream: UpstreamModels;
  // The store's MODELS_RECORD_KEY entry, or null.
  recorded: string | null;
  // False when pharn.records.json is absent or invalid.
  recordsAvailable: boolean;
  force: boolean;
}): ModelsUpdate {
  const { current, upstream, recorded, recordsAvailable, force } = input;
  const none = {
    label: null,
    replacedLegacyDefault: false,
    backup: false,
    conversion: null,
    problems: [],
    upstreamReasons: [],
  };

  // Nothing to compare with: the user's block stays, still converted if old
  // (rejected whatever pharn-oss ships). A block that was pharn's keeps its
  // record through the conversion, or a later run would read it as the user's
  // forever.
  if (upstream.kind !== 'ok') {
    const kept = keep(current);
    const pharns =
      current !== undefined &&
      (isLegacyDefault(current) ||
        (recorded !== null && modelsRecordHash(current) === recorded));
    return {
      ...none,
      ...kept,
      outcome:
        upstream.kind === 'absent' ? 'upstream-absent' : 'upstream-invalid',
      nextRecord: pharns ? modelsRecordHash(kept.next) : recorded,
      upstreamReasons: upstream.kind === 'invalid' ? upstream.reasons : [],
    };
  }

  const latestHash = modelsRecordHash(upstream.block);
  const diskHash = current === undefined ? null : modelsRecordHash(current);
  // A default an earlier pharn wrote is proof of authorship on its own, fed to
  // the table as the record.
  const legacyDefault = isLegacyDefault(current);
  const decision = decideFileAction({
    diskHash,
    latestHash,
    recordedHash: legacyDefault ? diskHash : recorded,
    recordsAvailable: legacyDefault || recordsAvailable,
    force,
  });

  if (decision.action === 'write') {
    return {
      ...none,
      outcome: decision.forced
        ? 'forced'
        : decision.label === 'restored'
          ? 'restored'
          : 'updated',
      label: decision.forced ? decision.label : null,
      replacedLegacyDefault: legacyDefault,
      next: upstream.block,
      nextRecord: latestHash,
      backup: decision.backup,
    };
  }
  if (decision.action === 'noop') {
    return { ...none, outcome: 'ok', next: current, nextRecord: latestHash };
  }
  return {
    ...none,
    ...keep(current),
    outcome: 'kept',
    label: decision.label,
    nextRecord: recorded,
  };
}

// The user's block as it stays: converted if old, with what pharn-oss's rules
// still reject.
function keep(
  current: unknown,
): Pick<ModelsUpdate, 'next' | 'conversion' | 'problems'> {
  if (current === undefined) {
    return { next: undefined, conversion: null, problems: [] };
  }
  const conversion = convertLegacyModels(current);
  const check = checkModelsBlock(conversion.block);
  return {
    next: conversion.block,
    conversion: conversion.changes.length > 0 ? conversion : null,
    problems: [
      ...conversion.leftovers,
      ...(check.kind === 'invalid' ? check.reds.map((red) => red.detail) : []),
    ],
  };
}
