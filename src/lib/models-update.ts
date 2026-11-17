import { modelsRecordHash } from './install-records.js';
import { checkModelsBlock } from './model-config.js';
import { decideFileAction, type UpdateLabel } from './update-decision.js';
import type { UpstreamModels } from './upstream-models.js';

// ---------------------------------------------------------------------------
// What `pharn update` does with the `models` block. The schema is pharn-oss's
// (lib/model-config.ts); this CLI keeps no format of its own.
//
// The decision is the per-file one — `decideFileAction`, called, not copied —
// with the block's hash standing in for a file's: absent → restored; equal to
// pharn-oss's → ok; still pharn's (its record) → updated; anything else is the
// user's and KEPT unless `--force` (config backed up first). A kept block is
// never rewritten: what pharn-oss's rules reject in it is named. So a block in
// the format pharn wrote before 0.7.0 is just a block those rules reject: kept
// as the user's unless its record proves pharn wrote it. 0.19.x was the last
// CLI that converted one. Pure: no I/O.
// ---------------------------------------------------------------------------

export type ModelsOutcome =
  // Your config had no block; pharn-oss's was written.
  | 'restored'
  // The block was still pharn's; it became pharn-oss's current one.
  | 'updated'
  // Already pharn-oss's current block.
  | 'ok'
  // Yours, kept as it is.
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
  // The block to write back; `undefined` means no `models` key.
  next: unknown;
  // The record to store under MODELS_RECORD_KEY; `null` means none. A block
  // pharn did not just write carries its previous record, never a new one.
  nextRecord: string | null;
  // Back up pharn.config.json before the config is written.
  backup: boolean;
  // Why the kept block fails pharn-oss's rules. Untrusted: `terminalSafe`.
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
    backup: false,
    problems: [],
    upstreamReasons: [],
  };

  // Nothing to compare with: the user's block stays, whatever pharn-oss ships.
  // Its record is carried unchanged, so a block that was pharn's is still
  // pharn's on the run where pharn-oss's block is usable again.
  if (upstream.kind !== 'ok') {
    return {
      ...none,
      ...keep(current),
      outcome:
        upstream.kind === 'absent' ? 'upstream-absent' : 'upstream-invalid',
      nextRecord: recorded,
      upstreamReasons: upstream.kind === 'invalid' ? upstream.reasons : [],
    };
  }

  const latestHash = modelsRecordHash(upstream.block);
  const diskHash = current === undefined ? null : modelsRecordHash(current);
  const decision = decideFileAction({
    diskHash,
    latestHash,
    recordedHash: recorded,
    recordsAvailable,
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

// The user's block as it stays — verbatim — with what pharn-oss's rules reject
// in it.
function keep(current: unknown): Pick<ModelsUpdate, 'next' | 'problems'> {
  if (current === undefined) return { next: undefined, problems: [] };
  const check = checkModelsBlock(current);
  return {
    next: current,
    problems:
      check.kind === 'invalid' ? check.reds.map((red) => red.detail) : [],
  };
}
