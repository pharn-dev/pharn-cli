import { isPlainObject } from './validate.js';

// ---------------------------------------------------------------------------
// pharn-oss's rules for the `models` block — a COPY, and only a copy.
//
// pharn-oss owns the `models` schema of pharn.config.json and its defaults.
// Its checker, `pharn/floor/check-model-config.mjs`, ships into every install,
// and pharn-oss's own root pharn.config.json carries the block `pharn init`
// copies. This file is a literal port of that checker's `validate` and
// `resolve` rules (`stagesOf`, `validateStages`, `resolveStage`): the same
// stage set, the same model and effort sets, the same RED kinds with the same
// wording, in the same order.
//
// Why a copy and not a call: this CLI never executes a file it installs
// (THREAT-MODEL.md §1). `pharn status --strict` runs in CI on pull requests,
// and at `init` the only checker is the one inside the downloaded clone.
//
// Why it cannot drift from that checker unnoticed:
// tests/model-config-parity.test.ts runs the real checker — vendored
// byte-for-byte at tests/fixtures/pharn-oss/ and pinned by sha256 — over a
// corpus, compares every verdict and RED line with this file's, and reads the
// four sets below out of the checker's own source. The vendored checker can
// still lag live upstream until someone refreshes it (docs/contributing.md);
// that lag is the residual below. pharn-oss stays the one owner of every rule
// here: add nothing the checker does not have, and change nothing it has not
// changed.
//
// When upstream widens a set before this copy follows, a block using the new
// member is rejected here and NOT applied — named, never fatal (LIMITS.md §3e);
// upstream's MIN_CLI is the lever that asks users to upgrade first.
//
// Pure: no I/O. One axis (P3): pharn-oss's rules for the models block.
// ---------------------------------------------------------------------------

/**
 * The product stages a `models.stages` key may name besides `default`, in the
 * checker's order (`PRODUCT_STAGES`, whose values are the command files; only
 * the keys are a rule of the block).
 */
export const PRODUCT_STAGES = [
  'spec',
  'plan',
  'grill',
  'build',
  'regress',
  'verify',
  'ship',
  'loop',
  'review',
  'memory-promote',
  'ac-test',
] as const;

/** Model aliases the checker accepts (`MODEL_ALIASES`). */
export const MODEL_ALIASES = [
  'sonnet',
  'opus',
  'haiku',
  'fable',
  'inherit',
] as const;

/** A full model id (`MODEL_ID_RE`), e.g. `claude-opus-4-8`. */
export const MODEL_ID_RE = /^claude-[a-z0-9][a-z0-9-]*$/;

/** Effort levels the checker accepts (`EFFORT_ENUM`). */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** One stage's declared model and effort, once the block has passed. */
export interface StageEntry {
  model: string;
  effort: string;
}

/**
 * A `models.stages` map that passed `checkModelsBlock`: `default` is present,
 * every key is `default` or a product stage, every entry carries a valid model
 * and effort. Entries may carry other keys too (the checker ignores them).
 */
export type ModelsStages = Readonly<Record<string, StageEntry>>;

/** The checker's RED kinds on this path — its own `red(kind, …)` names. */
export type ModelsRedKind =
  'shape' | 'default' | 'stage' | 'entry' | 'model' | 'effort';

export interface ModelsRed {
  kind: ModelsRedKind;
  // The checker's own detail text. It quotes keys and values from the block
  // with JSON.stringify, which escapes C0 controls but not C1 controls or
  // Unicode format characters: pass it through `terminalSafe` before printing.
  detail: string;
}

export type ModelsCheck =
  // No block, or a block with no `stages`: nothing is declared. The checker's
  // "GREEN by design" — an install need not use the block.
  | { kind: 'no-stages' }
  | { kind: 'valid'; stages: ModelsStages }
  | { kind: 'invalid'; reds: ModelsRed[] };

function isValidModel(model: unknown): boolean {
  return (
    typeof model === 'string' &&
    ((MODEL_ALIASES as readonly string[]).includes(model) ||
      MODEL_ID_RE.test(model))
  );
}

function isValidEffort(effort: unknown): boolean {
  return (
    typeof effort === 'string' &&
    (EFFORT_LEVELS as readonly string[]).includes(effort)
  );
}

/**
 * Check a `models` block (the value of the `models` key — `undefined` when
 * the key is absent) against pharn-oss's rules: the checker's `validate`.
 * Every RED is collected, not just the first, exactly as the checker prints
 * them.
 */
export function checkModelsBlock(models: unknown): ModelsCheck {
  // stagesOf
  if (models === undefined || models === null) return { kind: 'no-stages' };
  if (!isPlainObject(models)) {
    return invalid('shape', '`models` is present but is not an object');
  }
  const stages = models.stages;
  if (stages === undefined || stages === null) return { kind: 'no-stages' };
  if (!isPlainObject(stages)) {
    return invalid('shape', '`models.stages` is present but is not an object');
  }

  // validateStages
  const reds: ModelsRed[] = [];
  if (!Object.hasOwn(stages, 'default')) {
    reds.push({
      kind: 'default',
      detail:
        'missing required `default` stage entry (the resolution fallback)',
    });
  }
  for (const [name, entry] of Object.entries(stages)) {
    const stage = `stage ${JSON.stringify(name)}`;
    if (
      name !== 'default' &&
      !(PRODUCT_STAGES as readonly string[]).includes(name)
    ) {
      reds.push({
        kind: 'stage',
        detail: `${stage} is not a product stage — expected one of {${PRODUCT_STAGES.join(', ')}} or "default"`,
      });
      continue;
    }
    if (!isPlainObject(entry)) {
      reds.push({
        kind: 'entry',
        detail: `${stage} is not an object with {model, effort}`,
      });
      continue;
    }
    if (!Object.hasOwn(entry, 'model')) {
      reds.push({ kind: 'model', detail: `${stage} missing \`model\`` });
    } else if (!isValidModel(entry.model)) {
      reds.push({
        kind: 'model',
        detail: `${stage} model ${JSON.stringify(entry.model)} is not an alias {${MODEL_ALIASES.join(', ')}} nor a claude-* id`,
      });
    }
    if (!Object.hasOwn(entry, 'effort')) {
      reds.push({ kind: 'effort', detail: `${stage} missing \`effort\`` });
    } else if (!isValidEffort(entry.effort)) {
      reds.push({
        kind: 'effort',
        detail: `${stage} effort ${JSON.stringify(entry.effort)} not in {${EFFORT_LEVELS.join(', ')}}`,
      });
    }
  }
  return reds.length > 0
    ? { kind: 'invalid', reds }
    : { kind: 'valid', stages: stages as ModelsStages };
}

function invalid(kind: ModelsRedKind, detail: string): ModelsCheck {
  return { kind: 'invalid', reds: [{ kind, detail }] };
}

/**
 * The model and effort a stage resolves to — the checker's `resolve`: the
 * stage's OWN entry, else `default`. An own-property test, so an inherited
 * name (`constructor`, `toString`, `__proto__`) resolves to `default` rather
 * than to something off the prototype.
 */
export function resolveStageModel(
  stages: ModelsStages,
  stage: string,
): StageEntry {
  const entry = Object.hasOwn(stages, stage) ? stages[stage] : stages.default;
  // `default` is present in every ModelsStages (checkModelsBlock's own RED).
  const { model, effort } = entry!;
  return { model, effort };
}
