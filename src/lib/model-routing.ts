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
    // review fans out across lenses (a backend install ships ~22), so its cost
    // multiplies per lens — a premium model at max effort across that fan-out is
    // the worst-case token multiplier, and it would apply silently. Default to
    // opus-4-8/high (spend-safe); fable-5/max cross-model review has proven catch
    // value but stays the documented release-audit OPT-IN (set
    // models.stages.review in pharn.config.json). Effort calibration is gated on
    // the fan-out cost measurement — no speculative knobs added here.
    review: { model: 'opus-4-8', effort: 'high' },
  },
};

// Known keys for the two shape checks below. An unknown sibling key (e.g. a
// typo'd `stgaes` beside `stages`, or a stray key inside a stage entry) is
// REJECTED, naming it (P5, fail-closed) — so a hand-edit typo can never silently
// disable per-stage routing. `satisfies` keeps each set honest against its type.
const ROUTING_KEYS = [
  'default',
  'stages',
] as const satisfies readonly (keyof ModelRouting)[];
const STAGE_MODEL_KEYS = [
  'model',
  'effort',
] as const satisfies readonly (keyof StageModel)[];

// Reject any key not in `known`, naming the first offender (JSON-escaped so a
// control-char key is echoed as DATA, never raw — P2). Local to this axis.
function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  known: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      throw new ModelRoutingError(
        `${label} has unknown key ${JSON.stringify(key)} (expected one of ${known.join(', ')})`,
      );
    }
  }
}

// value ∈ allowlist. Mirrors validate.ts's assertRole/assertAppliesToken pattern
// (typeof guard + enum membership, not regex). Kept local to this axis.
function assertStageModel(value: unknown, label: string): StageModel {
  if (!isPlainObject(value)) {
    throw new ModelRoutingError(`${label} must be an object`);
  }
  assertNoUnknownKeys(value, STAGE_MODEL_KEYS, label);
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
  // Reject unknown sibling keys (e.g. a typo'd `stgaes`) BEFORE validating the
  // shape, so the typo — not a downstream "missing default" — is what is named.
  assertNoUnknownKeys(input, ROUTING_KEYS, 'models');
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

/**
 * Render a `models` block as aligned, one-line-per-entry display strings — the
 * shared renderer behind the init summary's "Models per stage" block and
 * `pharn status`'s MODELS note. `default` first, then each CONFIGURED stage in
 * PIPELINE_STAGES order (a deterministic membership walk, P5 — never JSON key
 * order). Pure: no color, no clack — callers add their own chrome; and pure of
 * input too, so the same `ModelRouting` always renders the same lines (the test
 * that feeds a non-default routing proves the block is rendered FROM the config,
 * not re-hardcoded). Every emitted token is an allowlist member (model ∈
 * MODEL_IDS, effort ∈ EFFORT_LEVELS, stage ∈ PIPELINE_STAGES), so the output
 * carries no untrusted free-text (P2).
 */
export function formatModelRoutingLines(routing: ModelRouting): string[] {
  const entries: Array<[label: string, target: StageModel]> = [
    ['default', routing.default],
  ];
  for (const stage of PIPELINE_STAGES) {
    const target = routing.stages?.[stage];
    if (target) entries.push([stage, target]);
  }
  // Align the model column: pad every label to the longest + a 3-space gap
  // (`default` is always present at length 7, so this is ≥ 10). Deterministic.
  const width = Math.max(...entries.map(([label]) => label.length)) + 3;
  return entries.map(
    ([label, { model, effort }]) =>
      `${label.padEnd(width)}${model} · ${effort}`,
  );
}
