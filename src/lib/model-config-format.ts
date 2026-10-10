import {
  PRODUCT_STAGES,
  resolveStageModel,
  type ModelsStages,
} from './model-config.js';

// ---------------------------------------------------------------------------
// Showing the `models` block — the rows `pharn status`, `pharn init` and
// `pharn update` print, and the one label they all print under them.
//
// The label is the point. It says what reads the block and what does not.
// Orchestrated runs read it: /pharn-ship and /pharn-loop pick the MODEL they
// request for each stage they route to a subagent (pharn-oss's routing policy;
// a stage it keeps inline, an `inherit` or a `claude-*` id runs on the
// session's model). EFFORT is never routed. A stage a person invokes directly
// uses that command's own static `model:` / `effort:` frontmatter, which the
// block is HELD TO by pharn-oss's checker (its `agreement` mode) — and nothing
// runs that check automatically. A request is never proof of what a stage ran
// on, so the rows are a declaration, never a record of what happened.
//
// Pure: no color, no clack — callers add their own chrome. Every token in a
// row is a product stage (this CLI's pinned list) or a value pharn-oss's rules
// accepted (an alias, a `claude-*` id, an effort level), so a row carries no
// untrusted free text. One axis (P3): presenting the models block.
// ---------------------------------------------------------------------------

/** The command that runs pharn-oss's checker in a project, in one mode. */
export function modelsCheckerCommand(
  floorDir: string,
  mode: 'validate' | 'agreement',
): string {
  return `node ${floorDir}/check-model-config.mjs ${mode}`;
}

/**
 * One row per product stage, resolved as pharn-oss resolves it, after the
 * `default` row: a stage without its own entry shows the `default` it falls
 * back to, marked `(default)`. The stage order is pharn-oss's.
 */
export function resolvedStageLines(stages: ModelsStages): string[] {
  const rows: Array<
    [label: string, model: string, effort: string, via: boolean]
  > = [['default', stages.default!.model, stages.default!.effort, false]];
  for (const stage of PRODUCT_STAGES) {
    const { model, effort } = resolveStageModel(stages, stage);
    rows.push([stage, model, effort, !Object.hasOwn(stages, stage)]);
  }
  const width = Math.max(...rows.map(([label]) => label.length)) + 3;
  return rows.map(
    ([label, model, effort, via]) =>
      `${label.padEnd(width)}${model} · ${effort}${via ? '  (default)' : ''}`,
  );
}

/**
 * What the rows are, and what they are not. Each line stays within 70
 * columns, so a clack note box in an 80-column terminal never wraps one.
 */
export function modelsLabelLines(floorDir: string): string[] {
  return [
    '/pharn-ship and /pharn-loop read this block to pick the model they',
    'request for each stage they run as a subagent. Effort is never',
    "routed, and a stage that runs inline uses the session's model.",
    "A stage you run directly uses its command's own model:/effort:",
    'frontmatter, which this block is held to. Nothing runs that',
    'check automatically; to run it:',
    modelsCheckerCommand(floorDir, 'agreement'),
  ];
}
