import { PIPELINE_STAGES } from './model-routing.js';
import type { ModelRouting, StageModel } from '../types.js';

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
 *
 * One axis (P3): PRESENTING the models block — split from model-routing.ts's
 * schema/validation/resolution (REVIEW.md P3, so a display-format change no
 * longer touches the validator). Reaches PIPELINE_STAGES via a `lib→lib` import
 * (allowed — not a sibling-leaf reference).
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
