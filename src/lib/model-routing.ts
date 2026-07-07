import { isPlainObject } from './validate.js';
import type {
  EffortLevel,
  ModelId,
  ModelRouting,
  PipelineStage,
  StageModel,
} from '../types.js';

// Thrown when a `models` block fails validation. Names the offending
// model/effort/stage so a hand-edited pharn.config.json fails loudly, never
// silently (P5).
export class ModelRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelRoutingError';
  }
}

// Runtime allowlists — the deterministic floor for the `models` block (enum
// membership, P5 / ARCHITECTURE.md §2 primitive #3). Each array is the runtime
// SoT paired with its types.ts union; `satisfies` keeps the two in lockstep (a
// typo or drift here is a compile error).
export const MODEL_IDS = [
  'opus-4-8',
  'sonnet-5',
  'fable-5',
  'haiku-4-5',
] as const satisfies readonly ModelId[];

export const EFFORT_LEVELS = [
  'low',
  'high',
  'max',
] as const satisfies readonly EffortLevel[];

export const PIPELINE_STAGES = [
  'plan',
  'grill',
  'build',
  'regress',
  'verify',
  'review',
  'ship',
] as const satisfies readonly PipelineStage[];

// Sensible defaults written on every fresh install. Only stages that DEVIATE
// from `default` need an entry; the rest resolve to `default` at read time
// (resolveStageModel). Its stage keys are ⊆ PIPELINE_STAGES and its models ⊆
// MODEL_IDS — asserted by validateModelRouting in the test suite.
export const DEFAULT_MODEL_ROUTING: ModelRouting = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' }, // hardest reasoning
    review: { model: 'fable-5', effort: 'max' }, // cross-model review
  },
};

// value ∈ allowlist. Mirrors validate.ts's assertRole/assertAppliesToken pattern
// (typeof guard + enum membership, not regex). Kept local to this axis.
function assertStageModel(value: unknown, label: string): StageModel {
  if (!isPlainObject(value)) {
    throw new ModelRoutingError(`${label} must be an object`);
  }
  const { model, effort } = value;
  if (
    typeof model !== 'string' ||
    !(MODEL_IDS as readonly string[]).includes(model)
  ) {
    throw new ModelRoutingError(
      `${label} has invalid model ${JSON.stringify(model)} (expected one of ${MODEL_IDS.join(', ')})`,
    );
  }
  if (
    typeof effort !== 'string' ||
    !(EFFORT_LEVELS as readonly string[]).includes(effort)
  ) {
    throw new ModelRoutingError(
      `${label} has invalid effort ${JSON.stringify(effort)} (expected one of ${EFFORT_LEVELS.join(', ')})`,
    );
  }
  return { model: model as ModelId, effort: effort as EffortLevel };
}

/**
 * Validate a `models` block (from pharn.config.json or DEFAULT_MODEL_ROUTING).
 * Rejects — throwing ModelRoutingError, naming the offender — an invalid model
 * string, an invalid effort, an unknown stage key, or a malformed shape. Returns
 * the typed, validated routing.
 *
 * Deterministic floor (P0/P5): three fixed-set membership tests; fail-closed —
 * a malformed block hard-fails, never a silent fallback.
 */
export function validateModelRouting(input: unknown): ModelRouting {
  if (!isPlainObject(input)) {
    throw new ModelRoutingError('models must be an object');
  }
  const routingDefault = assertStageModel(input.default, 'models.default');

  const stages: Partial<Record<PipelineStage, StageModel>> = {};
  if (input.stages !== undefined) {
    if (!isPlainObject(input.stages)) {
      throw new ModelRoutingError('models.stages must be an object');
    }
    for (const [stage, value] of Object.entries(input.stages)) {
      if (!(PIPELINE_STAGES as readonly string[]).includes(stage)) {
        throw new ModelRoutingError(
          `models.stages has unknown stage ${JSON.stringify(stage)} (expected one of ${PIPELINE_STAGES.join(', ')})`,
        );
      }
      stages[stage as PipelineStage] = assertStageModel(
        value,
        `models.stages.${stage}`,
      );
    }
  }
  return { default: routingDefault, stages };
}

/**
 * Resolve the model + effort for a stage. A stage without an explicit entry
 * (including an empty `stages`) resolves to `default` — deterministic membership
 * + a single fallback, no guess (P5).
 */
export function resolveStageModel(
  routing: ModelRouting,
  stage: PipelineStage,
): StageModel {
  return routing.stages?.[stage] ?? routing.default;
}
